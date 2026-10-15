import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { cartaoDoChamado } from '@/lib/material/leitura';

/**
 * O cartão da cotação de material no chamado (spec 0019): a em trâmite, ou a
 * mais recente, pela visão de quem lê (AC-15). O solicitante recebe só a
 * situação.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await verifySession();
  if (!sessao) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  try {
    await dbConnect();
    const cartao = await cartaoDoChamado(id, { userId: sessao.userId, role: sessao.role });
    if (!cartao) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    return NextResponse.json(cartao, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[material] erro ao ler o cartão:', e);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
