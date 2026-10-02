import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { processarLote } from '@/lib/vistoria/sincronizacao';
import { podeVistoriar } from '@/shared/vistoria/vistoria.constants';
import { LoteSincronizacaoSchema } from '@/shared/vistoria/vistoria.schemas';

/**
 * Sobe a fila do celular em lote (spec 0012, AC-5 a AC-10). Rota POST e não
 * Server Action: com sinal fraco, uma ida e volta para 50 operações vale mais
 * que 50 idas. Responde 200 sempre que o corpo é um lote; cada operação traz o
 * próprio resultado. 400 só quando o corpo não é um lote.
 */
export async function POST(req: Request) {
  const sessao = await verifySession();
  if (!sessao) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  if (!podeVistoriar(sessao.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 });
  }
  const lote = LoteSincronizacaoSchema.safeParse(corpo);
  if (!lote.success) return NextResponse.json({ error: 'Lote inválido' }, { status: 400 });

  try {
    await dbConnect();
    const resultados = await processarLote(lote.data.operacoes, {
      userId: sessao.userId,
      role: sessao.role,
    });
    return NextResponse.json({ resultados });
  } catch (e) {
    // O aparelho mantém tudo pendente; o reenvio é seguro (um efeito por clientOpId).
    console.error('[vistoria] sincronizar:', e);
    return NextResponse.json({ error: 'Falha ao sincronizar. Tente de novo.' }, { status: 500 });
  }
}
