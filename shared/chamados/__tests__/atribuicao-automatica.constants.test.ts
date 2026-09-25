import { describe, expect, it } from 'vitest';

import {
  ATRIBUICAO_MOTIVO_LABELS,
  ATRIBUICAO_MOTIVOS,
  type AtribuicaoAutomaticaGestao,
  rotuloDoTecnico,
  TECNICO_NOME_GENERICO,
  textoDaAtribuicaoAutomatica,
} from '../atribuicao-automatica.constants';

/**
 * As constantes e os textos da atribuição automática (spec 0008). Os rótulos
 * dos motivos são o que os gestores leem no aviso e no detalhe, então o texto
 * exato é parte do contrato.
 *
 * O limite de 3 tentativas (AC-8) não é conferido aqui: comparar a constante com o
 * próprio valor não protege nada. O comportamento dele está em
 * `lib/chamados/__tests__/atribuicao-automatica.db.test.ts`.
 *
 * covers: AC-13 (rótulos), AC-15 (texto do detalhe)
 */

function gestao(parcial: Partial<AtribuicaoAutomaticaGestao>): AtribuicaoAutomaticaGestao {
  return {
    resultado: 'atribuido',
    motivo: null,
    tecnicoNome: 'Carla',
    em: '2026-09-25T15:00:00.000Z',
    ...parcial,
  };
}

describe('rótulos dos motivos (AC-13)', () => {
  it('cada motivo tem o texto em português que os gestores leem', () => {
    expect(ATRIBUICAO_MOTIVO_LABELS).toEqual({
      sem_especialidade: 'nenhum técnico ativo com a especialidade',
      sem_vaga: 'todos os técnicos no limite de carga',
      erro: 'falha na atribuição automática',
    });
  });

  it.each([...ATRIBUICAO_MOTIVOS])(
    'o motivo %s tem rótulo, e o rótulo não é o código',
    (motivo) => {
      // Act
      const rotulo = ATRIBUICAO_MOTIVO_LABELS[motivo];

      // Assert
      expect(rotulo.trim().length).toBeGreaterThan(0);
      expect(rotulo).not.toContain('_');
    },
  );
});

describe('rotuloDoTecnico', () => {
  it.each([undefined, null, '', '   '])('nome %j vira o genérico "um técnico"', (nome) => {
    expect(rotuloDoTecnico(nome)).toBe(TECNICO_NOME_GENERICO);
    expect(TECNICO_NOME_GENERICO).toBe('um técnico');
  });

  it('nome com espaços nas pontas sai aparado', () => {
    expect(rotuloDoTecnico('  Carla  ')).toBe('Carla');
  });
});

describe('textoDaAtribuicaoAutomatica (AC-15)', () => {
  it('atribuído: diz a quem a regra atribuiu', () => {
    expect(textoDaAtribuicaoAutomatica(gestao({ tecnicoNome: 'Carla' }))).toBe(
      'Atribuído automaticamente a Carla',
    );
  });

  it('atribuído sem o nome resolvido: nunca fica em branco', () => {
    expect(textoDaAtribuicaoAutomatica(gestao({ tecnicoNome: null }))).toBe(
      'Atribuído automaticamente a um técnico',
    );
  });

  it.each([
    ['sem_especialidade', 'Sem técnico automático: nenhum técnico ativo com a especialidade'],
    ['sem_vaga', 'Sem técnico automático: todos os técnicos no limite de carga'],
    ['erro', 'Sem técnico automático: falha na atribuição automática'],
  ] as const)('sem técnico por %s: leva o motivo em português', (motivo, esperado) => {
    // Arrange
    const atribuicao = gestao({ resultado: 'sem_tecnico', motivo, tecnicoNome: null });

    // Act & Assert
    expect(textoDaAtribuicaoAutomatica(atribuicao)).toBe(esperado);
  });

  it('sem técnico e sem motivo gravado: só diz que não houve técnico automático', () => {
    // Arrange
    const atribuicao = gestao({ resultado: 'sem_tecnico', motivo: null, tecnicoNome: null });

    // Act & Assert
    expect(textoDaAtribuicaoAutomatica(atribuicao)).toBe('Sem técnico automático');
  });
});
