import fs from 'fs/promises';
import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { arquivoParaBaixar } from '@/lib/material/arquivos';

/** `filename*` em UTF-8 e um `filename` ASCII de reserva; sempre anexo. */
function contentDisposition(nome: string): string {
  const ascii = nome.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}

/**
 * Download de arquivo da cotação de material (spec 0019, AC-15): lado TRF1 e
 * responsável técnico baixam tudo; o técnico atribuído só evidência; o
 * solicitante nada. Sempre como anexo e com `nosniff`.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ arquivoId: string }> }) {
  const sessao = await verifySession();
  if (!sessao) return new NextResponse('Não autorizado.', { status: 401 });
  const { arquivoId } = await params;
  try {
    await dbConnect();
    const r = await arquivoParaBaixar(arquivoId, { userId: sessao.userId, role: sessao.role });
    if (!r.ok) {
      return new NextResponse(r.status === 403 ? 'Sem permissão.' : 'Arquivo não encontrado.', {
        status: r.status,
      });
    }
    let conteudo: Buffer;
    try {
      conteudo = await fs.readFile(r.caminho);
    } catch {
      return new NextResponse('Arquivo não encontrado.', { status: 404 });
    }
    return new NextResponse(new Uint8Array(conteudo), {
      status: 200,
      headers: {
        'Content-Type': r.mimeType,
        'Content-Length': String(conteudo.length),
        'Content-Disposition': contentDisposition(r.nomeOriginal),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    console.error('[material] erro ao servir arquivo:', e);
    return new NextResponse('Erro interno.', { status: 500 });
  }
}
