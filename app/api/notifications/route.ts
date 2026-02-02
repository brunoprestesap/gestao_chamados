import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { NotificationModel } from '@/models/Notification';
import { Types } from 'mongoose';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET: últimas 20 notificações do usuário logado.
 */
export async function GET() {
  const session = await verifySession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  await dbConnect();
  const userId = new Types.ObjectId(session.userId);
  const list = await NotificationModel.find({ userId }).sort({ createdAt: -1 }).limit(20).lean();

  return NextResponse.json(list);
}
