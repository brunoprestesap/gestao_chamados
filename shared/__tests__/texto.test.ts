import { describe, expect, it } from 'vitest';

import { textoSemPontuacaoFinal } from '../texto';

describe('textoSemPontuacaoFinal', () => {
  it.each([
    ['Sala 5', 'Sala 5'],
    ['Sala 5.', 'Sala 5'],
    ['Sala 5!', 'Sala 5'],
    ['Sala 5?', 'Sala 5'],
    ['Sala 5...', 'Sala 5'],
    ['Sala 5…', 'Sala 5'],
    ['Sala 5;', 'Sala 5'],
    ['Sala 5: ', 'Sala 5'],
    ['Sala 5 , .  ', 'Sala 5'],
  ])('%j vira %j', (entrada, esperado) => {
    expect(textoSemPontuacaoFinal(entrada)).toBe(esperado);
  });

  it('só tira o fim: a pontuação do meio e o texto do início ficam', () => {
    expect(textoSemPontuacaoFinal('Reparo, tomada. Sala 5.')).toBe('Reparo, tomada. Sala 5');
    expect(textoSemPontuacaoFinal('  Sala 5')).toBe('  Sala 5');
  });

  it('título vazio ou só de pontuação vira vazio', () => {
    expect(textoSemPontuacaoFinal('')).toBe('');
    expect(textoSemPontuacaoFinal('...')).toBe('');
    expect(textoSemPontuacaoFinal(' . ! ? ')).toBe('');
  });

  it('não engasga com milhares de pontos seguidos', () => {
    // Arrange: o pior caso de uma regex ancorada no fim, que seria quadrática
    const entrada = `Sala 5${'.'.repeat(200_000)}x${'.'.repeat(200_000)}`;

    // Act
    const inicio = Date.now();
    const saida = textoSemPontuacaoFinal(entrada);

    // Assert
    expect(saida).toBe(`Sala 5${'.'.repeat(200_000)}x`);
    expect(Date.now() - inicio).toBeLessThan(500);
  });
});
