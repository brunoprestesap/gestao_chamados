import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import type { Papeis } from '../papeis';
import {
  type CotacaoBruta,
  type EventoBruto,
  podeBaixar,
  serializarCotacao,
  visaoDe,
} from '../serializar';

/**
 * O serializador único da cotação de material (spec 0019, AC-15): cada visão
 * recebe só o que pode ver.
 *
 * covers: AC-15
 */

function papeis(over: Partial<Papeis> = {}): Papeis {
  return {
    userId: 'u',
    role: 'Solicitante',
    designacoes: [],
    tem: () => false,
    ladoTrf1: false,
    leitorAdmin: false,
    contratada: false,
    ...over,
  };
}

const agora = new Date('2026-10-15T12:00:00Z');

const cot: CotacaoBruta = {
  _id: new Types.ObjectId(),
  numero: 'COT-2026-0001',
  chamadoId: new Types.ObjectId(),
  situacao: 'autorizada',
  emTramite: true,
  versao: 5,
  itens: [
    {
      _id: new Types.ObjectId(),
      descricao: 'Disjuntor',
      unidade: 'un',
      quantidade: 2,
      motivo: 'Troca',
      doDiagnostico: true,
      origem: 'orcamento',
      precoAplicadoCentavos: 10_00,
      quantidadeExecutada: null,
      valorExecutadoCentavos: null,
    },
  ],
  orcamentos: [
    {
      _id: new Types.ObjectId(),
      fornecedor: 'Loja',
      cnpj: '11111111000191',
      data: new Date('2026-10-01'),
      validade: null,
      arquivoId: new Types.ObjectId(),
      precos: [],
    },
  ],
  montadoPorUserId: new Types.ObjectId(),
  diagnosticadoPorUserId: new Types.ObjectId(),
  diagnosticadoEm: agora,
  valorTotalCentavos: 20_00,
  empenhoId: new Types.ObjectId(),
  valorAutorizadoCentavos: 20_00,
  autorizadoEm: agora,
  executadoEm: null,
  valorExecutadoCentavos: null,
  advertencias: [{ codigo: 'divergencia_execucao', itemId: null }],
  createdAt: agora,
  updatedAt: agora,
};

const eventos: EventoBruto[] = [
  {
    _id: new Types.ObjectId(),
    de: 'em_aprovacao',
    para: 'autorizada',
    acao: 'aprovar',
    autorNome: 'Aprovador',
    papel: 'aprovador',
    limiteCentavosNoAto: 1_000_00,
    motivo: null,
    empenhoId: new Types.ObjectId(),
    valorCentavos: 20_00,
    advertenciasNoAto: [],
    em: agora,
  },
];

const ctx = (p: Papeis, extra: { tec?: boolean; sol?: boolean } = {}) => ({
  userId: 'u',
  papeis: p,
  ehTecnicoAtribuido: !!extra.tec,
  ehSolicitante: !!extra.sol,
});

describe('visaoDe', () => {
  it('TRF1 e Admin sem designação leem como TRF1', () => {
    expect(visaoDe(ctx(papeis({ ladoTrf1: true })), cot, agora)).toBe('trf1');
    expect(visaoDe(ctx(papeis({ leitorAdmin: true })), cot, agora)).toBe('trf1');
  });

  it('a contratada só vê encerrada dos últimos 90 dias', () => {
    const p = papeis({ contratada: true });
    const velha = {
      situacao: 'executada' as const,
      emTramite: false,
      updatedAt: new Date('2026-06-01T00:00:00Z'),
    };
    expect(visaoDe(ctx(p), velha, agora)).toBeNull();
    expect(visaoDe(ctx(p), { ...velha, emTramite: true }, agora)).toBe('contratada');
  });

  it('o rascunho não aparece para o lado TRF1 (AC-1)', () => {
    const rascunho = { situacao: 'rascunho' as const, emTramite: true, updatedAt: agora };
    expect(visaoDe(ctx(papeis({ ladoTrf1: true })), rascunho, agora)).toBeNull();
    expect(visaoDe(ctx(papeis({ leitorAdmin: true })), rascunho, agora)).toBeNull();
    // A contratada e o técnico atribuído continuam vendo.
    expect(visaoDe(ctx(papeis({ contratada: true })), rascunho, agora)).toBe('contratada');
    expect(visaoDe(ctx(papeis(), { tec: true }), rascunho, agora)).toBe('tecnico');
  });

  it('quem não tem relação com o chamado não vê', () => {
    expect(visaoDe(ctx(papeis()), cot, agora)).toBeNull();
  });
});

describe('serializarCotacao', () => {
  it('o solicitante recebe só a situação', () => {
    const dto = serializarCotacao(cot, 'solicitante', { userId: 'u' }, { eventos });
    expect(dto.itens).toBeUndefined();
    expect(dto.valorTotalCentavos).toBeUndefined();
    expect(dto.trilha).toBeUndefined();
    expect(dto.situacao).toBe('autorizada');
  });

  it('o técnico vê itens e valores, sem orçamento, empenho, limite nem advertência', () => {
    const dto = serializarCotacao(cot, 'tecnico', { userId: 'u' }, { eventos });
    expect(dto.itens).toHaveLength(1);
    expect(dto.orcamentos).toBeUndefined();
    expect(dto.empenhoId).toBeUndefined();
    expect(dto.advertencias).toBeUndefined();
    expect(dto.trilha?.[0]).not.toHaveProperty('limiteCentavosNoAto');
    expect(dto.trilha?.[0]).not.toHaveProperty('valorCentavos');
  });

  it('a contratada não vê empenho, limites nem advertência do lado TRF1', () => {
    const dto = serializarCotacao(cot, 'contratada', { userId: 'u' }, { eventos });
    expect(dto.orcamentos).toHaveLength(1);
    expect(dto.empenhoId).toBeUndefined();
    expect(dto.valorAutorizadoCentavos).toBeUndefined();
    expect(dto.advertencias).toEqual([]);
    expect(JSON.stringify(dto.trilha)).not.toMatch(/limiteCentavosNoAto|valorCentavos/);
  });

  it('o TRF1 vê tudo', () => {
    const dto = serializarCotacao(cot, 'trf1', { userId: 'u' }, { eventos });
    expect(dto.empenhoId).toBeTruthy();
    expect(dto.advertencias).toEqual(['divergencia_execucao']);
    expect(dto.trilha?.[0]?.limiteCentavosNoAto).toBe(1_000_00);
  });

  it('só o TRF1 vê quem registrou o recebimento; técnico e contratada veem o ato sem autor (AC-21)', () => {
    const recebimento: EventoBruto = {
      ...eventos[0]!,
      _id: new Types.ObjectId(),
      de: 'executada',
      para: 'executada',
      acao: 'receber_provisorio',
      autorNome: 'Gestora',
      papel: 'gestor',
      limiteCentavosNoAto: null,
      valorCentavos: null,
      empenhoId: null,
    };
    const lista = [...eventos, recebimento];
    const autorDoRecebimento = (visao: 'trf1' | 'contratada' | 'tecnico') =>
      serializarCotacao(cot, visao, { userId: 'u' }, { eventos: lista }).trilha?.find(
        (e) => e.acao === 'receber_provisorio',
      );
    expect(autorDoRecebimento('trf1')).toMatchObject({ autorNome: 'Gestora', papel: 'gestor' });
    expect(autorDoRecebimento('contratada')).toMatchObject({ autorNome: null, papel: 'gestor' });
    expect(autorDoRecebimento('tecnico')).toMatchObject({ autorNome: null, papel: 'gestor' });
    // Os outros atos continuam com o autor para o técnico.
    const aprovar = serializarCotacao(cot, 'tecnico', { userId: 'u' }, { eventos: lista });
    expect(aprovar.trilha?.[0]?.autorNome).toBe('Aprovador');
  });
});

describe('serializarCotacao com as tabelas de preço (fatia 3)', () => {
  // covers: AC-15, AC-27, AC-28, AC-29
  const itemAmbas = {
    _id: new Types.ObjectId(),
    descricao: 'Cabo',
    unidade: 'm',
    quantidade: 10,
    motivo: 'Troca',
    doDiagnostico: true,
    origem: 'ambas',
    anexoVItemId: new Types.ObjectId(),
    anexoVNumero: 1,
    anexoVPrecoCentavos: 150_00,
    sinapiCodigo: '100',
    sinapiReferencia: '2026-09',
    sinapiPrecoCentavos: 100_00,
    baseAplicada: null,
    justificativaBase: null,
    precoAplicadoCentavos: null,
    quantidadeExecutada: null,
    valorExecutadoCentavos: null,
  };
  const itemAnexo = {
    ...itemAmbas,
    _id: new Types.ObjectId(),
    origem: 'anexo_v',
    anexoVNumero: 3,
    anexoVPrecoCentavos: 25_00,
    sinapiCodigo: null,
    sinapiReferencia: null,
    sinapiPrecoCentavos: null,
    baseAplicada: 'anexo_v',
    precoAplicadoCentavos: 25_00,
  };
  const comTabelas: CotacaoBruta = {
    ...cot,
    situacao: 'em_analise',
    itens: [itemAmbas, itemAnexo],
    advertencias: [
      { codigo: 'anexo_v_acima_sinapi', itemId: itemAmbas._id },
      { codigo: 'sem_referencia_sinapi', itemId: itemAnexo._id },
    ],
  };
  const marcas = new Map([[String(itemAmbas._id), { automatica: true, manual: false }]]);

  it('a contratada vê a origem e a referência na tabela, mas não as duas bases nem as advertências de preço (AC-15)', () => {
    const dto = serializarCotacao(comTabelas, 'contratada', { userId: 'u' }, { marcas });
    const [ambas, anexo] = dto.itens!;
    expect(ambas).toMatchObject({
      origem: 'ambas',
      anexoVNumero: 1,
      sinapiCodigo: '100',
      sinapiReferencia: '2026-09',
      valorProvisorio: true,
    });
    for (const i of dto.itens!) {
      expect(i).not.toHaveProperty('anexoVPrecoCentavos');
      expect(i).not.toHaveProperty('sinapiPrecoCentavos');
      expect(i).not.toHaveProperty('advertencias');
      expect(i).not.toHaveProperty('marcaAnomalia');
      expect(i).not.toHaveProperty('justificativaBase');
    }
    expect(anexo).toMatchObject({ origem: 'anexo_v', valorProvisorio: false });
    expect(dto.advertencias).toEqual([]);
  });

  it('o TRF1 vê as duas bases, as advertências de cada item e a marca de conferência (AC-27, AC-28, AC-29)', () => {
    const dto = serializarCotacao(comTabelas, 'trf1', { userId: 'u' }, { marcas });
    const [ambas, anexo] = dto.itens!;
    expect(ambas).toMatchObject({
      anexoVPrecoCentavos: 150_00,
      sinapiPrecoCentavos: 100_00,
      baseAplicada: null,
      advertencias: ['anexo_v_acima_sinapi'],
      marcaAnomalia: { automatica: true, manual: false },
      valorProvisorio: true,
    });
    expect(anexo).toMatchObject({ advertencias: ['sem_referencia_sinapi'], marcaAnomalia: null });
    expect(dto.advertencias).toEqual(['anexo_v_acima_sinapi', 'sem_referencia_sinapi']);
  });

  it('o técnico não vê origem, bases nem marca', () => {
    const dto = serializarCotacao(comTabelas, 'tecnico', { userId: 'u' }, { marcas });
    expect(dto.itens![0]).not.toHaveProperty('origem');
    expect(dto.itens![0]).not.toHaveProperty('anexoVPrecoCentavos');
    expect(dto.itens![0]).not.toHaveProperty('marcaAnomalia');
  });
});

describe('podeBaixar', () => {
  it('técnico só evidência; solicitante nada', () => {
    expect(podeBaixar('tecnico', 'evidencia')).toBe(true);
    expect(podeBaixar('tecnico', 'orcamento')).toBe(false);
    expect(podeBaixar('tecnico', 'nota_fiscal')).toBe(false);
    expect(podeBaixar('solicitante', 'evidencia')).toBe(false);
    expect(podeBaixar('contratada', 'orcamento')).toBe(true);
    expect(podeBaixar('trf1', 'nota_fiscal')).toBe(true);
  });
});
