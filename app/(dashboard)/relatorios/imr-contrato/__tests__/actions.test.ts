import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MENSAGENS_FECHAMENTO as F,
  MENSAGENS_MARCACAO as M,
} from '@/shared/imr-contrato/imr-contrato.constants';

/**
 * Marcações, busca, fechamento e reabertura do IMR do contrato (spec 0023):
 * o servidor confere sessão, papel, mês fechado, base do mês e o estado atual
 * do alvo antes de gravar, e nunca lança. A apuração e o fechamento têm teste
 * de banco próprio; aqui a prévia e o fechamento são simulados na fronteira.
 *
 * covers: AC-7, AC-8, AC-9, AC-10, AC-11, AC-14
 */

const sessao = vi.hoisted(() => ({ atual: null as null | { userId: string; role: string } }));
const papel = vi.hoisted(() => ({ atual: 'fiscal' as 'fiscal' | 'gestor' | null }));
const lib = vi.hoisted(() => ({
  montarPreviaImr: vi.fn(),
  fecharMesImr: vi.fn(),
  reabrirMesImr: vi.fn(),
  criarMarcacao: vi.fn(),
}));
const revalidar = vi.hoisted(() => vi.fn());

vi.mock('@/lib/dal', () => ({ verifySession: async () => sessao.atual }));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: revalidar }));
vi.mock('@/lib/imr-contrato/acesso', () => ({ papelNoImr: async () => papel.atual }));
vi.mock('@/lib/imr-contrato/leitura', () => ({ montarPreviaImr: lib.montarPreviaImr }));
vi.mock('@/lib/imr-contrato/fechamento', () => ({
  fecharMesImr: lib.fecharMesImr,
  reabrirMesImr: lib.reabrirMesImr,
}));
vi.mock('@/models/ImrMarcacao', () => ({ ImrMarcacaoModel: { create: lib.criarMarcacao } }));

import {
  buscarChamadoDaBaseAction,
  fecharMesImrAction,
  marcarImrAction,
  reabrirMesImrAction,
} from '../actions';

const CONTRATO = 'c'.repeat(24);
const CHAMADO = 'a'.repeat(24);
const COTACAO = 'b'.repeat(24);
const USUARIO = 'e'.repeat(24);
const MOTIVO = 'Atraso causado pelo próprio TRF1.';

type Linha = {
  atraso: boolean;
  desconsideracao?: object | null;
  naoAtendimento?: object | null;
};

/** Linha da base com o mínimo que a ação lê. */
function linhaI3(extra: Linha & { ticketNumber?: string }) {
  return {
    chamadoId: CHAMADO,
    ticketNumber: 'CHM-2026-00123',
    descricao: 'Lâmpada queimada',
    solicitanteNome: 'Fulana',
    prazo: new Date('2026-09-09T21:00:00.000Z'),
    desconsideracao: null,
    naoAtendimento: null,
    ...extra,
  };
}

function previa(opcoes: { fechado?: boolean; i3?: Linha; i4?: Linha } = {}) {
  return {
    ok: true,
    estado: { fechado: opcoes.fechado ?? false },
    baseI3: new Map(opcoes.i3 ? [[CHAMADO, linhaI3(opcoes.i3)]] : []),
    baseI4: new Map(opcoes.i4 ? [[COTACAO, { desconsideracao: null, ...opcoes.i4 }]] : []),
  };
}

const marcarI3 = (tipo: string, extra: object = {}) => ({
  contratoId: CONTRATO,
  competencia: '2026-09',
  indicador: 3,
  alvoTipo: 'chamado',
  alvoId: CHAMADO,
  tipo,
  motivo: MOTIVO,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  sessao.atual = { userId: USUARIO, role: 'Admin' };
  papel.atual = 'fiscal';
  lib.montarPreviaImr.mockResolvedValue(previa({ i3: { atraso: true } }));
  lib.criarMarcacao.mockResolvedValue({});
});

describe('marcarImrAction', () => {
  it('grava a desconsideração com o papel de quem marcou e atualiza a tela (AC-7)', async () => {
    const r = await marcarImrAction(marcarI3('desconsiderar'));

    expect(r).toEqual({ ok: true });
    expect(lib.criarMarcacao).toHaveBeenCalledTimes(1);
    const doc = lib.criarMarcacao.mock.calls[0]![0];
    expect(doc).toMatchObject({
      competencia: '2026-09',
      indicador: 3,
      alvoTipo: 'chamado',
      tipo: 'desconsiderar',
      motivo: MOTIVO,
      papel: 'fiscal',
    });
    expect(String(doc.alvoId)).toBe(CHAMADO);
    expect(String(doc.porUserId)).toBe(USUARIO);
    expect(revalidar).toHaveBeenCalledWith('/relatorios/imr-contrato');
  });

  it('grava o papel gestor quando é o papel de quem marca (AC-14)', async () => {
    papel.atual = 'gestor';

    await marcarImrAction(marcarI3('desconsiderar'));

    expect(lib.criarMarcacao.mock.calls[0]![0].papel).toBe('gestor');
  });

  it('recusa o motivo com menos de 10 caracteres antes de ler o banco (AC-7)', async () => {
    const r = await marcarImrAction(marcarI3('desconsiderar', { motivo: 'curto 9ch' }));

    expect(r).toEqual({ ok: false, error: 'Escreva o motivo (ao menos 10 caracteres).' });
    expect(lib.montarPreviaImr).not.toHaveBeenCalled();
    expect(lib.criarMarcacao).not.toHaveBeenCalled();
  });

  it('recusa o indicador 3 apontando para cotação', async () => {
    const r = await marcarImrAction(marcarI3('desconsiderar', { alvoTipo: 'cotacao' }));

    expect(r).toEqual({
      ok: false,
      error: 'O indicador 3 marca chamado; o indicador 4 marca cotação.',
    });
  });

  it('pede login de novo sem sessão', async () => {
    sessao.atual = null;

    const r = await marcarImrAction(marcarI3('desconsiderar'));

    expect(r).toEqual({ ok: false, error: 'Sessão expirada. Entre de novo.' });
    expect(lib.criarMarcacao).not.toHaveBeenCalled();
  });

  it('recusa o Admin sem designação de fiscal ou gestor (AC-14)', async () => {
    papel.atual = null;

    const r = await marcarImrAction(marcarI3('desconsiderar'));

    expect(r).toEqual({ ok: false, error: M.semPapel });
    expect(lib.montarPreviaImr).not.toHaveBeenCalled();
  });

  it('recusa com o mês fechado, mesmo chamando a ação direto (AC-9)', async () => {
    lib.montarPreviaImr.mockResolvedValue(previa({ fechado: true, i3: { atraso: true } }));

    const r = await marcarImrAction(marcarI3('desconsiderar'));

    expect(r).toEqual({ ok: false, error: F.mesFechado });
    expect(lib.criarMarcacao).not.toHaveBeenCalled();
  });

  it('recusa o mês fora da vigência do contrato', async () => {
    lib.montarPreviaImr.mockResolvedValue({ ok: false, motivo: 'mes_fora_da_vigencia' });

    const r = await marcarImrAction(marcarI3('desconsiderar'));

    expect(r).toEqual({ ok: false, error: M.mesIndisponivel });
  });

  it('recusa o chamado fora da base do indicador 3 (AC-8)', async () => {
    lib.montarPreviaImr.mockResolvedValue(previa());

    const r = await marcarImrAction(marcarI3('nao_atendimento'));

    expect(r).toEqual({ ok: false, error: M.foraDaBase3 });
  });

  it('recusa a cotação fora da base do indicador 4 (AC-8)', async () => {
    const r = await marcarImrAction({
      ...marcarI3('nao_atendimento'),
      indicador: 4,
      alvoTipo: 'cotacao',
      alvoId: COTACAO,
    });

    expect(r).toEqual({ ok: false, error: M.foraDaBase4 });
  });

  it('marca não fornecido numa cotação da base do indicador 4 (AC-8)', async () => {
    lib.montarPreviaImr.mockResolvedValue(previa({ i4: { atraso: false } }));

    const r = await marcarImrAction({
      ...marcarI3('nao_atendimento'),
      indicador: 4,
      alvoTipo: 'cotacao',
      alvoId: COTACAO,
    });

    expect(r).toEqual({ ok: true });
    expect(lib.criarMarcacao.mock.calls[0]![0]).toMatchObject({
      indicador: 4,
      alvoTipo: 'cotacao',
    });
  });

  it.each([
    ['desconsiderar', { atraso: false }, M.semAtraso],
    ['desconsiderar', { atraso: true, desconsideracao: {} }, M.jaDesconsiderada],
    ['desfazer_desconsiderar', { atraso: true }, M.semDesconsideracao],
    ['nao_atendimento', { atraso: false, naoAtendimento: {} }, M.jaNaoAtendimento],
    ['desfazer_nao_atendimento', { atraso: false }, M.semNaoAtendimento],
  ])('%s em linha %o recusa com a mensagem certa (AC-7, AC-8)', async (tipo, linha, erro) => {
    lib.montarPreviaImr.mockResolvedValue(previa({ i3: linha }));

    const r = await marcarImrAction(marcarI3(tipo));

    expect(r).toEqual({ ok: false, error: erro });
    expect(lib.criarMarcacao).not.toHaveBeenCalled();
  });

  it.each([
    ['desfazer_desconsiderar', { atraso: true, desconsideracao: {} }],
    ['nao_atendimento', { atraso: false }],
    ['desfazer_nao_atendimento', { atraso: false, naoAtendimento: {} }],
  ])('%s em linha coerente grava', async (tipo, linha) => {
    lib.montarPreviaImr.mockResolvedValue(previa({ i3: linha }));

    expect(await marcarImrAction(marcarI3(tipo))).toEqual({ ok: true });
  });

  it('erro inesperado vira mensagem fixa, sem lançar', async () => {
    lib.criarMarcacao.mockRejectedValue(new Error('conexão perdida'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const r = await marcarImrAction(marcarI3('desconsiderar'));

    expect(r).toEqual({ ok: false, error: 'Não foi possível concluir agora. Tente de novo.' });
  });
});

describe('buscarChamadoDaBaseAction (AC-8)', () => {
  const busca = (numero: string) => ({ contratoId: CONTRATO, competencia: '2026-09', numero });

  it.each(['123', '#00123', 'CHM-2026-00123'])('acha o chamado digitando %s', async (numero) => {
    const r = await buscarChamadoDaBaseAction(busca(numero));

    expect(r).toEqual({
      ok: true,
      chamado: {
        chamadoId: CHAMADO,
        ticketNumber: 'CHM-2026-00123',
        descricao: 'Lâmpada queimada',
        solicitanteNome: 'Fulana',
        prazo: '2026-09-09T21:00:00.000Z',
        naoAtendimentoVigente: false,
      },
    });
  });

  it('diz que o número não está na base do mês', async () => {
    const r = await buscarChamadoDaBaseAction(busca('999'));

    expect(r).toEqual({
      ok: false,
      error: 'O chamado 999 não está na base do indicador 3 deste mês.',
    });
  });

  it('avisa quando o chamado já tem não atendimento vigente', async () => {
    lib.montarPreviaImr.mockResolvedValue(previa({ i3: { atraso: false, naoAtendimento: {} } }));

    const r = await buscarChamadoDaBaseAction(busca('123'));

    expect(r.ok && r.chamado.naoAtendimentoVigente).toBe(true);
  });

  it('recusa número vazio', async () => {
    const r = await buscarChamadoDaBaseAction(busca('#  '));

    expect(r).toEqual({ ok: false, error: 'Informe o número do chamado.' });
  });

  it('recusa sem papel e com o mês fechado (AC-9, AC-14)', async () => {
    papel.atual = null;
    expect(await buscarChamadoDaBaseAction(busca('123'))).toEqual({
      ok: false,
      error: M.semPapel,
    });

    papel.atual = 'fiscal';
    lib.montarPreviaImr.mockResolvedValue(previa({ fechado: true, i3: { atraso: true } }));
    expect(await buscarChamadoDaBaseAction(busca('123'))).toEqual({
      ok: false,
      error: F.mesFechado,
    });
  });
});

describe('fecharMesImrAction (AC-10)', () => {
  const fechar = (extra: object = {}) => ({
    contratoId: CONTRATO,
    competencia: '2026-09',
    i1Pontos: 40,
    i2Pontos: 18,
    i2Observacao: 'Faltou um uniforme.',
    pontosVistos: { i3: 15, i4: 20 },
    ...extra,
  });

  it('recusa sem os pontos dos indicadores 3 e 4 que a pessoa viu', async () => {
    const r = await fecharMesImrAction(fechar({ pontosVistos: undefined }));

    expect(r.ok).toBe(false);
    expect(lib.fecharMesImr).not.toHaveBeenCalled();
  });

  it('fecha com o papel de quem fecha e devolve a versão', async () => {
    lib.fecharMesImr.mockResolvedValue({ ok: true, versao: 1 });

    const r = await fecharMesImrAction(fechar());

    expect(r).toEqual({ ok: true, versao: 1 });
    expect(lib.fecharMesImr).toHaveBeenCalledWith(
      expect.objectContaining({
        i1Pontos: 40,
        i1Observacao: null,
        i2Pontos: 18,
        pontosVistos: { i3: 15, i4: 20 },
      }),
      { userId: USUARIO, papel: 'fiscal' },
    );
    expect(revalidar).toHaveBeenCalledWith('/relatorios/imr-contrato');
  });

  it.each([
    [{ i1Pontos: 41 }, 'Os pontos do indicador 1 vão de 0 a 40.'],
    [{ i2Pontos: 21 }, 'Os pontos do indicador 2 vão de 0 a 20.'],
    [{ i1Pontos: 10.5 }, 'Os pontos do indicador 1 são um número inteiro.'],
  ])('recusa %o com "%s"', async (extra, erro) => {
    const r = await fecharMesImrAction(fechar(extra));

    expect(r).toEqual({ ok: false, error: erro });
    expect(lib.fecharMesImr).not.toHaveBeenCalled();
  });

  it('recusa quem não é fiscal nem gestor (AC-14)', async () => {
    papel.atual = null;

    const r = await fecharMesImrAction(fechar());

    expect(r).toEqual({ ok: false, error: F.semPapel });
    expect(lib.fecharMesImr).not.toHaveBeenCalled();
  });

  it('repassa a recusa do fechamento sem atualizar a tela', async () => {
    lib.fecharMesImr.mockResolvedValue({ ok: false, error: F.mesNaoTerminou });

    const r = await fecharMesImrAction(fechar());

    expect(r).toEqual({ ok: false, error: F.mesNaoTerminou });
    expect(revalidar).not.toHaveBeenCalled();
  });
});

describe('reabrirMesImrAction (AC-11)', () => {
  const reabrir = (motivo: string) => ({ contratoId: CONTRATO, competencia: '2026-09', motivo });

  it('reabre com motivo e atualiza a tela', async () => {
    lib.reabrirMesImr.mockResolvedValue({ ok: true });

    const r = await reabrirMesImrAction(reabrir(MOTIVO));

    expect(r).toEqual({ ok: true });
    expect(lib.reabrirMesImr).toHaveBeenCalledWith(
      { contratoId: CONTRATO, competencia: '2026-09', motivo: MOTIVO },
      { userId: USUARIO, papel: 'fiscal' },
    );
    expect(revalidar).toHaveBeenCalled();
  });

  it('recusa motivo curto', async () => {
    const r = await reabrirMesImrAction(reabrir('curto'));

    expect(r).toEqual({ ok: false, error: 'Escreva o motivo (ao menos 10 caracteres).' });
    expect(lib.reabrirMesImr).not.toHaveBeenCalled();
  });

  it('recusa quem não é fiscal nem gestor (AC-14)', async () => {
    papel.atual = null;

    expect(await reabrirMesImrAction(reabrir(MOTIVO))).toEqual({
      ok: false,
      error: F.semPapel,
    });
  });
});
