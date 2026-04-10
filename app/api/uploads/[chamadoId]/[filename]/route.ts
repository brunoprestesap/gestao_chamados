import fs from 'fs/promises';
import { Types } from 'mongoose';
import { type NextRequest, NextResponse } from 'next/server';
import path from 'path';

import { canManage, verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';

/** Base directory for uploads — must match upload route. */
const UPLOADS_BASE = path.resolve(process.cwd(), 'data', 'uploads', 'chamados');

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ chamadoId: string; filename: string }> },
) {
  try {
    const session = await verifySession();
    if (!session) {
      return new NextResponse('Não autorizado.', { status: 401 });
    }

    const { chamadoId, filename } = await params;

    // Validate chamadoId
    if (!Types.ObjectId.isValid(chamadoId)) {
      return new NextResponse('ID inválido.', { status: 400 });
    }

    // Decode filename and resolve path safely
    const decodedFilename = decodeURIComponent(filename);
    const filePath = path.resolve(UPLOADS_BASE, chamadoId, decodedFilename);

    // Path traversal guard
    const expectedDir = path.resolve(UPLOADS_BASE, chamadoId);
    if (!filePath.startsWith(expectedDir + path.sep) && filePath !== expectedDir) {
      return new NextResponse('Caminho inválido.', { status: 400 });
    }

    // Verify access to chamado
    await dbConnect();
    const chamado = await ChamadoModel.findById(chamadoId)
      .select('solicitanteId assignedToUserId')
      .lean();

    if (!chamado) {
      return new NextResponse('Chamado não encontrado.', { status: 404 });
    }

    const isSolicitante = String(chamado.solicitanteId) === session.userId;
    const isAssignedTech =
      chamado.assignedToUserId && String(chamado.assignedToUserId) === session.userId;
    const isManager = canManage(session.role);

    if (!isSolicitante && !isAssignedTech && !isManager) {
      return new NextResponse('Sem permissão.', { status: 403 });
    }

    // Read and serve file
    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(filePath);
    } catch {
      return new NextResponse('Arquivo não encontrado.', { status: 404 });
    }

    const ext = path.extname(decodedFilename).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(fileBuffer.length),
        'Cache-Control': 'private, max-age=86400',
        'Content-Disposition': contentType === 'application/pdf'
          ? `inline; filename="${decodedFilename}"`
          : 'inline',
      },
    });
  } catch (e) {
    console.error('[uploads] Erro ao servir arquivo:', e);
    return new NextResponse('Erro interno.', { status: 500 });
  }
}
