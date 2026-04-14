import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { UnitModel } from '@/models/unit';
import { ChamadoListQuerySchema } from '@/shared/chamados/chamado.schemas';

// Projection — only the fields needed by the listing UI
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
  assignedToUserId: 1,
  assignedAt: 1,
  slaPausedAt: 1,
  pauseReason: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

function normalizeChamado(
  c: Record<string, unknown> & { _id: unknown; titulo: string; createdAt: Date; updatedAt: Date },
  unitNames: Map<string, string>,
) {
  const unitId = c.unitId ? String(c.unitId) : null;
  return {
    _id: String(c._id),
    ticket_number: c.ticket_number ?? '',
    titulo: c.titulo,
    descricao: c.descricao ?? '',
    status: c.status,
    solicitanteId: c.solicitanteId ? String(c.solicitanteId) : null,
    unitId,
    unitName: unitId ? (unitNames.get(unitId) ?? null) : null,
    localExato: c.localExato ?? '',
    tipoServico: c.tipoServico ?? '',
    naturezaAtendimento: c.naturezaAtendimento ?? '',
    requestedAttendanceNature: c.requestedAttendanceNature ?? null,
    attendanceNature: c.attendanceNature ?? null,
    grauUrgencia: c.grauUrgencia ?? 'Normal',
    telefoneContato: c.telefoneContato ?? '',
    subtypeId: c.subtypeId ? String(c.subtypeId) : null,
    catalogServiceId: c.catalogServiceId ? String(c.catalogServiceId) : null,
    assignedToUserId: c.assignedToUserId ? String(c.assignedToUserId) : null,
    assignedAt: c.assignedAt ?? null,
    slaPausedAt: c.slaPausedAt
      ? new Date(c.slaPausedAt as string | number | Date).toISOString()
      : null,
    pauseReason: (c.pauseReason as string) ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/**
 * GET /api/chamados-atribuidos
 * Lista chamados atribuídos ao técnico logado (paginado). Apenas role Técnico.
 */
export async function GET(req: Request) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  if (session.role !== 'Técnico') {
    return NextResponse.json({ error: 'Acesso restrito a técnicos' }, { status: 403 });
  }
  await dbConnect();

  const url = new URL(req.url);
  const parsed = ChamadoListQuerySchema.safeParse({
    q: url.searchParams.get('q') ?? '',
    status: url.searchParams.get('status') ?? 'all',
    page: url.searchParams.get('page') ?? '1',
    limit: url.searchParams.get('limit') ?? '10',
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { q, status, page, limit } = parsed.data;
  const filter: Record<string, unknown> = {
    assignedToUserId: new Types.ObjectId(session.userId),
  };

  if (status !== 'all') filter.status = status;

  if (q.trim()) {
    const term = q.trim();
    const regex = { $regex: term, $options: 'i' as const };
    filter.$or = [
      { ticket_number: regex },
      { titulo: regex },
      { descricao: regex },
      { localExato: regex },
    ];
  }

  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    ChamadoModel.countDocuments(filter),
    ChamadoModel.find(filter, LIST_PROJECTION)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  // Resolve unit names for the page
  const unitIds = [...new Set(items.map((c) => c.unitId).filter(Boolean))] as Types.ObjectId[];
  const unitNames = new Map<string, string>();
  if (unitIds.length > 0) {
    const units = await UnitModel.find({ _id: { $in: unitIds } })
      .select('_id name')
      .lean();
    units.forEach((u) => unitNames.set(String(u._id), u.name));
  }

  const totalPages = Math.ceil(total / limit);

  return NextResponse.json({
    items: items.map((c) => normalizeChamado(c, unitNames)),
    pagination: { page, limit, total, totalPages },
  });
}
