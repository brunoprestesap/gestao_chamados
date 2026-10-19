import 'server-only';

import type { Types } from 'mongoose';

import {
  type PapelEvento,
  type SituacaoCotacao,
  type TipoArquivoCotacao,
} from '@/shared/material/material.constants';
import { type CodigoControle, CONTROLES } from '@/shared/material/mensagens';

import type { Papeis } from './papeis';
import { visivelParaContratada } from './pendencia';
import { type PrazoAteste, prazoDoAteste } from './prazos';

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
    baseAplicada?: string | null;
    precoAplicadoCentavos: number | null;
    conferencia?: { texto: string; porUserId: Types.ObjectId; em: Date } | null;
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
  recebimentoProvisorio?: { porUserId: Types.ObjectId; em: Date } | null;
  recebimentoDefinitivo?: { porUserId: Types.ObjectId; em: Date } | null;
  notaFiscal?: {
    numero: string;
    data: Date;
    arquivoId: Types.ObjectId;
    porUserId: Types.ObjectId;
    em: Date;
  } | null;
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
  /** Só TRF1: origem do preço, base aplicada e a conferência do fiscal. */
  origem?: string | null;
  baseAplicada?: string | null;
  conferencia?: { texto: string; porNome: string | null; em: string } | null;
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

/** Um ato do ateste: quem e quando (AC-21, AC-22). A contratada recebe só o quando. */
export type AtoDTO = { porNome: string | null; em: string };

export type NotaFiscalDTO = AtoDTO & { numero: string; data: string; arquivoId: string };

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
  /** TRF1 e contratada: o ateste e a nota fiscal (fatia 2). */
  recebimentoProvisorio?: AtoDTO | null;
  recebimentoDefinitivo?: AtoDTO | null;
  notaFiscal?: NotaFiscalDTO | null;
  prazoAteste?: PrazoAteste | null;
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
  cot: Pick<CotacaoBruta, 'situacao' | 'emTramite' | 'updatedAt' | 'notaFiscal'>,
  agora: Date = new Date(),
): Visao | null {
  // O rascunho é da contratada e do técnico: o lado TRF1 só vê a partir do envio (AC-1).
  if ((ctx.papeis.ladoTrf1 || ctx.papeis.leitorAdmin) && cot.situacao !== 'rascunho') {
    return 'trf1';
  }
  if (ctx.papeis.contratada) {
    // Em trâmite, encerrada há até 90 dias ou devendo a nota fiscal (AC-15).
    if (visivelParaContratada(cot, agora)) return 'contratada';
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

/** Atos do gestor cujo autor a contratada não vê: só a data do recebimento (AC-21). */
const ACOES_SEM_AUTOR_PARA_CONTRATADA = new Set(['receber_provisorio', 'receber_definitivo']);

export function serializarCotacao(
  cot: CotacaoBruta,
  visao: Visao,
  ctx: { userId: string },
  extra: {
    eventos?: EventoBruto[];
    arquivos?: ArquivoBruto[];
    /** Nomes de quem registrou recebimento, nota fiscal e conferência, por id. */
    nomes?: ReadonlyMap<string, string>;
  } = {},
): CotacaoDTO {
  const eventos = extra.eventos ?? [];
  const nome = (id: Types.ObjectId | null | undefined) =>
    id ? (extra.nomes?.get(String(id)) ?? null) : null;
  const ato = (a: { porUserId: Types.ObjectId; em: Date } | null | undefined): AtoDTO | null =>
    a ? { porNome: nome(a.porUserId), em: a.em.toISOString() } : null;
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

  // A contratada vê quando o recebimento aconteceu, para emitir a NF, mas não quem recebeu (AC-21).
  const atoDoRecebimento = (a: { porUserId: Types.ObjectId; em: Date } | null | undefined) => {
    const r = ato(a);
    return r && visao === 'contratada' ? { ...r, porNome: null } : r;
  };
  base.recebimentoProvisorio = atoDoRecebimento(cot.recebimentoProvisorio);
  base.recebimentoDefinitivo = atoDoRecebimento(cot.recebimentoDefinitivo);
  base.notaFiscal = cot.notaFiscal
    ? {
        ...ato(cot.notaFiscal)!,
        numero: cot.notaFiscal.numero,
        data: cot.notaFiscal.data.toISOString().slice(0, 10),
        arquivoId: String(cot.notaFiscal.arquivoId),
      }
    : null;

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
        autorNome: ACOES_SEM_AUTOR_PARA_CONTRATADA.has(ev.acao) ? null : ev.autorNome,
        papel: ev.papel,
        motivo: ev.motivo,
        em: ev.em.toISOString(),
      }));
    base.advertencias = cot.advertencias
      .map((a) => a.codigo as CodigoControle)
      .filter((c) => CONTROLES[c]?.ve === 'todos');
    return base;
  }

  base.itens = base.itens.map((i, n) => {
    const bruto = cot.itens[n]!;
    return {
      ...i,
      origem: bruto.origem ?? null,
      baseAplicada: bruto.baseAplicada ?? null,
      conferencia: bruto.conferencia
        ? {
            texto: bruto.conferencia.texto,
            porNome: nome(bruto.conferencia.porUserId),
            em: bruto.conferencia.em.toISOString(),
          }
        : null,
    };
  });
  // O selo de atraso do ateste é do lado TRF1: a contratada vê só as datas (AC-21).
  base.prazoAteste = prazoDoAteste(cot);
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
