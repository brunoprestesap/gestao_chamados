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
const parametros = vi.hoisted(() => ({ salvarParametros: vi.fn() }));
vi.mock('@/lib/material/parametros', () => parametros);
vi.mock('@/lib/material/tabelas', () => ({
  marcarAnomalia: tabelas.marcarAnomalia,
  corrigirCodigoSinapi: tabelas.corrigirCodigoSinapi,
}));

import { ERRO_SEM_PERMISSAO } from '@/shared/ativos/ativo.constants';

import {
  alterarSituacaoEmpenhoAction,
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
  salvarParametrosAction,
} from '../actions';

const ID = 'a'.repeat(24);
const ADMIN = 'u'.repeat(24);
const MOTIVO = 'Fim da designação pelo contrato';

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
    await revogarDesignacaoAction({ designacaoId: ID, motivo: MOTIVO });
    expect(cadastro.revogarDesignacao).toHaveBeenCalledWith(ADMIN, ID, MOTIVO);
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

// ── parâmetros (fatia 5) ─────────────────────────────────────────

describe('salvarParametrosAction (AC-42)', () => {
  // covers: AC-42
  const padrao = {
    percentualSinapi: 10,
    janelaDias: 90,
    parcelaRelevantePercentual: 20,
    prazoFornecimentoDiasUteis: 5,
    raizCnpjContratada: '03543374',
  };

  beforeEach(() => {
    parametros.salvarParametros.mockResolvedValue({ ok: true });
  });

  it('grava com o autor da sessão os valores lidos e os novos', async () => {
    // Arrange
    const entrada = { lidos: padrao, novos: { ...padrao, janelaDias: 30 } };

    // Act
    const r = await salvarParametrosAction(entrada);

    // Assert
    expect(r).toEqual({ ok: true });
    expect(parametros.salvarParametros).toHaveBeenCalledWith(ADMIN, entrada);
  });

  it('repassa o aviso quando a gravação passou e o recálculo da anomalia falhou', async () => {
    parametros.salvarParametros.mockResolvedValue({ ok: true, aviso: 'recalcule' });

    const r = await salvarParametrosAction({
      lidos: padrao,
      novos: { ...padrao, percentualSinapi: 30 },
    });

    expect(r).toEqual({ ok: true, aviso: 'recalcule' });
  });

  it.each(['Preposto', 'Técnico', 'Solicitante'])(
    '%s é recusado sem tocar no banco',
    async (role) => {
      sessao.atual = { userId: ADMIN, role };

      const r = await salvarParametrosAction({ lidos: padrao, novos: padrao });

      expect(r.ok).toBe(false);
      expect(parametros.salvarParametros).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ percentualSinapi: 101 }, /de 0 a 100/],
    [{ janelaDias: 0 }, /de 1 a 365/],
    [{ parcelaRelevantePercentual: 0 }, /de 1 a 100/],
    [{ raizCnpjContratada: '123' }, /8 dígitos/],
  ])('recusa valor fora do limite (%o) com a mensagem do campo', async (errado, mensagem) => {
    const r = await salvarParametrosAction({ lidos: padrao, novos: { ...padrao, ...errado } });

    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.error).toMatch(mensagem);
    expect(parametros.salvarParametros).not.toHaveBeenCalled();
  });

  it('aceita corrigir um documento antigo com o percentual acima de 100', async () => {
    // O limite antigo era 1000: o valor lido só vai para o filtro da escrita condicional.
    const entrada = { lidos: { ...padrao, percentualSinapi: 500 }, novos: padrao };

    const r = await salvarParametrosAction(entrada);

    expect(r).toEqual({ ok: true });
    expect(parametros.salvarParametros).toHaveBeenCalledWith(ADMIN, entrada);
  });

  it('erro inesperado vira "tente de novo", sem lançar', async () => {
    parametros.salvarParametros.mockRejectedValue(new Error('queda'));
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});

    const r = await salvarParametrosAction({ lidos: padrao, novos: { ...padrao, janelaDias: 30 } });

    expect(r).toEqual({ ok: false, error: 'Não foi possível salvar agora. Tente de novo.' });
    erro.mockRestore();
  });
});

describe('motivo dos atos do cadastro (spec 0022)', () => {
  it('as três levam o Admin como autor e o motivo aparado (AC-1, AC-2, AC-3)', async () => {
    await desativarFaixaAction({ faixaId: ID, motivo: `  ${MOTIVO}  ` });
    await alterarSituacaoEmpenhoAction({ empenhoId: ID, ativo: false, motivo: MOTIVO });
    expect(cadastro.desativarFaixa).toHaveBeenCalledWith(ADMIN, ID, MOTIVO);
    expect(cadastro.alterarSituacaoEmpenho).toHaveBeenCalledWith(ADMIN, ID, false, MOTIVO);
  });

  it('revogar leva o Admin, a designação e o motivo aparado (AC-1)', async () => {
    expect(await revogarDesignacaoAction({ designacaoId: ID, motivo: `\n${MOTIVO} ` })).toEqual({
      ok: true,
    });
    expect(cadastro.revogarDesignacao).toHaveBeenCalledWith(ADMIN, ID, MOTIVO);
  });

  it('motivo acima de 500 caracteres é recusado no campo (AC-5)', async () => {
    const r = await desativarFaixaAction({ faixaId: ID, motivo: 'a'.repeat(501) });
    expect(r).toEqual({ ok: false, error: 'Até 500 caracteres.', campo: 'motivo' });
    expect(cadastro.desativarFaixa).not.toHaveBeenCalled();
  });

  it('id inválido é recusado sem apontar o campo de motivo', async () => {
    const resultados = await Promise.all([
      revogarDesignacaoAction({ designacaoId: 'x', motivo: MOTIVO }),
      desativarFaixaAction({ faixaId: 'x', motivo: MOTIVO }),
      alterarSituacaoEmpenhoAction({ empenhoId: 'x', ativo: false, motivo: MOTIVO }),
    ]);
    for (const r of resultados) {
      expect(r.ok).toBe(false);
      expect(r).not.toHaveProperty('campo');
    }
    for (const fn of Object.values(cadastro)) expect(fn).not.toHaveBeenCalled();
  });

  it('a recusa da corrida volta como veio, sem campo (AC-3)', async () => {
    const recusa = { ok: false, error: 'O empenho já está inativo. Recarregue.' };
    cadastro.alterarSituacaoEmpenho.mockResolvedValue(recusa);
    expect(
      await alterarSituacaoEmpenhoAction({ empenhoId: ID, ativo: false, motivo: MOTIVO }),
    ).toEqual(recusa);
  });

  it.each(['123456789', '          ', undefined])(
    'motivo %j é recusado no campo e não chega no banco',
    async (motivo) => {
      const resultados = await Promise.all([
        revogarDesignacaoAction({ designacaoId: ID, motivo }),
        desativarFaixaAction({ faixaId: ID, motivo }),
        alterarSituacaoEmpenhoAction({ empenhoId: ID, ativo: true, motivo }),
      ]);
      for (const r of resultados) expect(r).toMatchObject({ ok: false, campo: 'motivo' });
      for (const fn of Object.values(cadastro)) expect(fn).not.toHaveBeenCalled();
    },
  );

  it('quem não é Admin recebe a recusa de permissão nas três, mesmo sem motivo (AC-8)', async () => {
    sessao.atual = { userId: ADMIN, role: 'Preposto' };
    const resultados = await Promise.all([
      revogarDesignacaoAction({ designacaoId: ID }),
      desativarFaixaAction({ faixaId: ID }),
      alterarSituacaoEmpenhoAction({ empenhoId: ID, ativo: false }),
    ]);
    for (const r of resultados) expect(r).toEqual({ ok: false, error: ERRO_SEM_PERMISSAO });
  });
});
