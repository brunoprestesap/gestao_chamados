import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));

const mockLerProposta = vi.fn();
const mockAbrir = vi.fn();
const mockEnviarMensagem = vi.fn();
const mockInvalidarCartao = vi.fn();
const mockLerMensagens = vi.fn();
const mockRegistrarDecisao = vi.fn();
vi.mock('@/lib/conversas', () => ({
  registrarDecisao: (...args: unknown[]) => mockRegistrarDecisao(...args),
  lerProposta: (...args: unknown[]) => mockLerProposta(...args),
  abrirChamadoDaConversa: (...args: unknown[]) => mockAbrir(...args),
  enviarMensagem: (...args: unknown[]) => mockEnviarMensagem(...args),
  invalidarCartao: (...args: unknown[]) => mockInvalidarCartao(...args),
  lerMensagens: (...args: unknown[]) => mockLerMensagens(...args),
}));

const mockNotificar = vi.fn();
vi.mock('@/lib/chamados/novo-chamado', () => ({
  notificarNovoChamado: (...args: unknown[]) => mockNotificar(...args),
}));

const mockTentarAtribuicao = vi.fn();
vi.mock('@/lib/chamados/atribuicao-automatica', () => ({
  tentarAtribuicaoAutomatica: (...args: unknown[]) => mockTentarAtribuicao(...args),
}));

const mockUnidade = vi.fn();
vi.mock('@/models/unit', () => ({
  UnitModel: {
    findOne: (...args: unknown[]) => ({
      select: () => ({ lean: () => mockUnidade(...args) }),
    }),
  },
}));

const mockBuscarAtivoVinculavel = vi.fn();
vi.mock('@/lib/ativos/seletor', () => ({
  buscarAtivoVinculavel: (...args: unknown[]) => mockBuscarAtivoVinculavel(...args),
}));

const mockLerServicoAtivo = vi.fn();
vi.mock('../catalogo', () => ({
  lerServicoAtivo: (...args: unknown[]) => mockLerServicoAtivo(...args),
}));

const mockLerConfig = vi.fn();
vi.mock('@/lib/ia-confianca/config', () => ({
  lerConfig: (...args: unknown[]) => mockLerConfig(...args),
}));

const mockMontarSnapshotSla = vi.fn();
vi.mock('@/lib/sla-snapshot', () => ({
  montarSnapshotSla: (...args: unknown[]) => mockMontarSnapshotSla(...args),
}));

import {
  ativoDaConfirmacao,
  confirmarAbertura,
  decisoesDaProposta,
  montarDescricao,
  montarTituloChat,
} from '../confirmar';

/**
 * A confirmação do cartão resumo (spec 0004). O chamado nasce `aberto` com o
 * que o banco guarda; do navegador vêm só a conversa, o cartão, a unidade, o
 * local e, no modo manual, o tipo.
 *
 * covers: AC-9 (cartão manual sem serviço), AC-10 (conferências, dados do
 * chamado e decisões da proposta), AC-11 (mensagem final, notificação, clique
 * duplo), AC-12 (cartão desatualizado), AC-16 (log sem texto), AC-17 (dono e
 * corpo estrito)
 */

const VIEWER = { userId: '6aad5286df6f201a25eda111', role: 'Solicitante' as const };
const CONVERSA_ID = '6aad5286df6f201a25eda5f1';
const CARTAO_ID = '6aad5286df6f201a25eda5f5';
const OUTRO_CARTAO = '6aad5286df6f201a25eda5f6';
const CALL_ID = '6aad5286df6f201a25eda5f4';
const SERVICO_ID = '6aad5286df6f201a25edb001';
const SUBTIPO_ID = '6aad5286df6f201a25edb002';
const UNIDADE_ID = '6aad5286df6f201a25edc001';
const CHAMADO_ID = '6aad5286df6f201a25edd001';
const ATIVO_A = '6aad5286df6f201a25ede001';
const ATIVO_B = '6aad5286df6f201a25ede002';
const ATIVO_FORA = '6aad5286df6f201a25ede009';
const OUTRA_UNIDADE = '6aad5286df6f201a25edc002';
const CODIGO_DE: Record<string, string> = { [ATIVO_A]: '11997', [ATIVO_B]: '11998' };

const SERVICO_ATIVO = {
  catalogServiceId: SERVICO_ID,
  subtypeId: SUBTIPO_ID,
  tipoServico: 'Manutenção Predial',
  rotuloServico: 'Troca de lâmpada',
  rotuloSubtipo: 'Iluminação',
};

function proposta(extra: Record<string, unknown> = {}) {
  return {
    cartaoMensagemId: CARTAO_ID,
    servico: {
      catalogServiceId: SERVICO_ID,
      subtypeId: SUBTIPO_ID,
      tipoServico: 'Manutenção Predial',
      confianca: 0.91,
      motivo: 'Lâmpada queimada.',
    },
    prioridade: { prioridade: 'NORMAL', confianca: 0.55, motivo: 'Sem risco.' },
    localExato: 'Sala 302',
    localForaDoPerfil: false,
    completo: true,
    llmCallId: CALL_ID,
    modelo: 'qwen3',
    promptVersion: '1',
    task: 'conversa.abertura',
    origemMensagemId: '6aad5286df6f201a25eda5f2',
    atualizadaEm: new Date(),
    ...extra,
  };
}

function cartao(modo: 'ia' | 'manual' = 'ia') {
  return {
    id: CARTAO_ID,
    autor: modo === 'ia' ? 'ia' : 'sistema',
    payload: {
      modo,
      servico: modo === 'ia' ? SERVICO_ATIVO : null,
      unidade: { unitId: UNIDADE_ID, rotulo: 'Fórum Central', andar: '3º andar' },
      localExato: 'Sala 302',
      faltando: modo === 'ia' ? [] : ['tipo'],
    },
  };
}

function lida(extra: Record<string, unknown> = {}) {
  return { ok: true, situacao: 'rascunho', proposta: proposta(), cartaoAtual: cartao(), ...extra };
}

const ENTRADA = {
  conversaId: CONVERSA_ID,
  cartaoId: CARTAO_ID,
  unitId: UNIDADE_ID,
  localExato: '  Sala 302, perto da janela  ',
};

let avisos: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  avisos = [];
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    avisos.push(args.map(String).join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  mockLerProposta.mockResolvedValue(lida());
  mockLerServicoAtivo.mockResolvedValue(SERVICO_ATIVO);
  mockUnidade.mockResolvedValue({ _id: UNIDADE_ID });
  mockLerMensagens.mockResolvedValue([
    { autor: 'solicitante', tipo: 'texto', texto: 'A lâmpada queimou.' },
    { autor: 'ia', tipo: 'texto', texto: 'Onde fica?' },
    { autor: 'solicitante', tipo: 'texto', texto: 'Na sala 302.' },
    { autor: 'ia', tipo: 'cartao', texto: 'Resumo do chamado' },
    { autor: 'sistema', tipo: 'texto', texto: 'Aviso do Sigma' },
  ]);
  mockAbrir.mockResolvedValue({
    ok: true,
    chamadoId: CHAMADO_ID,
    ticketNumber: '2026-0412',
    jaExistia: false,
  });
  mockEnviarMensagem.mockResolvedValue({ ok: true, destino: 'conversa', id: 'x' });
  mockNotificar.mockResolvedValue(undefined);
  // A atribuição automática (spec 0008) desligada por padrão: nada muda nos outros testes.
  mockTentarAtribuicao.mockResolvedValue({ resultado: 'nao_tentada' });
  mockInvalidarCartao.mockResolvedValue({ ok: true });
  // Portão de confiança fechado por padrão (spec 0007): os testes existentes
  // seguem cobrindo o caminho de sempre, `aberto` com sugestão.
  mockLerConfig.mockResolvedValue({
    servico: { limiteConfianca: null, amostraMinima: 30 },
    prioridade: { limiteConfianca: null, amostraMinima: 30 },
    autonomiaAtiva: false,
  });
  mockMontarSnapshotSla.mockResolvedValue({ ok: false, motivo: 'não usado neste caminho' });
  mockRegistrarDecisao.mockResolvedValue({ ok: true, decisaoId: 'd1' });
  mockBuscarAtivoVinculavel.mockImplementation(async (id: string) => ({
    _id: id,
    codigo: CODIGO_DE[id],
  }));
});

// ── funções puras · AC-10 ────────────────────────────────────────

describe('montarTituloChat', () => {
  it('une o rótulo e o local com travessão', () => {
    // Act & Assert
    expect(montarTituloChat({ rotulo: 'Troca de lâmpada', localExato: 'Sala 302' })).toBe(
      'Troca de lâmpada — Sala 302',
    );
  });

  it('tira espaço das pontas dos dois lados', () => {
    // Act & Assert
    expect(montarTituloChat({ rotulo: ' Elevador ', localExato: ' Hall ' })).toBe(
      'Elevador — Hall',
    );
  });
});

describe('montarDescricao', () => {
  it('junta só o texto do solicitante, na ordem, com uma linha em branco', () => {
    // Act
    const descricao = montarDescricao([
      { autor: 'solicitante', tipo: 'texto', texto: 'primeiro' },
      { autor: 'ia', tipo: 'texto', texto: 'da ia' },
      { autor: 'solicitante', tipo: 'texto', texto: 'segundo' },
      { autor: 'sistema', tipo: 'texto', texto: 'do sistema' },
    ]);

    // Assert: nada escrito pelo modelo entra na descrição
    expect(descricao).toBe('primeiro\n\nsegundo');
  });
});

describe('decisoesDaProposta', () => {
  it('monta serviço e prioridade como sugestão da IA, com o meta da proposta', () => {
    // Act
    const decisoes = decisoesDaProposta(proposta() as never, SERVICO_ATIVO as never);

    // Assert
    expect(decisoes).toEqual([
      expect.objectContaining({
        campo: 'servico',
        decididoPor: 'ia',
        efeito: 'sugestao',
        confianca: 0.91,
        motivo: 'Lâmpada queimada.',
        valor: {
          catalogServiceId: SERVICO_ID,
          subtypeId: SUBTIPO_ID,
          tipoServico: 'Manutenção Predial',
        },
        meta: { model: 'qwen3', promptVersion: '1', task: 'conversa.abertura', callId: CALL_ID },
      }),
      expect.objectContaining({
        campo: 'prioridade',
        valor: { prioridade: 'NORMAL' },
        confianca: 0.55,
      }),
    ]);
  });

  it('sem serviço (modo manual), só a prioridade', () => {
    // Act
    const decisoes = decisoesDaProposta(proposta() as never, null);

    // Assert
    expect(decisoes.map((d) => d.campo)).toEqual(['prioridade']);
  });

  it('proposta só com ponteiro de cartão, sem meta, não gera decisão', () => {
    // Act
    const decisoes = decisoesDaProposta(
      proposta({ llmCallId: null, modelo: null, servico: null, prioridade: null }) as never,
      null,
    );

    // Assert
    expect(decisoes).toEqual([]);
  });
});

// ── confirmação no modo ia · AC-10, AC-11 ────────────────────────

describe('confirmarAbertura · modo ia', () => {
  it('abre o chamado com os dados fixos, o título do serviço e a descrição do relato', async () => {
    // Act
    const r = await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    expect(r).toEqual({
      ok: true,
      chamadoId: CHAMADO_ID,
      ticketNumber: '2026-0412',
      jaExistia: false,
    });
    const { dadosChamado, decisoes } = mockAbrir.mock.calls[0][0];
    expect(dadosChamado).toMatchObject({
      titulo: 'Troca de lâmpada — Sala 302, perto da janela',
      descricao: 'A lâmpada queimou.\n\nNa sala 302.',
      status: 'aberto',
      localExato: 'Sala 302, perto da janela',
      tipoServico: 'Manutenção Predial',
      grauUrgencia: 'Normal',
      naturezaAtendimento: 'Padrão',
      requestedAttendanceNature: 'PADRAO',
      telefoneContato: '',
    });
    expect(String(dadosChamado.unitId)).toBe(UNIDADE_ID);
    expect(String(dadosChamado.solicitanteId)).toBe(VIEWER.userId);
    expect(String(dadosChamado.catalogServiceId)).toBe(SERVICO_ID);
    expect(String(dadosChamado.subtypeId)).toBe(SUBTIPO_ID);
    expect(decisoes.map((d: { campo: string }) => d.campo)).toEqual(['servico', 'prioridade']);
  });

  it('grava a mensagem de chamado aberto com o número e notifica a gestão', async () => {
    // Act
    await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    expect(mockEnviarMensagem).toHaveBeenCalledWith(
      expect.objectContaining({ autor: 'sistema', tipo: 'texto', conversaId: CONVERSA_ID }),
    );
    expect(mockEnviarMensagem.mock.calls[0][0].texto).toContain('#2026-0412');
    expect(mockEnviarMensagem.mock.calls[0][0].texto).toContain('Preposto');
    expect(mockNotificar).toHaveBeenCalledWith({
      chamadoId: CHAMADO_ID,
      ticketNumber: '2026-0412',
      titulo: 'Troca de lâmpada — Sala 302, perto da janela',
      solicitanteId: VIEWER.userId,
      jaValidado: false,
    });
  });

  it('com `jaExistia`, não grava mensagem nem notifica de novo', async () => {
    // Arrange
    mockAbrir.mockResolvedValue({
      ok: true,
      chamadoId: CHAMADO_ID,
      ticketNumber: '2026-0412',
      jaExistia: true,
    });

    // Act
    const r = await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    expect(r).toMatchObject({ ok: true, jaExistia: true });
    expect(mockEnviarMensagem).not.toHaveBeenCalled();
    expect(mockNotificar).not.toHaveBeenCalled();
  });

  it('clique duplo: conversa já vinculada devolve o mesmo chamado sem gravar nada', async () => {
    // Arrange
    mockLerProposta.mockResolvedValue(lida({ situacao: 'vinculada' }));
    mockAbrir.mockResolvedValue({
      ok: true,
      chamadoId: CHAMADO_ID,
      ticketNumber: '2026-0412',
      jaExistia: true,
    });

    // Act
    const r = await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    expect(r).toEqual({
      ok: true,
      chamadoId: CHAMADO_ID,
      ticketNumber: '2026-0412',
      jaExistia: true,
    });
    expect(mockEnviarMensagem).not.toHaveBeenCalled();
    expect(mockNotificar).not.toHaveBeenCalled();
  });

  it('não desfaz o chamado quando a notificação falha', async () => {
    // Arrange
    mockNotificar.mockRejectedValue(new Error('socket fora'));

    // Act
    const r = await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    expect(r).toMatchObject({ ok: true, chamadoId: CHAMADO_ID });
  });

  it('loga `[abertura]` com ids, modo e `jaExistia`, sem texto (AC-16)', async () => {
    // Act
    await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    const linha = avisos.find((a) => a.startsWith('[abertura]'));
    expect(linha).toContain(CONVERSA_ID);
    expect(linha).toContain(CHAMADO_ID);
    expect(linha).toContain('"modo":"ia"');
    expect(linha).toContain('"jaExistia":false');
    expect(avisos.join('\n')).not.toMatch(/Sala 302|lâmpada/);
  });
});

// ── portão de confiança · spec 0007, AC-1 a AC-4, AC-13, AC-14 ───

describe('confirmarAbertura · portão de confiança', () => {
  const SNAPSHOT = {
    priority: 'NORMAL',
    responseTargetMinutes: 120,
    resolutionTargetMinutes: 480,
    businessHoursOnly: true,
    responseDueAt: new Date('2026-01-02T12:00:00Z'),
    resolutionDueAt: new Date('2026-01-03T12:00:00Z'),
    computedAt: new Date('2026-01-01T12:00:00Z'),
    configVersion: 'v1',
  };

  function confianteAtiva() {
    mockLerConfig.mockResolvedValue({
      servico: { limiteConfianca: null, amostraMinima: 30 },
      prioridade: { limiteConfianca: 0.5, amostraMinima: 30 },
      autonomiaAtiva: true,
    });
  }

  it('confiança suficiente e snapshot de SLA ok: nasce validado, decisão aplicada (AC-1, AC-3)', async () => {
    // Arrange
    confianteAtiva();
    mockMontarSnapshotSla.mockResolvedValue({ ok: true, snapshot: SNAPSHOT });

    // Act
    await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    const { dadosChamado, decisoes } = mockAbrir.mock.calls[0][0];
    expect(dadosChamado).toMatchObject({
      status: 'validado',
      finalPriority: 'NORMAL',
      // A natureza aprovada, como a classificação manual grava (AC-1).
      attendanceNature: 'PADRAO',
      sla: SNAPSHOT,
    });
    expect(dadosChamado.classifiedAt).toBeInstanceOf(Date);
    const decisaoPrioridade = decisoes.find((d: { campo: string }) => d.campo === 'prioridade');
    expect(decisaoPrioridade.efeito).toBe('aplicado');
    const decisaoServico = decisoes.find((d: { campo: string }) => d.campo === 'servico');
    expect(decisaoServico.efeito).toBe('sugestao');
  });

  it('confiança suficiente muda o texto ao solicitante e a notificação da gestão (AC-13, AC-14)', async () => {
    // Arrange
    confianteAtiva();
    mockMontarSnapshotSla.mockResolvedValue({ ok: true, snapshot: SNAPSHOT });

    // Act
    await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    expect(mockEnviarMensagem.mock.calls[0][0].texto).not.toContain('Preposto');
    expect(mockEnviarMensagem.mock.calls[0][0].texto).toContain('prioridade normal');
    expect(mockNotificar).toHaveBeenCalledWith(expect.objectContaining({ jaValidado: true }));
  });

  it('confiante mas sem SLA config ativa: cai no caminho de sempre, sem aplicar (AC-4)', async () => {
    // Arrange
    confianteAtiva();
    mockMontarSnapshotSla.mockResolvedValue({ ok: false, motivo: 'sem config ativa' });

    // Act
    const r = await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    expect(r.ok).toBe(true);
    const { dadosChamado, decisoes } = mockAbrir.mock.calls[0][0];
    expect(dadosChamado.status).toBe('aberto');
    expect(dadosChamado.finalPriority).toBeUndefined();
    const decisaoPrioridade = decisoes.find((d: { campo: string }) => d.campo === 'prioridade');
    expect(decisaoPrioridade.efeito).toBe('sugestao');
  });

  it('falha ao ler a configuração do portão: abre no caminho de sempre, sem erro (AC-4)', async () => {
    // Arrange
    mockLerConfig.mockRejectedValue(new Error('Mongo fora do ar'));

    // Act
    const r = await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    expect(r.ok).toBe(true);
    const { dadosChamado, decisoes } = mockAbrir.mock.calls[0][0];
    expect(dadosChamado.status).toBe('aberto');
    const decisaoPrioridade = decisoes.find((d: { campo: string }) => d.campo === 'prioridade');
    expect(decisaoPrioridade.efeito).toBe('sugestao');
    expect(mockMontarSnapshotSla).not.toHaveBeenCalled();
    expect(avisos.some((a) => a.includes('portao_indisponivel'))).toBe(true);
  });

  it('autonomia desligada não valida sozinho, mesmo com confiança alta', async () => {
    // Arrange
    mockLerConfig.mockResolvedValue({
      servico: { limiteConfianca: null, amostraMinima: 30 },
      prioridade: { limiteConfianca: 0.1, amostraMinima: 30 },
      autonomiaAtiva: false,
    });

    // Act
    await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    expect(mockMontarSnapshotSla).not.toHaveBeenCalled();
    const { dadosChamado } = mockAbrir.mock.calls[0][0];
    expect(dadosChamado.status).toBe('aberto');
  });

  it('modo manual nunca valida sozinho, mesmo com autonomia ligada', async () => {
    // Arrange
    confianteAtiva();
    mockLerProposta.mockResolvedValue(lida({ cartaoAtual: cartao('manual') }));

    // Act
    await confirmarAbertura(VIEWER, { ...ENTRADA, tipoServico: 'Manutenção Predial' });

    // Assert
    expect(mockMontarSnapshotSla).not.toHaveBeenCalled();
    const { dadosChamado } = mockAbrir.mock.calls[0][0];
    expect(dadosChamado.status).toBe('aberto');
  });
});

// ── cartão desatualizado · AC-10, AC-12 ──────────────────────────

describe('confirmarAbertura · cartão desatualizado', () => {
  it('falha quando o cartão não é o atual, sem criar nada', async () => {
    // Arrange
    mockLerProposta.mockResolvedValue(
      lida({ proposta: proposta({ cartaoMensagemId: OUTRO_CARTAO }) }),
    );

    // Act
    const r = await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    expect(r).toEqual({ ok: false, reason: 'cartao_desatualizado' });
    expect(mockAbrir).not.toHaveBeenCalled();
  });

  it('ponteiro sem mensagem conta como desatualizado e zera o ponteiro', async () => {
    // Arrange
    mockLerProposta.mockResolvedValue(lida({ cartaoAtual: null }));

    // Act
    const r = await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    expect(r).toEqual({ ok: false, reason: 'cartao_desatualizado' });
    expect(mockInvalidarCartao).toHaveBeenCalledWith(VIEWER, CONVERSA_ID, CARTAO_ID);
  });

  it('serviço desativado entre o cartão e a confirmação zera o ponteiro', async () => {
    // Arrange
    mockLerServicoAtivo.mockResolvedValue(null);

    // Act
    const r = await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    expect(r).toEqual({ ok: false, reason: 'cartao_desatualizado' });
    expect(mockInvalidarCartao).toHaveBeenCalledWith(VIEWER, CONVERSA_ID, CARTAO_ID);
    expect(mockAbrir).not.toHaveBeenCalled();
  });

  it('sem proposta nenhuma, qualquer cartão está desatualizado', async () => {
    // Arrange
    mockLerProposta.mockResolvedValue(lida({ proposta: null, cartaoAtual: null }));

    // Act & Assert
    expect(await confirmarAbertura(VIEWER, ENTRADA)).toEqual({
      ok: false,
      reason: 'cartao_desatualizado',
    });
  });
});

// ── dados inválidos · AC-10 ──────────────────────────────────────

describe('confirmarAbertura · dados inválidos', () => {
  it('recusa unidade inativa ou inexistente', async () => {
    // Arrange
    mockUnidade.mockResolvedValue(null);

    // Act
    const r = await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    expect(r).toEqual({ ok: false, reason: 'dados_invalidos' });
    expect(mockAbrir).not.toHaveBeenCalled();
  });

  it('recusa local vazio ou acima de 200 caracteres', async () => {
    // Act & Assert
    expect(await confirmarAbertura(VIEWER, { ...ENTRADA, localExato: '   ' })).toEqual({
      ok: false,
      reason: 'dados_invalidos',
    });
    expect(await confirmarAbertura(VIEWER, { ...ENTRADA, localExato: 'l'.repeat(201) })).toEqual({
      ok: false,
      reason: 'dados_invalidos',
    });
  });

  it('recusa sem unidade', async () => {
    // Act & Assert
    const semUnidade: Record<string, unknown> = { ...ENTRADA };
    delete semUnidade.unitId;
    expect(await confirmarAbertura(VIEWER, semUnidade)).toEqual({
      ok: false,
      reason: 'dados_invalidos',
    });
  });
});

// ── autorização e corpo estrito · AC-17 ──────────────────────────

describe('confirmarAbertura · autorização', () => {
  it('conversa de outra pessoa sai como inexistente', async () => {
    // Arrange
    mockLerProposta.mockResolvedValue({ ok: false, reason: 'sem_permissao' });

    // Act & Assert
    expect(await confirmarAbertura(VIEWER, ENTRADA)).toEqual({
      ok: false,
      reason: 'nao_encontrada',
    });
  });

  it('recusa corpo com serviço, prioridade ou confiança', async () => {
    // Act & Assert
    for (const extra of [
      { catalogServiceId: SERVICO_ID },
      { prioridade: 'EMERGENCIAL' },
      { confianca: 1 },
      { subtypeId: SUBTIPO_ID },
    ]) {
      expect(await confirmarAbertura(VIEWER, { ...ENTRADA, ...extra })).toEqual({
        ok: false,
        reason: 'dados_invalidos',
      });
    }
    expect(mockLerProposta).not.toHaveBeenCalled();
  });
});

// ── modo manual · AC-9 ───────────────────────────────────────────

describe('confirmarAbertura · modo manual', () => {
  beforeEach(() => {
    mockLerProposta.mockResolvedValue(
      lida({ proposta: proposta({ servico: null }), cartaoAtual: cartao('manual') }),
    );
  });

  it('exige o tipo de serviço', async () => {
    // Act & Assert
    expect(await confirmarAbertura(VIEWER, ENTRADA)).toEqual({
      ok: false,
      reason: 'dados_invalidos',
    });
  });

  it('abre sem serviço do catálogo, com o tipo no título e só a decisão de prioridade', async () => {
    // Act
    const r = await confirmarAbertura(VIEWER, { ...ENTRADA, tipoServico: 'Elevador' });

    // Assert
    expect(r).toMatchObject({ ok: true });
    const { dadosChamado, decisoes } = mockAbrir.mock.calls[0][0];
    expect(dadosChamado).toMatchObject({
      titulo: 'Elevador — Sala 302, perto da janela',
      tipoServico: 'Elevador',
      catalogServiceId: null,
      subtypeId: null,
    });
    expect(decisoes.map((d: { campo: string }) => d.campo)).toEqual(['prioridade']);
    expect(mockLerServicoAtivo).not.toHaveBeenCalled();
  });

  it('recusa tipo fora das três opções', async () => {
    // Act & Assert
    expect(await confirmarAbertura(VIEWER, { ...ENTRADA, tipoServico: 'Pintura' })).toEqual({
      ok: false,
      reason: 'dados_invalidos',
    });
  });
});

// ── atribuição automática · spec 0008, AC-1, AC-6, AC-7, AC-12, AC-13 ──

describe('confirmarAbertura · atribuição automática', () => {
  const SNAPSHOT = {
    priority: 'NORMAL',
    responseTargetMinutes: 120,
    resolutionTargetMinutes: 480,
    businessHoursOnly: true,
    responseDueAt: new Date('2026-01-02T12:00:00Z'),
    resolutionDueAt: new Date('2026-01-03T12:00:00Z'),
    computedAt: new Date('2026-01-01T12:00:00Z'),
    configVersion: 'v1',
  };

  /** O portão da 0007 aberto: o chamado nasce `validado`, e só então o passo entra em cena. */
  function nasceValidado() {
    mockLerConfig.mockResolvedValue({
      servico: { limiteConfianca: null, amostraMinima: 30 },
      prioridade: { limiteConfianca: 0.5, amostraMinima: 30 },
      autonomiaAtiva: true,
      atribuicaoAutomaticaAtiva: true,
    });
    mockMontarSnapshotSla.mockResolvedValue({ ok: true, snapshot: SNAPSHOT });
  }

  it('chamado que nasceu validado pelo chat chama o passo uma vez, com o subtipo do serviço lido no servidor (AC-1)', async () => {
    // Arrange
    nasceValidado();

    // Act
    await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    expect(mockTentarAtribuicao).toHaveBeenCalledOnce();
    expect(mockTentarAtribuicao).toHaveBeenCalledWith({
      chamadoId: CHAMADO_ID,
      solicitanteId: VIEWER.userId,
      subtypeId: SUBTIPO_ID,
      titulo: 'Troca de lâmpada — Sala 302, perto da janela',
      ticketNumber: '2026-0412',
    });
  });

  it('atribuído: a frase do chat diz o técnico e o aviso da gestão leva o resultado (AC-12, AC-13)', async () => {
    // Arrange
    nasceValidado();
    mockTentarAtribuicao.mockResolvedValue({
      resultado: 'atribuido',
      tecnicoId: '6aad5286df6f201a25eda333',
      tecnicoNome: 'Carla',
    });

    // Act
    await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    const texto = mockEnviarMensagem.mock.calls[0][0].texto;
    expect(texto).toContain('o técnico Carla já foi designado');
    expect(texto).not.toContain('Preposto');
    expect(mockNotificar).toHaveBeenCalledWith(
      expect.objectContaining({
        jaValidado: true,
        atribuicao: {
          resultado: 'atribuido',
          tecnicoId: '6aad5286df6f201a25eda333',
          tecnicoNome: 'Carla',
        },
      }),
    );
  });

  it('sem técnico: a frase diz que um Preposto designa, e o motivo vai só à gestão (AC-12, AC-13)', async () => {
    // Arrange
    nasceValidado();
    mockTentarAtribuicao.mockResolvedValue({ resultado: 'sem_tecnico', motivo: 'sem_vaga' });

    // Act
    await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    const texto = mockEnviarMensagem.mock.calls[0][0].texto;
    expect(texto).toContain('Um Preposto vai designar o técnico');
    expect(texto).not.toContain('limite');
    expect(mockNotificar).toHaveBeenCalledWith(
      expect.objectContaining({ atribuicao: { resultado: 'sem_tecnico', motivo: 'sem_vaga' } }),
    );
  });

  it('nao_tentada (passo desligado ou corrida perdida): a frase e o aviso da 0007, sem a chave atribuicao (AC-12, AC-13)', async () => {
    // Arrange
    nasceValidado();
    mockTentarAtribuicao.mockResolvedValue({ resultado: 'nao_tentada' });

    // Act
    await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    expect(mockEnviarMensagem.mock.calls[0][0].texto).toBe(
      'Chamado #2026-0412 aberto com prioridade normal, já validada. Você acompanha o atendimento por aqui.',
    );
    expect('atribuicao' in mockNotificar.mock.calls[0][0]).toBe(false);
  });

  it('o passo lançando, contra o contrato, não vira erro para a pessoa: o chamado abre como na 0007', async () => {
    // Arrange
    nasceValidado();
    mockTentarAtribuicao.mockRejectedValue(new Error('quebrou'));

    // Act
    const r = await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    expect(r).toMatchObject({ ok: true, chamadoId: CHAMADO_ID, jaExistia: false });
    expect(mockEnviarMensagem.mock.calls[0][0].texto).toContain('já validada');
    expect(mockNotificar).toHaveBeenCalled();
    expect(avisos.some((a) => a.includes('atribuicao_indisponivel'))).toBe(true);
  });

  it('o passo lançando algo que não é Error: o log diz "desconhecido" e a abertura segue', async () => {
    // Arrange
    nasceValidado();
    mockTentarAtribuicao.mockRejectedValue('caiu sem ser um Error');

    // Act
    const r = await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    expect(r).toMatchObject({ ok: true, chamadoId: CHAMADO_ID, jaExistia: false });
    const linha = avisos.find((a) => a.includes('atribuicao_indisponivel'));
    expect(linha).toContain('"erro":"desconhecido"');
    expect(mockEnviarMensagem.mock.calls[0][0].texto).toContain('já validada');
  });

  it('chamado que nasce aberto (sem confiança) nunca passa pelo passo (AC-6)', async () => {
    // Arrange: portão fechado por padrão no beforeEach

    // Act
    await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    expect(mockTentarAtribuicao).not.toHaveBeenCalled();
  });

  it('chamado do modo manual nunca passa pelo passo, mesmo com as duas chaves ligadas (AC-6)', async () => {
    // Arrange
    nasceValidado();
    mockLerProposta.mockResolvedValue(lida({ cartaoAtual: cartao('manual') }));

    // Act
    await confirmarAbertura(VIEWER, { ...ENTRADA, tipoServico: 'Manutenção Predial' });

    // Assert
    expect(mockTentarAtribuicao).not.toHaveBeenCalled();
  });

  it('confiante mas sem SLA config: nasce aberto e nunca passa pelo passo (AC-6)', async () => {
    // Arrange
    nasceValidado();
    mockMontarSnapshotSla.mockResolvedValue({ ok: false, motivo: 'sem config ativa' });

    // Act
    await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    expect(mockTentarAtribuicao).not.toHaveBeenCalled();
  });

  it('clique duplo com a conversa já vinculada não atribui, não avisa e não grava frase de novo (AC-7)', async () => {
    // Arrange
    nasceValidado();
    mockLerProposta.mockResolvedValue(lida({ situacao: 'vinculada' }));

    // Act
    const r = await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    expect(r).toMatchObject({ ok: true, jaExistia: true });
    expect(mockTentarAtribuicao).not.toHaveBeenCalled();
    expect(mockEnviarMensagem).not.toHaveBeenCalled();
    expect(mockNotificar).not.toHaveBeenCalled();
  });

  it('a abertura devolvendo jaExistia (corrida entre duas confirmações) também não atribui (AC-7)', async () => {
    // Arrange
    nasceValidado();
    mockAbrir.mockResolvedValue({
      ok: true,
      chamadoId: CHAMADO_ID,
      ticketNumber: '2026-0412',
      jaExistia: true,
    });

    // Act
    await confirmarAbertura(VIEWER, ENTRADA);

    // Assert
    expect(mockTentarAtribuicao).not.toHaveBeenCalled();
    expect(mockEnviarMensagem).not.toHaveBeenCalled();
    expect(mockNotificar).not.toHaveBeenCalled();
  });
});

// ── equipamento do cartão · spec 0014 ────────────────────────────

describe('confirmarAbertura · equipamento (spec 0014)', () => {
  const candidato = (ativoId: string) => ({
    ativoId,
    codigo: CODIGO_DE[ativoId]!,
    descricao: 'Split',
    caminho: 'Sede/Sala 302',
  });

  function comAtivo(origem: 'codigo' | 'regra', ids: string[] = [ATIVO_A]) {
    const c = cartao();
    mockLerProposta.mockResolvedValue(
      lida({
        cartaoAtual: {
          ...c,
          payload: { ...c.payload, ativo: { origem, candidatos: ids.map(candidato) } },
        },
      }),
    );
  }

  it('grava o ativo escolhido, o código na abertura e a decisão da regra (AC-8, AC-10)', async () => {
    // Arrange
    comAtivo('codigo');

    // Act
    const r = await confirmarAbertura(VIEWER, { ...ENTRADA, ativoId: ATIVO_A });

    // Assert
    expect(r.ok).toBe(true);
    const chamada = mockAbrir.mock.calls[0][0];
    expect(String(chamada.dadosChamado.ativoId)).toBe(ATIVO_A);
    expect(chamada.codigoAtivo).toBe('11997');
    expect(chamada.decisoes.map((d: { campo: string }) => d.campo)).not.toContain('ativo');
    expect(mockRegistrarDecisao).toHaveBeenCalledWith(
      expect.objectContaining({
        chamadoId: CHAMADO_ID,
        conversaId: CONVERSA_ID,
        campo: 'ativo',
        decididoPor: 'regra',
        efeito: 'aplicado',
        valor: { ativoId: ATIVO_A },
        confianca: null,
      }),
    );
  });

  it('escolhe um entre vários candidatos da regra', async () => {
    comAtivo('regra', [ATIVO_A, ATIVO_B]);
    await confirmarAbertura(VIEWER, { ...ENTRADA, ativoId: ATIVO_B });
    expect(String(mockAbrir.mock.calls[0][0].dadosChamado.ativoId)).toBe(ATIVO_B);
  });

  it('"Não sei" ou tirado (ativoId null) abre sem ativo e sem decisão', async () => {
    comAtivo('codigo');
    await confirmarAbertura(VIEWER, { ...ENTRADA, ativoId: null });
    expect(mockAbrir.mock.calls[0][0].dadosChamado.ativoId).toBeNull();
    expect(mockAbrir.mock.calls[0][0].codigoAtivo).toBeNull();
    expect(mockRegistrarDecisao).not.toHaveBeenCalled();
  });

  it('id fora dos candidatos abre sem ativo, sem erro, e avisa com o conversaId (AC-8)', async () => {
    comAtivo('codigo');
    const r = await confirmarAbertura(VIEWER, { ...ENTRADA, ativoId: ATIVO_FORA });
    expect(r.ok).toBe(true);
    expect(mockAbrir.mock.calls[0][0].dadosChamado.ativoId).toBeNull();
    expect(
      avisos.some((a) => a.includes('ativo_fora_dos_candidatos') && a.includes(CONVERSA_ID)),
    ).toBe(true);
  });

  it('valor que nem é ObjectId não vira dados_invalidos (AC-8)', async () => {
    comAtivo('codigo');
    const r = await confirmarAbertura(VIEWER, { ...ENTRADA, ativoId: 'xyz' });
    expect(r.ok).toBe(true);
    expect(mockAbrir.mock.calls[0][0].dadosChamado.ativoId).toBeNull();
  });

  it('ativo baixado entre o cartão e a confirmação abre sem ativo (AC-8)', async () => {
    comAtivo('codigo');
    mockBuscarAtivoVinculavel.mockResolvedValue(null);
    const r = await confirmarAbertura(VIEWER, { ...ENTRADA, ativoId: ATIVO_A });
    expect(r.ok).toBe(true);
    expect(mockAbrir.mock.calls[0][0].dadosChamado.ativoId).toBeNull();
    expect(mockRegistrarDecisao).not.toHaveBeenCalled();
  });

  it('cartão antigo, sem o campo ativo, ignora qualquer ativoId', async () => {
    const r = await confirmarAbertura(VIEWER, { ...ENTRADA, ativoId: ATIVO_A });
    expect(r.ok).toBe(true);
    expect(mockAbrir.mock.calls[0][0].dadosChamado.ativoId).toBeNull();
  });

  it('com a unidade trocada, ignora o ativo da regra (AC-6)', async () => {
    comAtivo('regra');
    await confirmarAbertura(VIEWER, { ...ENTRADA, unitId: OUTRA_UNIDADE, ativoId: ATIVO_A });
    expect(mockAbrir.mock.calls[0][0].dadosChamado.ativoId).toBeNull();
  });

  it('com a unidade trocada, mantém o ativo do código (AC-6)', async () => {
    comAtivo('codigo');
    await confirmarAbertura(VIEWER, { ...ENTRADA, unitId: OUTRA_UNIDADE, ativoId: ATIVO_A });
    expect(String(mockAbrir.mock.calls[0][0].dadosChamado.ativoId)).toBe(ATIVO_A);
  });

  it('falha ao gravar a decisão não desfaz o chamado e loga o chamadoId (AC-10)', async () => {
    // Arrange
    comAtivo('codigo');
    const erros: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      erros.push(a.map(String).join(' '));
    });
    mockRegistrarDecisao.mockRejectedValue(new Error('banco caiu'));

    // Act
    const r = await confirmarAbertura(VIEWER, { ...ENTRADA, ativoId: ATIVO_A });

    // Assert
    expect(r).toMatchObject({ ok: true, chamadoId: CHAMADO_ID });
    expect(erros.some((e) => e.includes(CHAMADO_ID) && e.includes('decisaoAtivo'))).toBe(true);
  });

  it('decisão que já existia (repetição) não é tratada como falha', async () => {
    comAtivo('codigo');
    const erros: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      erros.push(a.map(String).join(' '));
    });
    mockRegistrarDecisao.mockResolvedValue({ ok: false, reason: 'ja_existe' });
    await confirmarAbertura(VIEWER, { ...ENTRADA, ativoId: ATIVO_A });
    expect(erros.filter((e) => e.includes('decisaoAtivo'))).toEqual([]);
  });

  it('com jaExistia não grava a decisão de novo', async () => {
    comAtivo('codigo');
    mockAbrir.mockResolvedValue({
      ok: true,
      chamadoId: CHAMADO_ID,
      ticketNumber: '2026-0412',
      jaExistia: true,
    });
    await confirmarAbertura(VIEWER, { ...ENTRADA, ativoId: ATIVO_A });
    expect(mockRegistrarDecisao).not.toHaveBeenCalled();
  });

  it('o ativo não muda status, SLA, decisões nem atribuição (AC-9)', async () => {
    // Arrange: portão confiante, confirmando com e sem ativo
    mockLerConfig.mockResolvedValue({
      servico: { limiteConfianca: null, amostraMinima: 30 },
      prioridade: { limiteConfianca: 0.5, amostraMinima: 30 },
      autonomiaAtiva: true,
    });
    mockMontarSnapshotSla.mockResolvedValue({ ok: true, snapshot: { priority: 'NORMAL' } });
    comAtivo('codigo');

    // Act
    await confirmarAbertura(VIEWER, { ...ENTRADA, ativoId: ATIVO_A });
    await confirmarAbertura(VIEWER, { ...ENTRADA, ativoId: null });

    // Assert
    const [com, sem] = mockAbrir.mock.calls.map((c) => c[0]);
    const semAtivo = (dados: Record<string, unknown>) => {
      const resto = { ...dados };
      delete resto.ativoId;
      delete resto.classifiedAt;
      return resto;
    };
    expect(semAtivo(com.dadosChamado)).toEqual(semAtivo(sem.dadosChamado));
    expect(com.dadosChamado.status).toBe('validado');
    expect(com.decisoes).toEqual(sem.decisoes);
    expect(mockTentarAtribuicao).toHaveBeenCalledTimes(2);
  });

  it('o log de abertura leva origem e quantidade, nunca o código (AC-13)', async () => {
    comAtivo('regra', [ATIVO_A, ATIVO_B]);
    await confirmarAbertura(VIEWER, { ...ENTRADA, ativoId: ATIVO_A });
    const linha = avisos.find((a) => a.startsWith('[abertura]') && a.includes('ativoOrigem'));
    expect(linha).toContain('"ativoOrigem":"regra"');
    expect(linha).toContain('"ativoCandidatos":2');
    expect(linha).not.toContain('11997');
  });
});

describe('ativoDaConfirmacao', () => {
  it('sem ativoId não consulta o banco', async () => {
    const r = await ativoDaConfirmacao({
      conversaId: CONVERSA_ID,
      ativoId: undefined,
      cartao: cartao().payload as never,
      unitId: UNIDADE_ID,
    });
    expect(r).toBeNull();
    expect(mockBuscarAtivoVinculavel).not.toHaveBeenCalled();
  });

  it('erro de banco vira "sem ativo", sem lançar', async () => {
    mockBuscarAtivoVinculavel.mockRejectedValue(new Error('timeout'));
    const payload = {
      ...cartao().payload,
      ativo: {
        origem: 'codigo',
        candidatos: [{ ativoId: ATIVO_A, codigo: '11997', descricao: 'Split', caminho: null }],
      },
    };
    const r = await ativoDaConfirmacao({
      conversaId: CONVERSA_ID,
      ativoId: ATIVO_A,
      cartao: payload as never,
      unitId: UNIDADE_ID,
    });
    expect(r).toBeNull();
  });
});
