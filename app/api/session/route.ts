import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';

export async function GET() {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  return NextResponse.json({
    userId: session.userId,
    username: session.username,
    role: session.role,
    unitId: session.unitId ?? null,
    isActive: session.isActive,
  });
}
