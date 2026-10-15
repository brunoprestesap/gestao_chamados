import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * As actions do cadastro do material (spec 0019, AC-19): só o Admin
 * cadastra, e a entrada é validada antes de chegar no banco.
 *
 * covers: AC-19
 */

const sessao = vi.hoisted(() => ({ atual: null as null | { userId: string; role: string } }));
const cadastro = vi.hoisted(() => ({
  alterarSituacaoEmpenho: vi.fn(),
  criarDesignacao: vi.fn(),
  criarEmpenho: vi.fn(),
  criarFaixa: vi.fn(),
  desativarFaixa: vi.fn(),
  movimentarEmpenho: vi.fn(),
  revogarDesignacao: vi.fn(),
}));

vi.mock('@/lib/dal', () => ({
  verifySession: async () => sessao.atual,
  isAdmin: (role?: string) => role === 'Admin',
}));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/material/cadastro', () => cadastro);

import {
  criarDesignacaoAction,
  criarEmpenhoAction,
  criarFaixaAction,
  desativarFaixaAction,
  movimentarEmpenhoAction,
  revogarDesignacaoAction,
} from '../actions';

const ID = 'a'.repeat(24);
const ADMIN = 'u'.repeat(24);

beforeEach(() => {
  vi.clearAllMocks();
  sessao.atual = { userId: ADMIN, role: 'Admin' };
  for (const fn of Object.values(cadastro)) fn.mockResolvedValue({ ok: true });
});

describe('só o Admin cadastra', () => {
  it.each(['Preposto', 'Técnico', 'Solicitante'])(
    '%s é recusado em todas as actions',
    async (role) => {
      sessao.atual = { userId: ADMIN, role };
      const resultados = await Promise.all([
        criarEmpenhoAction({ numero: 'NE1', exercicio: 2026, valorInicialCentavos: 100 }),
        movimentarEmpenhoAction({ empenhoId: ID, tipo: 'reforco', valorCentavos: 1, ato: 'SEI 1' }),
        criarFaixaAction({ nome: 'Faixa', limiteCentavos: 1 }),
        desativarFaixaAction({ faixaId: ID }),
        criarDesignacaoAction({
          userId: ID,
          papel: 'fiscal',
          vigenciaInicio: '2026-01-01',
          ato: 'Port',
        }),
        revogarDesignacaoAction({ designacaoId: ID }),
      ]);
      expect(resultados.every((r) => !r.ok)).toBe(true);
      for (const fn of Object.values(cadastro)) expect(fn).not.toHaveBeenCalled();
    },
  );

  it('sem sessão também é recusado', async () => {
    sessao.atual = null;
    expect((await criarFaixaAction({ nome: 'Faixa', limiteCentavos: 1 })).ok).toBe(false);
  });
});

describe('validação e repasse', () => {
  it('empenho com valor zero não chega no banco', async () => {
    const r = await criarEmpenhoAction({ numero: 'NE1', exercicio: 2026, valorInicialCentavos: 0 });
    expect(r.ok).toBe(false);
    expect(cadastro.criarEmpenho).not.toHaveBeenCalled();
  });

  it('aprovador sem faixa não chega no banco', async () => {
    const r = await criarDesignacaoAction({
      userId: ID,
      papel: 'aprovador',
      vigenciaInicio: '2026-01-01',
      ato: 'Portaria',
    });
    expect(r).toMatchObject({ ok: false, error: 'Aprovador precisa de uma faixa.' });
    expect(cadastro.criarDesignacao).not.toHaveBeenCalled();
  });

  it('quem cadastra vai como autor do registro', async () => {
    await revogarDesignacaoAction({ designacaoId: ID });
    expect(cadastro.revogarDesignacao).toHaveBeenCalledWith(ADMIN, ID);
  });

  it('a recusa da regra volta como veio', async () => {
    cadastro.movimentarEmpenho.mockResolvedValue({
      ok: false,
      error: 'A anulação deixaria o valor líquido abaixo do já comprometido.',
    });
    const r = await movimentarEmpenhoAction({
      empenhoId: ID,
      tipo: 'anulacao',
      valorCentavos: 100,
      ato: 'SEI 9',
    });
    expect(r).toEqual({
      ok: false,
      error: 'A anulação deixaria o valor líquido abaixo do já comprometido.',
    });
  });

  it('erro inesperado vira mensagem fixa', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    cadastro.criarFaixa.mockRejectedValue(new Error('mongo caiu'));
    expect(await criarFaixaAction({ nome: 'Faixa', limiteCentavos: 1 })).toEqual({
      ok: false,
      error: 'Não foi possível salvar agora. Tente de novo.',
    });
  });
});
