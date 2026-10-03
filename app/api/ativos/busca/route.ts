import { NextResponse } from 'next/server';

import { podeVerDocumentos } from '@/lib/ativos/documentos/permissao';
import { buscarAtivosSeletor, FILTRO_RECEBE_DOCUMENTO } from '@/lib/ativos/seletor';
import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { BuscaSeletorSchema } from '@/shared/ativos/ativo.schemas';

/**
 * Busca do seletor "Equipamento" (spec 0011, AC-14): só Tier A ou B, nunca `baixado`.
 * Com `escopo=documentos` (spec 0013), qualquer tier, ainda sem `baixado`, e só
 * para quem lê documentos.
 */
export async function GET(req: Request) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const parsed = BuscaSeletorSchema.safeParse({
    q: sp.get('q') ?? '',
    limite: sp.get('limite') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Busca inválida.' },
      { status: 400 },
    );
  }

  const paraDocumentos = sp.get('escopo') === 'documentos';
  if (paraDocumentos && !podeVerDocumentos(session.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  await dbConnect();
  const items = await buscarAtivosSeletor(
    parsed.data.q,
    parsed.data.limite,
    paraDocumentos ? FILTRO_RECEBE_DOCUMENTO : undefined,
  );
  return NextResponse.json({ items });
}
