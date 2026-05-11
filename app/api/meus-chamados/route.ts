import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { generateTicketNumber } from '@/lib/chamado-utils';
import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { normalizeMaterialObservations } from '@/lib/dto-normalizers';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { toAttendanceNature } from '@/shared/chamados/chamado.constants';
import { ChamadoCreateSchema, ChamadoListQuerySchema } from '@/shared/chamados/chamado.schemas';
import { hasValidEvaluation } from '@/shared/chamados/evaluation.utils';

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
  evaluation: 1,
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

  const assignedRaw = c.assignedToUserId;
  const assignedToUserId = assignedRaw
    ? String(
        typeof assignedRaw === 'object' &&
          (assignedRaw as Record<string, unknown>)._id
          ? (assignedRaw as Record<string, unknown>)._id
          : assignedRaw,
      )
    : null;
  const assignedToUserName =
    assignedRaw &&
    typeof assignedRaw === 'object' &&
    (assignedRaw as Record<string, unknown>).name
      ? String((assignedRaw as Record<string, unknown>).name)
      : null;

  return {
    _id: String(c._id),
    ticket_number: (c.ticket_number as string) ?? '',
    titulo: c.titulo,
    descricao: (c.descricao as string) ?? '',
    status: c.status,
    solicitanteId: c.solicitanteId ? String(c.solicitanteId) : null,
    unitId: c.unitId ? String(c.unitId) : null,
    assignedToUserId,
    assignedToUserName,
    assignedAt: c.assignedAt ?? null,
    assignedByUserId: c.assignedByUserId ? String(c.assignedByUserId) : null,
    localExato: (c.localExato as string) ?? '',
    tipoServico: (c.tipoServico as string) ?? '',
    naturezaAtendimento: (c.naturezaAtendimento as string) ?? '',
    requestedAttendanceNature: (c.requestedAttendanceNature as string) ?? null,
    attendanceNature: (c.attendanceNature as string) ?? null,
    grauUrgencia: (c.grauUrgencia as string) ?? 'Normal',
    telefoneContato: (c.telefoneContato as string) ?? '',
    subtypeId: c.subtypeId ? String(c.subtypeId) : null,
    catalogServiceId: c.catalogServiceId ? String(c.catalogServiceId) : null,
    finalPriority: (c.finalPriority as string) ?? null,
    classificationNotes: (c.classificationNotes as string) ?? '',
    classifiedByUserId: c.classifiedByUserId ? String(c.classifiedByUserId) : null,
    classifiedAt: c.classifiedAt ?? null,
    slaPausedAt: c.slaPausedAt
      ? new Date(c.slaPausedAt as string | number | Date).toISOString()
      : null,
    totalPausedMinutes:
      typeof c.totalPausedMinutes === 'number' ? c.totalPausedMinutes : 0,
    pauseReason: (c.pauseReason as string) ?? null,
    pauseDetails: (c.pauseDetails as string) ?? null,
    materialObservations: normalizeMaterialObservations(c.materialObservations),
    sla: normalizeSla(c.sla as Record<string, unknown> | null | undefined),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    evaluation,
  };
}

export async function GET(req: Request) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
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
  const filter: Record<string, unknown> = {
    solicitanteId: new Types.ObjectId(session.userId),
  };

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

export async function POST(req: Request) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  await dbConnect();

  const body = await req.json().catch(() => ({}));
  const parsed = ChamadoCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Gera título automático se não fornecido
  const titulo =
    data.titulo ||
    `${data.tipoServico}${data.localExato ? ` — ${data.localExato}` : ''}${data.naturezaAtendimento === 'Urgente' ? ' [URGENTE]' : ''}`;

  // Gera número único do ticket
  const ticket_number = await generateTicketNumber();

  if (!ticket_number || ticket_number.trim() === '') {
    return NextResponse.json({ error: 'Falha ao gerar número do ticket' }, { status: 500 });
  }

  console.warn('Gerando ticket_number:', ticket_number);

  // Prepara os dados do chamado (natureza SOLICITADA apenas informativa)
  const chamadoData = {
    ticket_number: ticket_number.trim(),
    titulo,
    descricao: data.descricao,
    unitId: new Types.ObjectId(data.unitId),
    localExato: data.localExato,
    tipoServico: data.tipoServico,
    naturezaAtendimento: data.naturezaAtendimento,
    requestedAttendanceNature: toAttendanceNature(data.naturezaAtendimento),
    grauUrgencia: data.grauUrgencia,
    telefoneContato: data.telefoneContato ?? '',
    subtypeId: new Types.ObjectId(data.subtypeId),
    catalogServiceId: new Types.ObjectId(data.catalogServiceId),
    status: 'aberto' as const,
    solicitanteId: new Types.ObjectId(session.userId),
  };

  console.warn('Dados do chamado a serem criados:', {
    ...chamadoData,
    solicitanteId: String(chamadoData.solicitanteId),
    unitId: String(chamadoData.unitId),
  });

  const doc = await ChamadoModel.create(chamadoData);

  // Cria registro de histórico para auditoria
  await ChamadoHistoryModel.create({
    chamadoId: doc._id,
    userId: new Types.ObjectId(session.userId),
    action: 'abertura',
    statusAnterior: null,
    statusNovo: 'aberto',
    observacoes: `Chamado criado: ${titulo}`,
  });

  const docObject = doc.toObject();
  console.warn('Chamado criado com sucesso:', {
    _id: docObject._id,
    ticket_number: docObject.ticket_number,
  });

  return NextResponse.json(normalizeChamado(docObject), { status: 201 });
}
