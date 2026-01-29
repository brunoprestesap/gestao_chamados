import { NextResponse } from 'next/server';

import { dbConnect } from '@/lib/db';
import { verifySession } from '@/lib/dal';
import { UserModel } from '@/models/user.model';

export async function GET() {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  await dbConnect();
  const user = await UserModel.findById(session.userId).select('name').lean();

  return NextResponse.json({
    userId: session.userId,
    username: session.username,
    name: user?.name ?? session.username,
    role: session.role,
    unitId: session.unitId ?? null,
    isActive: session.isActive,
  });
}
