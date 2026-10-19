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
