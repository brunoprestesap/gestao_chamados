import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { type ChamadoCommentDoc,ChamadoCommentModel } from '@/models/ChamadoComment';

const MAX_COMMENTS = 200;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  await dbConnect();

  const { id } = await params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const chamado = await ChamadoModel.findById(new Types.ObjectId(id))
    .select('solicitanteId assignedToUserId')
    .lean();
  if (!chamado) {
    return NextResponse.json({ error: 'Chamado não encontrado' }, { status: 404 });
  }

  const isOwner = String(chamado.solicitanteId) === session.userId;
  const isManager = session.role === 'Admin' || session.role === 'Preposto';
  const isAssigned =
    chamado.assignedToUserId && String(chamado.assignedToUserId) === session.userId;

  if (!isOwner && !isManager && !isAssigned) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
  }

  const visibilityFilter =
    session.role === 'Solicitante' ? { visibility: 'publico' } : {};

  const comments = await ChamadoCommentModel.find({
    chamadoId: new Types.ObjectId(id),
    ...visibilityFilter,
  })
    .sort({ createdAt: 1 })
    .limit(MAX_COMMENTS)
    .populate('userId', 'name username')
    .lean<Array<ChamadoCommentDoc & { userId: { _id: Types.ObjectId; name?: string; username?: string } }>>();

  const items = comments.map((c) => ({
    _id: String(c._id),
    chamadoId: String(c.chamadoId),
    userId: String(c.userId._id),
    userName: c.userId.name ?? 'Usuário desconhecido',
    userUsername: c.userId.username ?? '',
    content: c.content,
    visibility: c.visibility,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  return NextResponse.json({ items });
}
