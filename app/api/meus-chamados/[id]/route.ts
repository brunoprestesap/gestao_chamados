import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { hasValidEvaluation } from '@/shared/chamados/evaluation.utils';

function normalizeChamado(
  c: Record<string, unknown> & {
    _id: unknown;
    titulo: string;
    descricao?: string;
    status: string;
    solicitanteId: unknown;
    createdAt: Date;
    updatedAt: Date;
  },
) {
  const ev = c.evaluation as
    | {
        rating?: number | null;
        notes?: string | null;
        createdAt?: Date | null;
        createdByUserId?: unknown;
      }
    | null
    | undefined;
  const evaluation =
    ev && hasValidEvaluation(ev)
      ? {
          rating: ev.rating ?? null,
          notes: ev.notes ?? null,
          createdAt: ev.createdAt ?? null,
          createdByUserId: ev.createdByUserId ? String(ev.createdByUserId) : null,
        }
      : null;

  const sla = c.sla as Record<string, unknown> | null | undefined;
  const slaNormalized =
    sla && typeof sla === 'object'
      ? {
          priority: (sla.priority as string) ?? null,
          responseTargetMinutes:
            typeof sla.responseTargetMinutes === 'number' ? sla.responseTargetMinutes : null,
          resolutionTargetMinutes:
            typeof sla.resolutionTargetMinutes === 'number' ? sla.resolutionTargetMinutes : null,
          businessHoursOnly:
            typeof sla.businessHoursOnly === 'boolean' ? sla.businessHoursOnly : null,
          responseDueAt: sla.responseDueAt
            ? new Date(sla.responseDueAt as Date).toISOString()
            : null,
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
        }
      : null;

  return {
    _id: String(c._id),
    ticket_number: (c.ticket_number as string) ?? '',
    titulo: c.titulo,
    descricao: (c.descricao as string) ?? '',
    status: c.status,
    solicitanteId: c.solicitanteId ? String(c.solicitanteId) : null,
    unitId: c.unitId ? String(c.unitId) : null,
    assignedToUserId: c.assignedToUserId ? String(c.assignedToUserId) : null,
    localExato: (c.localExato as string) ?? '',
    tipoServico: (c.tipoServico as string) ?? '',
    naturezaAtendimento: (c.naturezaAtendimento as string) ?? '',
    requestedAttendanceNature: (c.requestedAttendanceNature as string) ?? null,
    attendanceNature: (c.attendanceNature as string) ?? null,
    grauUrgencia: (c.grauUrgencia as string) ?? 'Normal',
    telefoneContato: (c.telefoneContato as string) ?? '',
    subtypeId: c.subtypeId ? String(c.subtypeId) : null,
    catalogServiceId: c.catalogServiceId ? String(c.catalogServiceId) : null,
    finalPriority: (c.finalPriority as string | null) ?? null,
    classifiedAt: (c.classifiedAt as Date | null) ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    closedAt: (c.closedAt as Date | null | undefined) ?? null,
    closedByUserId: c.closedByUserId ? String(c.closedByUserId) : null,
    closureNotes: (c.closureNotes as string | null | undefined) ?? null,
    evaluation,
    sla: slaNormalized,
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  await dbConnect();

  const { id } = await params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const chamado = await ChamadoModel.findById(id).lean();

  if (!chamado) {
    return NextResponse.json({ error: 'Chamado não encontrado' }, { status: 404 });
  }

  // Verifica se o usuário tem permissão (solicitante ou admin/preposto)
  const isOwner = String(chamado.solicitanteId) === session.userId;
  const canManage = session.role === 'Admin' || session.role === 'Preposto';

  if (!isOwner && !canManage) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
  }

  return NextResponse.json({ item: normalizeChamado(chamado) });
}
