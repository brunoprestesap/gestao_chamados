'use server';

import { Types } from 'mongoose';
import { revalidatePath } from 'next/cache';

import { isAdmin, requireSession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { sendNotificationEmail } from '@/lib/email/send-notification-email';
import { getBusinessCalendarConfig } from '@/lib/expediente-config';
import { getActiveHolidaysForRange } from '@/lib/holidays';
import { emitToRoom } from '@/lib/realtime-emit';
import { computeNewResolutionDueAtOnResume } from '@/lib/sla-utils';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { CotacaoModel } from '@/models/Cotacao';
import { NotificationModel } from '@/models/Notification';
import { PauseLogModel } from '@/models/PauseLog';
import { UserModel } from '@/models/user.model';
import {
  type ApproveCotacaoInput,
  ApproveCotacaoSchema,
  type RejectCotacaoInput,
  RejectCotacaoSchema,
  type SubmitCotacaoInput,
} from '@/shared/chamados/cotacao.schemas';
import { centavos, formatarReais } from '@/shared/chamados/custo';
import { MSG_ENVIO_ANTIGO_FECHADO } from '@/shared/material/mensagens';

export type CotacaoActionResult =
  | { ok: true; cotacaoId?: string }
  | { ok: false; error: string; code?: string };

function revalidateTicketPaths(ticketId: string) {
  revalidatePath('/chamados-atribuidos');
  revalidatePath(`/chamados-atribuidos/${ticketId}`);
  revalidatePath('/gestao');
  revalidatePath(`/chamados/${ticketId}`);
  revalidatePath(`/meus-chamados/${ticketId}`);
  revalidatePath('/meus-chamados');
}

function formatDurationPtBr(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  return `${minutes}min`;
}

// ---------------------------------------------------------------------------
// submitCotacaoAction: fechada pela spec 0019 (AC-18). A cotação nova nasce no
// chamado como cotação de material; as antigas `enviada` terminam pelo cartão
// atual (aprovar ou recusar), e as `aprovada` continuam no custo.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- a assinatura antiga continua para quem ainda chama
export async function submitCotacaoAction(_raw: SubmitCotacaoInput): Promise<CotacaoActionResult> {
  return { ok: false, error: MSG_ENVIO_ANTIGO_FECHADO };
}

// ---------------------------------------------------------------------------
// Helper interno — retoma SLA do chamado fechando a cotação (approve/reject)
// ---------------------------------------------------------------------------

async function resumeChamadoAfterQuoteReview(params: {
  cotacaoId: string;
  reviewerUserId: string;
  newCotacaoStatus: 'aprovada' | 'recusada';
  reviewObservacao?: string;
  historyAction: 'cotacao_aprovada' | 'cotacao_recusada';
  emitEvent: 'ticket:quote_approved' | 'ticket:quote_rejected';
  notifTitlePrefix: string;
}): Promise<CotacaoActionResult> {
  const {
    cotacaoId,
    reviewerUserId,
    newCotacaoStatus,
    reviewObservacao,
    historyAction,
    emitEvent,
    notifTitlePrefix,
  } = params;

  await dbConnect();

  const cotacao = await CotacaoModel.findById(cotacaoId);
  if (!cotacao) return { ok: false, error: 'Cotação não encontrada.' };
  if (cotacao.status !== 'enviada') {
    return { ok: false, error: 'Cotação já foi revisada anteriormente.' };
  }

  const doc = await ChamadoModel.findById(cotacao.chamadoId);
  if (!doc) return { ok: false, error: 'Chamado vinculado não encontrado.' };
  if (doc.status !== 'aguardando_terceiros') {
    return {
      ok: false,
      error: 'Chamado não está mais aguardando aprovação de cotação.',
    };
  }
  const slaPausedAt = doc.slaPausedAt;
  if (!slaPausedAt) {
    return { ok: false, error: 'Data de pausa não encontrada. Atualize a página.' };
  }

  const now = new Date();
  const pausedMs = now.getTime() - slaPausedAt.getTime();
  const pausedMinutes = Math.max(0, Math.round(pausedMs / 60000));
  const userId = new Types.ObjectId(reviewerUserId);

  const currentDueAt = doc.sla?.resolutionDueAt;
  let newResolutionDueAt: Date | undefined;
  if (currentDueAt) {
    const businessHoursOnly = doc.sla?.businessHoursOnly ?? false;
    let calendarConfig;
    let holidays;
    if (businessHoursOnly) {
      calendarConfig = await getBusinessCalendarConfig();
      holidays = await getActiveHolidaysForRange(slaPausedAt, now, calendarConfig.timezone);
    }
    newResolutionDueAt = computeNewResolutionDueAtOnResume(
      currentDueAt,
      slaPausedAt,
      now,
      businessHoursOnly,
      pausedMinutes,
      calendarConfig,
      holidays,
    );
  }

  const setPayload: Record<string, unknown> = { status: 'em atendimento' };
  if (newResolutionDueAt) {
    setPayload['sla.resolutionDueAt'] = newResolutionDueAt;
  }

  const updateResult = await ChamadoModel.updateOne(
    { _id: doc._id, status: 'aguardando_terceiros' },
    {
      $set: setPayload,
      $inc: {
        totalPausedMinutes: pausedMinutes,
        'sla.pausedMinutes': pausedMinutes,
      },
      $unset: { slaPausedAt: 1, pauseReason: 1, pauseDetails: 1 },
    },
  );

  if (updateResult.matchedCount === 0) {
    return {
      ok: false,
      error: 'Chamado não encontrado ou status já alterado. Atualize a página.',
    };
  }

  await PauseLogModel.findByIdAndUpdate(cotacao.pauseLogId, {
    $set: { resumedAt: now, pausedMinutes, resumedByUserId: userId },
  });

  cotacao.status = newCotacaoStatus;
  cotacao.reviewedByUserId = userId;
  cotacao.reviewedAt = now;
  if (reviewObservacao) cotacao.reviewObservacao = reviewObservacao.trim();
  await cotacao.save();

  const hoursStr = formatDurationPtBr(pausedMinutes);
  const reasonSummary =
    newCotacaoStatus === 'aprovada'
      ? `Cotação aprovada (${formatarReais(centavos(cotacao.valorEstimado))}). Tempo pausado: ${hoursStr}.`
      : `Cotação recusada. Tempo pausado: ${hoursStr}. Motivo: ${(reviewObservacao ?? '').trim().slice(0, 300)}`;

  await ChamadoHistoryModel.create({
    chamadoId: doc._id,
    userId,
    action: historyAction,
    statusAnterior: 'aguardando_terceiros',
    statusNovo: 'em atendimento',
    observacoes: reasonSummary,
  });

  const reviewer = await UserModel.findById(reviewerUserId).select('name').lean();
  const reviewerName = reviewer?.name ?? undefined;
  const payload = {
    ticketId: String(doc._id),
    ticketNumber: doc.ticket_number,
    title: doc.titulo,
    cotacaoId: String(cotacao._id),
    pausedMinutes,
    reviewedBy: { id: reviewerUserId, name: reviewerName },
    at: now.toISOString(),
    ...(emitEvent === 'ticket:quote_rejected'
      ? { observacao: (reviewObservacao ?? '').trim() }
      : {}),
  };

  const notifTitle = doc.ticket_number
    ? `${notifTitlePrefix} — chamado #${doc.ticket_number}`
    : notifTitlePrefix;
  const notifBody = `Tempo pausado: ${hoursStr}`;

  // Exclui o próprio Admin que aprovou/recusou — evita auto-notificação
  const managers = await UserModel.find({
    role: { $in: ['Preposto', 'Admin'] },
    isActive: true,
    _id: { $ne: userId },
  })
    .select('_id')
    .lean();
  if (managers.length > 0) {
    await NotificationModel.insertMany(
      managers.map((m) => ({
        userId: m._id,
        type: emitEvent,
        title: notifTitle,
        body: notifBody,
        data: payload,
        readAt: null,
      })),
    );
    for (const m of managers) {
      sendNotificationEmail(String(m._id), emitEvent, payload).catch(() => {});
    }
  }

  if (doc.assignedToUserId) {
    await NotificationModel.create({
      userId: doc.assignedToUserId,
      type: emitEvent,
      title: notifTitle,
      body: notifBody,
      data: payload,
      readAt: null,
    });
    sendNotificationEmail(String(doc.assignedToUserId), emitEvent, payload).catch(() => {});
    await emitToRoom(`user:${String(doc.assignedToUserId)}`, emitEvent, payload);
  }

  await NotificationModel.create({
    userId: doc.solicitanteId,
    type: emitEvent,
    title: notifTitle,
    body: notifBody,
    data: payload,
    readAt: null,
  });
  sendNotificationEmail(String(doc.solicitanteId), emitEvent, payload).catch(() => {});
  await emitToRoom(`user:${String(doc.solicitanteId)}`, emitEvent, payload);
  await emitToRoom('managers', emitEvent, payload);

  revalidateTicketPaths(String(doc._id));
  return { ok: true, cotacaoId: String(cotacao._id) };
}

// ---------------------------------------------------------------------------
// approveCotacaoAction — Gestor do Contrato (Admin) aprova cotação e SLA retoma.
// Preposto que submeteu NÃO pode aprovar (separação contratual de papéis).
// ---------------------------------------------------------------------------

export async function approveCotacaoAction(raw: ApproveCotacaoInput): Promise<CotacaoActionResult> {
  try {
    const session = await requireSession();
    if (!isAdmin(session.role)) {
      return {
        ok: false,
        error: 'Apenas o Gestor do Contrato (Admin) pode aprovar cotação.',
      };
    }

    const parsed = ApproveCotacaoSchema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const msg = fieldErrors.cotacaoId?.[0] ?? fieldErrors.observacao?.[0] ?? 'Dados inválidos.';
      return { ok: false, error: msg };
    }

    return resumeChamadoAfterQuoteReview({
      cotacaoId: parsed.data.cotacaoId,
      reviewerUserId: session.userId,
      newCotacaoStatus: 'aprovada',
      reviewObservacao: parsed.data.observacao,
      historyAction: 'cotacao_aprovada',
      emitEvent: 'ticket:quote_approved',
      notifTitlePrefix: 'Cotação aprovada',
    });
  } catch (e) {
    console.error('approveCotacaoAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao aprovar cotação. Tente novamente.',
    };
  }
}

// ---------------------------------------------------------------------------
// rejectCotacaoAction — Gestor do Contrato (Admin) recusa cotação; SLA retoma
// e a contratada (via Preposto) pode enviar nova cotação ajustada.
// ---------------------------------------------------------------------------

export async function rejectCotacaoAction(raw: RejectCotacaoInput): Promise<CotacaoActionResult> {
  try {
    const session = await requireSession();
    if (!isAdmin(session.role)) {
      return {
        ok: false,
        error: 'Apenas o Gestor do Contrato (Admin) pode recusar cotação.',
      };
    }

    const parsed = RejectCotacaoSchema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const msg = fieldErrors.observacao?.[0] ?? fieldErrors.cotacaoId?.[0] ?? 'Dados inválidos.';
      return { ok: false, error: msg };
    }

    return resumeChamadoAfterQuoteReview({
      cotacaoId: parsed.data.cotacaoId,
      reviewerUserId: session.userId,
      newCotacaoStatus: 'recusada',
      reviewObservacao: parsed.data.observacao,
      historyAction: 'cotacao_recusada',
      emitEvent: 'ticket:quote_rejected',
      notifTitlePrefix: 'Cotação recusada',
    });
  } catch (e) {
    console.error('rejectCotacaoAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao recusar cotação. Tente novamente.',
    };
  }
}
