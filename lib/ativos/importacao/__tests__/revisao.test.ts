import { describe, expect, it } from 'vitest';

import { formatarValorPatrimonial } from '../revisao';

/**
 * Como a revisão mostra o antes e o depois de cada campo alterado (spec 0012,
 * AC-22): data pelo dia em UTC (está guardada ao meio dia), número em reais,
 * texto como veio, e vazio como ausente.
 *
 * covers: AC-22
 */
describe('formatarValorPatrimonial', () => {
  it('data vira DD/MM/AAAA pelo dia em UTC, sem escorregar de dia', () => {
    expect(formatarValorPatrimonial('dataTombo', new Date('2020-01-15T12:00:00Z'))).toBe(
      '15/01/2020',
    );
    // Meia noite UTC continua no mesmo dia (o fuso de Belém mudaria para o dia 14).
    expect(formatarValorPatrimonial('garantiaFim', new Date('2020-01-15T00:00:00Z'))).toBe(
      '15/01/2020',
    );
  });

  it('data em texto ISO também é lida', () => {
    expect(formatarValorPatrimonial('garantiaInicio', '2023-12-29T12:00:00.000Z')).toBe(
      '29/12/2023',
    );
  });

  it('data que não se lê aparece como veio, sem quebrar a tela', () => {
    expect(formatarValorPatrimonial('dataTombo', 'ontem')).toBe('ontem');
  });

  it('valor histórico vira moeda em reais', () => {
    expect(formatarValorPatrimonial('valorHistorico', 1234.56)).toMatch(/^R\$\s?1\.234,56$/);
  });

  it('texto aparece como veio', () => {
    expect(formatarValorPatrimonial('setor', 'SETOR X')).toBe('SETOR X');
  });

  it.each([undefined, null, ''])('vazio (%s) vira ausente', (v) => {
    expect(formatarValorPatrimonial('setor', v)).toBeNull();
  });
});
