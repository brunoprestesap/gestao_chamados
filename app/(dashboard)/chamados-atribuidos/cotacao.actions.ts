'use server';

import { Types } from 'mongoose';
import { revalidatePath } from 'next/cache';

import { isAdmin, isPreposto, requireSession } from '@/lib/dal';
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
  SubmitCotacaoSchema,
} from '@/shared/chamados/cotacao.schemas';

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

function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

// ---------------------------------------------------------------------------
// submitCotacaoAction — Preposto (representante da contratada) envia cotação
// para aprovação do Gestor do Contrato (Admin). Somente Preposto pode submeter.
// ---------------------------------------------------------------------------

export async function submitCotacaoAction(raw: SubmitCotacaoInput): Promise<CotacaoActionResult> {
  try {
    const session = await requireSession();
    if (!isPreposto(session.role)) {
      return {
        ok: false,
        error: 'Apenas o Preposto pode enviar cotação para aprovação do contrato.',
      };
    }

    const parsed = SubmitCotacaoSchema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const msg =
        fieldErrors.valorEstimado?.[0] ??
        fieldErrors.descricao?.[0] ??
        fieldErrors.prazoEntregaDias?.[0] ??
        fieldErrors.observacoes?.[0] ??
        fieldErrors.ticketId?.[0] ??
        'Dados inválidos.';
      return { ok: false, error: msg };
    }

    const { ticketId, valorEstimado, descricao, prazoEntregaDias, observacoes, anexoId } =
      parsed.data;

    await dbConnect();

    const doc = await ChamadoModel.findById(ticketId);
    if (!doc) return { ok: false, error: 'Chamado não encontrado.' };

    if (doc.status !== 'em atendimento') {
      return {
        ok: false,
        error: 'Somente chamados em atendimento podem ter cotação enviada.',
      };
    }

    const existingActive = await CotacaoModel.findOne({
      chamadoId: doc._id,
      status: 'enviada',
    })
      .select('_id')
      .lean();
    if (existingActive) {
      return {
        ok: false,
        error: 'Já existe uma cotação aguardando aprovação para este chamado.',
      };
    }

    const now = new Date();
    const userId = new Types.ObjectId(session.userId);
    const detailsTrimmed = descricao.trim().slice(0, 200);

    // Preposto age em nome do contrato — não há vínculo de atribuição direta.
    const updateResult = await ChamadoModel.updateOne(
      { _id: ticketId, status: 'em atendimento' },
      {
        $set: {
          status: 'aguardando_terceiros',
          slaPausedAt: now,
          pauseReason: 'falta_peca_aprovacao_cliente',
          pauseDetails: detailsTrimmed,
        },
      },
    );

    if (updateResult.matchedCount === 0) {
      return {
        ok: false,
        error: 'Chamado não encontrado ou status já alterado. Atualize a página.',
      };
    }

    const pauseLog = await PauseLogModel.create({
      chamadoId: doc._id,
      reason: 'falta_peca_aprovacao_cliente',
      details: detailsTrimmed,
      pausedAt: now,
      pausedByUserId: userId,
    });

    let cotacao;
    try {
      cotacao = await CotacaoModel.create({
        chamadoId: doc._id,
        pauseLogId: pauseLog._id,
        status: 'enviada',
        valorEstimado,
        descricao: descricao.trim(),
        prazoEntregaDias,
        observacoes: observacoes?.trim(),
        anexoId: anexoId ? new Types.ObjectId(anexoId) : undefined,
        submittedByUserId: userId,
        submittedAt: now,
      });
    } catch (err: unknown) {
      // Compensa: chamado já foi para aguardando_terceiros e PauseLog foi criado.
      // Sem rollback, o ticket fica travado num estado inconsistente (pausado sem cotação).
      await ChamadoModel.updateOne(
        { _id: doc._id, status: 'aguardando_terceiros', slaPausedAt: now },
        {
          $set: { status: 'em atendimento' },
          $unset: { slaPausedAt: 1, pauseReason: 1, pauseDetails: 1 },
        },
      ).catch(() => {});
      await PauseLogModel.findByIdAndDelete(pauseLog._id).catch(() => {});

      const code = (err as { code?: number })?.code;
      if (code === 11000) {
        return {
          ok: false,
          error: 'Já existe uma cotação aguardando aprovação para este chamado.',
        };
      }
      throw err;
    }

    const obs = `Cotação enviada: ${formatBrl(valorEstimado)} — ${detailsTrimmed}`;
    await ChamadoHistoryModel.create({
      chamadoId: doc._id,
      userId,
      action: 'cotacao_enviada',
      statusAnterior: 'em atendimento',
      statusNovo: 'aguardando_terceiros',
      observacoes: obs,
    });

    const actionUser = await UserModel.findById(session.userId).select('name').lean();
    const submittedByName = actionUser?.name ?? undefined;

    const quotePayload = {
      ticketId: String(ticketId),
      ticketNumber: doc.ticket_number,
      title: doc.titulo,
      cotacaoId: String(cotacao._id),
      valorEstimado,
      submittedBy: { id: session.userId, name: submittedByName },
      at: now.toISOString(),
    };

    const pausePayload = {
      ticketId: String(ticketId),
      ticketNumber: doc.ticket_number,
      title: doc.titulo,
      pausedBy: { id: session.userId, name: submittedByName },
      reason: 'Aguardando Aprovação de Cotação',
      at: now.toISOString(),
    };

    const notifTitle = doc.ticket_number
      ? `Cotação aguardando aprovação — chamado #${doc.ticket_number}`
      : 'Cotação aguardando aprovação';
    const notifBody = `${formatBrl(valorEstimado)} — ${detailsTrimmed}`;

    // Exclui o próprio Preposto que submeteu — evita auto-notificação
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
          type: 'ticket:quote_submitted',
          title: notifTitle,
          body: notifBody,
          data: quotePayload,
          readAt: null,
        })),
      );
      for (const m of managers) {
        sendNotificationEmail(String(m._id), 'ticket:quote_submitted', quotePayload).catch(
          () => {},
        );
      }
    }

    await NotificationModel.create({
      userId: doc.solicitanteId,
      type: 'ticket:paused',
      title: notifTitle,
      body: notifBody,
      data: pausePayload,
      readAt: null,
    });
    sendNotificationEmail(String(doc.solicitanteId), 'ticket:paused', pausePayload).catch(() => {});

    await emitToRoom('managers', 'ticket:quote_submitted', quotePayload);
    await emitToRoom(`user:${String(doc.solicitanteId)}`, 'ticket:paused', pausePayload);

    revalidateTicketPaths(String(ticketId));
    return { ok: true, cotacaoId: String(cotacao._id) };
  } catch (e) {
    console.error('submitCotacaoAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao enviar cotação. Tente novamente.',
    };
  }
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
      ? `Cotação aprovada (${formatBrl(cotacao.valorEstimado)}). Tempo pausado: ${hoursStr}.`
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
