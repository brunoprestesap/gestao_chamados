import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

/**
 * Fechamento e reabertura do IMR do contrato contra o MongoDB de verdade
 * (spec 0023): a versão 1 igual à prévia, a recusa com o mês fechado, a
 * versão 2 depois de reabrir e as corridas nos índices únicos.
 *
 * covers: AC-9, AC-10, AC-11, AC-15, AC-18
 */

function cru(m: {
  createIndexes(): PromiseLike<unknown>;
  collection: { deleteMany(f: object): Promise<unknown>; indexes(): Promise<unknown> };
}): ModelDeTeste {
  return {
    createIndexes: () => m.createIndexes(),
    deleteMany: (f) => m.collection.deleteMany(f),
    collection: m.collection,
  };
}

const rodar = temMongoDeTeste ? describe : describe.skip;

/** `YYYY-MM-DDTHH:mm` em Belém. */
const b = (s: string) => new Date(`${s}:00.000-03:00`);

const AGORA = b('2026-11-03T10:00');
const COMPETENCIA = '2026-10';
const AUTOR = { userId: String(new Types.ObjectId()), papel: 'fiscal' as const };

rodar('fechamento do IMR do contrato contra o Mongo', () => {
  let fechamento: typeof import('../fechamento');
  let leitura: typeof import('../leitura');
  let estado: typeof import('../estado');
  let modelos: ModelDeTeste[];
  let M: {
    Contrato: typeof import('@/models/Contrato').ContratoModel;
    Chamado: typeof import('@/models/Chamado').ChamadoModel;
    Fechamento: typeof import('@/models/ImrFechamento').ImrFechamentoModel;
    Reabertura: typeof import('@/models/ImrReabertura').ImrReaberturaModel;
    Marcacao: typeof import('@/models/ImrMarcacao').ImrMarcacaoModel;
  };

  beforeAll(async () => {
    const [contrato, chamado, fech, reab, marc, cotacao, holiday, calendario] = await Promise.all([
      import('@/models/Contrato'),
      import('@/models/Chamado'),
      import('@/models/ImrFechamento'),
      import('@/models/ImrReabertura'),
      import('@/models/ImrMarcacao'),
      import('@/models/CotacaoMaterial'),
      import('@/models/Holiday'),
      import('@/models/BusinessCalendar'),
    ]);
    M = {
      Contrato: contrato.ContratoModel,
      Chamado: chamado.ChamadoModel,
      Fechamento: fech.ImrFechamentoModel,
      Reabertura: reab.ImrReaberturaModel,
      Marcacao: marc.ImrMarcacaoModel,
    };
    modelos = [
      cru(M.Contrato),
      cru(M.Chamado),
      cru(M.Fechamento),
      cru(M.Reabertura),
      cru(M.Marcacao),
      cru(cotacao.CotacaoMaterialModel),
      cru(holiday.HolidayModel),
      cru(calendario.BusinessCalendarModel),
    ];
    await conectarMongoDeTeste(modelos, 'severino_test_imr_fechamento');
    fechamento = await import('../fechamento');
    leitura = await import('../leitura');
    estado = await import('../estado');
  });

  beforeEach(async () => {
    await Promise.all(modelos.map((m) => m.deleteMany({})));
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  async function contrato() {
    const _id = new Types.ObjectId();
    await M.Contrato.collection.insertOne({
      _id,
      numero: '12/2025',
      numeroNormalizado: '12/2025',
      empresa: 'Contratada',
      cnpj: '12345678000199',
      processoSei: '0001',
      tiposServico: ['Manutenção Predial'],
      vigenciaInicio: '2026-01-01',
      vigenciaFim: '2027-02-28',
      isActive: true,
    });
    return String(_id);
  }

  /** Aberto segunda 05/10 sem técnico: o prazo (terça 18h) venceu, é um atraso. */
  async function chamadoAtrasado(ticket: string) {
    const _id = new Types.ObjectId();
    const createdAt = b('2026-10-05T09:00');
    await M.Chamado.collection.insertOne({
      _id,
      ticket_number: ticket,
      titulo: 'Troca de lâmpada',
      status: 'aberto',
      tipoServico: 'Manutenção Predial',
      createdAt,
      updatedAt: createdAt,
    });
    return String(_id);
  }

  const entrada = (contratoId: string) => ({
    contratoId,
    competencia: COMPETENCIA,
    i1Pontos: 40,
    i1Observacao: null,
    i2Pontos: 18,
    i2Observacao: 'Faltou um uniforme.',
  });

  it('recusa fechar antes do último dia do mês (AC-10)', async () => {
    const id = await contrato();
    const r = await fechamento.fecharMesImr(entrada(id), AUTOR, b('2026-10-31T23:00'));
    expect(r).toEqual({ ok: false, error: 'O mês só pode ser fechado depois do último dia dele.' });
  });

  it('grava a versão 1 com os números da prévia e recusa fechar de novo (AC-10, AC-15)', async () => {
    const id = await contrato();
    await chamadoAtrasado('CHM-2026-00001');
    const previa = await leitura.montarPreviaImr({
      contratoId: id,
      competencia: COMPETENCIA,
      agora: AGORA,
    });
    if (!previa.ok) throw new Error('prévia');

    expect(await fechamento.fecharMesImr(entrada(id), AUTOR, AGORA)).toEqual({
      ok: true,
      versao: 1,
    });

    const foto = await estado.lerFechamento(id, COMPETENCIA, 1);
    expect(foto?.i3.pontos).toBe(previa.apuracao.i3.pontos);
    expect(foto?.i3.pontos).toBe(15);
    expect(foto?.i3.linhas.map((l) => l.ticketNumber)).toEqual(['CHM-2026-00001']);
    expect(foto?.i4.pontos).toBe(20);
    expect(foto?.total).toBe(40 + 18 + 15 + 20);
    expect(foto?.faixa).toEqual({ fator: 1, percentual: 100 });
    expect(foto?.i2.observacao).toBe('Faltou um uniforme.');
    expect(foto?.reincidenciaAvaliada).toBe(false);
    expect(foto?.parametros.vigencia).toEqual({ inicio: '2026-01-01', fim: '2027-02-28' });

    expect(await fechamento.fecharMesImr(entrada(id), AUTOR, AGORA)).toEqual({
      ok: false,
      error: 'O mês já está fechado.',
    });
  });

  it('recusa fechar quando o I3 ou o I4 mudou desde a tela, sem gravar nada (AC-10, AC-15)', async () => {
    const id = await contrato();
    await chamadoAtrasado('CHM-2026-00001');

    // A tela foi aberta antes do atraso: o I3 mostrado era 20, a apuração agora dá 15.
    const r = await fechamento.fecharMesImr(
      { ...entrada(id), pontosVistos: { i3: 20, i4: 20 } },
      AUTOR,
      AGORA,
    );

    expect(r).toEqual({
      ok: false,
      error:
        'Os pontos dos indicadores 3 ou 4 mudaram desde que você abriu a tela. Atualize a tela e confira antes de fechar.',
    });
    expect(await estado.lerFechamento(id, COMPETENCIA, 1)).toBeNull();
  });

  it('fecha quando os pontos vistos batem com a apuração (AC-10)', async () => {
    const id = await contrato();
    await chamadoAtrasado('CHM-2026-00001');

    const r = await fechamento.fecharMesImr(
      { ...entrada(id), pontosVistos: { i3: 15, i4: 20 } },
      AUTOR,
      AGORA,
    );

    expect(r).toEqual({ ok: true, versao: 1 });
  });

  it('grava o fechadoEm depois das leituras, nunca antes do agora da apuração (AC-9)', async () => {
    const id = await contrato();
    const depois = new Date(AGORA.getTime() + 5_000);
    const relogio = vi.spyOn(Date, 'now').mockReturnValue(depois.getTime());

    try {
      await fechamento.fecharMesImr(entrada(id), AUTOR, AGORA);
    } finally {
      relogio.mockRestore();
    }

    const foto = await estado.lerFechamento(id, COMPETENCIA, 1);
    expect(foto?.fechadoEm).toEqual(depois);
  });

  it('reabre, fecha na versão 2 e a versão 1 continua legível (AC-11)', async () => {
    const id = await contrato();
    await chamadoAtrasado('CHM-2026-00001');
    await fechamento.fecharMesImr(entrada(id), AUTOR, AGORA);

    const motivo = { contratoId: id, competencia: COMPETENCIA, motivo: 'Pontos do I2 errados.' };
    expect(await fechamento.reabrirMesImr(motivo, AUTOR, b('2026-11-04T10:00'))).toEqual({
      ok: true,
    });
    expect((await estado.lerEstadoDoMes(id, COMPETENCIA)).fechado).toBe(false);
    expect(await fechamento.reabrirMesImr(motivo, AUTOR, b('2026-11-04T11:00'))).toEqual({
      ok: false,
      error: 'O mês não está fechado.',
    });

    const r = await fechamento.fecharMesImr(
      { ...entrada(id), i2Pontos: 20 },
      AUTOR,
      b('2026-11-05T10:00'),
    );
    expect(r).toEqual({ ok: true, versao: 2 });

    const historico = await estado.lerHistoricoDoMes(id, COMPETENCIA);
    expect(historico.estado).toMatchObject({ fechado: true, maiorVersao: 2 });
    expect(historico.versoes.map((v) => [v.versao, v.total])).toEqual([
      [1, 93],
      [2, 95],
    ]);
    expect(historico.reaberturas).toHaveLength(1);
    expect(historico.reaberturas[0]?.motivo).toBe('Pontos do I2 errados.');
    expect((await estado.lerFechamento(id, COMPETENCIA, 1))?.i2.pontos).toBe(18);
  });

  it('ignora a marcação gravada com o mês fechado, mesmo depois de reabrir (AC-9)', async () => {
    const id = await contrato();
    const chamadoId = await chamadoAtrasado('CHM-2026-00001');
    await fechamento.fecharMesImr(entrada(id), AUTOR, AGORA);
    // Corrida rara: a marcação entra enquanto o mês está fechado.
    await M.Marcacao.collection.insertOne({
      contratoId: new Types.ObjectId(id),
      competencia: COMPETENCIA,
      indicador: 3,
      alvoTipo: 'chamado',
      alvoId: new Types.ObjectId(chamadoId),
      tipo: 'nao_atendimento',
      motivo: 'Técnico não compareceu.',
      porUserId: new Types.ObjectId(AUTOR.userId),
      papel: 'fiscal',
      em: b('2026-11-03T11:00'),
    });
    await fechamento.reabrirMesImr(
      { contratoId: id, competencia: COMPETENCIA, motivo: 'Revisar o indicador 3.' },
      AUTOR,
      b('2026-11-04T10:00'),
    );

    const previa = await leitura.montarPreviaImr({
      contratoId: id,
      competencia: COMPETENCIA,
      agora: b('2026-11-04T12:00'),
    });
    if (!previa.ok) throw new Error('prévia');
    expect(previa.apuracao.i3.zeradoPorMarcacao).toBe(false);
    expect(previa.apuracao.i3.pontos).toBe(15);
  });

  it('dois fechamentos ao mesmo tempo gravam uma só versão (AC-18)', async () => {
    const id = await contrato();
    const rs = await Promise.all([
      fechamento.fecharMesImr(entrada(id), AUTOR, AGORA),
      fechamento.fecharMesImr(entrada(id), AUTOR, AGORA),
    ]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    const recusa = rs.find((r) => !r.ok);
    expect(recusa && !recusa.ok ? recusa.error : '').toMatch(
      /O mês já foi fechado por outra pessoa|O mês já está fechado/,
    );
    expect(await M.Fechamento.countDocuments({ contratoId: new Types.ObjectId(id) })).toBe(1);
  });

  it('duas reaberturas ao mesmo tempo da mesma versão gravam uma só (AC-18)', async () => {
    const id = await contrato();
    await fechamento.fecharMesImr(entrada(id), AUTOR, AGORA);
    const motivo = { contratoId: id, competencia: COMPETENCIA, motivo: 'Revisar o mês inteiro.' };
    const rs = await Promise.all([
      fechamento.reabrirMesImr(motivo, AUTOR, b('2026-11-04T10:00')),
      fechamento.reabrirMesImr(motivo, AUTOR, b('2026-11-04T10:00')),
    ]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(await M.Reabertura.countDocuments({ contratoId: new Types.ObjectId(id) })).toBe(1);
  });
});
