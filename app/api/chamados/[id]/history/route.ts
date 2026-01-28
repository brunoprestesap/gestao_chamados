import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';

function normalizeHistoryItem(h: {
  _id: unknown;
  chamadoId: unknown;
  userId: unknown;
  action: string;
  statusAnterior?: string | null;
  statusNovo?: string | null;
  observacoes?: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    _id: String(h._id),
    chamadoId: String(h.chamadoId),
    userId: String(h.userId),
    action: h.action,
    statusAnterior: h.statusAnterior ?? null,
    statusNovo: h.statusNovo ?? null,
    observacoes: h.observacoes ?? '',
    createdAt: h.createdAt,
    updatedAt: h.updatedAt,
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

  // Verifica se o chamado existe e se o usuário tem permissão
  const chamado = await ChamadoModel.findById(id).lean();
  if (!chamado) {
    return NextResponse.json({ error: 'Chamado não encontrado' }, { status: 404 });
  }

  const isOwner = String(chamado.solicitanteId) === session.userId;
  const canManage = session.role === 'Admin' || session.role === 'Preposto';

  if (!isOwner && !canManage) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
  }

  // Busca o histórico do chamado ordenado por data (mais recente primeiro)
  const history = await ChamadoHistoryModel.find({ chamadoId: new Types.ObjectId(id) })
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ items: history.map(normalizeHistoryItem) });
}
