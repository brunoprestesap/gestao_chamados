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
const tabelas = vi.hoisted(() => ({
  aplicarImportacao: vi.fn(),
  descartarImportacao: vi.fn(),
  marcarAnomalia: vi.fn(),
  corrigirCodigoSinapi: vi.fn(),
}));
vi.mock('@/lib/material/importacao/aplicar', () => ({
  aplicarImportacao: tabelas.aplicarImportacao,
}));
vi.mock('@/lib/material/importacao/pendente', () => ({
  descartarImportacao: tabelas.descartarImportacao,
}));
vi.mock('@/lib/material/tabelas', () => ({
  marcarAnomalia: tabelas.marcarAnomalia,
  corrigirCodigoSinapi: tabelas.corrigirCodigoSinapi,
}));

import {
  aplicarImportacaoAction,
  corrigirCodigoSinapiAction,
  criarDesignacaoAction,
  criarEmpenhoAction,
  criarFaixaAction,
  desativarFaixaAction,
  descartarImportacaoAction,
  marcarAnomaliaAction,
  movimentarEmpenhoAction,
  revogarDesignacaoAction,
} from '../actions';

const ID = 'a'.repeat(24);
const ADMIN = 'u'.repeat(24);

beforeEach(() => {
  vi.clearAllMocks();
  sessao.atual = { userId: ADMIN, role: 'Admin' };
  for (const fn of Object.values(cadastro)) fn.mockResolvedValue({ ok: true });
  for (const fn of Object.values(tabelas)) fn.mockResolvedValue({ ok: true });
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

describe('Anexo V e SINAPI (AC-24, AC-25, AC-29)', () => {
  const motivo = 'Conferir sempre este item.';

  it.each(['Preposto', 'Técnico'])('%s não aplica, descarta, marca nem corrige', async (role) => {
    sessao.atual = { userId: ADMIN, role };
    const resultados = await Promise.all([
      aplicarImportacaoAction({ importacaoId: ID }),
      descartarImportacaoAction({ importacaoId: ID }),
      marcarAnomaliaAction({ anexoVItemId: ID, marcada: true, motivo }),
      corrigirCodigoSinapiAction({ anexoVItemId: ID, codigo: '123', motivo }),
    ]);
    expect(resultados.every((r) => !r.ok)).toBe(true);
    for (const fn of Object.values(tabelas)) expect(fn).not.toHaveBeenCalled();
  });

  it('aplicar e descartar levam o Admin como autor', async () => {
    await aplicarImportacaoAction({ importacaoId: ID });
    await descartarImportacaoAction({ importacaoId: ID });
    expect(tabelas.aplicarImportacao).toHaveBeenCalledWith(ID, ADMIN);
    expect(tabelas.descartarImportacao).toHaveBeenCalledWith(ID, ADMIN);
  });

  it('marcar sem motivo suficiente não chega na regra', async () => {
    const r = await marcarAnomaliaAction({ anexoVItemId: ID, marcada: true, motivo: 'curto' });
    expect(r.ok).toBe(false);
    expect(tabelas.marcarAnomalia).not.toHaveBeenCalled();
  });

  it('corrigir passa o código já normalizado, e null limpa', async () => {
    await corrigirCodigoSinapiAction({ anexoVItemId: ID, codigo: '00.123', motivo });
    expect(tabelas.corrigirCodigoSinapi).toHaveBeenCalledWith(ADMIN, {
      anexoVItemId: ID,
      codigo: '123',
      motivo,
    });
    await corrigirCodigoSinapiAction({ anexoVItemId: ID, codigo: null, motivo });
    expect(tabelas.corrigirCodigoSinapi).toHaveBeenLastCalledWith(
      ADMIN,
      expect.objectContaining({ codigo: null }),
    );
  });

  it('a recusa da aplicação volta como veio', async () => {
    tabelas.aplicarImportacao.mockResolvedValue({
      ok: false,
      error: 'O Anexo V mudou depois da revisão; envie o arquivo de novo.',
    });
    expect(await aplicarImportacaoAction({ importacaoId: ID })).toEqual({
      ok: false,
      error: 'O Anexo V mudou depois da revisão; envie o arquivo de novo.',
    });
  });

  it('erro inesperado na aplicação vira mensagem fixa', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    tabelas.aplicarImportacao.mockRejectedValue(new Error('mongo caiu'));
    expect(await aplicarImportacaoAction({ importacaoId: ID })).toEqual({
      ok: false,
      error: 'Não foi possível salvar agora. Tente de novo.',
    });
  });
});
