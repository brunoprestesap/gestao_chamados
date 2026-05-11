import { NextResponse } from 'next/server';

import { requireManager } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { normalizeMaterialObservations } from '@/lib/dto-normalizers';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoListQuerySchema } from '@/shared/chamados/chamado.schemas';

// Projection — only the fields needed by the table/cards UI
const LIST_PROJECTION = {
  ticket_number: 1,
  titulo: 1,
  descricao: 1,
  status: 1,
  solicitanteId: 1,
  unitId: 1,
  localExato: 1,
  tipoServico: 1,
  naturezaAtendimento: 1,
  requestedAttendanceNature: 1,
  attendanceNature: 1,
  grauUrgencia: 1,
  telefoneContato: 1,
  subtypeId: 1,
  catalogServiceId: 1,
  finalPriority: 1,
  classificationNotes: 1,
  classifiedByUserId: 1,
  classifiedAt: 1,
  assignedToUserId: 1,
  assignedAt: 1,
  assignedByUserId: 1,
  slaPausedAt: 1,
  totalPausedMinutes: 1,
  pauseReason: 1,
  pauseDetails: 1,
  materialObservations: 1,
  sla: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

function normalizeSla(sla: Record<string, unknown> | null | undefined) {
  if (!sla || typeof sla !== 'object') return null;
  return {
    priority: (sla.priority as string) ?? null,
    responseTargetMinutes:
      typeof sla.responseTargetMinutes === 'number' ? sla.responseTargetMinutes : null,
    resolutionTargetMinutes:
      typeof sla.resolutionTargetMinutes === 'number' ? sla.resolutionTargetMinutes : null,
    businessHoursOnly: typeof sla.businessHoursOnly === 'boolean' ? sla.businessHoursOnly : null,
    responseDueAt: sla.responseDueAt ? new Date(sla.responseDueAt as Date).toISOString() : null,
    resolutionDueAt: sla.resolutionDueAt
      ? new Date(sla.resolutionDueAt as Date).toISOString()
      : null,
    responseStartedAt: sla.responseStartedAt
      ? new Date(sla.responseStartedAt as Date).toISOString()
      : null,
    resolvedAt: sla.resolvedAt ? new Date(sla.resolvedAt as Date).toISOString() : null,
    responseBreachedAt: sla.responseBreachedAt
      ? new Date(sla.responseBreachedAt as Date).toISOString()
      : null,
    resolutionBreachedAt: sla.resolutionBreachedAt
      ? new Date(sla.resolutionBreachedAt as Date).toISOString()
      : null,
    computedAt: sla.computedAt ? new Date(sla.computedAt as Date).toISOString() : null,
    configVersion: (sla.configVersion as string) ?? null,
  };
}

function normalizeChamado(
  c: Record<string, unknown> & { _id: unknown; titulo: string; createdAt: Date; updatedAt: Date },
) {
  return {
    _id: String(c._id),
    ticket_number: c.ticket_number ?? '',
    titulo: c.titulo,
    descricao: c.descricao ?? '',
    status: c.status,
    solicitanteId: c.solicitanteId ? String(c.solicitanteId) : null,
    unitId: c.unitId ? String(c.unitId) : null,
    localExato: c.localExato ?? '',
    tipoServico: c.tipoServico ?? '',
    naturezaAtendimento: c.naturezaAtendimento ?? '',
    requestedAttendanceNature: c.requestedAttendanceNature ?? null,
    attendanceNature: c.attendanceNature ?? null,
    grauUrgencia: c.grauUrgencia ?? 'Normal',
    telefoneContato: c.telefoneContato ?? '',
    subtypeId: c.subtypeId ? String(c.subtypeId) : null,
    catalogServiceId: c.catalogServiceId ? String(c.catalogServiceId) : null,
    finalPriority: c.finalPriority ?? null,
    classificationNotes: c.classificationNotes ?? '',
    classifiedByUserId: c.classifiedByUserId ? String(c.classifiedByUserId) : null,
    classifiedAt: c.classifiedAt ?? null,
    assignedToUserId: c.assignedToUserId
      ? String(
          typeof c.assignedToUserId === 'object' &&
            (c.assignedToUserId as Record<string, unknown>)._id
            ? (c.assignedToUserId as Record<string, unknown>)._id
            : c.assignedToUserId,
        )
      : null,
    assignedToUserName:
      c.assignedToUserId &&
      typeof c.assignedToUserId === 'object' &&
      (c.assignedToUserId as Record<string, unknown>).name
        ? String((c.assignedToUserId as Record<string, unknown>).name)
        : null,
    assignedAt: c.assignedAt ?? null,
    assignedByUserId: c.assignedByUserId ? String(c.assignedByUserId) : null,
    slaPausedAt: c.slaPausedAt
      ? new Date(c.slaPausedAt as string | number | Date).toISOString()
      : null,
    totalPausedMinutes:
      typeof c.totalPausedMinutes === 'number' ? c.totalPausedMinutes : 0,
    pauseReason: (c.pauseReason as string) ?? null,
    pauseDetails: (c.pauseDetails as string) ?? null,
    materialObservations: normalizeMaterialObservations(c.materialObservations),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    sla: normalizeSla(c.sla as Record<string, unknown> | null | undefined),
  };
}

/**
 * GET /api/gestao/chamados
 * Lista chamados paginados. Filtros: q (busca livre), status, page, limit.
 * Apenas Admin ou Preposto.
 */
export async function GET(req: Request) {
  await requireManager();
  await dbConnect();

  const url = new URL(req.url);
  const parsed = ChamadoListQuerySchema.safeParse({
    q: url.searchParams.get('q') ?? '',
    status: url.searchParams.get('status') ?? 'all',
    page: url.searchParams.get('page') ?? '1',
    limit: url.searchParams.get('limit') ?? '20',
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { q, status, page, limit } = parsed.data;
  const filter: Record<string, unknown> = {};

  if (status !== 'all') {
    filter.status = status.length === 1 ? status[0] : { $in: status };
  }

  if (q.trim()) {
    const term = q.trim();
    const regex = { $regex: term, $options: 'i' as const };
    filter.$or = [
      { ticket_number: regex },
      { titulo: regex },
      { descricao: regex },
      { localExato: regex },
      { tipoServico: regex },
    ];
  }

  const skip = (page - 1) * limit;

  // Run count and paginated query in parallel
  const [total, items] = await Promise.all([
    ChamadoModel.countDocuments(filter),
    ChamadoModel.find(filter, LIST_PROJECTION)
      .populate('assignedToUserId', 'name')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const totalPages = Math.ceil(total / limit);

  return NextResponse.json({
    items: items.map(normalizeChamado),
    pagination: { page, limit, total, totalPages },
  });
}
