import { describe, expect, it } from 'vitest';

import {
  CHAMADO_HISTORY_ACTION_LABELS,
  CHAMADO_HISTORY_ACTIONS,
  CHAMADO_HISTORY_ACTOR_LABELS,
  CHAMADO_HISTORY_ACTOR_TYPES,
} from '@/shared/chamados/history.constants';

/**
 * Constantes do histórico do chamado.
 *
 * A spec 0002 acrescentou as ações da IA e o tipo de ator. O que estes testes
 * trancam é o par: ação sem rótulo aparece crua na linha do tempo, e ator sem
 * rótulo deixa a entrada da IA sem nome de quem agiu (AC-11).
 */

describe('CHAMADO_HISTORY_ACTIONS', () => {
  it('não tem ação repetida', () => {
    // Arrange / Act
    const unicas = new Set<string>(CHAMADO_HISTORY_ACTIONS);

    // Assert: repetida passa batido no enum do Mongoose
    expect(unicas.size).toBe(CHAMADO_HISTORY_ACTIONS.length);
  });

  it('registra a decisão da IA (AC-11)', () => {
    expect([...CHAMADO_HISTORY_ACTIONS]).toContain('decisao_ia');
  });

  it('registra a correção de uma decisão da IA (AC-11)', () => {
    expect([...CHAMADO_HISTORY_ACTIONS]).toContain('correcao_ia');
  });

  it('mantém as ações antigas do chamado', () => {
    // Assert: a spec 0002 acrescenta, nunca remove, senão histórico gravado
    // vira enum inválido na leitura
    expect([...CHAMADO_HISTORY_ACTIONS]).toEqual(
      expect.arrayContaining([
        'abertura',
        'alteracao_status',
        'atribuicao_tecnico',
        'reatribuicao_tecnico',
        'comentario',
        'anexo',
        'cancelamento',
        'classificacao',
        'execucao_registrada',
        'encerramento',
        'avaliado',
        'reabertura',
      ]),
    );
  });
});

describe('CHAMADO_HISTORY_ACTION_LABELS', () => {
  it('tem um rótulo para cada ação, sem sobra', () => {
    // Arrange / Act
    const acoesComRotulo = Object.keys(CHAMADO_HISTORY_ACTION_LABELS).sort();

    // Assert
    expect(acoesComRotulo).toEqual([...CHAMADO_HISTORY_ACTIONS].sort());
  });

  it('nenhum rótulo é vazio', () => {
    const rotulos = Object.values(CHAMADO_HISTORY_ACTION_LABELS);

    expect(rotulos.every((rotulo) => rotulo.trim().length > 0)).toBe(true);
  });

  it('nomeia as duas ações da IA em português (AC-11)', () => {
    expect(CHAMADO_HISTORY_ACTION_LABELS.decisao_ia).toBe('Decisão da IA');
    expect(CHAMADO_HISTORY_ACTION_LABELS.correcao_ia).toBe('Correção de Decisão da IA');
  });
});

describe('CHAMADO_HISTORY_ACTOR_TYPES (AC-11)', () => {
  it('tem os três tipos de ator', () => {
    expect([...CHAMADO_HISTORY_ACTOR_TYPES]).toEqual(['usuario', 'ia', 'sistema']);
  });

  it('usuario é o primeiro, que é o padrão do documento antigo', () => {
    expect(CHAMADO_HISTORY_ACTOR_TYPES[0]).toBe('usuario');
  });
});

describe('CHAMADO_HISTORY_ACTOR_LABELS (AC-11)', () => {
  it('tem uma entrada para cada tipo de ator', () => {
    // Arrange / Act
    const tiposComEntrada = Object.keys(CHAMADO_HISTORY_ACTOR_LABELS).sort();

    // Assert
    expect(tiposComEntrada).toEqual([...CHAMADO_HISTORY_ACTOR_TYPES].sort());
  });

  it('mostra IA quando a entrada veio do modelo', () => {
    expect(CHAMADO_HISTORY_ACTOR_LABELS.ia).toBe('IA');
  });

  it('mostra Sistema quando a entrada veio de uma regra', () => {
    expect(CHAMADO_HISTORY_ACTOR_LABELS.sistema).toBe('Sistema');
  });

  it('deixa nulo para usuario, que é quando o nome vem do banco', () => {
    // Assert: o nulo é o sinal de "busque o usuário"; qualquer texto aqui
    // faria a tela parar de buscar o nome de quem agiu
    expect(CHAMADO_HISTORY_ACTOR_LABELS.usuario).toBeNull();
  });

  it('nenhum ator sem usuário fica sem nome a mostrar', () => {
    // Arrange
    const semUsuario = CHAMADO_HISTORY_ACTOR_TYPES.filter((tipo) => tipo !== 'usuario');

    // Act / Assert
    for (const tipo of semUsuario) {
      expect(CHAMADO_HISTORY_ACTOR_LABELS[tipo]).toBeTruthy();
    }
  });
});
