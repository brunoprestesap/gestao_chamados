import { describe, expect, it } from 'vitest';

import {
  centavos,
  custoDoChamado,
  formatarQuantidade,
  formatarReais,
  textoDoItem,
  valorDaCotacaoCentavos,
  valorDoItemCentavos,
} from '../custo';
import { custoEditavel } from '../custo.constants';
import { MaterialItemSchema, temAteCasas, ValorFinalCotacaoSchema } from '../custo.schemas';

describe('custo do chamado (spec 0018, AC-9)', () => {
  it('soma três itens de 0,1 × R$ 0,10 e um de 1 × R$ 0,20 exatamente em R$ 0,23', () => {
    const materiais = [
      { quantidade: 0.1, valorUnitario: 0.1 },
      { quantidade: 0.1, valorUnitario: 0.1 },
      { quantidade: 0.1, valorUnitario: 0.1 },
      { quantidade: 1, valorUnitario: 0.2 },
    ];
    expect(custoDoChamado({ cotacoes: [], materiais }).totalCentavos).toBe(23);
  });

  it('arredonda o item uma única vez: 0,333 × R$ 0,15 vale 5 centavos', () => {
    expect(valorDoItemCentavos({ quantidade: 0.333, valorUnitario: 0.15 })).toBe(5);
  });

  it('usa o valor final quando existe, o estimado quando é null, e zero quando é 0', () => {
    expect(
      valorDaCotacaoCentavos({ status: 'aprovada', valorEstimado: 300, valorFinal: 280 }),
    ).toBe(28000);
    expect(
      valorDaCotacaoCentavos({ status: 'aprovada', valorEstimado: 300, valorFinal: null }),
    ).toBe(30000);
    expect(valorDaCotacaoCentavos({ status: 'aprovada', valorEstimado: 300, valorFinal: 0 })).toBe(
      0,
    );
  });

  it('nunca soma cotação enviada ou recusada', () => {
    const cotacoes = [
      { status: 'enviada', valorEstimado: 100 },
      { status: 'recusada', valorEstimado: 100, valorFinal: 50 },
    ];
    expect(custoDoChamado({ cotacoes, materiais: [] }).totalCentavos).toBe(0);
  });

  it('separa cotações e material no total', () => {
    const r = custoDoChamado({
      cotacoes: [{ status: 'aprovada', valorEstimado: 300, valorFinal: 280 }],
      materiais: [{ quantidade: 2.5, valorUnitario: 10 }],
    });
    expect(r).toEqual({ cotacoesCentavos: 28000, materialCentavos: 2500, totalCentavos: 30500 });
  });

  it('arredonda valor estimado antigo com mais de 2 casas', () => {
    expect(centavos(10.005)).toBe(1001);
  });
});

describe('formatos (AC-7)', () => {
  it('formata reais e quantidade em pt-BR', () => {
    expect(formatarReais(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
    expect(formatarQuantidade(2.5)).toBe('2,5');
    expect(formatarQuantidade(3)).toBe('3');
    expect(formatarQuantidade(0.125)).toBe('0,125');
  });

  it('monta o texto do item para o histórico (AC-6)', () => {
    expect(
      textoDoItem({ descricao: 'Cabo', quantidade: 2.5, valorUnitario: 10 }).replace(/\s/g, ' '),
    ).toBe('Cabo: 2,5 × R$ 10,00 = R$ 25,00');
  });
});

describe('validação (AC-1, AC-5)', () => {
  it('aceita casas decimais com erro de ponto flutuante e recusa casa a mais', () => {
    expect(temAteCasas(0.1 * 3, 1)).toBe(true);
    expect(temAteCasas(9_999_999.99, 2)).toBe(true);
    expect(temAteCasas(1.005, 2)).toBe(false);
    expect(temAteCasas(2.5005, 3)).toBe(false);
  });

  it('recusa item fora da regra com a mensagem do AC-1', () => {
    const r = MaterialItemSchema.safeParse({
      descricao: 'ab',
      quantidade: 0,
      valorUnitario: 1.001,
    });
    expect(r.success).toBe(false);
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(msgs).toEqual(
      expect.arrayContaining([
        'Descrição do material inválida.',
        'Quantidade inválida.',
        'Valor unitário inválido.',
      ]),
    );
  });

  it('tira os espaços da descrição', () => {
    const r = MaterialItemSchema.safeParse({
      descricao: '  Fita  ',
      quantidade: 1,
      valorUnitario: 1,
    });
    expect(r.success && r.data.descricao).toBe('Fita');
  });

  it('aceita valor final zero e null, e recusa negativo', () => {
    const id = '0123456789abcdef01234567';
    expect(ValorFinalCotacaoSchema.safeParse({ cotacaoId: id, valorFinal: 0 }).success).toBe(true);
    expect(ValorFinalCotacaoSchema.safeParse({ cotacaoId: id, valorFinal: null }).success).toBe(
      true,
    );
    expect(ValorFinalCotacaoSchema.safeParse({ cotacaoId: id, valorFinal: -1 }).success).toBe(
      false,
    );
  });
});

describe('status editável (AC-3)', () => {
  it('libera em atendimento, nas pausas e em concluído; trava o resto', () => {
    for (const s of [
      'em atendimento',
      'aguardando_solicitante',
      'aguardando_terceiros',
      'concluído',
    ])
      expect(custoEditavel(s)).toBe(true);
    for (const s of ['aberto', 'validado', 'encerrado', 'cancelado', 'recusado'])
      expect(custoEditavel(s)).toBe(false);
  });
});

describe('limites de cada campo (AC-1, AC-5)', () => {
  const ok = { descricao: 'Cabo', quantidade: 1, valorUnitario: 1 };
  const mensagem = (dados: object) => {
    const r = MaterialItemSchema.safeParse({ ...ok, ...dados });
    return r.success ? null : r.error.issues[0]?.message;
  };

  it('aceita as bordas: 3 e 200 caracteres, quantidade e unitário no teto', () => {
    expect(mensagem({ descricao: 'abc' })).toBeNull();
    expect(mensagem({ descricao: 'a'.repeat(200) })).toBeNull();
    expect(mensagem({ quantidade: 99_999 })).toBeNull();
    expect(mensagem({ quantidade: 0.001 })).toBeNull();
    expect(mensagem({ valorUnitario: 9_999_999.99 })).toBeNull();
    expect(mensagem({ valorUnitario: 0.01 })).toBeNull();
  });

  it('descrição com 201 caracteres, ou curta depois de tirar espaços, é inválida', () => {
    expect(mensagem({ descricao: 'a'.repeat(201) })).toBe('Descrição do material inválida.');
    expect(mensagem({ descricao: '  ab  ' })).toBe('Descrição do material inválida.');
    expect(mensagem({ descricao: undefined })).toBe('Descrição do material inválida.');
  });

  it('quantidade acima do teto, negativa, com 4 casas ou em texto é inválida', () => {
    for (const quantidade of [99_999.001, -1, 1.0005, '2'])
      expect(mensagem({ quantidade })).toBe('Quantidade inválida.');
  });

  it('unitário acima do teto, zero ou em texto é inválido', () => {
    for (const valorUnitario of [10_000_000, 0, '10'])
      expect(mensagem({ valorUnitario })).toBe('Valor unitário inválido.');
  });

  it('valor final com 3 casas ou acima do teto é inválido', () => {
    const id = '0123456789abcdef01234567';
    for (const valorFinal of [1.005, 10_000_000, '280']) {
      const r = ValorFinalCotacaoSchema.safeParse({ cotacaoId: id, valorFinal });
      expect(r.success ? null : r.error.issues[0]?.message).toBe('Valor final inválido.');
    }
  });

  it('valor final sem o campo é recusado: limpar é mandar null', () => {
    const r = ValorFinalCotacaoSchema.safeParse({ cotacaoId: '0123456789abcdef01234567' });
    expect(r.success).toBe(false);
  });

  it('status ausente nunca libera o custo (AC-3)', () => {
    expect(custoEditavel(null)).toBe(false);
    expect(custoEditavel(undefined)).toBe(false);
  });
});

describe('conta em centavos, mais casos (AC-9)', () => {
  it('item com unitário de 3 casas arredonda o unitário antes de multiplicar', () => {
    // 1,005 × 100 = 100,49999… em double, e vira 100 centavos
    expect(valorDoItemCentavos({ quantidade: 1, valorUnitario: 1.005 })).toBe(100);
  });

  it('no teto, a conta continua exata em centavos', () => {
    expect(valorDoItemCentavos({ quantidade: 99_999, valorUnitario: 9_999_999.99 })).toBe(
      99_999 * 999_999_999,
    );
  });

  it('chamado sem nada vale zero', () => {
    expect(custoDoChamado({ cotacoes: [], materiais: [] })).toEqual({
      cotacoesCentavos: 0,
      materialCentavos: 0,
      totalCentavos: 0,
    });
  });

  it('formata zero e centavos soltos com duas casas', () => {
    expect(formatarReais(0).replace(/\s/g, ' ')).toBe('R$ 0,00');
    expect(formatarReais(5).replace(/\s/g, ' ')).toBe('R$ 0,05');
  });
});
