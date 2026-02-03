import { NextResponse } from 'next/server';

import { auth } from '@/auth';

/**
 * Valida a sessão a partir dos cookies da request (usado pelo socket-server).
 * Retorna { userId, username, role, unitId, isActive } ou 401.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  return NextResponse.json({
    userId: session.user.id,
    username: session.user.username ?? '',
    role: session.user.role,
    unitId: session.user.unitId ?? null,
    isActive: session.user.isActive,
  });
}
