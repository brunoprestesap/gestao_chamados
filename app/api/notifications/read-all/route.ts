import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { NotificationModel } from '@/models/Notification';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST: marca todas as notificações não lidas do usuário como lidas.
 */
export async function POST() {
  const session = await verifySession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  if (!Types.ObjectId.isValid(session.userId)) {
    return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 });
  }

  await dbConnect();
  const userId = new Types.ObjectId(session.userId);
  const result = await NotificationModel.updateMany(
    { userId, readAt: null },
    { $set: { readAt: new Date() } },
  );

  return NextResponse.json({ updated: result.modifiedCount });
}
