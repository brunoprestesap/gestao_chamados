import { NextResponse } from 'next/server';

import { gerarPdfContrato } from '@/lib/contratos/pdf/gerar';
import { isAdmin, verifySession } from '@/lib/dal';
import { PedidoPdfContratoSchema } from '@/shared/contratos/contrato.schemas';

// `@react-pdf/renderer`, `node:crypto`, a trava em memória e o Mongoose exigem Node.js.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PDF do relatório por contrato (spec 0016, AC-16 a AC-20). Só Admin; a
 * guarda fica no handler (o proxy ignora /api) e vem antes de qualquer
 * leitura. O servidor recalcula tudo: nenhum número vem da tela.
 */
export async function POST(request: Request) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  if (!isAdmin(session.role)) {
    return NextResponse.json({ error: 'Apenas usuário Admin' }, { status: 403 });
  }

  const corpo: unknown = await request.json().catch(() => null);
  const parsed = PedidoPdfContratoSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Pedido inválido.' },
      { status: 400 },
    );
  }

  const r = await gerarPdfContrato({ ...parsed.data, userId: session.userId });
  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: r.status });
  }

  return new Response(new Uint8Array(r.bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${r.nomeArquivo}"`,
      'Content-Length': String(r.bytes.length),
      'Cache-Control': 'no-store',
      'X-Emissao-Id': r.emissaoId,
    },
  });
}
