import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';

function normalizeExecution(e: {
  _id?: unknown;
  createdByUserId: unknown;
  serviceDescription: string;
  materialsUsed?: string;
  evidencePhotos?: string[];
  notes?: string;
  concludedAt: Date;
}) {
  return {
    _id: e._id ? String(e._id) : null,
    createdByUserId: e.createdByUserId ? String(e.createdByUserId) : null,
    serviceDescription: e.serviceDescription ?? '',
    materialsUsed: e.materialsUsed ?? '',
    evidencePhotos: Array.isArray(e.evidencePhotos) ? e.evidencePhotos : [],
    notes: e.notes ?? '',
    concludedAt: e.concludedAt,
  };
}

function normalizeChamado(
  c: Record<string, unknown> & {
    _id: unknown;
    titulo: string;
    createdAt: Date;
    updatedAt: Date;
    executions?: Array<{
      _id?: unknown;
      createdByUserId: unknown;
      serviceDescription: string;
      materialsUsed?: string;
      evidencePhotos?: string[];
      notes?: string;
      concludedAt: Date;
    }>;
  },
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
    assignedToUserId: c.assignedToUserId ? String(c.assignedToUserId) : null,
    assignedAt: c.assignedAt ?? null,
    concludedAt: c.concludedAt ?? null,
    executions: Array.isArray(c.executions) ? c.executions.map(normalizeExecution) : [],
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/**
 * GET /api/chamados-atribuidos/[id]
 * Retorna um chamado apenas se estiver atribuído ao técnico logado.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  if (session.role !== 'Técnico') {
    return NextResponse.json({ error: 'Acesso restrito a técnicos' }, { status: 403 });
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

  const assignedTo = (chamado as { assignedToUserId?: unknown }).assignedToUserId;
  if (!assignedTo || String(assignedTo) !== session.userId) {
    return NextResponse.json({ error: 'Não autorizado a acessar este chamado' }, { status: 403 });
  }

  return NextResponse.json({
    item: normalizeChamado(chamado as Parameters<typeof normalizeChamado>[0]),
  });
}
