import { NextResponse } from 'next/server';

import { itemSeletorPorId } from '@/lib/ativos/seletor';
import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';

/**
 * Um ativo no formato do seletor (spec 0011, AC-15), para o `?ativo=<id>` de
 * `/meus-chamados`. Inexistente, `baixado` ou Tier C/D devolve 404, pelas
 * mesmas regras da busca.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const { id } = await params;
  await dbConnect();
  const item = await itemSeletorPorId(id);
  if (!item) {
    return NextResponse.json({ error: 'Equipamento não encontrado.' }, { status: 404 });
  }
  return NextResponse.json({ item });
}
