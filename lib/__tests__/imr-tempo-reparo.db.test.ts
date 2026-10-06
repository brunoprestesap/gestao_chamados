import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

/**
 * Paridade entre `tempoDeReparoMs` (JS, indicadores de ativo) e o facet
 * `tempoPorTipo` do IMR (pipeline): a mesma fórmula nos dois lados, com pausa
 * descontada e resultado negativo cortado em zero (spec 0014, AC-17).
 *
 * Roda só com `MONGO_TEST_URI` (ver `tests/mongo-test-env.ts`).
 *
 * covers: AC-17
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('tempoDeReparoMs × tempoPorTipo (banco real)', () => {
  let models: ModelDeTeste[] = [];
  let ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  let computeImrReport: typeof import('@/lib/imr-service').computeImrReport;
  let tempoDeReparoMs: typeof import('@/lib/imr-service').tempoDeReparoMs;

  beforeAll(async () => {
    ({ ChamadoModel } = await import('@/models/Chamado'));
    ({ computeImrReport, tempoDeReparoMs } = await import('@/lib/imr-service'));
    models = [ChamadoModel as unknown as ModelDeTeste];
    await conectarMongoDeTeste(models, 'severino_test_imr_paridade');
  });

  beforeEach(async () => {
    await limparColecoes(models);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  it('dá o mesmo tempo médio para os mesmos chamados', async () => {
    // Arrange: com pausa, sem pausa, pausa maior que o tempo (vira zero) e sem resolução
    const h = 60 * 60 * 1000;
    const base = new Date('2026-09-10T12:00:00.000Z');
    const casos = [
      { createdAt: base, resolvedAt: new Date(base.getTime() + 10 * h), totalPausedMinutes: 120 },
      { createdAt: base, resolvedAt: new Date(base.getTime() + 3 * h), totalPausedMinutes: 0 },
      { createdAt: base, resolvedAt: new Date(base.getTime() + 1 * h), totalPausedMinutes: 600 },
      { createdAt: base, resolvedAt: null, totalPausedMinutes: 30 },
    ];
    await ChamadoModel.collection.insertMany(
      casos.map((c, i) => ({
        _id: new Types.ObjectId(),
        ticket_number: `PARIDADE-${i}`,
        status: 'encerrado',
        tipoServico: 'Ar-Condicionado',
        createdAt: c.createdAt,
        closedAt: new Date('2026-09-20T12:00:00.000Z'),
        totalPausedMinutes: c.totalPausedMinutes,
        sla: { resolvedAt: c.resolvedAt },
      })),
    );

    // Act
    const imr = await computeImrReport({
      dataInicial: new Date('2026-09-01T00:00:00.000Z'),
      dataFinal: new Date('2026-09-30T00:00:00.000Z'),
    });
    const tipo = imr.porTipoServico.find((t) => t.tipoServico === 'Ar-Condicionado');
    const emJs = casos.map((c) => tempoDeReparoMs(c)).filter((ms): ms is number => ms !== null);

    // Assert
    expect(emJs).toEqual([8 * h, 3 * h, 0]);
    expect(tipo?.tempoMedioMs).toBe(emJs.reduce((a, b) => a + b, 0) / emJs.length);
  });
});
