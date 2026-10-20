import { describe, expect, it } from 'vitest';

import {
  AcrescentarReferenciaSchema,
  CompletarPesquisaSchema,
  EnviarSchema,
  OrcamentoRascunhoSchema,
  ReferenciaEntradaSchema,
  SalvarRascunhoSchema,
} from '@/shared/material/cotacao.schemas';
import { erroCnpjDoOrcamento } from '@/shared/material/mensagens';
import { menorReferencia, raizCnpj, raizesDoItem } from '@/shared/material/valores';

import {
  defeitoDoCnpj,
  impedimentosDeEnvio,
  itensComPesquisaDivergente,
  itensComVariacaoAcima,
  orcamentosVencidos,
  pesquisaCompleta,
} from '../controles';
import {
  FILTRO_PENDENCIA_DA_CONTRATADA,
  pendenciaDaContratada,
  pesquisaDaUrgenciaPendente,
  visivelParaContratada,
} from '../pendencia';
import { recusaDaDataDaReferencia } from '../referencias';

/**
 * Os controles puros da fatia 4 da cotação de material (spec 0019): CNPJ,
 * referência, variação, validade e urgência.
 *
 * covers: AC-31, AC-32, AC-33, AC-34, AC-35
 */

const RAIZ_CONTRATADA = '03543374';
const CONTRATADA = '03543374000141';
const A = '11111111000191';
const A2 = '11111111000272'; // mesma raiz de A, outra filial
const B = '22222222000191';
const C = '33333333000191';
const VALIDADE = new Date('2099-12-31T12:00:00.000Z');
const REF = [{ valorUnitarioCentavos: 10_00 }];

const orc = (cnpj: string, itens: string[], extra: Record<string, unknown> = {}) => ({
  _id: `o-${cnpj}-${itens.join('')}`,
  cnpj,
  validade: VALIDADE,
  precos: itens.map((itemId) => ({ itemId, valorUnitarioCentavos: 10_00 })),
  ...extra,
});

const envio = (
  itens: { _id: string; origem?: string; referencias?: { valorUnitarioCentavos: number }[] }[],
  orcamentos: ReturnType<typeof orc>[],
  urgencia = false,
) => impedimentosDeEnvio({ itens, orcamentos, raizContratada: RAIZ_CONTRATADA, urgencia });

describe('CNPJ do orçamento (AC-31)', () => {
  it('a raiz são os 8 primeiros dígitos, com ou sem máscara', () => {
    expect(raizCnpj('11.111.111/0001-91')).toBe('11111111');
  });

  it('dígito inválido e raiz da contratada são defeitos do próprio orçamento', () => {
    expect(defeitoDoCnpj('11111111000192', RAIZ_CONTRATADA)).toBe('cnpj_invalido');
    expect(defeitoDoCnpj(CONTRATADA, RAIZ_CONTRATADA)).toBe('cnpj_contratada');
    expect(defeitoDoCnpj(A, RAIZ_CONTRATADA)).toBeNull();
  });

  it('a mensagem do salvar nomeia o fornecedor', () => {
    expect(erroCnpjDoOrcamento('Loja Elétrica', 'cnpj_invalido')).toContain('Loja Elétrica');
    expect(erroCnpjDoOrcamento('Loja Elétrica', 'cnpj_contratada')).toContain('contratada');
  });

  it('dois orçamentos da mesma raiz contam como uma empresa', () => {
    const orcs = [orc(A, ['i1']), orc(A2, ['i1']), orc(B, ['i1'])].map((o) => ({
      cnpj: o.cnpj,
      precos: o.precos,
    }));
    expect(raizesDoItem('i1', orcs)).toBe(2);
  });
});

describe('impedimentosDeEnvio da fatia 4', () => {
  const item = { _id: 'i1', origem: 'orcamento', referencias: REF };

  it('3 orçamentos de 3 empresas, com validade e referência, passam', () => {
    expect(envio([item], [orc(A, ['i1']), orc(B, ['i1']), orc(C, ['i1'])])).toEqual([]);
  });

  it('3 orçamentos com só 2 raízes dão cnpj_mesma_raiz, no lugar de orcamentos_insuficientes', () => {
    expect(envio([item], [orc(A, ['i1']), orc(A2, ['i1']), orc(B, ['i1'])])).toEqual([
      'cnpj_mesma_raiz',
    ]);
  });

  it('CNPJ inválido ou da contratada barra o envio', () => {
    expect(
      envio([item], [orc('11111111000192', ['i1']), orc(B, ['i1']), orc(C, ['i1'])]),
    ).toContain('cnpj_invalido');
    expect(envio([item], [orc(CONTRATADA, ['i1']), orc(B, ['i1']), orc(C, ['i1'])])).toContain(
      'cnpj_contratada',
    );
  });

  it('orçamento sem validade dá validade_ausente', () => {
    expect(
      envio([item], [orc(A, ['i1'], { validade: null }), orc(B, ['i1']), orc(C, ['i1'])]),
    ).toEqual(['validade_ausente']);
  });

  it('item do caminho 3 sem referência ativa dá sem_referencia; a retirada não conta', () => {
    const tres = [orc(A, ['i1']), orc(B, ['i1']), orc(C, ['i1'])];
    expect(envio([{ _id: 'i1', origem: 'orcamento' }], tres)).toEqual(['sem_referencia']);
    expect(
      envio(
        [
          {
            _id: 'i1',
            origem: 'orcamento',
            referencias: [{ valorUnitarioCentavos: 5_00, retiradaEm: new Date() }] as never,
          },
        ],
        tres,
      ),
    ).toEqual(['sem_referencia']);
  });

  it('item dos caminhos 1 e 2 não pede referência', () => {
    expect(envio([{ _id: 'i1', origem: 'anexo_v' }], [])).toEqual([]);
  });

  it('na urgência, 1 orçamento por item basta, e as 3 raízes ficam para depois', () => {
    expect(envio([item], [orc(A, ['i1'])], true)).toEqual([]);
    expect(envio([item], [], true)).toEqual(['orcamentos_insuficientes']);
  });

  it('na urgência, CNPJ, validade e referência valem iguais', () => {
    expect(envio([{ _id: 'i1', origem: 'orcamento' }], [orc(A, ['i1'])], true)).toEqual([
      'sem_referencia',
    ]);
    expect(envio([item], [orc(CONTRATADA, ['i1'])], true)).toEqual(['cnpj_contratada']);
  });

  it('o orçamento do complemento não conta no envio', () => {
    expect(
      envio([item], [orc(A, ['i1']), orc(B, ['i1']), orc(C, ['i1'], { fase: 'complemento' })]),
    ).toEqual(['orcamentos_insuficientes']);
  });
});

describe('pesquisaCompleta (AC-35)', () => {
  const itens = [
    { _id: 'i1', origem: 'orcamento' },
    { _id: 'i2', origem: 'anexo_v' },
  ];

  it('completa com 3 raízes por item do caminho 3, somando envio e complemento', () => {
    expect(
      pesquisaCompleta(itens, [
        orc(A, ['i1']),
        orc(B, ['i1'], { fase: 'complemento' }),
        orc(C, ['i1'], { fase: 'complemento' }),
      ]),
    ).toBe(true);
  });

  it('a mesma raiz duas vezes não completa', () => {
    expect(pesquisaCompleta(itens, [orc(A, ['i1']), orc(A2, ['i1']), orc(B, ['i1'])])).toBe(false);
  });
});

describe('variação acima da referência (AC-33)', () => {
  const item = (preco: number, referencias: object[]) => ({
    _id: 'i1',
    origem: 'orcamento',
    precoAplicadoCentavos: preco,
    referencias: referencias as never,
  });

  it('barra quando o menor orçamento passa da menor referência além do percentual', () => {
    // 11,01 sobre 10,00 é 10,1% acima: passa de 10%.
    expect(itensComVariacaoAcima([item(11_01, [{ valorUnitarioCentavos: 10_00 }])], 10)).toEqual([
      'i1',
    ]);
    expect(itensComVariacaoAcima([item(11_00, [{ valorUnitarioCentavos: 10_00 }])], 10)).toEqual(
      [],
    );
  });

  it('usa a menor entre todas as referências ativas', () => {
    const refs = [
      { valorUnitarioCentavos: 20_00 },
      { valorUnitarioCentavos: 10_00, papel: 'fiscal' },
    ];
    expect(menorReferencia(refs)).toBe(10_00);
    expect(itensComVariacaoAcima([item(15_00, refs)], 10)).toEqual(['i1']);
  });

  it('a referência retirada deixa de barrar', () => {
    const refs = [
      { valorUnitarioCentavos: 20_00 },
      { valorUnitarioCentavos: 10_00, retiradaEm: new Date() },
    ];
    expect(itensComVariacaoAcima([item(15_00, refs)], 10)).toEqual([]);
  });

  it('cotação sem referência (anterior à fatia 4) não é barrada', () => {
    expect(itensComVariacaoAcima([item(99_00, [])], 10)).toEqual([]);
  });

  it('só vale para o caminho 3', () => {
    expect(
      itensComVariacaoAcima(
        [{ ...item(99_00, [{ valorUnitarioCentavos: 1_00 }]), origem: 'anexo_v' }],
        10,
      ),
    ).toEqual([]);
  });
});

describe('orçamento vencido (AC-34)', () => {
  const itens = [
    { _id: 'i1', origem: 'orcamento' },
    { _id: 'i2', origem: 'anexo_v' },
  ];
  const dia = (ymd: string) => new Date(`${ymd}T12:00:00.000Z`);

  it('vencido ontem pede a marca; vencendo hoje ainda vale', () => {
    const orcs = [
      orc(A, ['i1'], { _id: 'ontem', validade: dia('2026-10-19') }),
      orc(B, ['i1'], { _id: 'hoje', validade: dia('2026-10-20') }),
    ];
    expect(orcamentosVencidos(itens, orcs, '2026-10-20')).toEqual(['ontem']);
  });

  it('o orçamento sem validade (anterior à fatia 4) conta como vencido', () => {
    expect(
      orcamentosVencidos(itens, [orc(A, ['i1'], { _id: 'sem', validade: null })], '2026-10-20'),
    ).toEqual(['sem']);
  });

  it('o complemento nunca pede a marca, nem o orçamento só de item da tabela', () => {
    const orcs = [
      orc(A, ['i1'], { _id: 'comp', validade: null, fase: 'complemento' }),
      orc(B, ['i2'], { _id: 'tabela', validade: null }),
    ];
    expect(orcamentosVencidos(itens, orcs, '2026-10-20')).toEqual([]);
  });
});

describe('pesquisa posterior divergente (AC-35)', () => {
  const item = { _id: 'i1', origem: 'orcamento', precoAplicadoCentavos: 10_00 };

  it('o complemento mais barato que o aplicado gera a advertência', () => {
    const comp = orc(B, ['i1'], { fase: 'complemento' });
    comp.precos = [{ itemId: 'i1', valorUnitarioCentavos: 9_00 }];
    expect(itensComPesquisaDivergente([item], [orc(A, ['i1']), comp])).toEqual(['i1']);
  });

  it('o complemento igual ou mais caro não gera', () => {
    expect(itensComPesquisaDivergente([item], [orc(B, ['i1'], { fase: 'complemento' })])).toEqual(
      [],
    );
  });
});

describe('pendência da contratada com a urgência (AC-15, AC-35)', () => {
  const urg = (extra: object = {}) => ({ decisao: 'aceita', pesquisaCompletaEm: null, ...extra });

  it('a urgência aceita incompleta em autorizada ou executada é pendência', () => {
    expect(pendenciaDaContratada({ situacao: 'autorizada', urgencia: urg() })).toBe(true);
    expect(pendenciaDaContratada({ situacao: 'executada', urgencia: urg() })).toBe(true);
  });

  it('completa, recusada, cancelada ou reprovada não contam', () => {
    expect(
      pesquisaDaUrgenciaPendente({
        situacao: 'autorizada',
        urgencia: urg({ pesquisaCompletaEm: new Date() }),
      }),
    ).toBe(false);
    expect(
      pesquisaDaUrgenciaPendente({
        situacao: 'autorizada',
        urgencia: urg({ decisao: 'recusada' }),
      }),
    ).toBe(false);
    expect(pesquisaDaUrgenciaPendente({ situacao: 'cancelada', urgencia: urg() })).toBe(false);
    expect(pesquisaDaUrgenciaPendente({ situacao: 'reprovada', urgencia: urg() })).toBe(false);
  });

  it('não some da contratada pela janela de 90 dias', () => {
    const velha = new Date('2020-01-01');
    expect(
      visivelParaContratada(
        { situacao: 'executada', emTramite: false, updatedAt: velha, urgencia: urg() },
        new Date('2026-10-20'),
      ),
    ).toBe(true);
  });

  it('o filtro Mongo tem os dois ramos', () => {
    expect(FILTRO_PENDENCIA_DA_CONTRATADA.$or).toHaveLength(2);
  });
});

describe('data da referência livre (AC-32)', () => {
  // 20/10/2026, 12:00 em Belém.
  const agora = new Date('2026-10-20T15:00:00.000Z');

  it('aceita de hoje até 12 meses atrás', () => {
    expect(recusaDaDataDaReferencia('2026-10-20', agora)).toBeNull();
    expect(recusaDaDataDaReferencia('2025-10-20', agora)).toBeNull();
  });

  it('recusa data futura e mais antiga que 12 meses', () => {
    expect(recusaDaDataDaReferencia('2026-10-21', agora)).toMatch(/posterior/);
    expect(recusaDaDataDaReferencia('2025-10-19', agora)).toMatch(/12 meses/);
  });

  it('a virada de dia é a de Belém, não a de UTC', () => {
    // 02:30 UTC de 21/10 ainda é 20/10 em Belém.
    expect(recusaDaDataDaReferencia('2026-10-21', new Date('2026-10-21T02:30:00.000Z'))).toMatch(
      /posterior/,
    );
  });
});

describe('schemas da fatia 4', () => {
  const id = '0123456789abcdef01234567';
  const id2 = '0123456789abcdef01234568';

  it('a referência SINAPI não aceita preço nem fonte na entrada (AC-26, AC-32)', () => {
    expect(ReferenciaEntradaSchema.safeParse({ id, sinapiCodigo: '00123' }).success).toBe(true);
    expect(
      ReferenciaEntradaSchema.safeParse({ id, sinapiCodigo: '123', valorUnitarioCentavos: 1 })
        .success,
    ).toBe(false);
  });

  it('a referência livre pede fonte de 10 a 200 caracteres e valor maior que zero', () => {
    const base = { id, fonte: 'Painel de preços', valorUnitarioCentavos: 100, data: '2026-10-01' };
    expect(ReferenciaEntradaSchema.safeParse(base).success).toBe(true);
    expect(ReferenciaEntradaSchema.safeParse({ ...base, fonte: 'curta' }).success).toBe(false);
    expect(ReferenciaEntradaSchema.safeParse({ ...base, valorUnitarioCentavos: 0 }).success).toBe(
      false,
    );
  });

  it('referência repetida no item é recusada no schema', () => {
    const ref = { id, fonte: 'Painel de preços', valorUnitarioCentavos: 100, data: '2026-10-01' };
    const r = SalvarRascunhoSchema.safeParse({
      id,
      versao: 1,
      itens: [
        {
          id: id2,
          descricao: 'Cabo',
          unidade: 'm',
          quantidade: 1,
          motivo: 'Troca',
          referencias: [ref, ref],
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('validade anterior à data do orçamento é recusada', () => {
    const o = {
      id,
      fornecedor: 'Loja',
      cnpj: A,
      data: '2026-10-10',
      arquivoId: id2,
      precos: [],
    };
    expect(OrcamentoRascunhoSchema.safeParse({ ...o, validade: '2026-10-10' }).success).toBe(true);
    expect(OrcamentoRascunhoSchema.safeParse({ ...o, validade: '2026-10-09' }).success).toBe(false);
  });

  it('o envio aceita a urgência com justificativa de 10 a 500 caracteres', () => {
    expect(
      EnviarSchema.safeParse({ id, versao: 1, urgencia: { justificativa: 'Quadro sem energia' } })
        .success,
    ).toBe(true);
    expect(
      EnviarSchema.safeParse({ id, versao: 1, urgencia: { justificativa: 'curta' } }).success,
    ).toBe(false);
    expect(EnviarSchema.safeParse({ id, versao: 1 }).success).toBe(true);
  });

  it('acrescentar referência pede item e referência', () => {
    expect(
      AcrescentarReferenciaSchema.safeParse({
        id,
        versao: 2,
        itemId: id2,
        referencia: { id, sinapiCodigo: '123' },
      }).success,
    ).toBe(true);
  });

  it('completar a pesquisa recusa orçamento repetido', () => {
    const o = {
      id: id2,
      fornecedor: 'Loja',
      cnpj: A,
      data: '2026-10-10',
      validade: '2026-11-10',
      arquivoId: id,
      precos: [],
    };
    expect(CompletarPesquisaSchema.safeParse({ id, versao: 3, orcamentos: [o] }).success).toBe(
      true,
    );
    expect(CompletarPesquisaSchema.safeParse({ id, versao: 3, orcamentos: [o, o] }).success).toBe(
      false,
    );
  });
});
