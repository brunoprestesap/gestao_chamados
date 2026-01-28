import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';

function normalizeChamado(c: {
  _id: unknown;
  ticket_number?: string;
  titulo: string;
  descricao?: string;
  status: string;
  solicitanteId: unknown;
  unitId?: unknown;
  localExato?: string;
  tipoServico?: string;
  naturezaAtendimento?: string;
  grauUrgencia?: string;
  telefoneContato?: string;
  subtypeId?: unknown;
  catalogServiceId?: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
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
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
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
