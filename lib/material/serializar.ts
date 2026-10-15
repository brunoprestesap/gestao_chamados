import 'server-only';

import type { Types } from 'mongoose';

import {
  DIAS_ENCERRADAS_VISIVEIS_RT,
  type PapelEvento,
  type SituacaoCotacao,
  type TipoArquivoCotacao,
} from '@/shared/material/material.constants';
import { type CodigoControle, CONTROLES } from '@/shared/material/mensagens';

import type { Papeis } from './papeis';

/**
 * O único serializador da cotação de material (spec 0019, AC-15). Toda
 * leitura passa por aqui, e a rota de arquivos aplica a mesma visão:
 * - `trf1`: fiscal, gestor e aprovador vigentes, e o Admin sem designação;
 * - `contratada`: responsável técnico, sem empenho, saldo, limites,
 *   advertências de preço nem confrontos de base;
 * - `tecnico`: o técnico atribuído, só itens, valores, situação e motivos;
 * - `solicitante`: só a situação.
 */

export type Visao = 'trf1' | 'contratada' | 'tecnico' | 'solicitante';

export type CotacaoBruta = {
  _id: Types.ObjectId;
  numero: string;
  chamadoId: Types.ObjectId;
  situacao: SituacaoCotacao;
  emTramite: boolean;
  versao: number;
  itens: {
    _id: Types.ObjectId;
    descricao: string;
    unidade: string;
    quantidade: number;
    motivo: string;
    doDiagnostico: boolean;
    origem: string | null;
    precoAplicadoCentavos: number | null;
    quantidadeExecutada: number | null;
    valorExecutadoCentavos: number | null;
  }[];
  orcamentos: {
    _id: Types.ObjectId;
    fornecedor: string;
    cnpj: string;
    data: Date;
    validade: Date | null;
    arquivoId: Types.ObjectId;
    precos: { itemId: Types.ObjectId; valorUnitarioCentavos: number }[];
  }[];
  montadoPorUserId: Types.ObjectId | null;
  diagnosticadoPorUserId: Types.ObjectId;
  diagnosticadoEm: Date;
  valorTotalCentavos: number;
  empenhoId: Types.ObjectId | null;
  valorAutorizadoCentavos: number | null;
  autorizadoEm: Date | null;
  executadoEm: Date | null;
  valorExecutadoCentavos: number | null;
  advertencias: { codigo: string; itemId: Types.ObjectId | null }[];
  createdAt: Date;
  updatedAt: Date;
};

export type EventoBruto = {
  _id: Types.ObjectId;
  de: SituacaoCotacao | null;
  para: SituacaoCotacao;
  acao: string;
  autorNome: string | null;
  papel: PapelEvento;
  limiteCentavosNoAto: number | null;
  motivo: string | null;
  empenhoId: Types.ObjectId | null;
  valorCentavos: number | null;
  advertenciasNoAto: string[];
  em: Date;
};

export type ArquivoBruto = {
  _id: Types.ObjectId;
  tipo: TipoArquivoCotacao;
  nomeOriginal: string;
  tamanho: number;
  enviadoPorUserId: Types.ObjectId;
  em: Date;
};

export type ItemDTO = {
  id: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  motivo: string;
  doDiagnostico: boolean;
  precoAplicadoCentavos: number | null;
  quantidadeExecutada: number | null;
  valorExecutadoCentavos: number | null;
};

export type OrcamentoDTO = {
  id: string;
  fornecedor: string;
  cnpj: string;
  data: string;
  validade: string | null;
  arquivoId: string;
  precos: { itemId: string; valorUnitarioCentavos: number }[];
};

export type EventoDTO = {
  id: string;
  de: SituacaoCotacao | null;
  para: SituacaoCotacao;
  acao: string;
  autorNome: string | null;
  papel: PapelEvento;
  motivo: string | null;
  em: string;
  /** Só TRF1. */
  limiteCentavosNoAto?: number | null;
  valorCentavos?: number | null;
  advertencias?: string[];
};

export type ArquivoDTO = {
  id: string;
  tipo: TipoArquivoCotacao;
  nomeOriginal: string;
  tamanho: number;
  em: string;
  meu: boolean;
};

export type CotacaoDTO = {
  id: string;
  numero: string;
  chamadoId: string;
  situacao: SituacaoCotacao;
  emTramite: boolean;
  versao: number;
  visao: Visao;
  criadaEm: string;
  atualizadaEm: string;
  /** Motivo do último devolver, reprovar ou cancelar. */
  ultimoMotivo: string | null;
  itens?: ItemDTO[];
  valorTotalCentavos?: number;
  valorExecutadoCentavos?: number | null;
  autorizadoEm?: string | null;
  executadoEm?: string | null;
  montadoPorMim?: boolean;
  orcamentos?: OrcamentoDTO[];
  arquivos?: ArquivoDTO[];
  trilha?: EventoDTO[];
  /** Só TRF1. */
  empenhoId?: string | null;
  valorAutorizadoCentavos?: number | null;
  advertencias?: CodigoControle[];
};

export type ContextoLeitura = {
  userId: string;
  papeis: Papeis;
  ehTecnicoAtribuido: boolean;
  ehSolicitante: boolean;
};

/** A visão de quem lê, ou `null` quando não pode ver esta cotação. */
export function visaoDe(
  ctx: ContextoLeitura,
  cot: Pick<CotacaoBruta, 'situacao' | 'emTramite' | 'updatedAt'>,
  agora: Date = new Date(),
): Visao | null {
  // O rascunho é da contratada e do técnico: o lado TRF1 só vê a partir do envio (AC-1).
  if ((ctx.papeis.ladoTrf1 || ctx.papeis.leitorAdmin) && cot.situacao !== 'rascunho') {
    return 'trf1';
  }
  if (ctx.papeis.contratada) {
    const limite = agora.getTime() - DIAS_ENCERRADAS_VISIVEIS_RT * 24 * 60 * 60 * 1000;
    if (cot.emTramite || cot.updatedAt.getTime() >= limite) return 'contratada';
  }
  if (ctx.ehTecnicoAtribuido) return 'tecnico';
  if (ctx.ehSolicitante) return 'solicitante';
  return null;
}

/** Quem baixa qual arquivo (AC-15): técnico só evidência, solicitante nada. */
export function podeBaixar(visao: Visao, tipo: TipoArquivoCotacao): boolean {
  if (visao === 'trf1' || visao === 'contratada') return true;
  if (visao === 'tecnico') return tipo === 'evidencia';
  return false;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

const ACOES_COM_MOTIVO = new Set(['devolver', 'reprovar', 'cancelar', 'alterar']);

export function serializarCotacao(
  cot: CotacaoBruta,
  visao: Visao,
  ctx: { userId: string },
  extra: { eventos?: EventoBruto[]; arquivos?: ArquivoBruto[] } = {},
): CotacaoDTO {
  const eventos = extra.eventos ?? [];
  const ultimo = [...eventos].reverse().find((ev) => ACOES_COM_MOTIVO.has(ev.acao) && ev.motivo);
  const base: CotacaoDTO = {
    id: String(cot._id),
    numero: cot.numero,
    chamadoId: String(cot.chamadoId),
    situacao: cot.situacao,
    emTramite: cot.emTramite,
    versao: cot.versao,
    visao,
    criadaEm: cot.createdAt.toISOString(),
    atualizadaEm: cot.updatedAt.toISOString(),
    ultimoMotivo: visao === 'solicitante' ? null : (ultimo?.motivo ?? null),
  };
  if (visao === 'solicitante') return base;

  base.itens = cot.itens.map((i) => ({
    id: String(i._id),
    descricao: i.descricao,
    unidade: i.unidade,
    quantidade: i.quantidade,
    motivo: i.motivo,
    doDiagnostico: i.doDiagnostico,
    precoAplicadoCentavos: i.precoAplicadoCentavos ?? null,
    quantidadeExecutada: i.quantidadeExecutada ?? null,
    valorExecutadoCentavos: i.valorExecutadoCentavos ?? null,
  }));
  base.valorTotalCentavos = cot.valorTotalCentavos;
  base.valorExecutadoCentavos = cot.valorExecutadoCentavos ?? null;
  base.autorizadoEm = iso(cot.autorizadoEm);
  base.executadoEm = iso(cot.executadoEm);
  base.montadoPorMim = !!cot.montadoPorUserId && String(cot.montadoPorUserId) === ctx.userId;
  base.arquivos = (extra.arquivos ?? [])
    .filter((a) => podeBaixar(visao, a.tipo))
    .map((a) => ({
      id: String(a._id),
      tipo: a.tipo,
      nomeOriginal: a.nomeOriginal,
      tamanho: a.tamanho,
      em: a.em.toISOString(),
      meu: String(a.enviadoPorUserId) === ctx.userId,
    }));

  if (visao === 'tecnico') {
    base.trilha = eventos.map((ev) => ({
      id: String(ev._id),
      de: ev.de,
      para: ev.para,
      acao: ev.acao,
      autorNome: ev.autorNome,
      papel: ev.papel,
      motivo: ACOES_COM_MOTIVO.has(ev.acao) ? ev.motivo : null,
      em: ev.em.toISOString(),
    }));
    return base;
  }

  base.orcamentos = cot.orcamentos.map((o) => ({
    id: String(o._id),
    fornecedor: o.fornecedor,
    cnpj: o.cnpj,
    data: o.data.toISOString().slice(0, 10),
    validade: o.validade ? o.validade.toISOString().slice(0, 10) : null,
    arquivoId: String(o.arquivoId),
    precos: o.precos.map((p) => ({
      itemId: String(p.itemId),
      valorUnitarioCentavos: p.valorUnitarioCentavos,
    })),
  }));

  if (visao === 'contratada') {
    // Sem empenho, saldo, limites nem advertências do lado TRF1.
    base.trilha = eventos
      .filter((ev) => ev.acao !== 'conciliar')
      .map((ev) => ({
        id: String(ev._id),
        de: ev.de,
        para: ev.para,
        acao: ev.acao,
        autorNome: ev.autorNome,
        papel: ev.papel,
        motivo: ev.motivo,
        em: ev.em.toISOString(),
      }));
    base.advertencias = cot.advertencias
      .map((a) => a.codigo as CodigoControle)
      .filter((c) => CONTROLES[c]?.ve === 'todos');
    return base;
  }

  base.empenhoId = cot.empenhoId ? String(cot.empenhoId) : null;
  base.valorAutorizadoCentavos = cot.valorAutorizadoCentavos ?? null;
  base.advertencias = cot.advertencias.map((a) => a.codigo as CodigoControle);
  base.trilha = eventos.map((ev) => ({
    id: String(ev._id),
    de: ev.de,
    para: ev.para,
    acao: ev.acao,
    autorNome: ev.autorNome,
    papel: ev.papel,
    motivo: ev.motivo,
    em: ev.em.toISOString(),
    limiteCentavosNoAto: ev.limiteCentavosNoAto,
    valorCentavos: ev.valorCentavos,
    advertencias: ev.advertenciasNoAto,
  }));
  return base;
}
