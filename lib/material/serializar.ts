import 'server-only';

import type { Types } from 'mongoose';

import {
  type PapelEvento,
  type SituacaoCotacao,
  type TipoArquivoCotacao,
} from '@/shared/material/material.constants';
import { type CodigoControle, CONTROLES } from '@/shared/material/mensagens';
import { valorProvisorio } from '@/shared/material/valores';

import type { Papeis } from './papeis';
import { pesquisaDaUrgenciaPendente, visivelParaContratada } from './pendencia';
import { type PrazoAteste, prazoDoAteste } from './prazos';
import type { MarcaAnomalia } from './precos';

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
    anexoVItemId?: Types.ObjectId | null;
    anexoVNumero?: number | null;
    anexoVPrecoCentavos?: number | null;
    sinapiCodigo?: string | null;
    sinapiReferencia?: string | null;
    sinapiPrecoCentavos?: number | null;
    justificativaBase?: string | null;
    referencias?: {
      _id: Types.ObjectId;
      tipo?: 'sinapi' | 'livre' | null;
      fonte: string;
      sinapiCodigo?: string | null;
      sinapiReferencia?: string | null;
      unidade?: string | null;
      valorUnitarioCentavos: number;
      data: Date;
      incluidaPorUserId?: Types.ObjectId | null;
      papel?: 'responsavel_tecnico' | 'fiscal' | null;
      em?: Date | null;
      retiradaEm?: Date | null;
    }[];
  }[];
  orcamentos: {
    _id: Types.ObjectId;
    fornecedor: string;
    cnpj: string;
    data: Date;
    validade: Date | null;
    arquivoId: Types.ObjectId;
    precos: { itemId: Types.ObjectId; valorUnitarioCentavos: number }[];
    fase?: 'envio' | 'complemento' | null;
  }[];
  fiscalUserId?: Types.ObjectId | null;
  urgencia?: {
    pedida: boolean;
    justificativa: string;
    pedidaEm: Date;
    decisao?: 'aceita' | 'recusada' | null;
    decididaPorUserId?: Types.ObjectId | null;
    decididaEm?: Date | null;
    motivoRecusa?: string | null;
    pesquisaCompletaEm?: Date | null;
  } | null;
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
  advertencias: {
    codigo: string;
    itemId: Types.ObjectId | null;
    orcamentoId?: Types.ObjectId | null;
    confirmadaPorUserId?: Types.ObjectId | null;
    em?: Date;
  }[];
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
  /** Contratada e TRF1: de onde vem o preço e a referência na tabela (fatia 3). */
  origem?: string | null;
  anexoVNumero?: number | null;
  sinapiCodigo?: string | null;
  sinapiReferencia?: string | null;
  /** Item `ambas` sem base escolhida: o valor dele é o provisório. */
  valorProvisorio?: boolean;
  /** Só TRF1: as duas bases lado a lado, a escolha e a conferência do fiscal (AC-27, AC-29). */
  baseAplicada?: string | null;
  anexoVPrecoCentavos?: number | null;
  sinapiPrecoCentavos?: number | null;
  justificativaBase?: string | null;
  conferencia?: { texto: string; porNome: string | null; em: string } | null;
  advertencias?: CodigoControle[];
  /** O item está na lista de conferência obrigatória, lida agora (AC-29). */
  marcaAnomalia?: MarcaAnomalia | null;
  /** TRF1 e contratada: as referências de preço do caminho 3, inclusive as retiradas (AC-32). */
  referencias?: ReferenciaDTO[];
};

/** Referência de preço (fatia 4). A contratada não recebe o nome de quem incluiu. */
export type ReferenciaDTO = {
  id: string;
  tipo: 'sinapi' | 'livre';
  fonte: string;
  sinapiCodigo: string | null;
  sinapiReferencia: string | null;
  unidade: string | null;
  valorUnitarioCentavos: number;
  data: string;
  papel: 'responsavel_tecnico' | 'fiscal';
  autorNome: string | null;
  /** Quem lê incluiu esta referência: o fiscal só retira a própria. */
  minha: boolean;
  retirada: boolean;
};

export type OrcamentoDTO = {
  id: string;
  fornecedor: string;
  cnpj: string;
  data: string;
  validade: string | null;
  arquivoId: string;
  precos: { itemId: string; valorUnitarioCentavos: number }[];
  fase: 'envio' | 'complemento';
};

/**
 * Urgência (fatia 4, AC-35). O técnico recebe só a marca; a contratada, a
 * justificativa e a decisão sem quem decidiu; o TRF1, tudo.
 */
export type UrgenciaDTO = {
  pedida: boolean;
  justificativa?: string;
  pedidaEm?: string;
  decisao?: 'aceita' | 'recusada' | null;
  motivoRecusa?: string | null;
  decididaEm?: string | null;
  pesquisaCompletaEm?: string | null;
  /** Só TRF1. */
  decididaPorNome?: string | null;
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
  /** Fatia 4: a marca para todos do fluxo e o técnico; o resto conforme `UrgenciaDTO`. */
  urgencia?: UrgenciaDTO | null;
  /** TRF1 e contratada: a urgência aceita ainda sem os 3 orçamentos por item (AC-35). */
  pesquisaPendente?: boolean;
  /** Só TRF1. */
  empenhoId?: string | null;
  valorAutorizadoCentavos?: number | null;
  advertencias?: CodigoControle[];
  /** Só TRF1: as confirmações do orçamento vencido no encaminhar (AC-34). */
  confirmacoesVencido?: { orcamentoId: string; porNome: string | null; em: string }[];
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
  cot: Pick<CotacaoBruta, 'situacao' | 'emTramite' | 'updatedAt' | 'notaFiscal' | 'urgencia'>,
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

const ACOES_COM_MOTIVO = new Set([
  'devolver',
  'reprovar',
  'cancelar',
  'alterar',
  'urgencia_recusada',
]);

/**
 * Atos do lado TRF1 cujo autor a contratada não vê: o recebimento (AC-21), a
 * referência do fiscal e a recusa da urgência (fatia 4). O técnico, que vê
 * menos que a contratada (AC-15), também não.
 */
const ACOES_SEM_AUTOR_FORA_DO_TRF1 = new Set([
  'receber_provisorio',
  'receber_definitivo',
  'referencia_acrescentada',
  'referencia_retirada',
  'urgencia_recusada',
]);

/** Atos da pesquisa de preços que o técnico não vê na trilha (fatia 4). */
const ACOES_FORA_DA_TRILHA_DO_TECNICO = new Set([
  'referencia_acrescentada',
  'referencia_retirada',
  'pesquisa_completada',
]);

const ymdDe = (d: Date) => d.toISOString().slice(0, 10);

export function serializarCotacao(
  cot: CotacaoBruta,
  visao: Visao,
  ctx: { userId: string },
  extra: {
    eventos?: EventoBruto[];
    arquivos?: ArquivoBruto[];
    /** Nomes de quem registrou recebimento, nota fiscal e conferência, por id. */
    nomes?: ReadonlyMap<string, string>;
    /** Só TRF1: a marca de conferência obrigatória de cada item, lida agora. */
    marcas?: ReadonlyMap<string, MarcaAnomalia>;
  } = {},
): CotacaoDTO {
  const eventos = extra.eventos ?? [];
  const nome = (id: Types.ObjectId | null | undefined) =>
    id ? (extra.nomes?.get(String(id)) ?? null) : null;
  const ato = (a: { porUserId: Types.ObjectId; em: Date } | null | undefined): AtoDTO | null =>
    a ? { porNome: nome(a.porUserId), em: a.em.toISOString() } : null;
  const ultimo = [...eventos].reverse().find((ev) => ACOES_COM_MOTIVO.has(ev.acao) && ev.motivo);
  // O motivo da recusa da urgência não é do técnico (fatia 4, visibilidade por campo).
  const ultimoDoTecnico = [...eventos]
    .reverse()
    .find((ev) => ACOES_COM_MOTIVO.has(ev.acao) && ev.acao !== 'urgencia_recusada' && ev.motivo);
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

  // A marca de urgência aparece para todos do fluxo e para o técnico (AC-35).
  base.urgencia = cot.urgencia?.pedida ? { pedida: true } : null;

  if (visao === 'tecnico') {
    // O técnico vê só a marca da urgência (fatia 4): a pesquisa de preços some da
    // trilha dele, e a recusa da urgência aparece como devolução comum, sem o motivo.
    base.trilha = eventos
      .filter((ev) => !ACOES_FORA_DA_TRILHA_DO_TECNICO.has(ev.acao))
      .map((ev) => {
        const recusa = ev.acao === 'urgencia_recusada';
        return {
          id: String(ev._id),
          de: ev.de,
          para: ev.para,
          acao: recusa ? 'devolver' : ev.acao,
          autorNome: ACOES_SEM_AUTOR_FORA_DO_TRF1.has(ev.acao) ? null : ev.autorNome,
          papel: ev.papel,
          motivo: !recusa && ACOES_COM_MOTIVO.has(ev.acao) ? ev.motivo : null,
          em: ev.em.toISOString(),
        };
      });
    base.ultimoMotivo = ultimoDoTecnico?.motivo ?? null;
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
    fase: o.fase ?? 'envio',
  }));

  // A origem e a referência na tabela: a contratada classificou, então vê o que escolheu.
  // As referências de preço vão inteiras, inclusive as do fiscal (é contra elas que o
  // preço da contratada é medido), mas o nome de quem incluiu é só do TRF1 (fatia 4).
  base.itens = base.itens.map((i, n) => {
    const bruto = cot.itens[n]!;
    return {
      ...i,
      origem: bruto.origem ?? null,
      anexoVNumero: bruto.anexoVNumero ?? null,
      sinapiCodigo: bruto.sinapiCodigo ?? null,
      sinapiReferencia: bruto.sinapiReferencia ?? null,
      valorProvisorio: valorProvisorio({
        origem: bruto.origem ?? null,
        quantidade: bruto.quantidade,
        precoAplicadoCentavos: bruto.precoAplicadoCentavos ?? null,
      }),
      referencias: (bruto.referencias ?? []).map((r) => ({
        id: String(r._id),
        tipo: r.tipo ?? 'livre',
        fonte: r.fonte,
        sinapiCodigo: r.sinapiCodigo ?? null,
        sinapiReferencia: r.sinapiReferencia ?? null,
        unidade: r.unidade ?? null,
        valorUnitarioCentavos: r.valorUnitarioCentavos,
        data: ymdDe(r.data),
        papel: r.papel ?? 'responsavel_tecnico',
        autorNome: visao === 'trf1' ? nome(r.incluidaPorUserId) : null,
        minha: !!r.incluidaPorUserId && String(r.incluidaPorUserId) === ctx.userId,
        retirada: !!r.retiradaEm,
      })),
    };
  });

  const u = cot.urgencia;
  if (u?.pedida) {
    base.urgencia = {
      pedida: true,
      justificativa: u.justificativa,
      pedidaEm: u.pedidaEm.toISOString(),
      decisao: u.decisao ?? null,
      motivoRecusa: u.motivoRecusa ?? null,
      decididaEm: iso(u.decididaEm),
      pesquisaCompletaEm: iso(u.pesquisaCompletaEm),
      ...(visao === 'trf1' ? { decididaPorNome: nome(u.decididaPorUserId) } : {}),
    };
  }
  base.pesquisaPendente = pesquisaDaUrgenciaPendente(cot);

  if (visao === 'contratada') {
    // Sem empenho, saldo, limites, advertências do lado TRF1 nem as duas bases lado a lado.
    base.trilha = eventos
      .filter((ev) => ev.acao !== 'conciliar')
      .map((ev) => ({
        id: String(ev._id),
        de: ev.de,
        para: ev.para,
        acao: ev.acao,
        autorNome: ACOES_SEM_AUTOR_FORA_DO_TRF1.has(ev.acao) ? null : ev.autorNome,
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
    const id = String(bruto._id);
    return {
      ...i,
      baseAplicada: bruto.baseAplicada ?? null,
      anexoVPrecoCentavos: bruto.anexoVPrecoCentavos ?? null,
      sinapiPrecoCentavos: bruto.sinapiPrecoCentavos ?? null,
      justificativaBase: bruto.justificativaBase ?? null,
      advertencias: cot.advertencias
        .filter((a) => a.itemId && String(a.itemId) === id)
        .map((a) => a.codigo as CodigoControle),
      marcaAnomalia: extra.marcas?.get(id) ?? null,
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
  base.advertencias = [...new Set(cot.advertencias.map((a) => a.codigo as CodigoControle))];
  base.confirmacoesVencido = cot.advertencias
    .filter((a) => a.codigo === 'orcamento_vencido' && a.orcamentoId)
    .map((a) => ({
      orcamentoId: String(a.orcamentoId),
      porNome: nome(a.confirmadaPorUserId),
      em: iso(a.em) ?? '',
    }));
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
