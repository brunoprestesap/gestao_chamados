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
 * `idsDoRecorte` (spec 0009, AC-1, AC-2): a query real por trás dos recortes
 * `sem_revisao` e `corrigidos`. `GET /api/gestao/chamados` mocka esta função
 * nos próprios testes (só confere o roteamento), então a query em si só prova
 * a forma certa contra o Mongo de verdade.
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('idsDoRecorte, contra o Mongo', () => {
  let idsDoRecorte: typeof import('../revisao-ia-filtro').idsDoRecorte;
  let DecisaoIaModel: typeof import('@/models/DecisaoIa').DecisaoIaModel;
  let todos: ModelDeTeste[];

  const userId = new Types.ObjectId();
  const valorBase = { prioridade: 'ALTA', rotulo: 'Alta' };

  function decisao(overrides: Record<string, unknown> = {}) {
    return {
      chamadoId: new Types.ObjectId(),
      campo: 'prioridade',
      decididoPor: 'ia',
      efeito: 'aplicado',
      valorIa: valorBase,
      valorFinal: valorBase,
      confianca: 0.9,
      motivo: 'Motivo da IA.',
      situacao: 'sem_revisao',
      correcoes: [],
      ...overrides,
    };
  }

  beforeAll(async () => {
    ({ idsDoRecorte } = await import('../revisao-ia-filtro'));
    ({ DecisaoIaModel } = await import('@/models/DecisaoIa'));
    todos = [DecisaoIaModel] as unknown as ModelDeTeste[];
    await conectarMongoDeTeste(todos, 'severino_test_revisao_ia_filtro');
  }, 60_000);

  afterEach(async () => {
    await limparColecoes(todos);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  it('sem_revisao: só decisões aplicadas e sem revisão, nunca sugestão nem já revisada', async () => {
    const semRevisao = await DecisaoIaModel.create(decisao());
    await DecisaoIaModel.create(decisao({ chamadoId: new Types.ObjectId(), efeito: 'sugestao' }));
    await DecisaoIaModel.create(
      decisao({ chamadoId: new Types.ObjectId(), situacao: 'confirmada' }),
    );

    const ids = await idsDoRecorte('sem_revisao');

    expect(ids).toEqual([String(semRevisao.chamadoId)]);
  });

  it('sem_revisao: um chamado com duas decisões (campos diferentes) aparece uma vez só', async () => {
    const chamadoId = new Types.ObjectId();
    await DecisaoIaModel.create(decisao({ chamadoId, campo: 'prioridade' }));
    await DecisaoIaModel.create(
      decisao({
        chamadoId,
        campo: 'tecnico',
        valorIa: { tecnicoId: userId, rotulo: 'Ana' },
        valorFinal: { tecnicoId: userId, rotulo: 'Ana' },
      }),
    );

    const ids = await idsDoRecorte('sem_revisao');

    expect(ids).toEqual([String(chamadoId)]);
  });

  it('corrigidos: só decisão corrigida com correção de origem gestao', async () => {
    const corrigidoPelaGestao = await DecisaoIaModel.create(
      decisao({
        situacao: 'corrigida',
        correcoes: [
          {
            anterior: valorBase,
            novo: { prioridade: 'EMERGENCIAL', rotulo: 'Emergencial' },
            userId,
            origem: 'gestao',
            motivo: 'Reincidência.',
            em: new Date(),
          },
        ],
      }),
    );
    // Corrigida, mas pela confirmação do solicitante na abertura — não conta.
    await DecisaoIaModel.create(
      decisao({
        chamadoId: new Types.ObjectId(),
        situacao: 'corrigida',
        correcoes: [
          {
            anterior: valorBase,
            novo: { prioridade: 'NORMAL', rotulo: 'Normal' },
            userId,
            origem: 'solicitante',
            motivo: '',
            em: new Date(),
          },
        ],
      }),
    );

    const ids = await idsDoRecorte('corrigidos');

    expect(ids).toEqual([String(corrigidoPelaGestao.chamadoId)]);
  });

  it('sem nenhuma decisão gravada, devolve lista vazia (nunca lança)', async () => {
    await expect(idsDoRecorte('sem_revisao')).resolves.toEqual([]);
    await expect(idsDoRecorte('corrigidos')).resolves.toEqual([]);
  });
});
