/**
 * IMR — Índice de Medição de Resultados.
 * Relatório gerencial: indicadores de desempenho de chamados encerrados no período.
 * Cálculos determinísticos e reproduzíveis (aggregations MongoDB).
 */

import 'server-only';

import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';

/** Período de apuração: chamados encerrados (closedAt) dentro do intervalo, inclusive. */
export type ImrPeriod = {
  dataInicial: Date;
  dataFinal: Date;
};

/** Volume por tipo de serviço */
export type ImrVolumePorTipo = {
  tipoServico: string;
  total: number;
};

/** Cumprimento de SLA (resolução) */
export type ImrSlaCumprimento = {
  totalDentro: number;
  totalFora: number;
  percentualDentro: number;
  percentualFora: number;
};

/** SLA por prioridade */
export type ImrSlaPorPrioridade = {
  prioridade: string;
  total: number;
  dentroSla: number;
  foraSla: number;
  percentualDentro: number;
  percentualFora: number;
};

/** Avaliação dos usuários (apenas chamados avaliados com rating 1–5) */
export type ImrAvaliacao = {
  mediaGeral: number;
  totalAvaliacoes: number;
  percentualNegativas: number;
  totalNegativas: number;
  /** Chamados encerrados no período sem avaliação registrada (transparência; não gera penalidade) */
  totalNaoAvaliados: number;
  percentualNaoAvaliados: number;
};

/** Penalidades (base para glosa) */
export type ImrPenalidade = {
  motivo: string;
  quantidade: number;
  percentualSobreTotal: number;
};

export type ImrResult = {
  periodo: ImrPeriod;
  totalChamados: number;
  volumePorTipo: ImrVolumePorTipo[];
  sla: ImrSlaCumprimento;
  slaPorPrioridade: ImrSlaPorPrioridade[];
  tempoMedioMs: number | null;
  tempoMedioPorTipo: { tipoServico: string; tempoMedioMs: number }[];
  avaliacao: ImrAvaliacao;
  penalidades: ImrPenalidade[];
  /** Chamados fora do SLA (para quadro-resumo "críticos") */
  chamadosForaSla: number;
};

/** Retorna data final ao fim do dia (23:59:59.999) no mesmo dia civil. */
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

/** Início do dia 00:00:00.000 */
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/** Condição SLA atendido (para uso em $cond): resolutionBreachedAt == null OU resolvedAt <= resolutionDueAt. */
const DENTRO_SLA_CONDITION = {
  $or: [
    { $eq: ['$sla.resolutionBreachedAt', null] },
    {
      $and: [
        { $ne: ['$sla.resolvedAt', null] },
        { $ne: ['$sla.resolutionDueAt', null] },
        { $lte: ['$sla.resolvedAt', '$sla.resolutionDueAt'] },
      ],
    },
  ],
};

function dentroSlaExpr(): Record<string, unknown> {
  return { $cond: { if: DENTRO_SLA_CONDITION, then: 1, else: 0 } };
}

function foraSlaExpr(): Record<string, unknown> {
  return { $cond: { if: DENTRO_SLA_CONDITION, then: 0, else: 1 } };
}

/**
 * Calcula todos os indicadores do IMR para o período.
 * Uma única aggregation com $facet para evitar N+1 e garantir reprodutibilidade.
 */
export async function computeImrReport(period: ImrPeriod): Promise<ImrResult> {
  await dbConnect();

  const start = startOfDay(period.dataInicial);
  const end = endOfDay(period.dataFinal);

  const matchBase = {
    status: 'encerrado' as const,
    closedAt: { $gte: start, $lte: end, $ne: null },
  };

  type FacetResult = {
    total: [{ count: number }];
    volumePorTipo: Array<{ _id: string; total: number }>;
    sla: Array<{ dentro: number; fora: number; total: number }>;
    slaPorPrioridade: Array<{
      _id: string;
      total: number;
      dentro: number;
      fora: number;
    }>;
    tempoMedio: Array<{ avgMs: number | null }>;
    tempoMedioPorTipo: Array<{ _id: string; avgMs: number }>;
    avaliacao: Array<{
      media: number;
      total: number;
      negativas: number;
    }>;
    penalidades: Array<{
      slaEstourado: number;
      avaliacaoNegativa: number;
      ambos: number;
    }>;
  };

  const [facet] = await ChamadoModel.aggregate<FacetResult>([
    { $match: matchBase },
    {
      $facet: {
        total: [{ $count: 'count' }],
        volumePorTipo: [
          { $group: { _id: '$tipoServico', total: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
        sla: [
          {
            $group: {
              _id: null,
              dentro: { $sum: dentroSlaExpr() },
              fora: { $sum: foraSlaExpr() },
              total: { $sum: 1 },
            },
          },
        ],
        slaPorPrioridade: [
          {
            $group: {
              _id: { $ifNull: ['$finalPriority', '$sla.priority'] },
              total: { $sum: 1 },
              dentro: { $sum: dentroSlaExpr() },
              fora: { $sum: foraSlaExpr() },
            },
          },
          { $sort: { _id: 1 } },
        ],
        tempoMedio: [
          {
            $project: {
              resolvedOrClosed: {
                $ifNull: ['$sla.resolvedAt', '$closedAt'],
              },
              createdAt: 1,
            },
          },
          {
            $match: {
              resolvedOrClosed: { $ne: null },
              createdAt: { $ne: null },
            },
          },
          {
            $project: {
              diffMs: { $subtract: ['$resolvedOrClosed', '$createdAt'] },
            },
          },
          {
            $group: {
              _id: null,
              avgMs: { $avg: '$diffMs' },
            },
          },
        ],
        tempoMedioPorTipo: [
          {
            $project: {
              tipoServico: 1,
              resolvedOrClosed: { $ifNull: ['$sla.resolvedAt', '$closedAt'] },
              createdAt: 1,
            },
          },
          {
            $match: {
              resolvedOrClosed: { $ne: null },
              createdAt: { $ne: null },
            },
          },
          {
            $project: {
              tipoServico: 1,
              diffMs: { $subtract: ['$resolvedOrClosed', '$createdAt'] },
            },
          },
          {
            $group: {
              _id: '$tipoServico',
              avgMs: { $avg: '$diffMs' },
            },
          },
          { $sort: { _id: 1 } },
        ],
        avaliacao: [
          {
            $match: {
              'evaluation.rating': { $gte: 1, $lte: 5 },
            },
          },
          {
            $group: {
              _id: null,
              media: { $avg: '$evaluation.rating' },
              total: { $sum: 1 },
              negativas: {
                $sum: { $cond: [{ $lte: ['$evaluation.rating', 2] }, 1, 0] },
              },
            },
          },
        ],
        penalidades: [
          {
            $project: {
              foraSla: foraSlaExpr(),
              // Avaliação negativa SOMENTE quando existe avaliação explícita (rating 1–5) e rating ≤ 2.
              // Chamados sem avaliação (rating ausente/null/fora do range) NÃO contam como negativa.
              avaliacaoNegativa: {
                $cond: [
                  {
                    $and: [
                      { $gte: ['$evaluation.rating', 1] },
                      { $lte: ['$evaluation.rating', 2] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
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
      },
    },
  ]);

  const totalChamados = facet?.total?.[0]?.count ?? 0;

  const volumePorTipo: ImrVolumePorTipo[] = (facet?.volumePorTipo ?? []).map((v) => ({
    tipoServico: v._id ?? '—',
    total: v.total ?? 0,
  }));

  const slaRow = facet?.sla?.[0];
  const totalDentro = slaRow?.dentro ?? 0;
  const totalFora = slaRow?.fora ?? 0;
  const slaTotal = slaRow?.total ?? 0;
  const sla: ImrSlaCumprimento = {
    totalDentro,
    totalFora,
    percentualDentro: slaTotal > 0 ? Math.round((totalDentro / slaTotal) * 10000) / 100 : 0,
    percentualFora: slaTotal > 0 ? Math.round((totalFora / slaTotal) * 10000) / 100 : 0,
  };

  const slaPorPrioridade: ImrSlaPorPrioridade[] = (facet?.slaPorPrioridade ?? []).map((p) => {
    const total = p.total ?? 0;
    const dentro = p.dentro ?? 0;
    const fora = p.fora ?? 0;
    return {
      prioridade: p._id ?? '—',
      total,
      dentroSla: dentro,
      foraSla: fora,
      percentualDentro: total > 0 ? Math.round((dentro / total) * 10000) / 100 : 0,
      percentualFora: total > 0 ? Math.round((fora / total) * 10000) / 100 : 0,
    };
  });

  const tempoMedioRow = facet?.tempoMedio?.[0];
  const tempoMedioMs = tempoMedioRow?.avgMs ?? null;

  const tempoMedioPorTipo = (facet?.tempoMedioPorTipo ?? []).map((t) => ({
    tipoServico: t._id ?? '—',
    tempoMedioMs: t.avgMs ?? 0,
  }));

  const avRow = facet?.avaliacao?.[0];
  const totalAvaliacoes = avRow?.total ?? 0;
  const totalNegativas = avRow?.negativas ?? 0;
  const totalNaoAvaliados = Math.max(0, totalChamados - totalAvaliacoes);
  const avaliacao: ImrAvaliacao = {
    mediaGeral: avRow?.media != null ? Math.round(avRow.media * 100) / 100 : 0,
    totalAvaliacoes,
    totalNegativas,
    percentualNegativas: totalAvaliacoes > 0 ? Math.round((totalNegativas / totalAvaliacoes) * 10000) / 100 : 0,
    totalNaoAvaliados,
    percentualNaoAvaliados: totalChamados > 0 ? Math.round((totalNaoAvaliados / totalChamados) * 10000) / 100 : 0,
  };

  const penRow = facet?.penalidades?.[0];
  const penalidades: ImrPenalidade[] = [];
  if (penRow && totalChamados > 0) {
    const s = penRow.slaEstourado ?? 0;
    const a = penRow.avaliacaoNegativa ?? 0;
    const b = penRow.ambos ?? 0;
    penalidades.push(
      { motivo: 'SLA estourado', quantidade: s, percentualSobreTotal: Math.round((s / totalChamados) * 10000) / 100 },
      { motivo: 'Avaliação negativa', quantidade: a, percentualSobreTotal: Math.round((a / totalChamados) * 10000) / 100 },
      { motivo: 'SLA estourado e avaliação negativa', quantidade: b, percentualSobreTotal: Math.round((b / totalChamados) * 10000) / 100 },
    );
  }

  return {
    periodo: { dataInicial: start, dataFinal: end },
    totalChamados,
    volumePorTipo,
    sla,
    slaPorPrioridade,
    tempoMedioMs,
    tempoMedioPorTipo,
    avaliacao,
    penalidades,
    chamadosForaSla: totalFora,
  };
}
