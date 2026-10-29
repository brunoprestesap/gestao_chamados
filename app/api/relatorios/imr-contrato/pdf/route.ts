import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { gerarPdfImr } from '@/lib/imr-contrato/pdf/gerar';
import { PedidoPdfImrSchema } from '@/shared/imr-contrato/imr-contrato.schemas';

// `@react-pdf/renderer`, `node:crypto`, a trava em memória e o Mongoose exigem Node.js.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PDF do fechamento vigente do IMR do contrato (spec 0023, AC-13, AC-14).
 * Admin, fiscal e gestor; a guarda fica no handler (o proxy ignora /api) e
 * vem antes de qualquer leitura. O PDF sai só da foto gravada.
 */
export async function POST(request: Request) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const corpo: unknown = await request.json().catch(() => null);
  const parsed = PedidoPdfImrSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Pedido inválido.' },
      { status: 400 },
    );
  }

  const r = await gerarPdfImr({ ...parsed.data, sessao: session });
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
