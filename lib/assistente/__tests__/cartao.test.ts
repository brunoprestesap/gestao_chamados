import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));

const mockLerProposta = vi.fn();
const mockGravarCartao = vi.fn();
vi.mock('@/lib/conversas', () => ({
  lerProposta: (...args: unknown[]) => mockLerProposta(...args),
  gravarCartao: (...args: unknown[]) => mockGravarCartao(...args),
}));

const mockLerServicoAtivo = vi.fn();
vi.mock('../catalogo', () => ({
  lerServicoAtivo: (...args: unknown[]) => mockLerServicoAtivo(...args),
}));

const mockResolverAtivo = vi.fn();
vi.mock('../ativo-do-cartao', () => ({
  resolverAtivoDoCartao: (...args: unknown[]) => mockResolverAtivo(...args),
}));

const mockBuscarDuplicados = vi.fn();
vi.mock('../duplicados', () => ({
  buscarDuplicados: (...args: unknown[]) => mockBuscarDuplicados(...args),
}));

const mockLerPerfil = vi.fn();
vi.mock('../perfil', () => ({
  lerPerfil: (...args: unknown[]) => mockLerPerfil(...args),
}));

import { cartaoPayloadSchema } from '@/shared/conversas/conversa.schemas';

import { montarCartao, revisarAbertura } from '../cartao';

/**
 * O cartão resumo e o `Revisar e abrir` (spec 0004). Montar cartão nunca chama
 * o modelo: sai da proposta guardada, com rótulos lidos do banco.
 *
 * covers: AC-5 (rótulos do banco e frase do Sigma), AC-6 (unidade do perfil ou
 * obrigatória), AC-7 (modo ia, modo manual e cartão devolvido sem gravar),
 * AC-17 (só o dono, no rascunho)
 */

const VIEWER = { userId: '6aad5286df6f201a25eda111', role: 'Solicitante' as const };
const CONVERSA_ID = '6aad5286df6f201a25eda5f1';
const CARTAO_ID = '6aad5286df6f201a25eda5f5';
const NOVO_ID = '6aad5286df6f201a25eda5f8';
const CALL_ID = '6aad5286df6f201a25eda5f4';
const SERVICO_ID = '6aad5286df6f201a25edb001';
const SUBTIPO_ID = '6aad5286df6f201a25edb002';
const UNIDADE_ID = '6aad5286df6f201a25edc001';

const PERFIL = { unidade: { unitId: UNIDADE_ID, nome: 'Fórum Central', andar: '3º andar' } };
const SERVICO_ATIVO = {
  catalogServiceId: SERVICO_ID,
  subtypeId: SUBTIPO_ID,
  tipoServico: 'Manutenção Predial',
  rotuloServico: 'Troca de lâmpada',
  rotuloSubtipo: 'Iluminação',
};

function proposta(extra: Record<string, unknown> = {}) {
  return {
    cartaoMensagemId: null,
    servico: {
      catalogServiceId: SERVICO_ID,
      subtypeId: SUBTIPO_ID,
      tipoServico: 'Manutenção Predial',
      confianca: 0.9,
      motivo: 'Lâmpada.',
    },
    prioridade: null,
    localExato: 'Sala 302',
    localForaDoPerfil: false,
    completo: false,
    llmCallId: CALL_ID,
    modelo: 'qwen3',
    promptVersion: '1',
    task: 'conversa.abertura',
    origemMensagemId: '6aad5286df6f201a25eda5f2',
    atualizadaEm: new Date(),
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mockLerServicoAtivo.mockResolvedValue(SERVICO_ATIVO);
  mockResolverAtivo.mockResolvedValue(null);
  mockBuscarDuplicados.mockResolvedValue(null);
  mockLerPerfil.mockResolvedValue(PERFIL);
  mockLerProposta.mockResolvedValue({
    ok: true,
    situacao: 'rascunho',
    proposta: proposta(),
    cartaoAtual: null,
  });
  mockGravarCartao.mockResolvedValue({ ok: true, mensagemId: NOVO_ID, substituiId: null });
});

// ── montarCartao · AC-5, AC-6 ────────────────────────────────────

describe('montarCartao', () => {
  it('modo ia: rótulos do banco, unidade do perfil e local, nada faltando', async () => {
    // Act
    const montado = await montarCartao({
      viewer: VIEWER,
      buscarDuplicados: false,
      conversaId: CONVERSA_ID,
      proposta: proposta() as never,
      perfil: PERFIL,
    });

    // Assert
    expect(montado.autor).toBe('ia');
    expect(montado.payload).toEqual({
      modo: 'ia',
      servico: SERVICO_ATIVO,
      unidade: { unitId: UNIDADE_ID, rotulo: 'Fórum Central', andar: '3º andar' },
      localExato: 'Sala 302',
      faltando: [],
      ativo: null,
      duplicados: null,
    });
    expect(cartaoPayloadSchema.safeParse(montado.payload).success).toBe(true);
  });

  it('a frase do cartão usa só os rótulos e avisa da descrição', async () => {
    // Act
    const montado = await montarCartao({
      viewer: VIEWER,
      buscarDuplicados: false,
      conversaId: CONVERSA_ID,
      proposta: proposta() as never,
      perfil: PERFIL,
    });

    // Assert
    expect(montado.texto).toContain('Troca de lâmpada');
    expect(montado.texto).toContain('Fórum Central');
    expect(montado.texto).toContain('Sala 302');
    expect(montado.texto).toContain('vira a descrição do chamado');
    expect(montado.texto).not.toContain('Lâmpada.');
  });

  it('sem unidade no perfil, a unidade chega vazia e obrigatória', async () => {
    // Act
    const montado = await montarCartao({
      viewer: VIEWER,
      buscarDuplicados: false,
      conversaId: CONVERSA_ID,
      proposta: proposta() as never,
      perfil: { unidade: null },
    });

    // Assert
    expect(montado.payload.unidade).toBeNull();
    expect(montado.payload.faltando).toEqual(['unidade']);
  });

  it('com o relato falando de outro lugar, não traz a unidade do perfil', async () => {
    // Act
    const montado = await montarCartao({
      viewer: VIEWER,
      buscarDuplicados: false,
      conversaId: CONVERSA_ID,
      proposta: proposta({ localForaDoPerfil: true }) as never,
      perfil: PERFIL,
    });

    // Assert
    expect(montado.payload.unidade).toBeNull();
    expect(montado.payload.faltando).toContain('unidade');
  });

  it('serviço que deixou de valer vira cartão manual, de autor sistema', async () => {
    // Arrange
    mockLerServicoAtivo.mockResolvedValue(null);

    // Act
    const montado = await montarCartao({
      viewer: VIEWER,
      buscarDuplicados: false,
      conversaId: CONVERSA_ID,
      proposta: proposta() as never,
      perfil: PERFIL,
    });

    // Assert
    expect(montado.autor).toBe('sistema');
    expect(montado.payload).toMatchObject({ modo: 'manual', servico: null, faltando: ['tipo'] });
  });

  it('sem proposta nenhuma, cartão manual pedindo tipo e local', async () => {
    // Act
    const montado = await montarCartao({
      viewer: VIEWER,
      buscarDuplicados: false,
      conversaId: CONVERSA_ID,
      proposta: null,
      perfil: PERFIL,
    });

    // Assert
    expect(montado.payload).toMatchObject({
      modo: 'manual',
      servico: null,
      localExato: null,
      faltando: ['tipo', 'local'],
    });
  });

  it('sem proposta e sem unidade no perfil, falta tipo, unidade e local juntos', async () => {
    // Act
    const montado = await montarCartao({
      viewer: VIEWER,
      buscarDuplicados: false,
      conversaId: CONVERSA_ID,
      proposta: null,
      perfil: { unidade: null },
    });

    // Assert
    expect(montado.payload).toMatchObject({
      modo: 'manual',
      servico: null,
      unidade: null,
      localExato: null,
      faltando: ['tipo', 'unidade', 'local'],
    });
  });
});

// ── revisarAbertura · AC-7, AC-17 ────────────────────────────────

describe('revisarAbertura', () => {
  it('grava o cartão da proposta atual, mesmo incompleta, sem chamar o modelo', async () => {
    // Act
    const r = await revisarAbertura(VIEWER, CONVERSA_ID);

    // Assert
    expect(r).toMatchObject({ ok: true, mensagemId: NOVO_ID, substituiId: null });
    expect(mockGravarCartao).toHaveBeenCalledWith(
      expect.objectContaining({ autor: 'ia', llmCallId: CALL_ID, conversaId: CONVERSA_ID }),
    );
  });

  it('devolve o mesmo cartão, sem gravar, quando a proposta não mudou desde ele', async () => {
    // Arrange
    const payload = (
      await montarCartao({
        viewer: VIEWER,
        buscarDuplicados: false,
        conversaId: CONVERSA_ID,
        proposta: proposta() as never,
        perfil: PERFIL,
      })
    ).payload;
    mockLerProposta.mockResolvedValue({
      ok: true,
      situacao: 'rascunho',
      proposta: proposta({ cartaoMensagemId: CARTAO_ID }),
      cartaoAtual: { id: CARTAO_ID, autor: 'ia', payload },
    });

    // Act
    const r = await revisarAbertura(VIEWER, CONVERSA_ID);

    // Assert
    expect(r).toEqual({ ok: true, mensagemId: CARTAO_ID, cartao: payload, substituiId: null });
    expect(mockGravarCartao).not.toHaveBeenCalled();
  });

  it('sem proposta, grava o cartão manual sem `llmCallId`', async () => {
    // Arrange
    mockLerProposta.mockResolvedValue({
      ok: true,
      situacao: 'rascunho',
      proposta: null,
      cartaoAtual: null,
    });

    // Act
    const r = await revisarAbertura(VIEWER, CONVERSA_ID);

    // Assert
    expect(r).toMatchObject({ ok: true, cartao: { modo: 'manual' } });
    expect(mockGravarCartao).toHaveBeenCalledWith(
      expect.objectContaining({ autor: 'sistema', llmCallId: null }),
    );
  });

  it('conversa de outra pessoa sai como inexistente', async () => {
    // Arrange
    mockLerProposta.mockResolvedValue({ ok: false, reason: 'sem_permissao' });

    // Act & Assert
    expect(await revisarAbertura(VIEWER, CONVERSA_ID)).toEqual({
      ok: false,
      reason: 'nao_encontrada',
    });
    expect(mockGravarCartao).not.toHaveBeenCalled();
  });

  it('conversa que virou chamado sai como inexistente', async () => {
    // Arrange
    mockLerProposta.mockResolvedValue({
      ok: true,
      situacao: 'vinculada',
      proposta: proposta(),
      cartaoAtual: null,
    });

    // Act & Assert
    expect(await revisarAbertura(VIEWER, CONVERSA_ID)).toEqual({
      ok: false,
      reason: 'nao_encontrada',
    });
  });

  it('confirmação em andamento avisa em vez de gravar cartão', async () => {
    // Arrange
    mockLerProposta.mockResolvedValue({
      ok: true,
      situacao: 'reservada',
      proposta: proposta(),
      cartaoAtual: null,
    });

    // Act & Assert
    expect(await revisarAbertura(VIEWER, CONVERSA_ID)).toEqual({
      ok: false,
      reason: 'confirmacao_em_andamento',
    });
  });

  it('nunca lança', async () => {
    // Arrange
    mockLerPerfil.mockRejectedValue(new Error('banco fora'));

    // Act & Assert
    expect(await revisarAbertura(VIEWER, CONVERSA_ID)).toEqual({ ok: false, reason: 'erro' });
  });
});

// ── chamados parecidos · spec 0017, AC-5a, AC-6 ──────────────────

describe('montarCartao · chamados parecidos (spec 0017)', () => {
  const PARECIDO = {
    chamadoId: '6aad5286df6f201a25edf001',
    ticketNumber: 'CHM-2026-00001',
    rotuloServico: 'Troca de lâmpada',
    localExato: 'Sala 302',
    ativoCodigo: null,
    status: 'aberto',
    abertoEm: '2026-10-07T12:00:00.000Z',
    proprio: false,
    jaTemAcesso: false,
  };

  it('com o sinal ligado, procura depois do ativo, com quem relata e o cartão montado', async () => {
    // Arrange
    const ativo = {
      origem: 'codigo',
      candidatos: [
        { ativoId: '6aad5286df6f201a25ede001', codigo: '11997', descricao: 'Split', caminho: null },
      ],
    };
    mockResolverAtivo.mockResolvedValue(ativo);
    mockBuscarDuplicados.mockResolvedValue([PARECIDO]);

    // Act
    const montado = await montarCartao({
      viewer: VIEWER,
      buscarDuplicados: true,
      conversaId: CONVERSA_ID,
      proposta: proposta() as never,
      perfil: PERFIL,
    });

    // Assert
    expect(mockBuscarDuplicados).toHaveBeenCalledWith({
      conversaId: CONVERSA_ID,
      viewer: VIEWER,
      cartao: {
        modo: 'ia',
        servico: SERVICO_ATIVO,
        unidade: { unitId: UNIDADE_ID, rotulo: 'Fórum Central', andar: '3º andar' },
        localExato: 'Sala 302',
        ativo,
      },
    });
    expect(mockResolverAtivo.mock.invocationCallOrder[0]).toBeLessThan(
      mockBuscarDuplicados.mock.invocationCallOrder[0],
    );
    expect(montado.payload.duplicados).toEqual([PARECIDO]);
    expect(cartaoPayloadSchema.safeParse(montado.payload).success).toBe(true);
  });

  it('com o sinal desligado, não procura e grava `duplicados: null` (AC-5a)', async () => {
    const montado = await montarCartao({
      viewer: VIEWER,
      buscarDuplicados: false,
      conversaId: CONVERSA_ID,
      proposta: proposta() as never,
      perfil: PERFIL,
    });
    expect(mockBuscarDuplicados).not.toHaveBeenCalled();
    expect(montado.payload).toHaveProperty('duplicados', null);
  });

  it('`Revisar e abrir` sempre procura os parecidos', async () => {
    mockBuscarDuplicados.mockResolvedValue([PARECIDO]);
    const r = await revisarAbertura(VIEWER, CONVERSA_ID);
    expect(mockBuscarDuplicados).toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, cartao: { duplicados: [PARECIDO] } });
  });

  it('o schema do cartão recusa item com campo a mais, como o nome de quem abriu (AC-6)', () => {
    const payload = {
      modo: 'manual',
      servico: null,
      unidade: null,
      localExato: null,
      faltando: [],
      duplicados: [{ ...PARECIDO, solicitanteNome: 'Fulano' }],
    };
    expect(cartaoPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it('o schema aceita cartão antigo sem o campo e recusa mais de três parecidos (AC-6)', () => {
    const base = { modo: 'manual', servico: null, unidade: null, localExato: null, faltando: [] };
    expect(cartaoPayloadSchema.safeParse(base).success).toBe(true);
    const quatro = [1, 2, 3, 4].map((n) => ({
      ...PARECIDO,
      chamadoId: `6aad5286df6f201a25edf00${n}`,
    }));
    expect(cartaoPayloadSchema.safeParse({ ...base, duplicados: quatro }).success).toBe(false);
    expect(cartaoPayloadSchema.safeParse({ ...base, duplicados: [] }).success).toBe(false);
  });
});
