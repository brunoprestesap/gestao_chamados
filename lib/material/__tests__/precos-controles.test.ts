import { describe, expect, it } from 'vitest';

import {
  advertenciasDePreco,
  ehAdvertenciaRecalculada,
  impedimentosDeEnvio,
  impedimentosDoEncaminhar,
} from '../controles';
import {
  derivarOrigem,
  escolhaGravada,
  type ItemAnexoVTabela,
  type TabelasDaCotacao,
  textoDaRecusa,
} from '../precos';

/**
 * A derivação da origem dos caminhos 1 e 2 (AC-26, RN-51) e os controles de
 * preço da fatia 3 (AC-27, AC-28, AC-29), todos puros.
 *
 * covers: AC-26, AC-27, AC-28, AC-29, AC-30
 */

function anexo(numero: number, over: Partial<ItemAnexoVTabela> = {}): ItemAnexoVTabela {
  return {
    id: `a${numero}`.padEnd(24, '0'),
    contratoId: 'c'.repeat(24),
    numero,
    versao: 2,
    descricao: `Item ${numero}`,
    unidade: 'm',
    precoCentavos: 15000,
    sinapiCodigo: null,
    ...over,
  };
}

function tabelas(over: Partial<TabelasDaCotacao> = {}): TabelasDaCotacao {
  return {
    anexoV: [
      anexo(1, { sinapiCodigo: '100' }),
      anexo(3),
      anexo(4, { sinapiCodigo: '400' }),
      anexo(5, { sinapiCodigo: '400' }),
    ],
    contrato: { id: 'c'.repeat(24), numero: 'CT-1' },
    mes: '2026-09',
    sinapi: new Map([
      ['100', { codigo: '100', descricao: 'Cabo', unidade: 'm', precoCentavos: 10000 }],
      ['400', { codigo: '400', descricao: 'Tomada', unidade: 'un', precoCentavos: 1000 }],
      ['700', { codigo: '700', descricao: 'Fita', unidade: 'rolo', precoCentavos: 500 }],
    ]),
    ...over,
  };
}

describe('derivarOrigem (AC-26)', () => {
  it('item do Anexo V com código no mês mais recente vira ambas, sem base e sem preço aplicado', () => {
    const r = derivarOrigem({ anexoVNumero: 1 }, tabelas());
    expect(r).toEqual({
      ok: true,
      copia: {
        origem: 'ambas',
        unidade: 'm',
        anexoVItemId: anexo(1).id,
        anexoVNumero: 1,
        anexoVVersao: 2,
        anexoVPrecoCentavos: 15000,
        sinapiCodigo: '100',
        sinapiReferencia: '2026-09',
        sinapiPrecoCentavos: 10000,
        baseAplicada: null,
        precoAplicadoCentavos: null,
      },
    });
  });

  it('item do Anexo V sem código fica anexo_v com o preço pactuado', () => {
    expect(derivarOrigem({ anexoVNumero: 3 }, tabelas())).toMatchObject({
      ok: true,
      copia: {
        origem: 'anexo_v',
        baseAplicada: 'anexo_v',
        precoAplicadoCentavos: 15000,
        sinapiCodigo: null,
      },
    });
  });

  it('item do Anexo V cujo código saiu do mês mais recente volta a anexo_v', () => {
    const t = tabelas({ sinapi: new Map() });
    expect(derivarOrigem({ anexoVNumero: 1 }, t)).toMatchObject({
      ok: true,
      copia: { origem: 'anexo_v', sinapiCodigo: null, sinapiReferencia: null },
    });
  });

  it('insumo sem equivalente no Anexo V fica sinapi, com a unidade do insumo', () => {
    expect(derivarOrigem({ sinapiCodigo: '700' }, tabelas())).toMatchObject({
      ok: true,
      copia: {
        origem: 'sinapi',
        unidade: 'rolo',
        anexoVNumero: null,
        baseAplicada: 'sinapi',
        precoAplicadoCentavos: 500,
        sinapiReferencia: '2026-09',
      },
    });
  });

  it('insumo equivalente a exatamente um item vigente vira ambas com as duas cópias', () => {
    expect(derivarOrigem({ sinapiCodigo: '100' }, tabelas())).toMatchObject({
      ok: true,
      copia: { origem: 'ambas', anexoVNumero: 1, sinapiCodigo: '100', unidade: 'm' },
    });
  });

  it('insumo equivalente a mais de um item vigente é recusado com os números', () => {
    const r = derivarOrigem({ sinapiCodigo: '400' }, tabelas());
    expect(r).toEqual({ ok: false, motivo: 'equivale_a_varios', numeros: [4, 5] });
    if (!r.ok) {
      expect(textoDaRecusa(r)).toBe(
        'Este insumo equivale aos itens 4 e 5 do Anexo V; escolha um deles.',
      );
    }
  });

  it('item que saiu da versão vigente é recusado', () => {
    expect(derivarOrigem({ anexoVNumero: 2 }, tabelas())).toEqual({
      ok: false,
      motivo: 'item_fora_da_versao',
    });
  });

  it('sem contrato com Anexo V não há caminho 1 (AC-30)', () => {
    expect(derivarOrigem({ anexoVNumero: 1 }, tabelas({ anexoV: null }))).toEqual({
      ok: false,
      motivo: 'sem_contrato',
    });
  });

  it('sem SINAPI importado não há caminho 2 (AC-30)', () => {
    expect(derivarOrigem({ sinapiCodigo: '700' }, tabelas({ mes: null }))).toEqual({
      ok: false,
      motivo: 'sem_sinapi',
    });
  });

  it('insumo fora do mês mais recente é recusado', () => {
    expect(derivarOrigem({ sinapiCodigo: '999' }, tabelas())).toEqual({
      ok: false,
      motivo: 'insumo_fora_do_mes',
    });
  });

  it('insumo sem contrato vigente fica sinapi (sem equivalentes para olhar)', () => {
    expect(derivarOrigem({ sinapiCodigo: '100' }, tabelas({ anexoV: null }))).toMatchObject({
      ok: true,
      copia: { origem: 'sinapi' },
    });
  });
});

describe('escolhaGravada', () => {
  it('item com número do Anexo V deriva de novo pelo número, mesmo que tenha código', () => {
    expect(escolhaGravada({ origem: 'ambas', anexoVNumero: 1, sinapiCodigo: '100' })).toEqual({
      anexoVNumero: 1,
    });
  });

  it('item só do SINAPI deriva pelo código', () => {
    expect(escolhaGravada({ origem: 'sinapi', sinapiCodigo: '700' })).toEqual({
      sinapiCodigo: '700',
    });
  });

  it('item do caminho 3 ou sem origem não tem escolha', () => {
    expect(escolhaGravada({ origem: 'orcamento' })).toBeNull();
    expect(escolhaGravada({ origem: null })).toBeNull();
  });
});

describe('advertenciasDePreco (AC-28)', () => {
  it('Anexo V acima do SINAPI além do percentual gera anexo_v_acima_sinapi', () => {
    expect(
      advertenciasDePreco(
        [{ _id: 'i1', origem: 'ambas', anexoVPrecoCentavos: 15000, sinapiPrecoCentavos: 10000 }],
        10,
      ),
    ).toEqual([{ codigo: 'anexo_v_acima_sinapi', itemId: 'i1' }]);
  });

  it('dentro do percentual não adverte', () => {
    expect(
      advertenciasDePreco(
        [{ _id: 'i1', origem: 'ambas', anexoVPrecoCentavos: 1100, sinapiPrecoCentavos: 1000 }],
        10,
      ),
    ).toEqual([]);
  });

  it('item só do Anexo V adverte sem referência SINAPI', () => {
    expect(
      advertenciasDePreco([{ _id: 'i2', origem: 'anexo_v', anexoVPrecoCentavos: 100 }], 10),
    ).toEqual([{ codigo: 'sem_referencia_sinapi', itemId: 'i2' }]);
  });

  it('itens do SINAPI e do caminho 3 não advertem', () => {
    expect(
      advertenciasDePreco(
        [
          { _id: 'i3', origem: 'sinapi', sinapiPrecoCentavos: 100 },
          { _id: 'i4', origem: 'orcamento' },
        ],
        10,
      ),
    ).toEqual([]);
  });

  it('reconhece os códigos de preço e a pesquisa posterior como recalculáveis', () => {
    expect(ehAdvertenciaRecalculada('anexo_v_acima_sinapi')).toBe(true);
    expect(ehAdvertenciaRecalculada('sem_referencia_sinapi')).toBe(true);
    expect(ehAdvertenciaRecalculada('pesquisa_posterior_divergente')).toBe(true);
    expect(ehAdvertenciaRecalculada('divergencia_execucao')).toBe(false);
    expect(ehAdvertenciaRecalculada('orcamento_vencido')).toBe(false);
  });
});

describe('impedimentosDeEnvio com os caminhos 1 e 2 (AC-26)', () => {
  it('item da tabela não pede orçamento', () => {
    expect(
      impedimentosDeEnvio({
        itens: [
          { _id: 'i1', origem: 'anexo_v' },
          { _id: 'i2', origem: 'sinapi' },
          { _id: 'i3', origem: 'ambas' },
        ],
        orcamentos: [],
        raizContratada: '03543374',
      }),
    ).toEqual([]);
  });

  it('item do caminho 3 continua pedindo 3 orçamentos', () => {
    expect(
      impedimentosDeEnvio({
        itens: [
          { _id: 'i1', origem: 'anexo_v' },
          { _id: 'i2', origem: 'orcamento' },
        ],
        orcamentos: [],
        raizContratada: '03543374',
      }),
    ).toEqual(['orcamentos_insuficientes', 'sem_referencia']);
  });
});

describe('impedimentosDoEncaminhar (AC-27, AC-29)', () => {
  const itens = [
    { _id: 'i1', origem: 'ambas' },
    { _id: 'i2', origem: 'anexo_v' },
  ];

  it('item ambas sem base escolhida barra o encaminhar', () => {
    expect(
      impedimentosDoEncaminhar(itens, { bases: new Set(), conferencias: new Set() }, new Set()),
    ).toEqual(['base_nao_escolhida']);
  });

  it('item da lista sem conferência barra o encaminhar', () => {
    expect(
      impedimentosDoEncaminhar(
        itens,
        { bases: new Set(['i1']), conferencias: new Set() },
        new Set(['i2']),
      ),
    ).toEqual(['conferencia_pendente']);
  });

  it('com base e conferências completas não há impedimento', () => {
    expect(
      impedimentosDoEncaminhar(
        itens,
        { bases: new Set(['i1']), conferencias: new Set(['i2']) },
        new Set(['i2']),
      ),
    ).toEqual([]);
  });

  it('mostra os dois impedimentos juntos', () => {
    expect(
      impedimentosDoEncaminhar(
        itens,
        { bases: new Set(), conferencias: new Set() },
        new Set(['i1']),
      ),
    ).toEqual(['base_nao_escolhida', 'conferencia_pendente']);
  });
});
