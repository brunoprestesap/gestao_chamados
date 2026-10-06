import { describe, expect, it } from 'vitest';

import {
  codigosNoTexto,
  ehCodigoInterno,
  formatarCodigoInterno,
  normalizarCodigo,
} from '../codigo';

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

describe('codigosNoTexto (spec 0014, AC-1)', () => {
  it('acha o número logo depois de "tombo"', () => {
    expect(codigosNoTexto('o ar de tombo 11997 pinga')).toEqual(['11997']);
  });

  it('não conta número solto, sem uma das palavras antes', () => {
    expect(codigosNoTexto('ramal 11997, sala 3020')).toEqual([]);
  });

  it('aceita as cinco palavras, sem diferença de acento nem de maiúscula', () => {
    expect(
      codigosNoTexto('TOMBAMENTO 1001, Patrimônio 1002, etiqueta 1003, Código 1004, tombo 1005'),
    ).toEqual(['1001', '1002', '1003', '1004', '1005']);
  });

  it('aceita nº, n°, n., dois pontos e # entre a palavra e o número', () => {
    expect(
      codigosNoTexto('tombo nº 2001; tombo n° 2002; tombo n. 2003; tombo: 2004; tombo #2005'),
    ).toEqual(['2001', '2002', '2003', '2004', '2005']);
  });

  it('exige quatro dígitos ou mais depois da palavra', () => {
    expect(codigosNoTexto('tombo 123 e tombo 1234')).toEqual(['1234']);
  });

  it('acha MNT- com dígitos em qualquer lugar, já em maiúsculas', () => {
    expect(codigosNoTexto('o bebedouro mnt-0012 vaza')).toEqual(['MNT-0012']);
  });

  it('normaliza o número, tirando zeros à esquerda', () => {
    expect(codigosNoTexto('patrimônio 0011997')).toEqual(['11997']);
  });

  it('devolve na ordem em que aparecem e sem repetição', () => {
    expect(codigosNoTexto('código 5555, depois MNT-0012, de novo tombo 5555')).toEqual([
      '5555',
      'MNT-0012',
    ]);
  });

  it('não junta a palavra com um número que é parte de outra palavra', () => {
    expect(codigosNoTexto('retombo 11997 e tombos 11998')).toEqual([]);
  });

  it('devolve vazio para texto vazio', () => {
    expect(codigosNoTexto('')).toEqual([]);
  });
});
