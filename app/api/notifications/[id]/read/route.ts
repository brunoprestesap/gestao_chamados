import { NextResponse } from 'next/server';
import { Types } from 'mongoose';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { NotificationModel } from '@/models/Notification';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST: marca a notificação como lida (readAt = now).
 * Apenas do usuário logado (dono da notificação).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const { id } = await params;
  if (!id || !Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  await dbConnect();
  const userId = new Types.ObjectId(session.userId);
  const now = new Date();
  const updated = await NotificationModel.findOneAndUpdate(
    { _id: id, userId },
    { $set: { readAt: now } },
    { new: true },
  ).lean();

  if (!updated) {
    return NextResponse.json({ error: 'Notificação não encontrada' }, { status: 404 });
  }

  return NextResponse.json(updated);
}
