import fs from 'fs/promises';
import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { caminhoDoArquivo } from '@/lib/ativos/documentos/arquivo';
import { podeVerDocumentos } from '@/lib/ativos/documentos/permissao';
import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { DocumentoAtivoModel } from '@/models/DocumentoAtivo';

type ArquivoLean = {
  situacao: string;
  arquivo: { filename: string; originalName: string; mimeType: string };
};

/** `filename*` em UTF-8 e um `filename` ASCII de reserva. */
function contentDisposition(nome: string, mime: string): string {
  const ascii = nome.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const tipo = mime === 'application/pdf' || mime.startsWith('image/') ? 'inline' : 'attachment';
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}

/** Download do arquivo do documento (spec 0013, AC-10): Admin, Preposto e Técnico. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await verifySession();
  if (!sessao) return new NextResponse('Não autorizado.', { status: 401 });
  if (!podeVerDocumentos(sessao.role)) return new NextResponse('Sem permissão.', { status: 403 });

  const { id } = await params;
  if (!Types.ObjectId.isValid(id))
    return new NextResponse('Documento não encontrado.', { status: 404 });

  try {
    await dbConnect();
    const doc = await DocumentoAtivoModel.findById(id)
      .select('situacao arquivo')
      .lean<ArquivoLean>();
    if (!doc || doc.situacao === 'excluido') {
      return new NextResponse('Documento não encontrado.', { status: 404 });
    }

    const caminho = caminhoDoArquivo(id, doc.arquivo.filename);
    if (!caminho) return new NextResponse('Documento não encontrado.', { status: 404 });

    let conteudo: Buffer;
    try {
      conteudo = await fs.readFile(caminho);
    } catch {
      return new NextResponse('Arquivo não encontrado.', { status: 404 });
    }

    return new NextResponse(new Uint8Array(conteudo), {
      status: 200,
      headers: {
        'Content-Type': doc.arquivo.mimeType,
        'Content-Length': String(conteudo.length),
        'Content-Disposition': contentDisposition(doc.arquivo.originalName, doc.arquivo.mimeType),
        // Nunca do cache: em computador compartilhado, outro perfil (ou um
        // documento já excluído) abriria o arquivo sem passar pela checagem.
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    console.error('[documentos] erro ao servir arquivo:', e);
    return new NextResponse('Erro interno.', { status: 500 });
  }
}
