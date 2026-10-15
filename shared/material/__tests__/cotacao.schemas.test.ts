import { describe, expect, it } from 'vitest';

import {
  CriarCotacaoSchema,
  CriarDesignacaoSchema,
  ExecutarSchema,
  MovimentoEmpenhoSchema,
  SalvarRascunhoSchema,
  TransicaoComMotivoSchema,
} from '../cotacao.schemas';
import { MAX_ITENS_COTACAO } from '../material.constants';

/**
 * As entradas das actions da cotação de material (spec 0019). O servidor
 * confere aqui o formato antes de qualquer regra.
 *
 * covers: AC-1, AC-5, AC-10, AC-19
 */

const ID = 'a'.repeat(24);
const item = { descricao: 'Disjuntor', unidade: 'un', quantidade: 2, motivo: 'Troca' };

describe('CriarCotacaoSchema (AC-1)', () => {
  it('aceita um item válido', () => {
    expect(CriarCotacaoSchema.safeParse({ chamadoId: ID, itens: [item] }).success).toBe(true);
  });

  it('recusa cotação sem item', () => {
    expect(CriarCotacaoSchema.safeParse({ chamadoId: ID, itens: [] }).success).toBe(false);
  });

  it(`recusa mais de ${MAX_ITENS_COTACAO} itens`, () => {
    const itens = Array.from({ length: MAX_ITENS_COTACAO + 1 }, () => item);
    expect(CriarCotacaoSchema.safeParse({ chamadoId: ID, itens }).success).toBe(false);
  });

  it('aceita quantidade com até 3 casas e recusa com 4', () => {
    expect(
      CriarCotacaoSchema.safeParse({ chamadoId: ID, itens: [{ ...item, quantidade: 1.333 }] })
        .success,
    ).toBe(true);
    expect(
      CriarCotacaoSchema.safeParse({ chamadoId: ID, itens: [{ ...item, quantidade: 1.3333 }] })
        .success,
    ).toBe(false);
  });

  it('recusa quantidade zero ou negativa', () => {
    for (const quantidade of [0, -1]) {
      expect(
        CriarCotacaoSchema.safeParse({ chamadoId: ID, itens: [{ ...item, quantidade }] }).success,
      ).toBe(false);
    }
  });

  it('recusa id de chamado fora do formato', () => {
    expect(CriarCotacaoSchema.safeParse({ chamadoId: 'xyz', itens: [item] }).success).toBe(false);
  });
});

describe('SalvarRascunhoSchema', () => {
  const orcamento = {
    id: ID,
    fornecedor: 'Loja',
    cnpj: '11.111.111/0001-91',
    data: '2026-10-10',
    arquivoId: ID,
    precos: [{ itemId: ID, valorUnitarioCentavos: 1000 }],
  };

  it('tira a máscara do CNPJ', () => {
    const r = SalvarRascunhoSchema.safeParse({
      id: ID,
      versao: 1,
      itens: [{ ...item, id: ID }],
      orcamentos: [orcamento],
    });
    expect(r.success && r.data.orcamentos?.[0]?.cnpj).toBe('11111111000191');
  });

  it('recusa CNPJ sem 14 dígitos', () => {
    const r = SalvarRascunhoSchema.safeParse({
      id: ID,
      versao: 1,
      itens: [{ ...item, id: ID }],
      orcamentos: [{ ...orcamento, cnpj: '123' }],
    });
    expect(r.success).toBe(false);
  });

  it('recusa preço negativo ou com fração de centavo', () => {
    for (const valorUnitarioCentavos of [-1, 10.5]) {
      const r = SalvarRascunhoSchema.safeParse({
        id: ID,
        versao: 1,
        itens: [{ ...item, id: ID }],
        orcamentos: [{ ...orcamento, precos: [{ itemId: ID, valorUnitarioCentavos }] }],
      });
      expect(r.success).toBe(false);
    }
  });

  it('recusa item repetido, orçamento repetido e dois preços ao mesmo item (AC-1)', () => {
    const B = 'b'.repeat(24);
    const base = { id: ID, versao: 1, itens: [{ ...item, id: ID }], orcamentos: [orcamento] };
    const casos = [
      {
        ...base,
        itens: [
          { ...item, id: ID },
          { ...item, id: ID, quantidade: 50 },
        ],
      },
      { ...base, orcamentos: [orcamento, { ...orcamento, cnpj: '22.222.222/0001-91' }] },
      {
        ...base,
        orcamentos: [
          {
            ...orcamento,
            precos: [
              { itemId: ID, valorUnitarioCentavos: 1 },
              { itemId: ID, valorUnitarioCentavos: 9999 },
            ],
          },
        ],
      },
    ];
    casos.push({
      ...base,
      orcamentos: [orcamento, { ...orcamento, id: B, cnpj: '22.222.222/0001-91' }],
    });
    for (const c of casos) expect(SalvarRascunhoSchema.safeParse(c).success).toBe(false);
    // Ids diferentes passam.
    expect(
      SalvarRascunhoSchema.safeParse({
        ...base,
        itens: [
          { ...item, id: ID },
          { ...item, id: B },
        ],
      }).success,
    ).toBe(true);
  });

  it('exige a versão (controle otimista)', () => {
    expect(SalvarRascunhoSchema.safeParse({ id: ID, itens: [{ ...item, id: ID }] }).success).toBe(
      false,
    );
  });
});

describe('TransicaoComMotivoSchema (AC-5)', () => {
  it('motivo com menos de 5 letras é recusado com a mensagem certa', () => {
    const r = TransicaoComMotivoSchema.safeParse({ id: ID, versao: 2, motivo: '  ab  ' });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0]?.message).toMatch(/motivo/i);
  });

  it('aceita motivo suficiente e tira os espaços das pontas', () => {
    const r = TransicaoComMotivoSchema.safeParse({ id: ID, versao: 2, motivo: '  Preço alto  ' });
    expect(r.success && r.data.motivo).toBe('Preço alto');
  });
});

describe('ExecutarSchema (AC-10)', () => {
  it('aceita aplicar zero de um item', () => {
    expect(
      ExecutarSchema.safeParse({
        id: ID,
        versao: 3,
        quantidades: [{ itemId: ID, quantidadeExecutada: 0 }],
      }).success,
    ).toBe(true);
  });

  it('recusa quantidade negativa', () => {
    expect(
      ExecutarSchema.safeParse({
        id: ID,
        versao: 3,
        quantidades: [{ itemId: ID, quantidadeExecutada: -1 }],
      }).success,
    ).toBe(false);
  });
});

describe('CriarDesignacaoSchema (AC-19)', () => {
  const base = {
    userId: ID,
    papel: 'fiscal' as const,
    vigenciaInicio: '2026-01-01',
    ato: 'Portaria 1',
  };

  it('aprovador sem faixa é recusado', () => {
    const r = CriarDesignacaoSchema.safeParse({ ...base, papel: 'aprovador' });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0]?.path).toEqual(['faixaId']);
  });

  it('aprovador com faixa passa', () => {
    expect(
      CriarDesignacaoSchema.safeParse({ ...base, papel: 'aprovador', faixaId: ID }).success,
    ).toBe(true);
  });

  it('fim antes do início é recusado', () => {
    expect(CriarDesignacaoSchema.safeParse({ ...base, vigenciaFim: '2025-12-31' }).success).toBe(
      false,
    );
  });

  it('papel fora da lista é recusado', () => {
    expect(CriarDesignacaoSchema.safeParse({ ...base, papel: 'chefe' }).success).toBe(false);
  });
});

describe('MovimentoEmpenhoSchema (AC-19)', () => {
  it('exige valor positivo e o ato', () => {
    expect(
      MovimentoEmpenhoSchema.safeParse({
        empenhoId: ID,
        tipo: 'anulacao',
        valorCentavos: 0,
        ato: 'SEI 1',
      }).success,
    ).toBe(false);
    expect(
      MovimentoEmpenhoSchema.safeParse({
        empenhoId: ID,
        tipo: 'reforco',
        valorCentavos: 100,
        ato: '',
      }).success,
    ).toBe(false);
  });
});
