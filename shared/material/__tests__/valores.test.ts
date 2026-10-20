import { describe, expect, it } from 'vitest';

import {
  acimaDoPercentual,
  menorPrecoDoItem,
  normalizarCodigoSinapi,
  normalizarTextoBusca,
  precoParaValor,
  precosDoItem,
  reaisParaCentavos,
  valorDaLinhaCentavos,
  valorProvisorio,
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

// ---------------------------------------------------------------------------
// Fatia 3: valor provisório de `ambas`, percentual e textos normalizados
// covers: AC-26, AC-27, AC-28
// ---------------------------------------------------------------------------

describe('precoParaValor e valorProvisorio (AC-27)', () => {
  it('fora de ambas, vale o preço aplicado', () => {
    expect(precoParaValor({ quantidade: 1, precoAplicadoCentavos: 300, origem: 'sinapi' })).toBe(
      300,
    );
  });

  it('em ambas sem base escolhida, vale o maior dos dois preços', () => {
    const item = {
      quantidade: 1,
      precoAplicadoCentavos: null,
      origem: 'ambas',
      anexoVPrecoCentavos: 15000,
      sinapiPrecoCentavos: 10000,
    };
    expect(precoParaValor(item)).toBe(15000);
    expect(valorProvisorio(item)).toBe(true);
  });

  it('em ambas com base escolhida, vale a base e o valor deixa de ser provisório', () => {
    const item = {
      quantidade: 1,
      precoAplicadoCentavos: 10000,
      origem: 'ambas',
      anexoVPrecoCentavos: 15000,
      sinapiPrecoCentavos: 10000,
    };
    expect(precoParaValor(item)).toBe(10000);
    expect(valorProvisorio(item)).toBe(false);
  });

  it('sem preço nenhum fora de ambas, não há valor', () => {
    expect(
      precoParaValor({ quantidade: 1, precoAplicadoCentavos: null, origem: 'orcamento' }),
    ).toBeNull();
  });

  it('o total soma o provisório de ambas junto das outras linhas', () => {
    expect(
      valorTotalCentavos([
        {
          quantidade: 10,
          precoAplicadoCentavos: null,
          origem: 'ambas',
          anexoVPrecoCentavos: 15000,
          sinapiPrecoCentavos: 10000,
        },
        { quantidade: 4, precoAplicadoCentavos: 2000, origem: 'sinapi' },
      ]),
    ).toBe(150000 + 8000);
  });
});

describe('acimaDoPercentual (RN-27, RN-52)', () => {
  it('compara em inteiros, sem arredondar', () => {
    expect(acimaDoPercentual(1100, 1000, 10)).toBe(false);
    expect(acimaDoPercentual(1101, 1000, 10)).toBe(true);
    expect(acimaDoPercentual(1, 1, 0)).toBe(false);
    expect(acimaDoPercentual(2, 1, 0)).toBe(true);
  });
});

describe('normalizarCodigoSinapi', () => {
  it.each([
    ['00.123', '123'],
    [' 1 234 ', '1234'],
    ['', ''],
    ['   ', ''],
  ])('%j vira %j', (entrada, saida) => {
    expect(normalizarCodigoSinapi(entrada)).toBe(saida);
  });

  it.each(['12A', '1-2', '000'])('%j é recusado', (entrada) => {
    expect(normalizarCodigoSinapi(entrada)).toBeNull();
  });
});

describe('normalizarTextoBusca', () => {
  it('tira acento, baixa a caixa e colapsa espaços', () => {
    expect(normalizarTextoBusca('  Lâmpada   FLUORESCENTE ')).toBe('lampada fluorescente');
  });
});
