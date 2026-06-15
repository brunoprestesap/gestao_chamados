/**
 * IMR — Índice de Medição de Resultados.
 * Relatório gerencial: indicadores de desempenho de chamados encerrados no período.
 * Cálculos determinísticos e reproduzíveis (aggregations MongoDB).
 *
 * IMPORTANTE: todos os indicadores são computados em uma ÚNICA aggregation com $facet,
 * agrupando por tipoServico. O resultado geral é derivado somando os tipos no JS —
 * evitando N+1 queries para cada tipo de serviço.
 */

import 'server-only';

import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { TIPO_SERVICO_OPTIONS } from '@/shared/chamados/new-ticket.schemas';

/* ─────────────────────────── Types públicos ─────────────────────────── */

export type ImrPeriod = {
  dataInicial: Date;
  dataFinal: Date;
};

export type ImrVolumePorTipo = {
  tipoServico: string;
  total: number;
};

export type ImrSlaCumprimento = {
  totalDentro: number;
  totalFora: number;
  percentualDentro: number;
  percentualFora: number;
};

export type ImrSlaPorPrioridade = {
  prioridade: string;
  total: number;
  dentroSla: number;
  foraSla: number;
  percentualDentro: number;
  percentualFora: number;
};

export type ImrAvaliacao = {
  mediaGeral: number;
  totalAvaliacoes: number;
  percentualNegativas: number;
  totalNegativas: number;
  totalNaoAvaliados: number;
  percentualNaoAvaliados: number;
};

export type ImrPenalidade = {
  motivo: string;
  quantidade: number;
  percentualSobreTotal: number;
};

export type ImrResultPorTipo = {
  tipoServico: string;
  totalChamados: number;
  sla: ImrSlaCumprimento;
  slaPorPrioridade: ImrSlaPorPrioridade[];
  tempoMedioMs: number | null;
  avaliacao: ImrAvaliacao;
  penalidades: ImrPenalidade[];
  chamadosForaSla: number;
};

/** Dados do resumo geral (passados ao componente de abas). */
export type ImrResumoGeral = {
  totalChamados: number;
  volumePorTipo: ImrVolumePorTipo[];
  sla: ImrSlaCumprimento;
  slaPorPrioridade: ImrSlaPorPrioridade[];
  tempoMedioMs: number | null;
  tempoMedioPorTipo: { tipoServico: string; tempoMedioMs: number }[];
  avaliacao: ImrAvaliacao;
  penalidades: ImrPenalidade[];
  chamadosForaSla: number;
};

export type ImrResult = {
  periodo: ImrPeriod;
  resumoGeral: ImrResumoGeral;
  porTipoServico: ImrResultPorTipo[];
};

/* ─────────────────────────── Helpers internos ─────────────────────────── */

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/** Calcula percentual arredondado para 2 casas. Retorna 0 se denominador for 0. */
function pct(numerador: number, denominador: number): number {
  return denominador > 0 ? Math.round((numerador / denominador) * 10000) / 100 : 0;
}

/* ─────────────────────────── Expressões SLA ─────────────────────────── */

// Um chamado só entra no cálculo de cumprimento de SLA se tiver snapshot de SLA
// (resolutionDueAt definido). Chamados sem SLA (legados / que chegaram a
// 'encerrado' sem classificação) não contam como "dentro" nem como "fora" —
// antes, o ramo `resolutionBreachedAt == null` os contava como "dentro" e
// inflava o percentual de cumprimento.
const TEM_SLA = { $ne: ['$sla.resolutionDueAt', null] };

// Pressupõe TEM_SLA: está "dentro" se não houve breach de resolução (ou,
// defensivamente, se foi resolvido até o prazo).
const DENTRO_SLA_INNER = {
  $or: [
    { $eq: ['$sla.resolutionBreachedAt', null] },
    {
      $and: [
        { $ne: ['$sla.resolvedAt', null] },
        { $lte: ['$sla.resolvedAt', '$sla.resolutionDueAt'] },
      ],
    },
  ],
};

/** 1 se o chamado tem snapshot de SLA (base do cálculo de cumprimento). */
function temSlaExpr(): Record<string, unknown> {
  return { $cond: { if: TEM_SLA, then: 1, else: 0 } };
}

function dentroSlaExpr(): Record<string, unknown> {
  return { $cond: { if: { $and: [TEM_SLA, DENTRO_SLA_INNER] }, then: 1, else: 0 } };
}

function foraSlaExpr(): Record<string, unknown> {
  return { $cond: { if: { $and: [TEM_SLA, { $not: [DENTRO_SLA_INNER] }] }, then: 1, else: 0 } };
}

/* ─────────────────────────── Facet unificado ─────────────────────────── */

/**
 * Tipo do resultado bruto da aggregation unificada.
 * Todos os facets agrupam por tipoServico, permitindo derivar tanto o
 * resultado geral (soma) quanto o resultado por tipo (filtro por _id).
 */
type UnifiedFacetResult = {
  totalPorTipo: Array<{ _id: string; count: number }>;
  slaPorTipo: Array<{ _id: string; dentro: number; fora: number; total: number }>;
  slaPorTipoEPrioridade: Array<{
    _id: { tipo: string; prioridade: string };
    total: number;
    dentro: number;
    fora: number;
  }>;
  tempoPorTipo: Array<{ _id: string; somaMs: number; count: number }>;
  avaliacaoPorTipo: Array<{
    _id: string;
    somaRating: number;
    total: number;
    negativas: number;
  }>;
  penalidadesPorTipo: Array<{
    _id: string;
    slaEstourado: number;
    avaliacaoNegativa: number;
    ambos: number;
  }>;
};

/** Facets unificados — uma única passada sobre os documentos. */
function unifiedFacets() {
  return {
    totalPorTipo: [
      { $group: { _id: '$tipoServico', count: { $sum: 1 } } },
      { $sort: { _id: 1 as const } },
    ],

    slaPorTipo: [
      {
        $group: {
          _id: '$tipoServico',
          dentro: { $sum: dentroSlaExpr() },
          fora: { $sum: foraSlaExpr() },
          // base = chamados com SLA (dentro + fora), não todos os chamados
          total: { $sum: temSlaExpr() },
        },
      },
    ],

    slaPorTipoEPrioridade: [
      {
        $group: {
          _id: {
            tipo: '$tipoServico',
            prioridade: { $ifNull: ['$finalPriority', '$sla.priority'] },
          },
          total: { $sum: temSlaExpr() },
          dentro: { $sum: dentroSlaExpr() },
          fora: { $sum: foraSlaExpr() },
        },
      },
      { $sort: { '_id.prioridade': 1 as const } },
    ],

    tempoPorTipo: [
      {
        $project: {
          tipoServico: 1,
          // Tempo de atendimento = resolvedAt - createdAt - tempo pausado.
          // Usa apenas a resolução técnica (sla.resolvedAt); NÃO usa closedAt
          // como fallback, pois o encerramento administrativo pode ocorrer dias
          // depois e inflaria o tempo médio. Descontar pausas evita contar
          // janelas de "aguardando solicitante/terceiros" como tempo de trabalho.
          resolvedAt: '$sla.resolvedAt',
          createdAt: 1,
          pausedMs: { $multiply: [{ $ifNull: ['$totalPausedMinutes', 0] }, 60000] },
        },
      },
      { $match: { resolvedAt: { $ne: null }, createdAt: { $ne: null } } },
      {
        $project: {
          tipoServico: 1,
          diffMs: {
            $max: [0, { $subtract: [{ $subtract: ['$resolvedAt', '$createdAt'] }, '$pausedMs'] }],
          },
        },
      },
      {
        $group: {
          _id: '$tipoServico',
          somaMs: { $sum: '$diffMs' },
          count: { $sum: 1 },
        },
      },
    ],

    avaliacaoPorTipo: [
      { $match: { 'evaluation.rating': { $gte: 1, $lte: 5 } } },
      {
        $group: {
          _id: '$tipoServico',
          somaRating: { $sum: '$evaluation.rating' },
          total: { $sum: 1 },
          negativas: {
            $sum: { $cond: [{ $lte: ['$evaluation.rating', 2] }, 1, 0] },
          },
        },
      },
    ],

    penalidadesPorTipo: [
      {
        $project: {
          tipoServico: 1,
          foraSla: foraSlaExpr(),
          avaliacaoNegativa: {
            $cond: [
              {
                $and: [{ $gte: ['$evaluation.rating', 1] }, { $lte: ['$evaluation.rating', 2] }],
              },
              1,
              0,
            ],
          },
        },
      },
      {
        $group: {
          _id: '$tipoServico',
          slaEstourado: { $sum: '$foraSla' },
          avaliacaoNegativa: { $sum: '$avaliacaoNegativa' },
          ambos: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$foraSla', 1] }, { $eq: ['$avaliacaoNegativa', 1] }] },
                1,
                0,
              ],
            },
          },
        },
      },
    ],
  };
}

/* ─────────────────────────── Transformação ─────────────────────────── */

function buildSlaCumprimento(dentro: number, fora: number, total: number): ImrSlaCumprimento {
  return {
    totalDentro: dentro,
    totalFora: fora,
    percentualDentro: pct(dentro, total),
    percentualFora: pct(fora, total),
  };
}

function buildSlaPorPrioridade(
  rows: Array<{ prioridade: string; total: number; dentro: number; fora: number }>,
): ImrSlaPorPrioridade[] {
  return rows.map((r) => ({
    prioridade: r.prioridade,
    total: r.total,
    dentroSla: r.dentro,
    foraSla: r.fora,
    percentualDentro: pct(r.dentro, r.total),
    percentualFora: pct(r.fora, r.total),
  }));
}

function buildAvaliacao(
  somaRating: number,
  totalAvaliacoes: number,
  totalNegativas: number,
  totalChamados: number,
): ImrAvaliacao {
  const totalNaoAvaliados = Math.max(0, totalChamados - totalAvaliacoes);
  return {
    mediaGeral: totalAvaliacoes > 0 ? Math.round((somaRating / totalAvaliacoes) * 100) / 100 : 0,
    totalAvaliacoes,
    totalNegativas,
    percentualNegativas: pct(totalNegativas, totalAvaliacoes),
    totalNaoAvaliados,
    percentualNaoAvaliados: pct(totalNaoAvaliados, totalChamados),
  };
}

function buildPenalidades(
  slaEstourado: number,
  avaliacaoNegativa: number,
  ambos: number,
  totalChamados: number,
): ImrPenalidade[] {
  if (totalChamados === 0) return [];
  return [
    {
      motivo: 'SLA estourado',
      quantidade: slaEstourado,
      percentualSobreTotal: pct(slaEstourado, totalChamados),
    },
    {
      motivo: 'Avaliação negativa',
      quantidade: avaliacaoNegativa,
      percentualSobreTotal: pct(avaliacaoNegativa, totalChamados),
    },
    {
      motivo: 'SLA estourado e avaliação negativa',
      quantidade: ambos,
      percentualSobreTotal: pct(ambos, totalChamados),
    },
  ];
}

/** Extrai indicadores de um tipo de serviço específico a partir do facet unificado. */
function extractPerType(facet: UnifiedFacetResult, tipo: string): ImrResultPorTipo {
  const totalRow = facet.totalPorTipo.find((r) => r._id === tipo);
  const totalChamados = totalRow?.count ?? 0;

  const slaRow = facet.slaPorTipo.find((r) => r._id === tipo);
  const sla = buildSlaCumprimento(slaRow?.dentro ?? 0, slaRow?.fora ?? 0, slaRow?.total ?? 0);

  const prioridadeRows = facet.slaPorTipoEPrioridade
    .filter((r) => r._id.tipo === tipo)
    .map((r) => ({
      prioridade: r._id.prioridade ?? '—',
      total: r.total,
      dentro: r.dentro,
      fora: r.fora,
    }));
  const slaPorPrioridade = buildSlaPorPrioridade(prioridadeRows);

  const tempoRow = facet.tempoPorTipo.find((r) => r._id === tipo);
  const tempoMedioMs = tempoRow && tempoRow.count > 0 ? tempoRow.somaMs / tempoRow.count : null;

  const avRow = facet.avaliacaoPorTipo.find((r) => r._id === tipo);
  const avaliacao = buildAvaliacao(
    avRow?.somaRating ?? 0,
    avRow?.total ?? 0,
    avRow?.negativas ?? 0,
    totalChamados,
  );

  const penRow = facet.penalidadesPorTipo.find((r) => r._id === tipo);
  const penalidades = buildPenalidades(
    penRow?.slaEstourado ?? 0,
    penRow?.avaliacaoNegativa ?? 0,
    penRow?.ambos ?? 0,
    totalChamados,
  );

  return {
    tipoServico: tipo,
    totalChamados,
    sla,
    slaPorPrioridade,
    tempoMedioMs,
    avaliacao,
    penalidades,
    chamadosForaSla: sla.totalFora,
  };
}

/** Agrega os resultados de todos os tipos para produzir o resumo geral. */
function buildResumoGeral(facet: UnifiedFacetResult): ImrResumoGeral {
  const volumePorTipo: ImrVolumePorTipo[] = facet.totalPorTipo.map((r) => ({
    tipoServico: r._id ?? '—',
    total: r.count,
  }));
  const totalChamados = facet.totalPorTipo.reduce((acc, r) => acc + r.count, 0);

  // SLA global: soma dos tipos
  const slaDentro = facet.slaPorTipo.reduce((acc, r) => acc + r.dentro, 0);
  const slaFora = facet.slaPorTipo.reduce((acc, r) => acc + r.fora, 0);
  const slaTotal = facet.slaPorTipo.reduce((acc, r) => acc + r.total, 0);
  const sla = buildSlaCumprimento(slaDentro, slaFora, slaTotal);

  // SLA por prioridade global: agrupar por prioridade (somando tipos)
  const prioridadeMap = new Map<string, { total: number; dentro: number; fora: number }>();
  for (const r of facet.slaPorTipoEPrioridade) {
    const key = r._id.prioridade ?? '—';
    const existing = prioridadeMap.get(key) ?? { total: 0, dentro: 0, fora: 0 };
    existing.total += r.total;
    existing.dentro += r.dentro;
    existing.fora += r.fora;
    prioridadeMap.set(key, existing);
  }
  const slaPorPrioridade = buildSlaPorPrioridade(
    [...prioridadeMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([prioridade, vals]) => ({ prioridade, ...vals })),
  );

  // Tempo médio global: média ponderada (somaMs total / count total)
  const tempoSomaMs = facet.tempoPorTipo.reduce((acc, r) => acc + r.somaMs, 0);
  const tempoCount = facet.tempoPorTipo.reduce((acc, r) => acc + r.count, 0);
  const tempoMedioMs = tempoCount > 0 ? tempoSomaMs / tempoCount : null;
  const tempoMedioPorTipo = facet.tempoPorTipo
    .filter((r) => r.count > 0)
    .map((r) => ({ tipoServico: r._id ?? '—', tempoMedioMs: r.somaMs / r.count }))
    .sort((a, b) => a.tipoServico.localeCompare(b.tipoServico));

  // Avaliação global: soma de todos os tipos
  const avSomaRating = facet.avaliacaoPorTipo.reduce((acc, r) => acc + r.somaRating, 0);
  const avTotal = facet.avaliacaoPorTipo.reduce((acc, r) => acc + r.total, 0);
  const avNegativas = facet.avaliacaoPorTipo.reduce((acc, r) => acc + r.negativas, 0);
  const avaliacao = buildAvaliacao(avSomaRating, avTotal, avNegativas, totalChamados);

  // Penalidades global: soma de todos os tipos
  const penSlaEstourado = facet.penalidadesPorTipo.reduce((acc, r) => acc + r.slaEstourado, 0);
  const penAvalNegativa = facet.penalidadesPorTipo.reduce((acc, r) => acc + r.avaliacaoNegativa, 0);
  const penAmbos = facet.penalidadesPorTipo.reduce((acc, r) => acc + r.ambos, 0);
  const penalidades = buildPenalidades(penSlaEstourado, penAvalNegativa, penAmbos, totalChamados);

  return {
    totalChamados,
    volumePorTipo,
    sla,
    slaPorPrioridade,
    tempoMedioMs,
    tempoMedioPorTipo,
    avaliacao,
    penalidades,
    chamadosForaSla: sla.totalFora,
  };
}

/* ─────────────────────────── Função pública ─────────────────────────── */

/**
 * Calcula todos os indicadores do IMR para o período em uma ÚNICA aggregation.
 * Os resultados por tipo e o resumo geral são derivados do mesmo dataset.
 */
export async function computeImrReport(period: ImrPeriod): Promise<ImrResult> {
  await dbConnect();

  const start = startOfDay(period.dataInicial);
  const end = endOfDay(period.dataFinal);

  const [facet] = await ChamadoModel.aggregate<UnifiedFacetResult>([
    {
      $match: {
        status: 'encerrado' as const,
        closedAt: { $gte: start, $lte: end, $ne: null },
      },
    },
    { $facet: unifiedFacets() },
  ]);

  const resumoGeral = buildResumoGeral(facet);
  const porTipoServico = TIPO_SERVICO_OPTIONS.map((tipo) => extractPerType(facet, tipo));

  return {
    periodo: { dataInicial: start, dataFinal: end },
    resumoGeral,
    porTipoServico,
  };
}
