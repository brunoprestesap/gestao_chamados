import { Types } from 'mongoose';
import { type NextRequest, NextResponse } from 'next/server';

import { canManage, verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { AttachmentModel } from '@/models/Attachment';
import { ChamadoModel } from '@/models/Chamado';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
    }

    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ ok: false, error: 'ID inválido.' }, { status: 400 });
    }

    await dbConnect();

    // Verify access
    const chamado = await ChamadoModel.findById(id).select('solicitanteId assignedToUserId').lean();

    if (!chamado) {
      return NextResponse.json({ ok: false, error: 'Chamado não encontrado.' }, { status: 404 });
    }

    const isSolicitante = String(chamado.solicitanteId) === session.userId;
    const isAssignedTech =
      chamado.assignedToUserId && String(chamado.assignedToUserId) === session.userId;
    const isManager = canManage(session.role);

    if (!isSolicitante && !isAssignedTech && !isManager) {
      return NextResponse.json({ ok: false, error: 'Sem permissão.' }, { status: 403 });
    }

    const attachments = await AttachmentModel.find({ chamadoId: new Types.ObjectId(id) })
      .sort({ createdAt: 1 })
      .populate('userId', 'name')
      .lean();

    const data = attachments.map((a) => ({
      _id: String(a._id),
      filename: a.filename,
      originalName: a.originalName,
      mimeType: a.mimeType,
      size: a.size,
      url: a.url,
      context: a.context,
      createdAt: (a as unknown as { createdAt: Date }).createdAt?.toISOString(),
      user: {
        _id: String((a.userId as unknown as { _id: Types.ObjectId; name: string })._id),
        name: (a.userId as unknown as { _id: Types.ObjectId; name: string }).name,
      },
    }));

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error('[attachments] Erro ao listar anexos:', e);
    return NextResponse.json({ ok: false, error: 'Erro interno.' }, { status: 500 });
  }
}
