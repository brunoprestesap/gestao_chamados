import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { papeisDe } from '@/lib/material/papeis';
import { UserModel } from '@/models/user.model';

export async function GET() {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  await dbConnect();
  const user = await UserModel.findById(session.userId).select('name').lean();
  // Cotação de material (spec 0019): o menu mostra a fila a quem tem designação vigente.
  const papeis = await papeisDe(session.userId, session.role);

  return NextResponse.json({
    userId: session.userId,
    username: session.username,
    name: user?.name ?? session.username,
    role: session.role,
    unitId: session.unitId ?? null,
    isActive: session.isActive,
    designacaoMaterial: papeis.designacoes.length > 0,
  });
}
