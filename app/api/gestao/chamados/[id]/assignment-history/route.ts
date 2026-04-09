import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { requireManager } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';

/**
 * GET /api/gestao/chamados/[id]/assignment-history
 * Retorna histórico de atribuições e reatribuições de um chamado.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireManager();
    await dbConnect();

    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'ID de chamado inválido' }, { status: 400 });
    }

    const history = await ChamadoHistoryModel.find({
      chamadoId: new Types.ObjectId(id),
      action: { $in: ['atribuicao_tecnico', 'reatribuicao_tecnico'] },
    })
      .sort({ createdAt: -1 })
      .populate('userId', 'name username')
      .lean();

    const items = history.map((h) => ({
      _id: String(h._id),
      action: h.action,
      observacoes: h.observacoes ?? '',
      createdAt: h.createdAt?.toISOString?.() ?? '',
      user: h.userId
        ? {
            name: (h.userId as { name?: string }).name ?? '',
            username: (h.userId as { username?: string }).username ?? '',
          }
        : null,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Erro ao buscar histórico de atribuições:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar histórico de atribuições' },
      { status: 500 },
    );
  }
}
