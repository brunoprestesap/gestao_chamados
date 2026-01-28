import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { CHAMADO_STATUSES } from '@/shared/chamados/chamado.constants';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const { status: novoStatus, observacoes } = body;

  if (!novoStatus || !CHAMADO_STATUSES.includes(novoStatus)) {
    return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
  }

  // Busca o chamado atual para obter o status anterior
  const chamadoAtual = await ChamadoModel.findById(id).lean();
  if (!chamadoAtual) {
    return NextResponse.json({ error: 'Chamado não encontrado' }, { status: 404 });
  }

  // Apenas Admin/Preposto podem alterar status manualmente
  // Solicitante não pode alterar status (apenas cancelar)
  const canManage = session.role === 'Admin' || session.role === 'Preposto';

  if (!canManage) {
    return NextResponse.json(
      { error: 'Apenas Administradores e Prepostos podem alterar o status do chamado' },
      { status: 403 },
    );
  }

  const statusAnterior = chamadoAtual.status;

  // Se o status não mudou, não faz nada
  if (statusAnterior === novoStatus) {
    return NextResponse.json({ ok: true });
  }

  // Atualiza o status do chamado
  await ChamadoModel.findByIdAndUpdate(id, { status: novoStatus }, { new: true });

  // Cria registro de histórico
  await ChamadoHistoryModel.create({
    chamadoId: new Types.ObjectId(id),
    userId: new Types.ObjectId(session.userId),
    action: 'alteracao_status',
    statusAnterior: statusAnterior as string,
    statusNovo: novoStatus,
    observacoes:
      observacoes && observacoes.trim()
        ? observacoes.trim()
        : `Status alterado de "${statusAnterior}" para "${novoStatus}"`,
  });

  return NextResponse.json({ ok: true });
}
