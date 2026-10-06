import { describe, expect, it } from 'vitest';

import { formatarTempoIndicador } from '../indicadores-formato';

/** covers: AC-19 (ausente vira "—", nunca zero) */
describe('formatarTempoIndicador (spec 0014)', () => {
  const h = 60 * 60 * 1000;

  it('mostra "—" quando não há valor', () => {
    expect(formatarTempoIndicador(null)).toBe('—');
  });

  it('mostra zero como zero horas, não como ausente', () => {
    expect(formatarTempoIndicador(0)).toBe('0 hora(s)');
  });

  it('usa horas abaixo de um dia', () => {
    expect(formatarTempoIndicador(6 * h)).toBe('6 hora(s)');
  });

  it('usa dias a partir de 24 horas, com duas casas', () => {
    expect(formatarTempoIndicador(36 * h)).toBe('1.5 dia(s)');
  });
});
