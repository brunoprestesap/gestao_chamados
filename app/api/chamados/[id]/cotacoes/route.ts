import { Types } from 'mongoose';
import { NextResponse } from 'next/server';

import { verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ChamadoModel } from '@/models/Chamado';
import { type CotacaoDoc, CotacaoModel } from '@/models/Cotacao';
import { UserModel } from '@/models/user.model';

type LeanCotacao = Omit<CotacaoDoc, keyof Document>;

function normalizeCotacao(
  c: LeanCotacao,
  nameByUserId: Record<string, string>,
) {
  return {
    _id: String(c._id),
    chamadoId: String(c.chamadoId),
    pauseLogId: String(c.pauseLogId),
    status: c.status,
    valorEstimado: c.valorEstimado,
    descricao: c.descricao,
    prazoEntregaDias: c.prazoEntregaDias ?? null,
    observacoes: c.observacoes ?? null,
    anexoId: c.anexoId ? String(c.anexoId) : null,
    submittedByUserId: String(c.submittedByUserId),
    submittedByName: nameByUserId[String(c.submittedByUserId)] ?? null,
    submittedAt: c.submittedAt instanceof Date ? c.submittedAt.toISOString() : c.submittedAt,
    reviewedByUserId: c.reviewedByUserId ? String(c.reviewedByUserId) : null,
    reviewedByName: c.reviewedByUserId
      ? (nameByUserId[String(c.reviewedByUserId)] ?? null)
      : null,
    reviewedAt:
      c.reviewedAt instanceof Date
        ? c.reviewedAt.toISOString()
        : (c.reviewedAt ?? null),
    reviewObservacao: c.reviewObservacao ?? null,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  await dbConnect();
  const { id } = await params;

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const chamado = await ChamadoModel.findById(id).lean();
  if (!chamado) {
    return NextResponse.json({ error: 'Chamado não encontrado' }, { status: 404 });
  }

  const isOwner = String(chamado.solicitanteId) === session.userId;
  const canManage = session.role === 'Admin' || session.role === 'Preposto';
  const isAssigned =
    chamado.assignedToUserId && String(chamado.assignedToUserId) === session.userId;

  if (!isOwner && !canManage && !isAssigned) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
  }

  const cotacoes = (await CotacaoModel.find({ chamadoId: new Types.ObjectId(id) })
    .sort({ createdAt: -1 })
    .lean()) as unknown as LeanCotacao[];

  const userIds = new Set<string>();
  for (const c of cotacoes) {
    userIds.add(String(c.submittedByUserId));
    if (c.reviewedByUserId) userIds.add(String(c.reviewedByUserId));
  }
  const users = userIds.size
    ? await UserModel.find({ _id: { $in: Array.from(userIds) } })
        .select('name')
        .lean()
    : [];
  const nameByUserId: Record<string, string> = {};
  for (const u of users) nameByUserId[String(u._id)] = u.name ?? '';

  const normalized = cotacoes.map((c) => normalizeCotacao(c, nameByUserId));
  const active = normalized.find((c) => c.status === 'enviada') ?? null;

  return NextResponse.json({ active, history: normalized });
}
