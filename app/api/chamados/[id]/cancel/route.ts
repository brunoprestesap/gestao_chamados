import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { notificarFimAosInteressados } from '@/lib/chamados/interessados';
import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  await dbConnect();

  const { id } = await params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { observacoes } = body;

  // Busca o chamado atual
  const chamadoAtual = await ChamadoModel.findById(id).lean();
  if (!chamadoAtual) {
    return NextResponse.json({ error: 'Chamado não encontrado' }, { status: 404 });
  }

  // Verifica se o usuário é o solicitante (proprietário)
  const isOwner = String(chamadoAtual.solicitanteId) === session.userId;

  if (!isOwner) {
    return NextResponse.json(
      { error: 'Apenas o solicitante pode cancelar o chamado' },
      { status: 403 },
    );
  }

  // Verifica se o chamado já está cancelado ou concluído
  if (chamadoAtual.status === 'cancelado') {
    return NextResponse.json({ error: 'Chamado já está cancelado' }, { status: 400 });
  }

  if (chamadoAtual.status === 'concluído') {
    return NextResponse.json(
      { error: 'Não é possível cancelar um chamado concluído' },
      { status: 400 },
    );
  }

  const statusAnterior = chamadoAtual.status;

  // Atualiza o status para cancelado só se ele não mudou desde a leitura:
  // senão o histórico e o aviso aos interessados (spec 0017) falariam de um
  // cancelamento que não aconteceu.
  const cancelado = await ChamadoModel.updateOne(
    { _id: id, status: statusAnterior },
    { $set: { status: 'cancelado' } },
  );
  if (cancelado.matchedCount === 0) {
    return NextResponse.json(
      { error: 'O chamado mudou enquanto você cancelava. Atualize a página e tente de novo.' },
      { status: 409 },
    );
  }

  // Cria registro de histórico
  await ChamadoHistoryModel.create({
    chamadoId: new Types.ObjectId(id),
    userId: new Types.ObjectId(session.userId),
    action: 'cancelamento',
    statusAnterior: statusAnterior as string,
    statusNovo: 'cancelado',
    observacoes:
      observacoes && observacoes.trim() ? observacoes.trim() : `Chamado cancelado pelo solicitante`,
  });

  // Quem acompanha o chamado recebe o aviso de fim no sino (spec 0017, AC-17).
  void notificarFimAosInteressados(id, 'cancelado');

  return NextResponse.json({ ok: true });
}
