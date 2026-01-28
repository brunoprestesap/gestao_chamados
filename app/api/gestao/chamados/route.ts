import { NextResponse } from 'next/server';

import { requireManager } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoListQuerySchema } from '@/shared/chamados/chamado.schemas';

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
      { grauUrgencia: regex },
      { telefoneContato: regex },
      { classificationNotes: regex },
    ];
  }

  const items = await ChamadoModel.find(filter).sort({ updatedAt: -1 }).lean();

  return NextResponse.json({ items: items.map(normalizeChamado) });
}
