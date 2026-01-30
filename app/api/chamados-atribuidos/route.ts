import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { UnitModel } from '@/models/unit';
import { ChamadoListQuerySchema } from '@/shared/chamados/chamado.schemas';

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
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/**
 * GET /api/chamados-atribuidos
 * Lista chamados atribuídos ao técnico logado. Apenas role Técnico.
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
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { q, status } = parsed.data;
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

  const items = await ChamadoModel.find(filter).sort({ updatedAt: -1 }).lean();

  const unitIds = [...new Set(items.map((c) => c.unitId).filter(Boolean))] as Types.ObjectId[];
  const unitNames = new Map<string, string>();
  if (unitIds.length > 0) {
    const units = await UnitModel.find({ _id: { $in: unitIds } })
      .select('_id name')
      .lean();
    units.forEach((u) => unitNames.set(String(u._id), u.name));
  }

  return NextResponse.json({
    items: items.map((c) => normalizeChamado(c, unitNames)),
  });
}
