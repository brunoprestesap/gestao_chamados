import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

/**
 * `generateTicketNumber` com o contador atômico (scope, feature 29): continua a
 * sequência dos chamados criados antes do contador e nunca repete número em
 * gerações simultâneas, nem na primeira do ano, quando o contador é semeado.
 *
 * Roda só com `MONGO_TEST_URI` (ver `tests/mongo-test-env.ts`).
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('número do chamado pelo contador (banco real)', () => {
  let models: ModelDeTeste[] = [];
  let ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  let ContadorModel: typeof import('@/models/Contador').ContadorModel;
  let generateTicketNumber: typeof import('@/lib/chamado-utils').generateTicketNumber;

  const ano = new Date().getFullYear();
  const prefixo = `CHM-${ano}-`;

  beforeAll(async () => {
    ({ ChamadoModel } = await import('@/models/Chamado'));
    ({ ContadorModel } = await import('@/models/Contador'));
    ({ generateTicketNumber } = await import('@/lib/chamado-utils'));
    models = [ChamadoModel as unknown as ModelDeTeste, ContadorModel as unknown as ModelDeTeste];
    await conectarMongoDeTeste(models, 'severino_test_numero_chamado');
  });

  beforeEach(async () => {
    await limparColecoes(models);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  it('começa do 1 quando o ano ainda não tem chamado', async () => {
    // Act
    const numero = await generateTicketNumber();

    // Assert
    expect(numero).toBe(`${prefixo}00001`);
  });

  it('continua a partir do maior número já gravado antes do contador', async () => {
    // Arrange: chamados antigos, de outro ano inclusive, sem contador no banco
    await ChamadoModel.collection.insertMany([
      { _id: new Types.ObjectId(), ticket_number: `${prefixo}00007` },
      { _id: new Types.ObjectId(), ticket_number: `${prefixo}00041` },
      { _id: new Types.ObjectId(), ticket_number: `CHM-${ano - 1}-00900` },
    ]);

    // Act
    const primeiro = await generateTicketNumber();
    const segundo = await generateTicketNumber();

    // Assert
    expect([primeiro, segundo]).toEqual([`${prefixo}00042`, `${prefixo}00043`]);
  });

  it('recomeça do 1 no ano novo, com um contador próprio', async () => {
    // Arrange: o ano anterior já vai alto
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2031, 11, 31, 23, 0));
    await generateTicketNumber();
    await generateTicketNumber();

    // Act
    vi.setSystemTime(new Date(2032, 0, 1, 8, 0));
    const primeiroDoAno = await generateTicketNumber();
    vi.useRealTimers();

    // Assert
    expect(primeiroDoAno).toBe('CHM-2032-00001');
    expect(await ContadorModel.findById('chamado_2031').lean()).toMatchObject({ seq: 2 });
  });

  it('não repete número em gerações simultâneas, inclusive na semeadura', async () => {
    // Arrange: sem contador, então todas as chamadas disputam a semeadura
    await ChamadoModel.collection.insertOne({
      _id: new Types.ObjectId(),
      ticket_number: `${prefixo}00010`,
    });

    // Act
    const numeros = await Promise.all(Array.from({ length: 30 }, () => generateTicketNumber()));

    // Assert: 30 números distintos e em sequência a partir do 11
    const esperados = Array.from(
      { length: 30 },
      (_, i) => `${prefixo}${String(11 + i).padStart(5, '0')}`,
    );
    expect([...numeros].sort()).toEqual(esperados);
  });
});
