import { describe, expect, it } from 'vitest';

import {
  ILEGIVEL,
  lerDataIso,
  lerDataSicam,
  lerNumero,
  mesmoValorPatrimonial,
  texto,
  textoCompacto,
} from '../patrimonial';

/** Normalizadores compartilhados pela carga e pelo importador (spec 0012). */
describe('normalizadores patrimoniais', () => {
  it('texto: vazio vira ausente; compacto junta espaços', () => {
    expect(texto('  ')).toBeUndefined();
    expect(texto(' A  B ')).toBe('A  B');
    expect(textoCompacto(' A  \t B ')).toBe('A B');
  });

  it('data ISO e data do SICAM caem no mesmo meio dia UTC', () => {
    expect(lerDataIso('2020-01-15')).toEqual(new Date('2020-01-15T12:00:00Z'));
    expect(lerDataSicam('15-JAN-20')).toEqual(new Date('2020-01-15T12:00:00Z'));
    expect(lerDataSicam('01-OUT-41')).toEqual(new Date('1941-10-01T12:00:00Z'));
    expect(lerDataSicam('01-OCT-40')).toEqual(new Date('2040-10-01T12:00:00Z'));
  });

  it('data inexistente ou fora do formato é ilegível', () => {
    expect(lerDataIso('2020-02-30')).toBe(ILEGIVEL);
    expect(lerDataSicam('15-XYZ-20')).toBe(ILEGIVEL);
    expect(lerDataSicam('2020-01-15')).toBe(ILEGIVEL);
    expect(lerDataSicam('')).toBeUndefined();
  });

  it('número: vírgula decimal com ponto de milhar, ou ponto decimal sem vírgula', () => {
    expect(lerNumero('1.234,56')).toBe(1234.56);
    expect(lerNumero('8700,9')).toBe(8700.9);
    expect(lerNumero('8700.9')).toBe(8700.9);
    expect(lerNumero('R$ 10')).toBe(ILEGIVEL);
  });

  it('comparação: texto sem espaços sobrando, data pelo dia, número pelo valor', () => {
    expect(mesmoValorPatrimonial('setor', 'SETOR  X ', 'SETOR X')).toBe(true);
    expect(
      mesmoValorPatrimonial(
        'dataTombo',
        new Date('2020-01-15T12:00:00Z'),
        new Date('2020-01-15T03:00:00Z'),
      ),
    ).toBe(true);
    expect(mesmoValorPatrimonial('valorHistorico', 8700.9, 8700.9)).toBe(true);
    expect(mesmoValorPatrimonial('setor', undefined, 'SETOR X')).toBe(false);
  });
});
