import { describe, expect, it } from 'vitest';

import { formatarDuracao, formatarFator, ROTULO_PAPEL, ROTULO_SITUACAO } from '../formato';

/**
 * Os formatos do IMR do contrato (spec 0023), os mesmos na tela e no PDF.
 *
 * covers: AC-16, AC-17
 */

describe('formatarFator', () => {
  it.each([
    [1, '1,00'],
    [0.95, '0,95'],
    [0.9, '0,90'],
    [0, '0,00'],
  ])('%s vira %s', (fator, texto) => {
    expect(formatarFator(fator)).toBe(texto);
  });
});

describe('formatarDuracao', () => {
  it.each([
    [0, '0 min'],
    [59, '59 min'],
    [60, '1 h 00 min'],
    [125, '2 h 05 min'],
    [24 * 60 + 1, '24 h 01 min'],
  ])('%s minutos vira %s', (min, texto) => {
    expect(formatarDuracao(min)).toBe(texto);
  });
});

describe('rótulos', () => {
  it('nomeia as três situações da linha', () => {
    expect(ROTULO_SITUACAO).toEqual({
      atraso: 'Atraso',
      nao_atendimento: 'Não atendimento',
      desconsiderada: 'Desconsiderada',
    });
  });

  it('nomeia os dois papéis em minúsculas, como aparecem entre parênteses', () => {
    expect(ROTULO_PAPEL).toEqual({ fiscal: 'fiscal', gestor: 'gestor' });
  });
});
