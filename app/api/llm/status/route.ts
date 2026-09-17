import { NextResponse } from 'next/server';

import { isAdmin, verifySession } from '@/lib/dal';
import { getLlmStatus } from '@/lib/llm';

// Estado em memória (limitador, disjuntor) e Mongoose exigem Node.js.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Saúde da integração com a IA local (spec 0001, AC-12). Só Admin.
 * A guarda fica no handler (o proxy ignora /api) e responde JSON em vez de
 * redirecionar como `requireAdmin()`.
 */
export async function GET() {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  if (!isAdmin(session.role)) {
    return NextResponse.json({ error: 'Apenas usuário Admin' }, { status: 403 });
  }

  const status = await getLlmStatus();
  return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
}
