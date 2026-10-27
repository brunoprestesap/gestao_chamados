import { describe, expect, it } from 'vitest';

import {
  BuscarItensPrecoSchema,
  ClassificarItemSchema,
  CorrigirCodigoSinapiSchema,
  CriarCotacaoSchema,
  CriarDesignacaoSchema,
  DesativarFaixaSchema,
  EncaminharSchema,
  ExecutarSchema,
  ImportacaoMaterialIdSchema,
  MarcarAnomaliaSchema,
  MovimentoEmpenhoSchema,
  NotaFiscalSchema,
  RecebimentoSchema,
  referenciaSinapi,
  RevogarDesignacaoSchema,
  SalvarRascunhoSchema,
  SituacaoEmpenhoSchema,
  TransicaoComMotivoSchema,
} from '../cotacao.schemas';
import { MAX_ITENS_COTACAO } from '../material.constants';

/**
 * As entradas das actions da cotação de material (spec 0019). O servidor
 * confere aqui o formato antes de qualquer regra.
 *
 * covers: AC-1, AC-5, AC-10, AC-19, AC-21, AC-22 (spec 0019); AC-1, AC-2, AC-3 (spec 0022)
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

describe('motivo dos atos do cadastro (spec 0022, AC-1, AC-2, AC-3)', () => {
  const atos = [
    ['RevogarDesignacaoSchema', RevogarDesignacaoSchema, { designacaoId: ID }],
    ['DesativarFaixaSchema', DesativarFaixaSchema, { faixaId: ID }],
    ['SituacaoEmpenhoSchema', SituacaoEmpenhoSchema, { empenhoId: ID, ativo: false }],
  ] as const;

  it.each(atos)('%s grava o motivo sem os espaços das pontas', (_, schema, base) => {
    const r = schema.safeParse({ ...base, motivo: '  Fim do contrato  ' });
    expect(r.success && r.data.motivo).toBe('Fim do contrato');
  });

  it.each(atos)('%s aceita exatamente 10 e exatamente 500 caracteres', (_, schema, base) => {
    expect(schema.safeParse({ ...base, motivo: 'a'.repeat(10) }).success).toBe(true);
    expect(schema.safeParse({ ...base, motivo: 'a'.repeat(500) }).success).toBe(true);
  });

  it.each(atos)('%s recusa motivo ausente, curto, só de espaços ou longo', (_, schema, base) => {
    for (const motivo of [undefined, '', 'a'.repeat(9), ' '.repeat(20), `  ${'a'.repeat(9)}  `]) {
      const r = schema.safeParse({ ...base, motivo });
      expect(r.success).toBe(false);
      expect(!r.success && r.error.issues[0]?.path).toEqual(['motivo']);
    }
    const longo = schema.safeParse({ ...base, motivo: 'a'.repeat(501) });
    expect(!longo.success && longo.error.issues[0]?.message).toBe('Até 500 caracteres.');
  });

  it.each(atos)('%s diz o mínimo e o máximo na recusa do motivo curto', (_, schema, base) => {
    const r = schema.safeParse({ ...base, motivo: 'curto' });
    expect(!r.success && r.error.issues[0]?.message).toMatch(/de 10 a 500 caracteres/);
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

describe('NotaFiscalSchema (AC-22)', () => {
  const nf = { id: ID, versao: 3, numero: '123', data: '2026-10-18', arquivoId: ID };

  it('aceita número, data e arquivo', () => {
    expect(NotaFiscalSchema.safeParse(nf).success).toBe(true);
  });

  it.each(['2026-02-31', '2026-13-01', '2026-00-10', '18/10/2026'])(
    'recusa a data %s com "Data inválida."',
    (data) => {
      const r = NotaFiscalSchema.safeParse({ ...nf, data });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.message).toBe('Data inválida.');
    },
  );

  it('aceita 29/02 só em ano bissexto', () => {
    expect(NotaFiscalSchema.safeParse({ ...nf, data: '2028-02-29' }).success).toBe(true);
    expect(NotaFiscalSchema.safeParse({ ...nf, data: '2026-02-29' }).success).toBe(false);
  });

  it('recusa número vazio', () => {
    expect(NotaFiscalSchema.safeParse({ ...nf, numero: '  ' }).success).toBe(false);
  });
});

describe('RecebimentoSchema (AC-21)', () => {
  it('aceita só provisório e definitivo', () => {
    expect(RecebimentoSchema.safeParse({ id: ID, versao: 1, etapa: 'provisorio' }).success).toBe(
      true,
    );
    expect(RecebimentoSchema.safeParse({ id: ID, versao: 1, etapa: 'final' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fatia 3: classificação, busca, encaminhar e as ações do Admin no Anexo V
// covers: AC-24, AC-25, AC-26, AC-27, AC-29
// ---------------------------------------------------------------------------

describe('ClassificarItemSchema (AC-26: a origem e o preço nunca vêm da entrada)', () => {
  const base = { id: ID, versao: 3, itemId: 'b'.repeat(24) };

  it('aceita as três escolhas, com o código já normalizado', () => {
    expect(
      ClassificarItemSchema.safeParse({ ...base, escolha: { anexoVItemId: ID } }).success,
    ).toBe(true);
    expect(ClassificarItemSchema.safeParse({ ...base, escolha: { orcamento: true } }).success).toBe(
      true,
    );
    expect(
      ClassificarItemSchema.safeParse({ ...base, escolha: { sinapiCodigo: '00.123' } }),
    ).toMatchObject({ success: true, data: { escolha: { sinapiCodigo: '123' } } });
  });

  it.each([
    ['origem sozinha', { origem: 'anexo_v' }],
    ['origem junto do código', { sinapiCodigo: '123', origem: 'ambas' }],
    ['preço junto do item', { anexoVItemId: ID, precoCentavos: 1 }],
    ['código com letra', { sinapiCodigo: '12A' }],
    ['orcamento falso', { orcamento: false }],
  ])('recusa %s', (_caso, escolha) => {
    expect(ClassificarItemSchema.safeParse({ ...base, escolha }).success).toBe(false);
  });
});

describe('BuscarItensPrecoSchema', () => {
  it('pede ao menos 3 letras, sem contar espaços', () => {
    expect(BuscarItensPrecoSchema.safeParse({ cotacaoId: ID, texto: 'cab' }).success).toBe(true);
    const curto = BuscarItensPrecoSchema.safeParse({ cotacaoId: ID, texto: ' a b ' });
    expect(curto.success).toBe(false);
    if (!curto.success) expect(curto.error.issues[0]!.message).toBe('Digite ao menos 3 letras.');
  });
});

describe('EncaminharSchema (AC-27, AC-29)', () => {
  const base = { id: ID, versao: 2 };
  const just = 'SINAPI é a referência pública.';

  it('sem bases nem conferências, encaminha com listas vazias', () => {
    expect(EncaminharSchema.safeParse(base)).toMatchObject({
      success: true,
      data: { bases: [], conferencias: [] },
    });
  });

  it('aceita base com justificativa e conferência de 10 a 500 caracteres', () => {
    const r = EncaminharSchema.safeParse({
      ...base,
      bases: [{ itemId: ID, base: 'sinapi', justificativa: just }],
      conferencias: [{ itemId: ID, texto: 'Conferido no mercado.' }],
    });
    expect(r.success).toBe(true);
  });

  it.each([
    [
      'base orcamento, que não é base de ambas',
      [{ itemId: ID, base: 'orcamento', justificativa: just }],
    ],
    ['justificativa curta', [{ itemId: ID, base: 'anexo_v', justificativa: 'curta' }]],
    ['justificativa longa', [{ itemId: ID, base: 'anexo_v', justificativa: 'x'.repeat(501) }]],
  ])('recusa %s', (_caso, bases) => {
    expect(EncaminharSchema.safeParse({ ...base, bases }).success).toBe(false);
  });

  it('recusa item repetido nas bases ou nas conferências', () => {
    const dupBase = { itemId: ID, base: 'sinapi', justificativa: just };
    expect(EncaminharSchema.safeParse({ ...base, bases: [dupBase, dupBase] }).success).toBe(false);
    const dupConf = { itemId: ID, texto: 'Conferido no mercado.' };
    expect(EncaminharSchema.safeParse({ ...base, conferencias: [dupConf, dupConf] }).success).toBe(
      false,
    );
  });
});

describe('Anexo V e SINAPI do Admin (AC-24, AC-25, AC-29)', () => {
  const motivo = 'Código certo da tabela.';

  it('referenciaSinapi aceita AAAA-MM e recusa mês 13 ou outro formato', () => {
    expect(referenciaSinapi.safeParse('2026-08').success).toBe(true);
    for (const r of ['2026-13', '2026-8', '08/2026', '2026-08-01']) {
      expect(referenciaSinapi.safeParse(r).success).toBe(false);
    }
  });

  it('MarcarAnomaliaSchema pede motivo de 10 a 500 caracteres', () => {
    expect(
      MarcarAnomaliaSchema.safeParse({ anexoVItemId: ID, marcada: true, motivo }).success,
    ).toBe(true);
    expect(
      MarcarAnomaliaSchema.safeParse({ anexoVItemId: ID, marcada: true, motivo: 'curto' }).success,
    ).toBe(false);
  });

  it('CorrigirCodigoSinapiSchema normaliza o código, aceita null para limpar e recusa letra', () => {
    expect(
      CorrigirCodigoSinapiSchema.safeParse({ anexoVItemId: ID, codigo: '0.500', motivo }),
    ).toMatchObject({ success: true, data: { codigo: '500' } });
    expect(
      CorrigirCodigoSinapiSchema.safeParse({ anexoVItemId: ID, codigo: null, motivo }).success,
    ).toBe(true);
    expect(
      CorrigirCodigoSinapiSchema.safeParse({ anexoVItemId: ID, codigo: 'X1', motivo }).success,
    ).toBe(false);
  });

  it('ImportacaoMaterialIdSchema pede um id válido', () => {
    expect(ImportacaoMaterialIdSchema.safeParse({ importacaoId: ID }).success).toBe(true);
    expect(ImportacaoMaterialIdSchema.safeParse({ importacaoId: 'x' }).success).toBe(false);
  });
});
