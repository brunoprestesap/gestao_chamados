import { describe, expect, it } from 'vitest';

import { ehCodigoInterno, formatarCodigoInterno, normalizarCodigo } from '../codigo';

describe('normalizarCodigo (spec 0011, AC-11)', () => {
  it('tira espaços e zeros à esquerda de um código só com dígitos', () => {
    expect(normalizarCodigo(' 00011997 ')).toBe('11997');
  });

  it('passa o código interno para maiúsculas e mantém os zeros dele', () => {
    expect(normalizarCodigo('mnt-0001')).toBe('MNT-0001');
  });

  it('não deixa um código de zeros virar texto vazio', () => {
    expect(normalizarCodigo('0000')).toBe('0');
  });

  it('tira espaços do meio, como os do leitor USB', () => {
    expect(normalizarCodigo('11 997\n')).toBe('11997');
  });

  it('devolve vazio para entrada só com espaços', () => {
    expect(normalizarCodigo('   ')).toBe('');
  });
});

describe('formatarCodigoInterno', () => {
  it('usa pelo menos quatro dígitos', () => {
    expect(formatarCodigoInterno(1)).toBe('MNT-0001');
    expect(formatarCodigoInterno(12345)).toBe('MNT-12345');
  });
});

describe('ehCodigoInterno', () => {
  it('reconhece MNT- sem diferenciar maiúsculas', () => {
    expect(ehCodigoInterno('mnt-0003')).toBe(true);
    expect(ehCodigoInterno('11997')).toBe(false);
  });
});
