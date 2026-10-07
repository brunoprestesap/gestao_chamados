import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLerProposta = vi.hoisted(() => vi.fn());
const mockDescartar = vi.hoisted(() => vi.fn());
vi.mock('@/lib/conversas', () => ({
  lerProposta: (...a: unknown[]) => mockLerProposta(...a),
  descartarRascunho: (...a: unknown[]) => mockDescartar(...a),
}));

const mockRegistrar = vi.hoisted(() => vi.fn());
const mockSair = vi.hoisted(() => vi.fn());
vi.mock('@/lib/chamados/interessados', () => ({
  registrarInteresse: (...a: unknown[]) => mockRegistrar(...a),
  sairDoInteresse: (...a: unknown[]) => mockSair(...a),
}));

const mockChamado = vi.hoisted(() => ({
  atual: null as Record<string, unknown> | null,
  /** O que a segunda leitura (depois de gravar o interesse) devolve; `undefined` repete `atual`. */
  depois: undefined as Record<string, unknown> | null | undefined,
  leituras: 0,
  falhar: false,
}));
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    findById: () => ({
      select: () => ({
        lean: async () => {
          if (mockChamado.falhar) throw new Error('banco fora');
          mockChamado.leituras += 1;
          if (mockChamado.leituras > 1 && mockChamado.depois !== undefined)
            return mockChamado.depois;
          return mockChamado.atual;
        },
      }),
    }),
  },
}));

import { acompanharChamado, deixarDeAcompanhar } from '../acompanhar';

/**
 * "Acompanhar este" e "Deixar de acompanhar" (spec 0017). As conferências na
 * ordem da spec, a corrida com o fim do chamado e com a confirmação do
 * rascunho, e o descarte que falha depois de o interesse gravado.
 *
 * covers: AC-9, AC-10, AC-11, AC-16
 */

const EU = String(new Types.ObjectId());
const viewer = { userId: EU, role: 'Solicitante' as const };
const CONVERSA = String(new Types.ObjectId());
const CARTAO = String(new Types.ObjectId());
const CHAMADO = String(new Types.ObjectId());
const OUTRO = new Types.ObjectId();

const item = (extra: Record<string, unknown> = {}) => ({
  chamadoId: CHAMADO,
  ticketNumber: 'CHM-2026-00001',
  rotuloServico: 'Split',
  localExato: 'sala 205',
  ativoCodigo: null,
  status: 'aberto',
  abertoEm: '2026-10-07T12:00:00.000Z',
  proprio: false,
  jaTemAcesso: false,
  ...extra,
});

function proposta(duplicados: unknown[] | null = [item()], extra: Record<string, unknown> = {}) {
  mockLerProposta.mockResolvedValue({
    ok: true,
    situacao: 'rascunho',
    proposta: null,
    cartaoAtual: { id: CARTAO, payload: { duplicados } },
    ...extra,
  });
}

const entrada = { conversaId: CONVERSA, cartaoId: CARTAO, chamadoId: CHAMADO };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mockChamado.atual = { status: 'validado', solicitanteId: OUTRO, assignedToUserId: null };
  mockChamado.falhar = false;
  mockChamado.depois = undefined;
  mockChamado.leituras = 0;
  proposta();
  mockRegistrar.mockResolvedValue({ novo: true });
  mockDescartar.mockResolvedValue({ ok: true });
  mockSair.mockResolvedValue(true);
});

describe('acompanharChamado · localVisivel (AC-6, AC-9, revisão de 2026-10-07)', () => {
  it('grava localVisivel false quando o cartão escondeu o local do item', async () => {
    // Arrange
    proposta([item({ localExato: null })]);

    // Act
    const r = await acompanharChamado(viewer, entrada);

    // Assert
    expect(r).toMatchObject({ ok: true });
    expect(mockRegistrar).toHaveBeenCalledWith(CHAMADO, EU, false);
  });

  it('grava localVisivel true quando o cartão mostrou o local do item', async () => {
    await acompanharChamado(viewer, entrada);
    expect(mockRegistrar).toHaveBeenCalledWith(CHAMADO, EU, true);
  });

  it('chamado sem local escrito conta como visível (string vazia não é null)', async () => {
    proposta([item({ localExato: '' })]);
    await acompanharChamado(viewer, entrada);
    expect(mockRegistrar).toHaveBeenCalledWith(CHAMADO, EU, true);
  });

  it('usa o item do chamado clicado, não outro item do mesmo cartão', async () => {
    // Arrange
    const outro = String(new Types.ObjectId());
    proposta([item({ chamadoId: outro, localExato: 'sala 101' }), item({ localExato: null })]);

    // Act
    await acompanharChamado(viewer, entrada);

    // Assert
    expect(mockRegistrar).toHaveBeenCalledWith(CHAMADO, EU, false);
  });

  it('recusa um localVisivel mandado pelo navegador junto dos ids', async () => {
    const r = await acompanharChamado(viewer, { ...entrada, localVisivel: true });
    expect(r).toEqual({ ok: false, reason: 'dados_invalidos' });
    expect(mockRegistrar).not.toHaveBeenCalled();
  });
});

describe('acompanharChamado · caminho feliz (AC-9)', () => {
  it('grava o interesse, depois descarta o rascunho, e devolve o chamado', async () => {
    // Act
    const r = await acompanharChamado(viewer, entrada);

    // Assert
    expect(r).toEqual({ ok: true, chamadoId: CHAMADO, rascunhoDescartado: true });
    expect(mockRegistrar).toHaveBeenCalledWith(CHAMADO, EU, true);
    expect(mockDescartar).toHaveBeenCalledWith(viewer, CONVERSA);
    expect(mockRegistrar.mock.invocationCallOrder[0]).toBeLessThan(
      mockDescartar.mock.invocationCallOrder[0],
    );
  });
});

describe('acompanharChamado · conferências (AC-9)', () => {
  it('entrada fora do schema ou com campo a mais é `dados_invalidos`, sem ler nada', async () => {
    expect(await acompanharChamado(viewer, { ...entrada, chamadoId: 'x' })).toEqual({
      ok: false,
      reason: 'dados_invalidos',
    });
    expect(await acompanharChamado(viewer, { ...entrada, extra: 1 })).toEqual({
      ok: false,
      reason: 'dados_invalidos',
    });
    expect(mockLerProposta).not.toHaveBeenCalled();
  });

  it('rascunho de outra pessoa ou inexistente é `nao_encontrada`', async () => {
    mockLerProposta.mockResolvedValue({ ok: false, reason: 'sem_permissao' });
    expect(await acompanharChamado(viewer, entrada)).toEqual({
      ok: false,
      reason: 'nao_encontrada',
    });
    mockLerProposta.mockResolvedValue({ ok: false, reason: 'nao_encontrada' });
    expect(await acompanharChamado(viewer, entrada)).toEqual({
      ok: false,
      reason: 'nao_encontrada',
    });
  });

  it('rascunho reservado é `confirmacao_em_andamento`; conversa que já virou chamado é `nao_encontrada`', async () => {
    proposta([item()], { situacao: 'reservada' });
    expect(await acompanharChamado(viewer, entrada)).toEqual({
      ok: false,
      reason: 'confirmacao_em_andamento',
    });
    proposta([item()], { situacao: 'vinculada' });
    expect(await acompanharChamado(viewer, entrada)).toEqual({
      ok: false,
      reason: 'nao_encontrada',
    });
  });

  it('cartão que não é o atual é `cartao_desatualizado`', async () => {
    expect(
      await acompanharChamado(viewer, { ...entrada, cartaoId: String(new Types.ObjectId()) }),
    ).toEqual({
      ok: false,
      reason: 'cartao_desatualizado',
    });
    proposta(null, { cartaoAtual: null });
    expect(await acompanharChamado(viewer, entrada)).toEqual({
      ok: false,
      reason: 'cartao_desatualizado',
    });
  });

  it('chamado fora dos parecidos do cartão é `fora_do_cartao`: o navegador não escolhe chamado', async () => {
    proposta([item({ chamadoId: String(new Types.ObjectId()) })]);
    expect(await acompanharChamado(viewer, entrada)).toEqual({
      ok: false,
      reason: 'fora_do_cartao',
    });
    proposta(null);
    expect(await acompanharChamado(viewer, entrada)).toEqual({
      ok: false,
      reason: 'fora_do_cartao',
    });
  });

  it.each([
    ['próprio', { proprio: true }],
    ['de quem já tem acesso', { jaTemAcesso: true }],
  ])('item %s é `fora_do_cartao`, sem gravar nada', async (_, extra) => {
    proposta([item(extra)]);
    expect(await acompanharChamado(viewer, entrada)).toEqual({
      ok: false,
      reason: 'fora_do_cartao',
    });
    expect(mockRegistrar).not.toHaveBeenCalled();
  });

  it('cartão velho: se agora a pessoa é dona ou técnica atribuída, é `fora_do_cartao`', async () => {
    mockChamado.atual = {
      status: 'aberto',
      solicitanteId: new Types.ObjectId(EU),
      assignedToUserId: null,
    };
    expect(await acompanharChamado(viewer, entrada)).toEqual({
      ok: false,
      reason: 'fora_do_cartao',
    });
    mockChamado.atual = {
      status: 'aberto',
      solicitanteId: OUTRO,
      assignedToUserId: new Types.ObjectId(EU),
    };
    expect(await acompanharChamado(viewer, entrada)).toEqual({
      ok: false,
      reason: 'fora_do_cartao',
    });
    expect(mockRegistrar).not.toHaveBeenCalled();
  });
});

describe('acompanharChamado · corrida com o fim (AC-10)', () => {
  it.each(['concluído', 'encerrado', 'cancelado', 'recusado'])(
    'chamado %s é `chamado_encerrado`, sem gravar nem descartar',
    async (status) => {
      mockChamado.atual = { status, solicitanteId: OUTRO };
      expect(await acompanharChamado(viewer, entrada)).toEqual({
        ok: false,
        reason: 'chamado_encerrado',
      });
      expect(mockRegistrar).not.toHaveBeenCalled();
      expect(mockDescartar).not.toHaveBeenCalled();
    },
  );

  it('chamado que sumiu também é `chamado_encerrado`', async () => {
    mockChamado.atual = null;
    expect(await acompanharChamado(viewer, entrada)).toEqual({
      ok: false,
      reason: 'chamado_encerrado',
    });
  });
});

describe('acompanharChamado · corrida com a confirmação (AC-9)', () => {
  it.each(['confirmacao_em_andamento', 'sem_permissao'])(
    'descarte com `%s`: desfaz o interesse recém gravado e responde `confirmacao_em_andamento`',
    async (motivo) => {
      mockDescartar.mockResolvedValue({ ok: false, reason: motivo });
      expect(await acompanharChamado(viewer, entrada)).toEqual({
        ok: false,
        reason: 'confirmacao_em_andamento',
      });
      expect(mockSair).toHaveBeenCalledWith(CHAMADO, EU);
    },
  );

  it('interesse que já existia antes do clique não é desfeito', async () => {
    mockRegistrar.mockResolvedValue({ novo: false });
    mockDescartar.mockResolvedValue({ ok: false, reason: 'confirmacao_em_andamento' });
    expect(await acompanharChamado(viewer, entrada)).toEqual({
      ok: false,
      reason: 'confirmacao_em_andamento',
    });
    expect(mockSair).not.toHaveBeenCalled();
  });
});

describe('acompanharChamado · descarte falhando por outro motivo (AC-11)', () => {
  it.each(['erro', 'nao_encontrada'])(
    'com `%s`, segue ok, com o rascunho ainda na lateral',
    async (motivo) => {
      mockDescartar.mockResolvedValue({ ok: false, reason: motivo });
      expect(await acompanharChamado(viewer, entrada)).toEqual({
        ok: true,
        chamadoId: CHAMADO,
        rascunhoDescartado: false,
      });
      expect(mockSair).not.toHaveBeenCalled();
    },
  );

  it('falha inesperada vira `erro`, sem lançar', async () => {
    mockChamado.falhar = true;
    expect(await acompanharChamado(viewer, entrada)).toEqual({ ok: false, reason: 'erro' });
  });
});

describe('deixarDeAcompanhar (AC-16)', () => {
  it('grava a saída do próprio usuário', async () => {
    expect(await deixarDeAcompanhar(viewer, { chamadoId: CHAMADO })).toEqual({ ok: true });
    expect(mockSair).toHaveBeenCalledWith(CHAMADO, EU);
  });

  it('quem nunca acompanhou, ou id inválido, recebe `nao_encontrada`', async () => {
    mockSair.mockResolvedValue(false);
    expect(await deixarDeAcompanhar(viewer, { chamadoId: CHAMADO })).toEqual({
      ok: false,
      reason: 'nao_encontrada',
    });
    expect(await deixarDeAcompanhar(viewer, { chamadoId: '../x' })).toEqual({
      ok: false,
      reason: 'nao_encontrada',
    });
  });

  it('falha do banco vira `erro`, sem lançar', async () => {
    mockSair.mockRejectedValue(new Error('fora'));
    expect(await deixarDeAcompanhar(viewer, { chamadoId: CHAMADO })).toEqual({
      ok: false,
      reason: 'erro',
    });
  });
});

describe('acompanharChamado · o chamado termina entre a conferência e a gravação (AC-10)', () => {
  it('desfaz o interesse recém gravado, responde `chamado_encerrado` e não descarta o rascunho', async () => {
    mockChamado.depois = { status: 'concluído', solicitanteId: OUTRO };

    expect(await acompanharChamado(viewer, entrada)).toEqual({
      ok: false,
      reason: 'chamado_encerrado',
    });

    expect(mockRegistrar).toHaveBeenCalled();
    expect(mockSair).toHaveBeenCalledWith(CHAMADO, EU);
    expect(mockDescartar).not.toHaveBeenCalled();
  });

  it('interesse que já existia não é desfeito', async () => {
    mockRegistrar.mockResolvedValue({ novo: false });
    mockChamado.depois = { status: 'cancelado', solicitanteId: OUTRO };

    expect(await acompanharChamado(viewer, entrada)).toEqual({
      ok: false,
      reason: 'chamado_encerrado',
    });
    expect(mockSair).not.toHaveBeenCalled();
  });
});
