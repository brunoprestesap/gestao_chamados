import { describe, expect, it } from 'vitest';

import {
  menorPrecoDoItem,
  precosDoItem,
  reaisParaCentavos,
  valorDaLinhaCentavos,
  valorTotalCentavos,
} from '../valores';

/**
 * As contas da cotação de material (spec 0019), em centavos inteiros.
 *
 * covers: AC-4 (menor preço entre os orçamentos que cotaram o item), AC-10 (valor executado)
 */

describe('valorDaLinhaCentavos', () => {
  it('multiplica quantidade inteira pelo preço', () => {
    expect(valorDaLinhaCentavos(2, 1000)).toBe(2000);
  });

  it('arredonda uma única vez: 1,333 × R$ 0,03 dá R$ 0,04', () => {
    expect(valorDaLinhaCentavos(1.333, 3)).toBe(4);
  });

  it('quantidade com erro de ponto flutuante não muda o resultado', () => {
    // 0.1 + 0.2 = 0.30000000000000004
    expect(valorDaLinhaCentavos(0.1 + 0.2, 1000)).toBe(300);
  });

  it('quantidade zero vale zero', () => {
    expect(valorDaLinhaCentavos(0, 12345)).toBe(0);
  });

  it('meio centavo arredonda para cima', () => {
    // 0,5 × R$ 0,01 = 0,5 centavo
    expect(valorDaLinhaCentavos(0.5, 1)).toBe(1);
  });
});

describe('precosDoItem e menorPrecoDoItem', () => {
  const orcamentos = [
    { cnpj: '1', precos: [{ itemId: 'a', valorUnitarioCentavos: 1200 }] },
    {
      cnpj: '2',
      precos: [
        { itemId: 'a', valorUnitarioCentavos: 1000 },
        { itemId: 'b', valorUnitarioCentavos: 50 },
      ],
    },
    { cnpj: '3', precos: [{ itemId: 'a', valorUnitarioCentavos: 1100 }] },
  ];

  it('lista só os orçamentos que deram preço ao item', () => {
    expect(precosDoItem('b', orcamentos)).toEqual([{ cnpj: '2', valorUnitarioCentavos: 50 }]);
  });

  it('o preço do item é o menor entre os que o cotaram', () => {
    expect(menorPrecoDoItem('a', orcamentos)).toBe(1000);
  });

  it('item que ninguém cotou não tem preço', () => {
    expect(menorPrecoDoItem('z', orcamentos)).toBeNull();
  });

  it('sem orçamento nenhum, não há preço', () => {
    expect(menorPrecoDoItem('a', [])).toBeNull();
  });
});

describe('valorTotalCentavos', () => {
  it('soma as linhas e ignora item ainda sem preço', () => {
    expect(
      valorTotalCentavos([
        { quantidade: 2, precoAplicadoCentavos: 1000 },
        { quantidade: 1.333, precoAplicadoCentavos: 3 },
        { quantidade: 5, precoAplicadoCentavos: null },
      ]),
    ).toBe(2004);
  });

  it('lista vazia vale zero', () => {
    expect(valorTotalCentavos([])).toBe(0);
  });
});

describe('reaisParaCentavos', () => {
  it.each([
    ['100,00', 10000],
    ['1.000,00', 100000],
    ['12.345,67', 1234567],
    ['R$ 15,00', 1500],
    ['R$15,5', 1550],
    ['0,03', 3],
    ['7', 700],
    ['1000', 100000],
  ])('%s vira %i centavos', (texto, esperado) => {
    expect(reaisParaCentavos(texto)).toBe(esperado);
  });

  it.each(['', 'abc', '1,234', '10.5', '-5,00', '1..000,00', '1.00,00'])(
    'recusa "%s" (mais de 2 casas, formato errado ou negativo)',
    (texto) => {
      expect(reaisParaCentavos(texto)).toBeNull();
    },
  );
});
