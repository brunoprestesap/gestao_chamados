import { NextResponse } from 'next/server';

import { requireManager } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoListQuerySchema } from '@/shared/chamados/chamado.schemas';

function normalizeSla(sla: Record<string, unknown> | null | undefined): {
  priority: string | null;
  responseTargetMinutes: number | null;
  resolutionTargetMinutes: number | null;
  businessHoursOnly: boolean | null;
  responseDueAt: string | null;
  resolutionDueAt: string | null;
  responseStartedAt: string | null;
  resolvedAt: string | null;
  responseBreachedAt: string | null;
  resolutionBreachedAt: string | null;
  computedAt: string | null;
  configVersion: string | null;
} | null {
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
    assignedToUserId: c.assignedToUserId ? String(c.assignedToUserId) : null,
    assignedAt: c.assignedAt ?? null,
    assignedByUserId: c.assignedByUserId ? String(c.assignedByUserId) : null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    sla: normalizeSla(c.sla as Record<string, unknown> | null | undefined),
  };
}

/**
 * GET /api/gestao/chamados
 * Lista chamados (todos os status). Filtros: q (busca livre), status.
 * Apenas Admin ou Preposto.
 */
export async function GET(req: Request) {
  await requireManager();
  await dbConnect();

  const url = new URL(req.url);
  const parsed = ChamadoListQuerySchema.safeParse({
    q: url.searchParams.get('q') ?? '',
    status: url.searchParams.get('status') ?? 'all',
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { q, status } = parsed.data;
  const filter: Record<string, unknown> = {};

  if (status !== 'all') filter.status = status;

  if (q.trim()) {
    const term = q.trim();
    const regex = { $regex: term, $options: 'i' as const };
    filter.$or = [
      { ticket_number: regex },
      { titulo: regex },
      { descricao: regex },
      { localExato: regex },
      { tipoServico: regex },
      { naturezaAtendimento: regex },
      { requestedAttendanceNature: regex },
      { attendanceNature: regex },
      { grauUrgencia: regex },
      { telefoneContato: regex },
      { classificationNotes: regex },
    ];
  }

  const items = await ChamadoModel.find(filter).sort({ updatedAt: -1 }).lean();

  return NextResponse.json({ items: items.map(normalizeChamado) });
}
