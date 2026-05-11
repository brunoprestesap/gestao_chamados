/**
 * Serviço de relatório de breach de SLA por técnico, unidade, prioridade e timeline.
 * Aggregation com $facet unificado — match geral por SLA computado no período,
 * breach contado via $cond dentro de cada $group (não pré-filtrado no $match).
 */

import 'server-only';

import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { UnitModel } from '@/models/unit';
import { UserModel } from '@/models/user.model';

/* ─── Tipos exportados ─────────────────────────────────────────── */

export type BreachByTechnician = {
  technicianId: string;
  technicianName: string;
  totalChamados: number;
  breachedChamados: number;
  responseBreaches: number;
  resolutionBreaches: number;
  avgDelayMinutes: number | null;
  breachRate: number;
};

export type BreachByUnit = {
  unitId: string;
  unitName: string;
  totalChamados: number;
  breachedChamados: number;
  responseBreaches: number;
  resolutionBreaches: number;
  avgDelayMinutes: number | null;
  breachRate: number;
};

export type BreachByPriority = {
  priority: string;
  total: number;
  responseBreaches: number;
  resolutionBreaches: number;
};

export type BreachByTipoServico = {
  tipoServico: string;
  total: number;
  responseBreaches: number;
  resolutionBreaches: number;
};

export type BreachTimeline = {
  month: string;
  total: number;
  responseBreaches: number;
  resolutionBreaches: number;
};

export type BreachReport = {
  period: { start: string; end: string };
  totalChamadosComSla: number;
  totalBreachedChamados: number;
  totalResponseBreaches: number;
  totalResolutionBreaches: number;
  avgBreachRate: number;
  byTechnician: BreachByTechnician[];
  byUnit: BreachByUnit[];
  byPriority: BreachByPriority[];
  byTipoServico: BreachByTipoServico[];
  timeline: BreachTimeline[];
};

/* ─── Expressões reutilizáveis para $cond ──────────────────────── */

const HAS_RESPONSE_BREACH = { $ne: ['$sla.responseBreachedAt', null] };
const HAS_RESOLUTION_BREACH = { $ne: ['$sla.resolutionBreachedAt', null] };
const HAS_ANY_BREACH = { $or: [HAS_RESPONSE_BREACH, HAS_RESOLUTION_BREACH] };

/** Atraso médio: resolvedAt - resolutionDueAt, apenas para breaches já concluídos. */
const AVG_DELAY_EXPR = {
  $avg: {
    $cond: [
      {
        $and: [
          { $ne: ['$sla.resolvedAt', null] },
          { $ne: ['$sla.resolutionDueAt', null] },
          { $gt: ['$sla.resolvedAt', '$sla.resolutionDueAt'] },
        ],
      },
      { $subtract: ['$sla.resolvedAt', '$sla.resolutionDueAt'] },
      null,
    ],
  },
};

/* ─── Aggregation ──────────────────────────────────────────────── */

export async function computeBreachReport(startDate: Date, endDate: Date): Promise<BreachReport> {
  await dbConnect();

  // Match: TODOS os chamados com SLA computado no período (não apenas breaches).
  // Breaches são contados via $cond dentro de cada $group, garantindo que
  // totalChamados reflita o total real (necessário para calcular breachRate).
  const matchStage = {
    $match: {
      'sla.computedAt': { $gte: startDate, $lte: endDate, $ne: null },
    },
  };

  const results = await ChamadoModel.aggregate([
    matchStage,
    {
      $facet: {
        byTechnician: [
          {
            $group: {
              _id: '$assignedToUserId',
              totalChamados: { $sum: 1 },
              breachedChamados: { $sum: { $cond: [HAS_ANY_BREACH, 1, 0] } },
              responseBreaches: { $sum: { $cond: [HAS_RESPONSE_BREACH, 1, 0] } },
              resolutionBreaches: { $sum: { $cond: [HAS_RESOLUTION_BREACH, 1, 0] } },
              avgDelayMs: AVG_DELAY_EXPR,
            },
          },
        ],

        byUnit: [
          {
            $group: {
              _id: '$unitId',
              totalChamados: { $sum: 1 },
              breachedChamados: { $sum: { $cond: [HAS_ANY_BREACH, 1, 0] } },
              responseBreaches: { $sum: { $cond: [HAS_RESPONSE_BREACH, 1, 0] } },
              resolutionBreaches: { $sum: { $cond: [HAS_RESOLUTION_BREACH, 1, 0] } },
              avgDelayMs: AVG_DELAY_EXPR,
            },
          },
        ],

        byPriority: [
          {
            $match: { $expr: HAS_ANY_BREACH },
          },
          {
            $group: {
              _id: '$sla.priority',
              total: { $sum: 1 },
              responseBreaches: { $sum: { $cond: [HAS_RESPONSE_BREACH, 1, 0] } },
              resolutionBreaches: { $sum: { $cond: [HAS_RESOLUTION_BREACH, 1, 0] } },
            },
          },
          { $sort: { total: -1 } },
        ],

        byTipoServico: [
          {
            $match: { $expr: HAS_ANY_BREACH },
          },
          {
            $group: {
              _id: '$tipoServico',
              total: { $sum: 1 },
              responseBreaches: { $sum: { $cond: [HAS_RESPONSE_BREACH, 1, 0] } },
              resolutionBreaches: { $sum: { $cond: [HAS_RESOLUTION_BREACH, 1, 0] } },
            },
          },
          { $sort: { total: -1 } },
        ],

        breachTimeline: [
          {
            $match: { $expr: HAS_ANY_BREACH },
          },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$sla.computedAt' } },
              total: { $sum: 1 },
              responseBreaches: { $sum: { $cond: [HAS_RESPONSE_BREACH, 1, 0] } },
              resolutionBreaches: { $sum: { $cond: [HAS_RESOLUTION_BREACH, 1, 0] } },
            },
          },
          { $sort: { _id: 1 } },
        ],

        totals: [
          {
            $group: {
              _id: null,
              totalChamados: { $sum: 1 },
              breachedChamados: { $sum: { $cond: [HAS_ANY_BREACH, 1, 0] } },
              responseBreaches: { $sum: { $cond: [HAS_RESPONSE_BREACH, 1, 0] } },
              resolutionBreaches: { $sum: { $cond: [HAS_RESOLUTION_BREACH, 1, 0] } },
            },
          },
        ],
      },
    },
  ]);

  const facets = results[0] ?? {};

  // Populate nomes de técnicos e unidades
  const techIds = (facets.byTechnician ?? []).map((t: { _id: unknown }) => t._id).filter(Boolean);
  const unitIds = (facets.byUnit ?? []).map((u: { _id: unknown }) => u._id).filter(Boolean);

  const [techUsers, units] = await Promise.all([
    techIds.length > 0
      ? UserModel.find({ _id: { $in: techIds } }, '_id name').lean()
      : Promise.resolve([]),
    unitIds.length > 0
      ? UnitModel.find({ _id: { $in: unitIds } }, '_id name').lean()
      : Promise.resolve([]),
  ]);

  const techNameMap = new Map(techUsers.map((u) => [String(u._id), u.name ?? 'Sem nome']));
  const unitNameMap = new Map(units.map((u) => [String(u._id), u.name ?? 'Sem nome']));

  // Totais
  const totalsDoc = (facets.totals ?? [])[0];
  const totalChamadosComSla = totalsDoc?.totalChamados ?? 0;
  const totalBreachedChamados = totalsDoc?.breachedChamados ?? 0;
  const totalResponseBreaches = totalsDoc?.responseBreaches ?? 0;
  const totalResolutionBreaches = totalsDoc?.resolutionBreaches ?? 0;

  // breachRate = chamados com pelo menos 1 breach / total com SLA (sem double-counting)
  const avgBreachRate =
    totalChamadosComSla > 0
      ? Math.round((totalBreachedChamados / totalChamadosComSla) * 10000) / 100
      : 0;

  // --- Transform facets ---

  interface RawGroupDoc {
    _id: unknown;
    totalChamados: number;
    breachedChamados: number;
    responseBreaches: number;
    resolutionBreaches: number;
    avgDelayMs: number | null;
  }

  const byTechnician: BreachByTechnician[] = (facets.byTechnician ?? [])
    .filter((t: RawGroupDoc) => t._id != null && t.breachedChamados > 0)
    .map((t: RawGroupDoc) => ({
      technicianId: String(t._id),
      technicianName: techNameMap.get(String(t._id)) ?? 'Sem atribuição',
      totalChamados: t.totalChamados,
      breachedChamados: t.breachedChamados,
      responseBreaches: t.responseBreaches,
      resolutionBreaches: t.resolutionBreaches,
      avgDelayMinutes: t.avgDelayMs != null ? Math.round(t.avgDelayMs / 60_000) : null,
      breachRate:
        t.totalChamados > 0 ? Math.round((t.breachedChamados / t.totalChamados) * 10000) / 100 : 0,
    }))
    .sort((a: BreachByTechnician, b: BreachByTechnician) => b.breachRate - a.breachRate);

  const byUnit: BreachByUnit[] = (facets.byUnit ?? [])
    .filter((u: RawGroupDoc) => u._id != null && u.breachedChamados > 0)
    .map((u: RawGroupDoc) => ({
      unitId: String(u._id),
      unitName: unitNameMap.get(String(u._id)) ?? 'Sem unidade',
      totalChamados: u.totalChamados,
      breachedChamados: u.breachedChamados,
      responseBreaches: u.responseBreaches,
      resolutionBreaches: u.resolutionBreaches,
      avgDelayMinutes: u.avgDelayMs != null ? Math.round(u.avgDelayMs / 60_000) : null,
      breachRate:
        u.totalChamados > 0 ? Math.round((u.breachedChamados / u.totalChamados) * 10000) / 100 : 0,
    }))
    .sort((a: BreachByUnit, b: BreachByUnit) => b.breachRate - a.breachRate);

  interface RawBreachDoc {
    _id: string;
    total: number;
    responseBreaches: number;
    resolutionBreaches: number;
  }

  const byPriority: BreachByPriority[] = (facets.byPriority ?? []).map((p: RawBreachDoc) => ({
    priority: p._id ?? 'N/A',
    total: p.total,
    responseBreaches: p.responseBreaches,
    resolutionBreaches: p.resolutionBreaches,
  }));

  const byTipoServico: BreachByTipoServico[] = (facets.byTipoServico ?? []).map(
    (t: RawBreachDoc) => ({
      tipoServico: t._id ?? 'Outros',
      total: t.total,
      responseBreaches: t.responseBreaches,
      resolutionBreaches: t.resolutionBreaches,
    }),
  );

  const timeline: BreachTimeline[] = (facets.breachTimeline ?? []).map((t: RawBreachDoc) => ({
    month: t._id,
    total: t.total,
    responseBreaches: t.responseBreaches,
    resolutionBreaches: t.resolutionBreaches,
  }));

  return {
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
    totalChamadosComSla,
    totalBreachedChamados,
    totalResponseBreaches,
    totalResolutionBreaches,
    avgBreachRate,
    byTechnician,
    byUnit,
    byPriority,
    byTipoServico,
    timeline,
  };
}
