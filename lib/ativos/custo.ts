import 'server-only';

import { Types } from 'mongoose';

import {
  type InfoDoAtivo,
  janelaDeHoje,
  lerInfoDosAtivos,
  RANKING_MAX,
  STATUS_FORA_DO_CORRETIVO,
} from '@/lib/ativos/indicadores';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { CotacaoModel } from '@/models/Cotacao';
import { custoDoChamado } from '@/shared/chamados/custo';
import { TIPO_SERVICO_OPTIONS } from '@/shared/chamados/new-ticket.schemas';
import type { TipoServico } from '@/shared/chamados/tipo-servico';

/**
 * Custo acumulado por ativo (spec 0018, AC-9, AC-10, AC-14). Nada é gravado:
 * a ficha, o IMR, o relatório por contrato e a substituição passam todos por
 * `lerCustosDosChamados` e `custoPorAtivo`, então mostram o mesmo número.
 */

/** Os campos de chamado que a conta precisa, para somar à projeção de quem lê. */
export const PROJECAO_CUSTO = {
  _id: 1,
  ativoId: 1,
  createdAt: 1,
  originTemplateId: 1,
  'materiaisForaCotacao.quantidade': 1,
  'materiaisForaCotacao.valorUnitario': 1,
} as const;

export type ChamadoParaCusto = {
  _id: Types.ObjectId;
  ativoId?: Types.ObjectId | null;
  createdAt: Date;
  originTemplateId?: Types.ObjectId | null;
  materiaisForaCotacao?: { quantidade: number; valorUnitario: number }[];
};

export type CustoDeChamado = {
  chamadoId: string;
  ativoId: string | null;
  createdAt: Date;
  /** Com `originTemplateId`: soma na parte preventiva. */
  preventiva: boolean;
  cotacoesCentavos: number;
  materialCentavos: number;
  totalCentavos: number;
};

export type CustoAgrupado = {
  corretivoCentavos: number;
  preventivaCentavos: number;
  totalCentavos: number;
};

export const CUSTO_ZERO: CustoAgrupado = {
  corretivoCentavos: 0,
  preventivaCentavos: 0,
  totalCentavos: 0,
};

/**
 * O custo de cada chamado já lido (com `PROJECAO_CUSTO`): busca as cotações
 * aprovadas por `chamadoId: { $in }` e soma com os itens de material.
 */
export async function lerCustosDosChamados(
  chamados: readonly ChamadoParaCusto[],
): Promise<CustoDeChamado[]> {
  if (chamados.length === 0) return [];
  const cotacoes = await CotacaoModel.find({
    chamadoId: { $in: chamados.map((c) => c._id) },
    status: 'aprovada',
  })
    .select('chamadoId status valorEstimado valorFinal')
    .lean<
      {
        chamadoId: Types.ObjectId;
        status: string;
        valorEstimado: number;
        valorFinal?: number | null;
      }[]
    >();
  const porChamado = new Map<string, typeof cotacoes>();
  for (const c of cotacoes) {
    const k = String(c.chamadoId);
    porChamado.set(k, [...(porChamado.get(k) ?? []), c]);
  }
  return chamados.map((c) => {
    const id = String(c._id);
    const conta = custoDoChamado({
      cotacoes: porChamado.get(id) ?? [],
      materiais: c.materiaisForaCotacao ?? [],
    });
    return {
      chamadoId: id,
      ativoId: c.ativoId ? String(c.ativoId) : null,
      createdAt: c.createdAt,
      preventiva: !!c.originTemplateId,
      ...conta,
    };
  });
}

/** Soma por ativo os chamados com `createdAt` dentro da janela (sem janela, todos). */
export function custoPorAtivo(
  custos: readonly CustoDeChamado[],
  janela?: { inicio: Date; fim: Date },
): Map<string, CustoAgrupado> {
  const out = new Map<string, CustoAgrupado>();
  for (const c of custos) {
    if (!c.ativoId) continue;
    if (janela && (c.createdAt < janela.inicio || c.createdAt > janela.fim)) continue;
    const atual = out.get(c.ativoId) ?? { ...CUSTO_ZERO };
    if (c.preventiva) atual.preventivaCentavos += c.totalCentavos;
    else atual.corretivoCentavos += c.totalCentavos;
    atual.totalCentavos += c.totalCentavos;
    out.set(c.ativoId, atual);
  }
  return out;
}

export type ChamadoComCusto = {
  id: string;
  numero: string;
  abertoEm: string;
  preventiva: boolean;
  cotacoesCentavos: number;
  materialCentavos: number;
  totalCentavos: number;
};

export type CustoDaFicha = {
  /** Últimos 12 meses, a mesma `janelaDeHoje` dos `corretivos12m`. */
  doze: CustoAgrupado;
  /** Todos os chamados do ativo, sem filtro de data e sem teto. */
  totalGeralCentavos: number;
  /** Só chamados com custo maior que zero, abertura mais nova primeiro. */
  chamados: ChamadoComCusto[];
};

/** O bloco "Custo de manutenção" da ficha (AC-11). */
export async function custoDaFicha(
  ativoId: string,
  limiteLista: number,
  agora: Date = new Date(),
): Promise<CustoDaFicha> {
  const chamados = await ChamadoModel.find({
    ativoId: new Types.ObjectId(ativoId),
    status: { $nin: [...STATUS_FORA_DO_CORRETIVO] },
  })
    .select({ ...PROJECAO_CUSTO, ticket_number: 1 })
    .lean<(ChamadoParaCusto & { ticket_number: string })[]>();
  const custos = await lerCustosDosChamados(chamados);
  const numero = new Map(chamados.map((c) => [String(c._id), c.ticket_number]));

  const janela = janelaDeHoje(agora);
  const doze = custoPorAtivo(custos, janela).get(ativoId) ?? { ...CUSTO_ZERO };
  const totalGeralCentavos = custos.reduce((s, c) => s + c.totalCentavos, 0);
  const lista = custos
    .filter((c) => c.totalCentavos > 0)
    .sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() || b.chamadoId.localeCompare(a.chamadoId),
    )
    .slice(0, limiteLista)
    .map((c) => ({
      id: c.chamadoId,
      numero: numero.get(c.chamadoId) ?? '',
      abertoEm: c.createdAt.toISOString(),
      preventiva: c.preventiva,
      cotacoesCentavos: c.cotacoesCentavos,
      materialCentavos: c.materialCentavos,
      totalCentavos: c.totalCentavos,
    }));
  return { doze, totalGeralCentavos, chamados: lista };
}

export type LinhaMaisCaro = CustoAgrupado & {
  ativoId: string;
  codigo: string;
  descricao: string;
  categoria: string | null;
  caminho: string | null;
};

export type CustoDoFiltro = {
  /** Custo no período de cada ativo com custo, para a coluna do ranking. */
  porAtivo: Record<string, CustoAgrupado>;
  /** Até `RANKING_MAX` ativos com custo maior que zero, maior total primeiro. */
  maisCaros: LinhaMaisCaro[];
};

export type CustosAtivos = {
  geral: CustoDoFiltro;
  porTipo: Record<TipoServico, CustoDoFiltro>;
};

function filtroDeCusto(
  custos: readonly CustoDeChamado[],
  info: ReadonlyMap<string, InfoDoAtivo>,
): CustoDoFiltro {
  const porAtivo = custoPorAtivo(custos);
  const maisCaros = [...porAtivo.entries()]
    .filter(([, c]) => c.totalCentavos > 0)
    .map(([ativoId, c]) => {
      const i = info.get(ativoId);
      return {
        ativoId,
        codigo: i?.codigo ?? '—',
        descricao: i?.descricao ?? '',
        categoria: i?.categoria ?? null,
        caminho: i?.caminho ?? null,
        ...c,
      };
    })
    .sort(
      (a, b) =>
        b.totalCentavos - a.totalCentavos ||
        a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }),
    )
    .slice(0, RANKING_MAX);
  return { porAtivo: Object.fromEntries(porAtivo), maisCaros };
}

/**
 * O custo da aba Ativos do IMR (AC-12): leitura própria dos chamados com
 * ativo no período, com e sem `originTemplateId` (o filtro de corretivo deixa
 * as preventivas de fora), fora de `cancelado` e `recusado`. "Todos" e cada
 * tipo de serviço numa só leitura, como `calcularIndicadoresAtivos`.
 */
export async function calcularCustosAtivos(params: {
  inicio: Date;
  fim: Date;
}): Promise<CustosAtivos> {
  await dbConnect();
  const chamados = await ChamadoModel.find({
    ativoId: { $type: 'objectId' },
    status: { $nin: [...STATUS_FORA_DO_CORRETIVO] },
    createdAt: { $gte: params.inicio, $lte: params.fim },
  })
    .select({ ...PROJECAO_CUSTO, tipoServico: 1 })
    .lean<(ChamadoParaCusto & { tipoServico?: string | null })[]>();
  const custos = await lerCustosDosChamados(chamados);
  const tipoDe = new Map(chamados.map((c) => [String(c._id), c.tipoServico ?? null]));
  const comCusto = [
    ...new Set(custos.filter((c) => c.totalCentavos > 0 && c.ativoId).map((c) => c.ativoId!)),
  ];
  const info = await lerInfoDosAtivos(comCusto);

  const porTipo = Object.fromEntries(
    TIPO_SERVICO_OPTIONS.map((tipo) => [
      tipo,
      filtroDeCusto(
        custos.filter((c) => tipoDe.get(c.chamadoId) === tipo),
        info,
      ),
    ]),
  ) as Record<TipoServico, CustoDoFiltro>;
  return { geral: filtroDeCusto(custos, info), porTipo };
}
