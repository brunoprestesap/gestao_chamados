import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QuadroResposta } from '@/shared/conversas/quadro.schemas';

// ── Mocks ────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));

const mockLerConversa = vi.fn();
const mockEnviarMensagem = vi.fn();
const mockGravarProposta = vi.fn();
const mockLerProposta = vi.fn();
const mockGravarCartao = vi.fn();
const mockInvalidarCartao = vi.fn();
vi.mock('@/lib/conversas', () => ({
  lerConversa: (...args: unknown[]) => mockLerConversa(...args),
  enviarMensagem: (...args: unknown[]) => mockEnviarMensagem(...args),
  gravarProposta: (...args: unknown[]) => mockGravarProposta(...args),
  lerProposta: (...args: unknown[]) => mockLerProposta(...args),
  gravarCartao: (...args: unknown[]) => mockGravarCartao(...args),
  invalidarCartao: (...args: unknown[]) => mockInvalidarCartao(...args),
}));

const mockStream = vi.fn();
vi.mock('@/lib/llm', () => ({
  streamLlmObject: (...args: unknown[]) => mockStream(...args),
}));

const mockLerCatalogo = vi.fn();
const mockLerServicoAtivo = vi.fn();
vi.mock('../catalogo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../catalogo')>()),
  lerCatalogoParaPrompt: () => mockLerCatalogo(),
  lerServicoAtivo: (...args: unknown[]) => mockLerServicoAtivo(...args),
}));

const mockLerPerfil = vi.fn();
vi.mock('../perfil', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../perfil')>()),
  lerPerfil: (...args: unknown[]) => mockLerPerfil(...args),
}));

import { ENTRADA_MAX_CARACTERES } from '../config';
import { montarHistorico, responderNaConversa } from '../responder';
import { respostaAberturaSchema } from '../schema';

/**
 * O caminho que a mensagem faz do envio até a resposta, a proposta e o cartão
 * (specs 0003 e 0004). Este módulo nunca lança e nunca cria nem descarta
 * rascunho: falha da IA vira mensagem de `sistema` e, sem cartão valendo, o
 * cartão manual; resposta boa grava a proposta e decide o cartão.
 *
 * covers: AC-1 (uma chamada, tarefa nova, só `resposta` nos quadros), AC-2
 * (prompt e corte do histórico), AC-3 (proposta validada e proposta velha),
 * AC-4 (cartão novo, mantido e invalidado), AC-5 (nada vaza), AC-8 (reserva
 * com cartão manual), AC-12 (nada depois de virar chamado), AC-16 (logs)
 */

const VIEWER = { userId: '6aad5286df6f201a25eda111', role: 'Solicitante' as const };
const CONVERSA_ID = '6aad5286df6f201a25eda5f1';
const MSG_SOLICITANTE = '6aad5286df6f201a25eda5f2';
const MSG_IA = '6aad5286df6f201a25eda5f3';
const CALL_ID = '6aad5286df6f201a25eda5f4';
const CARTAO_NOVO = '6aad5286df6f201a25eda5f5';
const CARTAO_VELHO = '6aad5286df6f201a25eda5f6';
const MSG_SISTEMA = '6aad5286df6f201a25eda5f7';
const SERVICO_ID = '6aad5286df6f201a25edb001';
const SUBTIPO_ID = '6aad5286df6f201a25edb002';
const OUTRO_SERVICO_ID = '6aad5286df6f201a25edb003';
const UNIDADE_ID = '6aad5286df6f201a25edc001';
const TEXTO = 'A lâmpada da sala 302 queimou.';

const PERFIL = { unidade: { unitId: UNIDADE_ID, nome: 'Fórum Central', andar: '3º andar' } };

const CATALOGO = {
  bloco: 'ELET-0001 | Troca de lâmpada | Iluminação | Manutenção Predial | Lâmpada queimada',
  tamanho: 80,
  acimaDoTeto: false,
  porCodigo: new Map([
    [
      'ELET-0001',
      {
        code: 'ELET-0001',
        catalogServiceId: SERVICO_ID,
        subtypeId: SUBTIPO_ID,
        tipoServico: 'Manutenção Predial',
        nome: 'Troca de lâmpada',
        subtipo: 'Iluminação',
      },
    ],
  ]),
  codigoPorId: new Map([[SERVICO_ID, 'ELET-0001']]),
};

const SERVICO_ATIVO = {
  catalogServiceId: SERVICO_ID,
  subtypeId: SUBTIPO_ID,
  tipoServico: 'Manutenção Predial',
  rotuloServico: 'Troca de lâmpada',
  rotuloSubtipo: 'Iluminação',
};

/** Resposta completa do modelo; cada teste muda o que precisa. */
function dados(extra: Record<string, unknown> = {}) {
  return {
    servicoCodigo: 'ELET-0001',
    servicoConfianca: 0.9,
    servicoMotivo: 'Lâmpada queimada é troca de lâmpada.',
    prioridade: 'NORMAL',
    prioridadeConfianca: 0.6,
    prioridadeMotivo: 'Atrapalha sem parar o trabalho.',
    localExato: 'Sala 302',
    localForaDoPerfil: false,
    completo: true,
    resposta: 'Entendi: a lâmpada da sala 302 queimou.',
    ...extra,
  };
}

const META = {
  callId: CALL_ID,
  task: 'conversa.abertura',
  promptVersion: '1',
  model: 'qwen3',
  attempts: 1,
  latencyMs: 900,
};

function finalOk(extra: Record<string, unknown> = {}) {
  return { ok: true, data: dados(extra), meta: META };
}

/** Recolhe todos os quadros do gerador, como a rota faz. */
async function coletar(gerador: AsyncGenerator<QuadroResposta>): Promise<QuadroResposta[]> {
  const quadros: QuadroResposta[] = [];
  for await (const q of gerador) quadros.push(q);
  return quadros;
}

function conversaLida(
  situacao: 'rascunho' | 'reservada' | 'vinculada' = 'rascunho',
  mensagens: unknown[] = [],
) {
  return { ok: true, conversa: { id: CONVERSA_ID, situacao }, mensagens };
}

/** Um fluxo de `lib/llm` que entrega os parciais (objetos) e depois o final. */
function fluxo(partes: Record<string, unknown>[], final: unknown) {
  return {
    ok: true,
    partial: (async function* () {
      for (const parte of partes) yield parte;
    })(),
    final: Promise.resolve(final),
  };
}

/** A proposta como `lerProposta` devolve depois de gravada. */
function propostaLida(extra: Record<string, unknown> = {}) {
  return {
    cartaoMensagemId: null,
    servico: {
      catalogServiceId: SERVICO_ID,
      subtypeId: SUBTIPO_ID,
      tipoServico: 'Manutenção Predial',
      confianca: 0.9,
      motivo: 'Lâmpada queimada é troca de lâmpada.',
    },
    prioridade: { prioridade: 'NORMAL', confianca: 0.6, motivo: 'Atrapalha.' },
    localExato: 'Sala 302',
    localForaDoPerfil: false,
    completo: true,
    llmCallId: CALL_ID,
    modelo: 'qwen3',
    promptVersion: '1',
    task: 'conversa.abertura',
    origemMensagemId: MSG_SOLICITANTE,
    atualizadaEm: new Date(),
    ...extra,
  };
}

/** Um cartão que já vale na conversa. */
function cartaoAtual(extra: Record<string, unknown> = {}) {
  return {
    id: CARTAO_VELHO,
    autor: 'ia',
    payload: {
      modo: 'ia',
      servico: { ...SERVICO_ATIVO },
      unidade: { unitId: UNIDADE_ID, rotulo: 'Fórum Central', andar: '3º andar' },
      localExato: 'Sala 302',
      faltando: [],
      ...extra,
    },
  };
}

function estado(proposta: unknown, cartao: unknown = null) {
  return { ok: true, situacao: 'rascunho', proposta, cartaoAtual: cartao };
}

let avisos: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  avisos = [];
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    avisos.push(args.map(String).join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  mockLerConversa.mockResolvedValue(conversaLida());
  mockEnviarMensagem.mockImplementation(async ({ autor }: { autor: string }) => {
    if (autor === 'solicitante') return { ok: true, destino: 'conversa', id: MSG_SOLICITANTE };
    if (autor === 'sistema') return { ok: true, destino: 'conversa', id: MSG_SISTEMA };
    return { ok: true, destino: 'conversa', id: MSG_IA };
  });
  mockLerCatalogo.mockResolvedValue(CATALOGO);
  mockLerServicoAtivo.mockResolvedValue(SERVICO_ATIVO);
  mockLerPerfil.mockResolvedValue(PERFIL);
  mockGravarProposta.mockResolvedValue({
    ok: true,
    gravada: true,
    origemGuardada: MSG_SOLICITANTE,
  });
  // Antes da volta: sem proposta. Depois de gravar: a proposta nova, sem cartão.
  mockLerProposta.mockResolvedValueOnce(estado(null)).mockResolvedValue(estado(propostaLida()));
  mockGravarCartao.mockResolvedValue({ ok: true, mensagemId: CARTAO_NOVO, substituiId: null });
  mockInvalidarCartao.mockResolvedValue({ ok: true });
  mockStream.mockResolvedValue(
    fluxo(
      [{ servicoCodigo: 'ELET' }, { servicoCodigo: 'ELET-0001', resposta: 'Entendi' }],
      finalOk(),
    ),
  );
});

async function responder(texto = TEXTO) {
  const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto });
  if (!r.ok) throw new Error('esperava sucesso');
  return coletar(r.quadros);
}

// ── caminho feliz · AC-1, AC-4 ───────────────────────────────────

describe('responderNaConversa · resposta com cartão', () => {
  it('devolve inicio, parcial, fim e depois o cartão', async () => {
    // Act
    const quadros = await responder();

    // Assert
    expect(quadros.map((q) => q.tipo)).toEqual(['inicio', 'parcial', 'fim', 'cartao']);
  });

  it('manda só a `resposta` nos parciais, nunca a extração', async () => {
    // Act
    const quadros = await responder();

    // Assert: o primeiro parcial do modelo não tinha `resposta` e foi ignorado
    const parciais = quadros.filter((q) => q.tipo === 'parcial');
    expect(parciais).toEqual([{ tipo: 'parcial', texto: 'Entendi' }]);
  });

  it('fecha com o texto final e o id da mensagem gravada', async () => {
    // Act
    const quadros = await responder();

    // Assert
    expect(quadros.find((q) => q.tipo === 'fim')).toEqual({
      tipo: 'fim',
      texto: dados().resposta,
      mensagemId: MSG_IA,
      motivo: null,
    });
  });

  it('grava o cartão com a mensagem de origem e o `llmCallId` da chamada', async () => {
    // Act
    await responder();

    // Assert
    expect(mockGravarCartao).toHaveBeenCalledWith(
      expect.objectContaining({
        conversaId: CONVERSA_ID,
        autor: 'ia',
        llmCallId: CALL_ID,
        origemMensagemId: MSG_SOLICITANTE,
      }),
    );
  });

  it('manda no quadro o cartão com rótulos do banco, unidade do perfil e local', async () => {
    // Act
    const quadros = await responder();

    // Assert
    expect(quadros.at(-1)).toEqual({
      tipo: 'cartao',
      mensagemId: CARTAO_NOVO,
      substituiId: null,
      cartao: {
        modo: 'ia',
        servico: SERVICO_ATIVO,
        unidade: { unitId: UNIDADE_ID, rotulo: 'Fórum Central', andar: '3º andar' },
        localExato: 'Sala 302',
        faltando: [],
      },
    });
  });

  it('não põe confiança, motivo nem prioridade em nenhum quadro (AC-5)', async () => {
    // Act
    const quadros = await responder();

    // Assert: o `motivo` do quadro `fim` é o motivo de falha da gravação, não
    // o motivo da IA; o cartão não tem motivo nenhum
    const serializado = JSON.stringify(quadros);
    expect(serializado).not.toMatch(/confianca|prioridade|NORMAL|0\.9|explicou|Atrapalha/);
    const cartao = JSON.stringify(quadros.filter((q) => q.tipo === 'cartao'));
    expect(cartao).not.toContain('motivo');
  });
});

// ── AC-14: o modelo não pode dizer que já abriu o chamado ────────

describe('responderNaConversa · resposta que afirma chamado já aberto', () => {
  it('troca o texto do modelo pela frase fixa no quadro `fim` e na mensagem gravada', async () => {
    // Arrange: o modelo ignorou a instrução do prompt e disse que já abriu
    mockStream.mockResolvedValue(
      fluxo([], finalOk({ resposta: 'O chamado foi aberto para reparo de vazamento.' })),
    );

    // Act
    const quadros = await responder();

    // Assert
    const fim = quadros.find((q) => q.tipo === 'fim');
    expect(fim && 'texto' in fim ? fim.texto : null).not.toContain('O chamado foi aberto');
    expect(mockEnviarMensagem).toHaveBeenCalledWith(
      expect.objectContaining({
        autor: 'ia',
        texto: expect.not.stringContaining('O chamado foi aberto'),
      }),
    );
  });

  it('loga o achado sem vazar o texto da IA (AC-16)', async () => {
    // Arrange
    mockStream.mockResolvedValue(
      fluxo([], finalOk({ resposta: 'Seu chamado foi registrado com sucesso.' })),
    );

    // Act
    await responder();

    // Assert
    const linha = avisos.find((a) => a.includes('resposta afirmava chamado aberto'));
    expect(linha).toBeTruthy();
    expect(linha).not.toContain('registrado');
  });

  it('não mexe na extração: a proposta e o cartão continuam saindo da mesma volta', async () => {
    // Arrange
    mockStream.mockResolvedValue(
      fluxo([], finalOk({ resposta: 'O chamado já está aberto, obrigado.' })),
    );

    // Act
    const quadros = await responder();

    // Assert: o cartão nasce normalmente, mesmo com a resposta trocada
    expect(quadros.map((q) => q.tipo)).toContain('cartao');
    expect(mockGravarProposta).toHaveBeenCalled();
  });

  it('não mexe numa resposta comum, que não afirma nada sobre o chamado existir', async () => {
    // Act
    const quadros = await responder();

    // Assert: mesmo texto de sempre, sem passar pela troca
    expect(quadros.find((q) => q.tipo === 'fim')).toMatchObject({ texto: dados().resposta });
  });
});

// ── o que vai para o modelo · AC-1, AC-2 ─────────────────────────

describe('responderNaConversa · chamada ao modelo', () => {
  it('usa a tarefa nova na raia interativa, sem mexer na amostragem', async () => {
    // Act
    await responder();

    // Assert
    expect(mockStream).toHaveBeenCalledTimes(1);
    const input = mockStream.mock.calls[0][0];
    expect(input).toMatchObject({
      task: 'conversa.abertura',
      promptVersion: '2',
      lane: 'interactive',
      userId: VIEWER.userId,
      ref: { type: 'conversa', id: CONVERSA_ID },
    });
    expect(input.schema).toBe(respostaAberturaSchema);
    // O `maxOutputTokens` padrão da spec 0001 vale quando nada é sobrescrito.
    expect(input.sampling).toBeUndefined();
  });

  it('repassa o sinal de cancelamento, que é o que libera a vaga na GPU', async () => {
    // Arrange
    const controller = new AbortController();

    // Act
    const r = await responderNaConversa({
      viewer: VIEWER,
      conversaId: CONVERSA_ID,
      texto: TEXTO,
      signal: controller.signal,
    });
    if (!r.ok) throw new Error('esperava sucesso');
    await coletar(r.quadros);

    // Assert
    expect(mockStream.mock.calls[0][0].signal).toBe(controller.signal);
  });

  it('põe o catálogo e depois a unidade do perfil no prompt de sistema', async () => {
    // Act
    await responder();

    // Assert
    const system: string = mockStream.mock.calls[0][0].system;
    expect(system).toContain(CATALOGO.bloco);
    expect(system.indexOf('ELET-0001')).toBeLessThan(system.indexOf('Fórum Central'));
  });

  it('devolve ao prompt a proposta atual, traduzida de volta para o código', async () => {
    // Arrange
    mockLerProposta.mockReset();
    mockLerProposta.mockResolvedValue(estado(propostaLida({ localExato: 'Corredor B' })));

    // Act
    await responder();

    // Assert
    const system: string = mockStream.mock.calls[0][0].system;
    expect(system).toContain('Serviço: ELET-0001');
    expect(system).toContain('Local exato: Corredor B');
  });

  it('vai sem catálogo e loga só o tamanho quando o catálogo passa do teto', async () => {
    // Arrange
    mockLerCatalogo.mockResolvedValue({
      ...CATALOGO,
      bloco: null,
      tamanho: 12_345,
      acimaDoTeto: true,
      porCodigo: new Map(),
    });

    // Act
    await responder();

    // Assert
    expect(mockStream.mock.calls[0][0].system).not.toContain('Catálogo de serviços (');
    expect(avisos.some((a) => a.includes('catalogo acima do teto') && a.includes('12345'))).toBe(
      true,
    );
    expect(mockGravarProposta.mock.calls[0][2].servico).toBeNull();
  });

  it('monta o histórico com solicitante como user e texto da ia como assistant', async () => {
    // Arrange
    mockLerConversa.mockResolvedValue(
      conversaLida('rascunho', [
        { autor: 'solicitante', tipo: 'texto', texto: 'primeira' },
        { autor: 'ia', tipo: 'texto', texto: 'resposta da ia' },
        { autor: 'sistema', tipo: 'texto', texto: 'aviso do Sigma' },
        { autor: 'ia', tipo: 'cartao', texto: 'Resumo do chamado' },
      ]),
    );

    // Act
    await responder();

    // Assert: aviso do sistema e cartão não são diálogo
    expect(mockStream.mock.calls[0][0].messages).toEqual([
      { role: 'user', content: 'primeira' },
      { role: 'assistant', content: 'resposta da ia' },
      { role: 'user', content: TEXTO },
    ]);
  });

  it('mantém a entrada inteira dentro do teto com o histórico longo (AC-2)', async () => {
    // Arrange: 25 mensagens de 1.500 caracteres, alternando os autores
    const anteriores = Array.from({ length: 25 }, (_, i) => ({
      autor: i % 2 === 0 ? 'solicitante' : 'ia',
      tipo: 'texto',
      texto: `${i}`.padEnd(1500, 'x'),
    }));
    mockLerConversa.mockResolvedValue(conversaLida('rascunho', anteriores));
    mockLerCatalogo.mockResolvedValue({ ...CATALOGO, bloco: 'c'.repeat(11_900) });

    // Act
    await responder();

    // Assert: contado como a admissão da spec 0001 conta
    const { system, messages } = mockStream.mock.calls[0][0];
    const total = messages.reduce(
      (soma: number, m: { content: string }) => soma + m.content.length,
      system.length,
    );
    expect(total).toBeLessThanOrEqual(ENTRADA_MAX_CARACTERES);
    expect(messages[0].content.startsWith('0')).toBe(true);
    expect(messages.at(-1)).toEqual({ role: 'user', content: TEXTO });
  });
});

// ── montarHistorico · AC-2 ───────────────────────────────────────

describe('montarHistorico', () => {
  const m = (autor: string, texto: string) => ({ autor, tipo: 'texto', texto }) as never;

  it('manda tudo quando cabe', () => {
    // Act
    const r = montarHistorico([m('solicitante', 'a'), m('ia', 'b')], 'c', 100);

    // Assert
    expect(r.map((x) => x.content)).toEqual(['a', 'b', 'c']);
  });

  it('corta o meio e mantém a primeira do solicitante e as mais recentes', () => {
    // Arrange
    const anteriores = [
      m('solicitante', '1111'),
      m('ia', '2222'),
      m('solicitante', '3333'),
      m('ia', '4444'),
    ];

    // Act: cabem 13 caracteres, a nova tem 1
    const r = montarHistorico(anteriores, 'n', 13);

    // Assert
    expect(r.map((x) => x.content)).toEqual(['1111', '3333', '4444', 'n']);
  });

  it('não deixa buraco entre as recentes: para na primeira que não cabe', () => {
    // Arrange
    const anteriores = [m('solicitante', 'aa'), m('ia', 'bbbbbbbb'), m('solicitante', 'cc')];

    // Act
    const r = montarHistorico(anteriores, 'n', 6);

    // Assert
    expect(r.map((x) => x.content)).toEqual(['aa', 'cc', 'n']);
  });

  it('sempre manda a mensagem nova, mesmo com o orçamento apertado', () => {
    // Act
    const r = montarHistorico([m('solicitante', 'relato longo')], 'nova', 4);

    // Assert
    expect(r).toEqual([{ role: 'user', content: 'nova' }]);
  });
});

// ── proposta · AC-3, AC-16 ───────────────────────────────────────

describe('responderNaConversa · proposta', () => {
  it('grava a proposta com o serviço traduzido do código e o meta da chamada', async () => {
    // Act
    await responder();

    // Assert
    expect(mockGravarProposta).toHaveBeenCalledWith(VIEWER, CONVERSA_ID, {
      servico: {
        catalogServiceId: SERVICO_ID,
        subtypeId: SUBTIPO_ID,
        tipoServico: 'Manutenção Predial',
        confianca: 0.9,
        motivo: 'Lâmpada queimada é troca de lâmpada.',
      },
      prioridade: {
        prioridade: 'NORMAL',
        confianca: 0.6,
        motivo: 'Atrapalha sem parar o trabalho.',
      },
      localExato: 'Sala 302',
      localForaDoPerfil: false,
      completo: true,
      llmCallId: CALL_ID,
      modelo: 'qwen3',
      promptVersion: '1',
      task: 'conversa.abertura',
      origemMensagemId: MSG_SOLICITANTE,
    });
  });

  it('código inventado vira proposta sem serviço e log `codigo_invalido`, sem cartão', async () => {
    // Arrange
    mockStream.mockResolvedValue(fluxo([], finalOk({ servicoCodigo: 'XXXX-9999' })));
    mockLerProposta.mockReset();
    mockLerProposta
      .mockResolvedValueOnce(estado(null))
      .mockResolvedValue(estado(propostaLida({ servico: null })));

    // Act
    const quadros = await responder();

    // Assert
    expect(mockGravarProposta.mock.calls[0][2].servico).toBeNull();
    expect(quadros.map((q) => q.tipo)).not.toContain('cartao');
    const linha = avisos.find((a) => a.includes('[assistente] proposta'));
    expect(linha).toContain('codigo_invalido');
    expect(linha).not.toContain('XXXX-9999');
  });

  it('troca motivo vazio do modelo pela frase fixa', async () => {
    // Arrange
    mockStream.mockResolvedValue(fluxo([], finalOk({ servicoMotivo: '  ', prioridadeMotivo: '' })));

    // Act
    await responder();

    // Assert
    const proposta = mockGravarProposta.mock.calls[0][2];
    expect(proposta.servico.motivo).toBe('O modelo não explicou.');
    expect(proposta.prioridade.motivo).toBe('O modelo não explicou.');
  });

  it('deixa de fora confiança e motivo do campo que veio nulo', async () => {
    // Arrange
    mockStream.mockResolvedValue(
      fluxo([], finalOk({ prioridade: null, prioridadeConfianca: 0.8, prioridadeMotivo: 'x' })),
    );

    // Act
    await responder();

    // Assert
    expect(mockGravarProposta.mock.calls[0][2].prioridade).toBeNull();
  });

  it('resposta de mensagem mais antiga não grava cartão e loga os dois ids', async () => {
    // Arrange
    const maisNova = '6aad5286df6f201a25eda699';
    mockGravarProposta.mockResolvedValue({ ok: true, gravada: false, origemGuardada: maisNova });

    // Act
    const quadros = await responder();

    // Assert
    expect(quadros.map((q) => q.tipo)).toEqual(['inicio', 'parcial', 'fim']);
    expect(mockGravarCartao).not.toHaveBeenCalled();
    const linha = avisos.find((a) => a.includes('proposta_velha'));
    expect(linha).toContain(MSG_SOLICITANTE);
    expect(linha).toContain(maisNova);
  });

  it('conversa que virou chamado no meio não ganha proposta nem cartão (AC-12)', async () => {
    // Arrange
    mockGravarProposta.mockResolvedValue({ ok: false, reason: 'nao_encontrada' });

    // Act
    const quadros = await responder();

    // Assert
    expect(quadros.map((q) => q.tipo)).not.toContain('cartao');
    expect(mockGravarCartao).not.toHaveBeenCalled();
    expect(mockInvalidarCartao).not.toHaveBeenCalled();
  });

  it('nenhuma linha de log traz relato, resposta ou local (AC-16)', async () => {
    // Act
    await responder();

    // Assert
    const tudo = avisos.join('\n');
    expect(tudo).not.toContain(TEXTO);
    expect(tudo).not.toContain(dados().resposta);
    expect(tudo).not.toContain('Sala 302');
    const linha = avisos.find((a) => a.includes('[assistente] proposta'));
    expect(linha).toMatch(/"codigo":"valido".*"completo":true.*"cartao":"novo".*"duracaoMs"/);
  });
});

// ── cartão que muda · AC-4 ───────────────────────────────────────

describe('responderNaConversa · cartão que muda', () => {
  it('mantém o cartão que vale quando o conteúdo visível é o mesmo', async () => {
    // Arrange
    mockLerProposta.mockReset();
    mockLerProposta.mockResolvedValue(
      estado(propostaLida({ cartaoMensagemId: CARTAO_VELHO }), cartaoAtual()),
    );

    // Act
    const quadros = await responder();

    // Assert
    expect(mockGravarCartao).not.toHaveBeenCalled();
    expect(quadros.map((q) => q.tipo)).not.toContain('cartao');
    expect(avisos.find((a) => a.includes('[assistente] proposta'))).toContain('"mantido"');
  });

  it('grava cartão novo, com o antigo como substituído, quando o local muda', async () => {
    // Arrange
    mockLerProposta.mockReset();
    mockLerProposta
      .mockResolvedValueOnce(estado(null, cartaoAtual({ localExato: 'Sala 301' })))
      .mockResolvedValue(
        estado(
          propostaLida({ cartaoMensagemId: CARTAO_VELHO }),
          cartaoAtual({ localExato: 'Sala 301' }),
        ),
      );
    mockGravarCartao.mockResolvedValue({
      ok: true,
      mensagemId: CARTAO_NOVO,
      substituiId: CARTAO_VELHO,
    });

    // Act
    const quadros = await responder();

    // Assert
    expect(quadros.at(-1)).toMatchObject({
      tipo: 'cartao',
      mensagemId: CARTAO_NOVO,
      substituiId: CARTAO_VELHO,
    });
  });

  it('invalida o cartão quando o serviço muda sem a proposta estar completa', async () => {
    // Arrange
    mockLerProposta.mockReset();
    mockLerProposta.mockResolvedValue(
      estado(
        propostaLida({
          cartaoMensagemId: CARTAO_VELHO,
          completo: false,
          servico: { ...propostaLida().servico, catalogServiceId: OUTRO_SERVICO_ID },
        }),
        cartaoAtual(),
      ),
    );

    // Act
    const quadros = await responder();

    // Assert
    expect(mockInvalidarCartao).toHaveBeenCalledWith(VIEWER, CONVERSA_ID, CARTAO_VELHO);
    expect(quadros.at(-1)).toEqual({
      tipo: 'cartao',
      mensagemId: null,
      cartao: null,
      substituiId: CARTAO_VELHO,
    });
  });

  it('não grava cartão sem local, mesmo com serviço e completo', async () => {
    // Arrange
    mockLerProposta.mockReset();
    mockLerProposta.mockResolvedValue(estado(propostaLida({ localExato: null })));

    // Act
    const quadros = await responder();

    // Assert
    expect(mockGravarCartao).not.toHaveBeenCalled();
    expect(quadros.map((q) => q.tipo)).not.toContain('cartao');
  });

  it('não grava cartão da IA quando o serviço foi desativado no meio', async () => {
    // Arrange
    mockLerServicoAtivo.mockResolvedValue(null);

    // Act
    const quadros = await responder();

    // Assert
    expect(mockGravarCartao).not.toHaveBeenCalled();
    expect(quadros.map((q) => q.tipo)).not.toContain('cartao');
  });

  it('pede a unidade quando o relato fala de outro lugar', async () => {
    // Arrange
    mockLerProposta.mockReset();
    mockLerProposta
      .mockResolvedValueOnce(estado(null))
      .mockResolvedValue(estado(propostaLida({ localForaDoPerfil: true })));

    // Act
    const quadros = await responder();

    // Assert
    const cartao = quadros.at(-1);
    expect(cartao).toMatchObject({
      tipo: 'cartao',
      cartao: { unidade: null, faltando: ['unidade'] },
    });
  });
});

// ── portaria antes do modelo ─────────────────────────────────────

describe('responderNaConversa · antes de gastar vaga na GPU', () => {
  it('para na conversa que não existe, sem chamar o modelo', async () => {
    // Arrange
    mockLerConversa.mockResolvedValue({ ok: false, reason: 'nao_encontrada' });

    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });

    // Assert
    expect(r).toEqual({ ok: false, reason: 'nao_encontrada' });
    expect(mockStream).not.toHaveBeenCalled();
    expect(mockEnviarMensagem).not.toHaveBeenCalled();
  });

  it('some com a conversa já ligada a chamado, que abre em modo leitura', async () => {
    // Arrange
    mockLerConversa.mockResolvedValue(conversaLida('vinculada'));

    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });

    // Assert
    expect(r).toEqual({ ok: false, reason: 'nao_encontrada' });
    expect(mockEnviarMensagem).not.toHaveBeenCalled();
    expect(mockStream).not.toHaveBeenCalled();
  });

  it('devolve o motivo quando a mensagem do solicitante não grava', async () => {
    // Arrange
    mockEnviarMensagem.mockResolvedValue({ ok: false, reason: 'limite_mensagens' });

    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });

    // Assert
    expect(r).toEqual({ ok: false, reason: 'limite_mensagens' });
    expect(mockStream).not.toHaveBeenCalled();
  });
});

// ── a IA falhou · AC-8 ───────────────────────────────────────────

describe('responderNaConversa · reserva com cartão manual', () => {
  beforeEach(() => {
    mockStream.mockResolvedValue({ ok: false, reason: 'disabled', meta: null });
    mockLerProposta.mockReset();
    mockLerProposta.mockResolvedValue(estado(null));
    mockLerServicoAtivo.mockResolvedValue(null);
  });

  it('manda a reserva e logo depois o cartão manual, sem parcial', async () => {
    // Act
    const quadros = await responder();

    // Assert
    expect(quadros.map((q) => q.tipo)).toEqual(['inicio', 'reserva', 'cartao']);
    expect(quadros.at(-1)).toMatchObject({
      tipo: 'cartao',
      mensagemId: CARTAO_NOVO,
      cartao: { modo: 'manual', servico: null, faltando: ['tipo', 'local'] },
    });
  });

  it('grava a reserva como `sistema`, com a frase que aponta o resumo e o formulário', async () => {
    // Act
    const quadros = await responder();

    // Assert
    expect(mockEnviarMensagem).toHaveBeenCalledWith(
      expect.objectContaining({ autor: 'sistema', tipo: 'texto' }),
    );
    const reserva = quadros.find((q) => q.tipo === 'reserva');
    const texto = reserva && 'texto' in reserva ? reserva.texto.toLowerCase() : '';
    expect(texto).toContain('salvo');
    expect(texto).toContain('resumo');
    expect(texto).toContain('formulário');
  });

  it('grava o cartão manual como `sistema`, sem `llmCallId`', async () => {
    // Act
    await responder();

    // Assert
    expect(mockGravarCartao).toHaveBeenCalledWith(
      expect.objectContaining({ autor: 'sistema', llmCallId: null }),
    );
  });

  it('não grava cartão novo quando já existe cartão valendo', async () => {
    // Arrange
    mockLerProposta.mockResolvedValue(
      estado(propostaLida({ cartaoMensagemId: CARTAO_VELHO }), cartaoAtual()),
    );

    // Act
    const quadros = await responder();

    // Assert
    expect(quadros.map((q) => q.tipo)).toEqual(['inicio', 'reserva']);
    expect(mockGravarCartao).not.toHaveBeenCalled();
  });

  it('troca o texto parcial pela reserva quando o objeto final é reprovado', async () => {
    // Arrange
    mockStream.mockResolvedValue(
      fluxo([{ resposta: 'Entendi,' }], { ok: false, reason: 'invalid_output', meta: null }),
    );

    // Act
    const quadros = await responder();

    // Assert
    expect(quadros.map((q) => q.tipo)).toEqual(['inicio', 'parcial', 'reserva', 'cartao']);
    expect(mockGravarProposta).not.toHaveBeenCalled();
  });

  it('não grava nada e não manda reserva quando quem desistiu foi a pessoa', async () => {
    // Arrange
    mockStream.mockResolvedValue({ ok: false, reason: 'cancelled', meta: null });

    // Act
    const quadros = await responder();

    // Assert
    expect(quadros.map((q) => q.tipo)).toEqual(['inicio']);
    expect(mockEnviarMensagem).toHaveBeenCalledTimes(1);
    expect(mockGravarCartao).not.toHaveBeenCalled();
  });

  it('ainda mostra a reserva quando nem ela consegue ser gravada', async () => {
    // Arrange
    mockEnviarMensagem.mockImplementation(async ({ autor }: { autor: string }) =>
      autor === 'solicitante'
        ? { ok: true, destino: 'conversa', id: MSG_SOLICITANTE }
        : { ok: false, reason: 'erro' },
    );

    // Act
    const quadros = await responder();

    // Assert
    const reserva = quadros.find((q) => q.tipo === 'reserva');
    expect(reserva && 'mensagemId' in reserva && reserva.mensagemId).toBeNull();
  });

  it('nunca lança, seja qual for o motivo da IA', async () => {
    // Arrange & Act & Assert
    for (const reason of ['timeout', 'unavailable', 'circuit_open', 'busy', 'auth_error']) {
      mockStream.mockResolvedValue({ ok: false, reason, meta: null });
      const r = await responderNaConversa({
        viewer: VIEWER,
        conversaId: CONVERSA_ID,
        texto: TEXTO,
      });
      if (!r.ok) throw new Error('esperava sucesso');
      await expect(coletar(r.quadros)).resolves.toBeDefined();
    }
  });
});
