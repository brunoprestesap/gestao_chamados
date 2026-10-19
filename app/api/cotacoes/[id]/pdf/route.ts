import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { gerarPdfCotacao } from '@/lib/material/pdf/gerar';

// `@react-pdf/renderer`, `node:crypto`, a trava em memória e o Mongoose exigem Node.js.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PDF da cotação de material (spec 0019, AC-23), só para o lado TRF1. A
 * guarda fica no handler (o proxy ignora /api); quem pode ver sai da mesma
 * `visaoDe` da tela, e cada emissão grava o SHA-256 dos bytes.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const { id } = await params;
  await dbConnect();
  const r = await gerarPdfCotacao({
    cotacaoId: id,
    sessao: { userId: session.userId, role: session.role },
  });
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
