import fs from 'fs/promises';
import { Types } from 'mongoose';
import { type NextRequest, NextResponse } from 'next/server';
import path from 'path';

import { canManage, verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { AttachmentModel } from '@/models/Attachment';
import { ChamadoModel } from '@/models/Chamado';
import {
  ALLOWED_MIME_TYPES,
  ATTACHMENT_CONTEXTS,
  MAX_ATTACHMENTS_PER_TICKET,
  MAX_FILE_SIZE,
} from '@/shared/chamados/attachment.schemas';

/** Base directory for uploads — outside public/ to require auth for serving. */
const UPLOADS_BASE = path.resolve(process.cwd(), 'data', 'uploads', 'chamados');

/** Magic bytes signatures for allowed file types. */
const MAGIC_BYTES: Record<string, { offset: number; bytes: number[] }[]> = {
  'image/jpeg': [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  'image/png': [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }],
  'image/webp': [
    // RIFF....WEBP
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
    { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  ],
  'application/pdf': [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }],
};

function detectMimeType(buffer: Uint8Array): string | null {
  for (const [mime, signatures] of Object.entries(MAGIC_BYTES)) {
    const allMatch = signatures.every((sig) =>
      sig.bytes.every((byte, i) => buffer[sig.offset + i] === byte),
    );
    if (allMatch) return mime;
  }
  return null;
}

function sanitizeFilename(name: string): string {
  // Normaliza separadores Windows para POSIX antes do basename — `path.basename`
  // nativo não reconhece `\` no Linux, deixando passar path traversal cross-platform.
  const normalized = name.replace(/\\/g, '/');
  const base = path.posix.basename(normalized);
  return base
    .replace(/\0/g, '')
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 200);
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
  };
  return map[mime] ?? '';
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const chamadoId = formData.get('chamadoId') as string | null;

    // Validate context against allowed values
    const rawContext = (formData.get('context') as string) || 'geral';
    const context = (ATTACHMENT_CONTEXTS as readonly string[]).includes(rawContext)
      ? rawContext
      : 'geral';

    if (!file || !chamadoId) {
      return NextResponse.json(
        { ok: false, error: 'Arquivo e chamadoId são obrigatórios.' },
        { status: 400 },
      );
    }

    // Validate chamadoId format
    if (!Types.ObjectId.isValid(chamadoId)) {
      return NextResponse.json({ ok: false, error: 'ID do chamado inválido.' }, { status: 400 });
    }

    // Preliminary file size check (client-reported, may be spoofed)
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { ok: false, error: 'Arquivo excede o tamanho máximo de 5MB.' },
        { status: 400 },
      );
    }

    // Read file buffer for magic bytes validation
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Verify real buffer size (client may spoof file.size)
    if (buffer.byteLength > MAX_FILE_SIZE) {
      return NextResponse.json(
        { ok: false, error: 'Arquivo excede o tamanho máximo de 5MB.' },
        { status: 400 },
      );
    }

    // Validate MIME type by content (magic bytes)
    const detectedMime = detectMimeType(buffer);
    if (!detectedMime || !(ALLOWED_MIME_TYPES as readonly string[]).includes(detectedMime)) {
      return NextResponse.json(
        { ok: false, error: 'Tipo de arquivo não permitido. Aceitos: JPEG, PNG, WebP, PDF.' },
        { status: 400 },
      );
    }

    await dbConnect();

    // Verify chamado exists and user has access
    const chamado = await ChamadoModel.findById(chamadoId)
      .select('solicitanteId assignedToUserId status')
      .lean();

    if (!chamado) {
      return NextResponse.json({ ok: false, error: 'Chamado não encontrado.' }, { status: 404 });
    }

    const isSolicitante = String(chamado.solicitanteId) === session.userId;
    const isAssignedTech =
      chamado.assignedToUserId && String(chamado.assignedToUserId) === session.userId;
    const isManager = canManage(session.role);

    if (!isSolicitante && !isAssignedTech && !isManager) {
      return NextResponse.json(
        { ok: false, error: 'Sem permissão para anexar arquivos neste chamado.' },
        { status: 403 },
      );
    }

    // Check attachment limit
    const existingCount = await AttachmentModel.countDocuments({ chamadoId });
    if (existingCount >= MAX_ATTACHMENTS_PER_TICKET) {
      return NextResponse.json(
        {
          ok: false,
          error: `Limite de ${MAX_ATTACHMENTS_PER_TICKET} anexos por chamado atingido.`,
        },
        { status: 400 },
      );
    }

    // Sanitize filename and create unique name
    const sanitized = sanitizeFilename(file.name) || 'arquivo';
    const ext = path.extname(sanitized) || mimeToExt(detectedMime);
    const baseName = path.basename(sanitized, ext) || 'arquivo';
    const timestamp = Date.now();
    const filename = `${timestamp}-${baseName}${ext}`;

    // Build upload directory and verify no path traversal
    const uploadDir = path.resolve(UPLOADS_BASE, chamadoId);
    if (!uploadDir.startsWith(UPLOADS_BASE + path.sep) && uploadDir !== UPLOADS_BASE) {
      return NextResponse.json({ ok: false, error: 'Caminho inválido.' }, { status: 400 });
    }

    await fs.mkdir(uploadDir, { recursive: true });

    // Build file path and verify no path traversal
    const filePath = path.resolve(uploadDir, filename);
    if (!filePath.startsWith(uploadDir + path.sep)) {
      return NextResponse.json({ ok: false, error: 'Nome de arquivo inválido.' }, { status: 400 });
    }

    // Write file to disk
    await fs.writeFile(filePath, buffer);

    // URL points to the authenticated serving route
    const url = `/api/uploads/${chamadoId}/${encodeURIComponent(filename)}`;

    // Save attachment record
    const attachment = await AttachmentModel.create({
      chamadoId: new Types.ObjectId(chamadoId),
      userId: new Types.ObjectId(session.userId),
      filename,
      originalName: file.name,
      mimeType: detectedMime,
      size: buffer.byteLength,
      url,
      context,
    });

    return NextResponse.json({
      ok: true,
      data: {
        _id: String(attachment._id),
        url,
        filename,
        originalName: file.name,
        mimeType: detectedMime,
        size: buffer.byteLength,
      },
    });
  } catch (e) {
    console.error('[upload] Erro no upload:', e);
    return NextResponse.json(
      { ok: false, error: 'Erro interno ao processar upload.' },
      { status: 500 },
    );
  }
}
