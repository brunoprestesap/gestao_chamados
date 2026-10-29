import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

/**
 * A leitura do indicador 4 contra o MongoDB de verdade (spec 0023): as
 * cotações entram pelo prazo, de chamado do contrato aberto em qualquer data,
 * e o encerramento sai da trilha.
 *
 * covers: AC-5, AC-6
 */

/** Pela coleção crua: a trilha é só de inclusão e o teste grava direto. */
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

rodar('leitura do IMR do contrato, indicador 4, contra o Mongo', () => {
  let leitura: typeof import('../leitura');
  let modelos: ModelDeTeste[];
  let M: {
    Contrato: typeof import('@/models/Contrato').ContratoModel;
    Chamado: typeof import('@/models/Chamado').ChamadoModel;
    Cotacao: typeof import('@/models/CotacaoMaterial').CotacaoMaterialModel;
    Evento: typeof import('@/models/CotacaoMaterialEvento').CotacaoMaterialEventoModel;
  };

  beforeAll(async () => {
    const [contrato, chamado, cotacao, evento, holiday, calendario] = await Promise.all([
      import('@/models/Contrato'),
      import('@/models/Chamado'),
      import('@/models/CotacaoMaterial'),
      import('@/models/CotacaoMaterialEvento'),
      import('@/models/Holiday'),
      import('@/models/BusinessCalendar'),
    ]);
    M = {
      Contrato: contrato.ContratoModel,
      Chamado: chamado.ChamadoModel,
      Cotacao: cotacao.CotacaoMaterialModel,
      Evento: evento.CotacaoMaterialEventoModel,
    };
    modelos = [
      cru(M.Contrato),
      cru(M.Chamado),
      cru(M.Cotacao),
      cru(M.Evento),
      cru(holiday.HolidayModel),
      cru(calendario.BusinessCalendarModel),
    ];
    await conectarMongoDeTeste(modelos, 'severino_test_imr_contrato');
    leitura = await import('../leitura');
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

  let numero = 0;
  async function chamado(tipoServico: string, createdAt: Date) {
    const _id = new Types.ObjectId();
    numero += 1;
    await M.Chamado.collection.insertOne({
      _id,
      ticket_number: `CHM-2026-${String(numero).padStart(5, '0')}`,
      titulo: 'Troca de lâmpada',
      status: 'em atendimento',
      tipoServico,
      createdAt,
      updatedAt: createdAt,
    });
    return _id;
  }

  async function cotacao(chamadoId: Types.ObjectId, extra: Record<string, unknown>) {
    const _id = new Types.ObjectId();
    numero += 1;
    await M.Cotacao.collection.insertOne({
      _id,
      numero: `MAT-2026-${String(numero).padStart(4, '0')}`,
      chamadoId,
      situacao: 'autorizada',
      autorizadoEm: b('2026-09-10T09:00'),
      executadoEm: null,
      ...extra,
    });
    return _id;
  }

  it('entra pelo prazo, de chamado antigo do contrato; outro tipo de serviço fica fora', async () => {
    const contratoId = await contrato();
    // Aberto em julho, fora da janela de leitura do indicador 3.
    const antigo = await chamado('Manutenção Predial', b('2026-07-01T10:00'));
    const outroTipo = await chamado('Ar-Condicionado', b('2026-09-01T10:00'));
    await cotacao(antigo, {
      situacao: 'executada',
      fornecimentoAte: b('2026-09-17T18:00'),
      executadoEm: b('2026-09-18T10:00'),
    });
    await cotacao(outroTipo, { fornecimentoAte: b('2026-09-17T18:00') });

    const r = await leitura.montarPreviaImr({
      contratoId,
      competencia: '2026-09',
      agora: b('2026-10-05T12:00'),
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.apuracao.i4).toMatchObject({ base: 1, ocorrencias: 1, pontos: 15 });
    expect(r.apuracao.i4.linhas[0]?.chamadoTicketNumber).toMatch(/^CHM-2026-/);
  });

  it('a cotação antiga sem prazo entra estimada, e a cancelada antes do prazo sai pela trilha', async () => {
    const contratoId = await contrato();
    const c = await chamado('Manutenção Predial', b('2026-09-01T10:00'));
    // Sem `fornecimentoAte`: autorizada antes da spec 0023.
    await cotacao(c, {});
    const cancelada = await cotacao(c, {
      situacao: 'cancelada',
      fornecimentoAte: b('2026-09-17T18:00'),
    });
    await M.Evento.collection.insertOne({
      cotacaoId: cancelada,
      de: 'autorizada',
      para: 'cancelada',
      acao: 'cancelar',
      em: b('2026-09-15T10:00'),
    });

    const r = await leitura.montarPreviaImr({
      contratoId,
      competencia: '2026-09',
      agora: b('2026-10-05T12:00'),
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.apuracao.i4).toMatchObject({ base: 1, ocorrencias: 1, prazosEstimados: 1 });
    expect(r.apuracao.i4.linhas[0]).toMatchObject({
      prazo: b('2026-09-17T18:00'),
      prazoEstimado: true,
      executadoEm: null,
    });
  });
});
