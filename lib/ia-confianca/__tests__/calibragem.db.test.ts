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
 * Medição de calibragem contra o Mongo de verdade (spec 0006, AC-1 a AC-4, AC-9).
 * Sem `.filter`/mock de query: o filtro de amostra e a matemática do corte só
 * provam certo com dados reais indo e voltando do banco.
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('calibragem da confiança, contra o Mongo', () => {
  let DecisaoIaModel: typeof import('@/models/DecisaoIa').DecisaoIaModel;
  let medirCalibragem: typeof import('../calibragem').medirCalibragem;
  let ABERTURA_TASK: string;
  let PROMPT_VERSION: string;
  let todos: ModelDeTeste[];

  beforeAll(async () => {
    ({ DecisaoIaModel } = await import('@/models/DecisaoIa'));
    ({ medirCalibragem } = await import('../calibragem'));
    ({ ABERTURA_TASK, PROMPT_VERSION } = await import('@/lib/assistente/prompt'));

    todos = [DecisaoIaModel] as unknown as ModelDeTeste[];
    await conectarMongoDeTeste(todos, 'severino_test_calibragem');
  }, 60_000);

  afterEach(async () => {
    await limparColecoes(todos);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  const valor = { rotulo: 'X' };

  /** Uma decisão elegível (bate todos os filtros de AC-9) menos o que `overrides` mudar. */
  function decisaoElegivel(overrides: Record<string, unknown> = {}) {
    return {
      chamadoId: new Types.ObjectId(),
      campo: 'prioridade',
      decididoPor: 'ia',
      efeito: 'sugestao',
      valorIa: valor,
      valorFinal: valor,
      motivo: 'motivo',
      confianca: 0.95,
      promptVersion: PROMPT_VERSION,
      task: ABERTURA_TASK,
      revisadaEm: new Date(),
      situacao: 'confirmada',
      ...overrides,
    };
  }

  it('mede acerto, monta a tabela de cortes e sugere o menor corte elegível (AC-1, AC-2, AC-4)', async () => {
    // Arrange: 5 decisões de prioridade sempre confirmadas (0.95 a 0.85) e uma
    // corrigida a 0.60, que só entra na amostra a partir do corte 0.60.
    await DecisaoIaModel.create([
      decisaoElegivel({ confianca: 0.95 }),
      decisaoElegivel({ confianca: 0.95 }),
      decisaoElegivel({ confianca: 0.9 }),
      decisaoElegivel({ confianca: 0.9 }),
      decisaoElegivel({ confianca: 0.85 }),
      decisaoElegivel({ confianca: 0.6, situacao: 'corrigida' }),
    ] as never);

    // Act
    const relatorio = await medirCalibragem({ servico: 3, prioridade: 3 });

    // Assert
    const prioridade = relatorio.prioridade;
    expect(prioridade.totalElegivel).toBe(6);
    expect(prioridade.amostraSuficiente).toBe(true);

    const corte100 = prioridade.cortes.find((l) => l.corte === 1.0);
    expect(corte100).toEqual({ corte: 1.0, total: 0, percentualAcerto: null });

    const corte65 = prioridade.cortes.find((l) => l.corte === 0.65);
    expect(corte65).toEqual({ corte: 0.65, total: 5, percentualAcerto: 1 });

    const corte60 = prioridade.cortes.find((l) => l.corte === 0.6);
    expect(corte60?.total).toBe(6);
    expect(corte60?.percentualAcerto).toBeCloseTo(5 / 6);

    // 0.90 e 0.85 também batem a meta, mas 0.65 é o menor corte elegível.
    expect(prioridade.sugestao).toBe(0.65);
  });

  it('sem amostra mínima, não monta tabela nem sugestão, mas mostra o total (AC-3)', async () => {
    await DecisaoIaModel.create([
      decisaoElegivel({ confianca: 0.95 }),
      decisaoElegivel({ confianca: 0.9 }),
    ] as never);

    const relatorio = await medirCalibragem({ servico: 3, prioridade: 3 });

    expect(relatorio.prioridade.totalElegivel).toBe(2);
    expect(relatorio.prioridade.amostraSuficiente).toBe(false);
    expect(relatorio.prioridade.cortes).toEqual([]);
    expect(relatorio.prioridade.sugestao).toBeNull();
  });

  it('sem nenhum corte atingindo a meta de 90%, não sugere nenhum valor (AC-4)', async () => {
    await DecisaoIaModel.create([
      decisaoElegivel({ confianca: 0.95, situacao: 'confirmada' }),
      decisaoElegivel({ confianca: 0.95, situacao: 'confirmada' }),
      decisaoElegivel({ confianca: 0.95, situacao: 'corrigida' }),
      decisaoElegivel({ confianca: 0.95, situacao: 'corrigida' }),
    ] as never);

    const relatorio = await medirCalibragem({ servico: 3, prioridade: 3 });

    expect(relatorio.prioridade.amostraSuficiente).toBe(true);
    expect(relatorio.prioridade.cortes.length).toBeGreaterThan(0);
    expect(relatorio.prioridade.sugestao).toBeNull();
  });

  it('nunca mistura decisão de tecnico, regra, aplicado, outra task, prompt antigo, sem confiança ou não revisada (AC-9)', async () => {
    await DecisaoIaModel.create([
      // As 6 elegíveis do caminho feliz, pra ter uma contagem de referência.
      decisaoElegivel({ confianca: 0.95 }),
      decisaoElegivel({ confianca: 0.95 }),
      decisaoElegivel({ confianca: 0.9 }),
      decisaoElegivel({ confianca: 0.9 }),
      decisaoElegivel({ confianca: 0.85 }),
      decisaoElegivel({ confianca: 0.6, situacao: 'corrigida' }),
      // As que nunca podem contar, cada uma quebrando só um filtro de cada vez:
      decisaoElegivel({ campo: 'tecnico' }),
      decisaoElegivel({ decididoPor: 'regra' }),
      decisaoElegivel({ efeito: 'aplicado' }),
      decisaoElegivel({ task: 'outra.tarefa' }),
      decisaoElegivel({ promptVersion: '0' }),
      decisaoElegivel({ confianca: null }),
      decisaoElegivel({ revisadaEm: null, situacao: 'sem_revisao' }),
    ] as never);

    const relatorio = await medirCalibragem({ servico: 3, prioridade: 3 });

    expect(relatorio.prioridade.totalElegivel).toBe(6);
    expect(relatorio.servico.totalElegivel).toBe(0);
  });
});
