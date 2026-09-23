import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

/**
 * Documento único de configuração contra o Mongo de verdade (spec 0006,
 * AC-5, AC-6). O índice único em `chave` é o que garante nunca existir dois
 * documentos; só prova certo com o banco de verdade.
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('configuração de calibração, contra o Mongo', () => {
  let IaAutonomiaConfigModel: typeof import('@/models/IaAutonomiaConfig').IaAutonomiaConfigModel;
  let lerConfig: typeof import('../config').lerConfig;
  let salvarConfig: typeof import('../config').salvarConfig;
  let todos: ModelDeTeste[];

  beforeAll(async () => {
    ({ IaAutonomiaConfigModel } = await import('@/models/IaAutonomiaConfig'));
    ({ lerConfig, salvarConfig } = await import('../config'));

    todos = [IaAutonomiaConfigModel] as unknown as ModelDeTeste[];
    await conectarMongoDeTeste(todos, 'severino_test_ia_confianca_config');
  }, 60_000);

  afterEach(async () => {
    await limparColecoes(todos);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  it('nasce com os padrões de fábrica na primeira leitura, sem nenhum documento ainda (AC-6)', async () => {
    const config = await lerConfig();

    expect(config).toEqual({
      servico: { limiteConfianca: null, amostraMinima: 30 },
      prioridade: { limiteConfianca: null, amostraMinima: 30 },
      autonomiaAtiva: false,
    });
    await expect(IaAutonomiaConfigModel.countDocuments()).resolves.toBe(1);
  });

  it('grava os três campos numa única gravação e nunca cria um segundo documento (AC-5)', async () => {
    const userId = String(new Types.ObjectId());

    await salvarConfig(
      {
        servico: { limiteConfianca: 0.9, amostraMinima: 20 },
        prioridade: { limiteConfianca: null, amostraMinima: 15 },
        autonomiaAtiva: true,
      },
      userId,
    );

    const lido = await lerConfig();
    expect(lido).toEqual({
      servico: { limiteConfianca: 0.9, amostraMinima: 20 },
      prioridade: { limiteConfianca: null, amostraMinima: 15 },
      autonomiaAtiva: true,
    });

    const doc = await IaAutonomiaConfigModel.findOne().lean();
    expect(String(doc?.updatedByUserId)).toBe(userId);
    await expect(IaAutonomiaConfigModel.countDocuments()).resolves.toBe(1);
  });

  it('duas leituras concorrentes na primeira carga nunca criam dois documentos', async () => {
    await Promise.all([lerConfig(), lerConfig(), lerConfig()]);

    await expect(IaAutonomiaConfigModel.countDocuments()).resolves.toBe(1);
  });
});
