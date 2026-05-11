'use server';

import { Types } from 'mongoose';
import { revalidatePath } from 'next/cache';

import { canManage, isTechnician, requireSession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { sendNotificationEmail } from '@/lib/email/send-notification-email';
import { getBusinessCalendarConfig } from '@/lib/expediente-config';
import { getActiveHolidaysForRange } from '@/lib/holidays';
import { emitToRoom } from '@/lib/realtime-emit';
import { computeNewResolutionDueAtOnResume, evaluateResolutionBreach } from '@/lib/sla-utils';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { NotificationModel } from '@/models/Notification';
import { PauseLogModel } from '@/models/PauseLog';
import { UserModel } from '@/models/user.model';
import {
  type RegisterExecutionInput,
  RegisterExecutionSchema,
} from '@/shared/chamados/execution.schemas';
import {
  type MaterialObservationInput,
  MaterialObservationSchema,
} from '@/shared/chamados/material-observation.schemas';
import {
  type PauseForRequesterInput,
  PauseForRequesterSchema,
  type PauseTicketInput,
  PauseTicketSchema,
  type ResumeFromRequesterInput,
  ResumeFromRequesterSchema,
  type ResumeTicketInput,
  ResumeTicketSchema,
} from '@/shared/chamados/pause.schemas';
import { PAUSE_REASON_LABELS, type PauseReason } from '@/shared/chamados/pause-reason.constants';

export type ActionResult = { ok: true } | { ok: false; error: string; code?: string };
export type RegisterExecutionResult = ActionResult;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function revalidateTicketPaths(ticketId: string) {
  revalidatePath('/chamados-atribuidos');
  revalidatePath(`/chamados-atribuidos/${ticketId}`);
  revalidatePath('/gestao');
  revalidatePath(`/meus-chamados/${ticketId}`);
  revalidatePath('/meus-chamados');
}

// ---------------------------------------------------------------------------
// registerExecutionAction
// ---------------------------------------------------------------------------

export async function registerExecutionAction(
  raw: RegisterExecutionInput,
): Promise<RegisterExecutionResult> {
  try {
    const session = await requireSession();
    if (!isTechnician(session.role) && !canManage(session.role)) {
      return { ok: false, error: 'Acesso negado.' };
    }
    const parsed = RegisterExecutionSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg =
        first.serviceDescription?.[0] ??
        first.ticketId?.[0] ??
        'Dados inválidos. Verifique os campos.';
      return { ok: false, error: msg };
    }

    const { ticketId, serviceDescription, materialsUsed, notes, evidencePhotos } = parsed.data;
    await dbConnect();

    const doc = await ChamadoModel.findById(ticketId);
    if (!doc) return { ok: false, error: 'Chamado não encontrado.' };

    const assignedTo = doc.assignedToUserId;
    if (!assignedTo || String(assignedTo) !== session.userId) {
      if (!canManage(session.role)) {
        return { ok: false, error: 'Você não está atribuído a este chamado.' };
      }
    }

    // Bloquear se aguardando solicitante ou terceiros — deve retomar antes
    if (doc.status === 'aguardando_solicitante' || doc.status === 'aguardando_terceiros') {
      return {
        ok: false,
        error: 'Chamado pausado. Retome o atendimento antes de registrar execução.',
      };
    }

    if (doc.status !== 'em atendimento') {
      return {
        ok: false,
        error: 'Somente chamados em atendimento podem ter execução registrada.',
      };
    }

    const now = new Date();
    const userId = new Types.ObjectId(session.userId);

    const executionDoc = {
      createdByUserId: userId,
      serviceDescription: serviceDescription.trim(),
      materialsUsed: (materialsUsed ?? '').trim() || '',
      evidencePhotos: Array.isArray(evidencePhotos) ? evidencePhotos : [],
      notes: (notes ?? '').trim() || '',
      concludedAt: now,
    };

    const resolutionBreachedAt = evaluateResolutionBreach(
      now,
      doc.sla?.resolutionDueAt ?? null,
      doc.sla?.resolvedAt ?? null,
    );

    const updatePayload: Record<string, unknown> = {
      status: 'concluído',
      concludedAt: now,
      'sla.resolvedAt': now,
    };
    if (resolutionBreachedAt) {
      updatePayload['sla.resolutionBreachedAt'] = resolutionBreachedAt;
    }

    const atomicFilter = canManage(session.role)
      ? { _id: ticketId, status: 'em atendimento' }
      : { _id: ticketId, status: 'em atendimento', assignedToUserId: userId };

    const updateResult = await ChamadoModel.updateOne(atomicFilter, {
      $set: updatePayload,
      $push: {
        executions: executionDoc,
      },
    });

    if (updateResult.matchedCount === 0) {
      return {
        ok: false,
        error: 'Chamado não encontrado ou já foi concluído. Atualize a página.',
      };
    }

    await ChamadoHistoryModel.create({
      chamadoId: doc._id,
      userId,
      action: 'execucao_registrada',
      statusAnterior: 'em atendimento',
      statusNovo: 'concluído',
      observacoes: `Execução registrada. Descrição: ${serviceDescription.trim().slice(0, 100)}${serviceDescription.trim().length > 100 ? '…' : ''}`,
    });

    // Notificação para Preposto, Admin e Solicitante: execução registrada pelo técnico
    const technicianUser = await UserModel.findById(session.userId).select('name').lean();
    const payload = {
      ticketId: String(ticketId),
      ticketNumber: doc.ticket_number,
      title: doc.titulo,
      executedBy: { id: session.userId, name: technicianUser?.name ?? undefined },
      at: now.toISOString(),
    };
    const managers = await UserModel.find({
      role: { $in: ['Preposto', 'Admin'] },
      isActive: true,
    })
      .select('_id')
      .lean();
    const notificationTitle = doc.ticket_number
      ? `Execução registrada no chamado #${doc.ticket_number}`
      : 'Execução registrada no chamado';
    for (const manager of managers) {
      await NotificationModel.create({
        userId: manager._id,
        type: 'ticket:execution_registered',
        title: notificationTitle,
        body: doc.titulo ?? '',
        data: payload,
        readAt: null,
      });
      sendNotificationEmail(String(manager._id), 'ticket:execution_registered', payload).catch(() => {});
    }
    await NotificationModel.create({
      userId: doc.solicitanteId,
      type: 'ticket:execution_registered',
      title: notificationTitle,
      body: doc.titulo ?? '',
      data: payload,
      readAt: null,
    });
    sendNotificationEmail(String(doc.solicitanteId), 'ticket:execution_registered', payload).catch(() => {});
    await emitToRoom('managers', 'ticket:execution_registered', payload);
    await emitToRoom(`user:${String(doc.solicitanteId)}`, 'ticket:execution_registered', payload);

    revalidateTicketPaths(String(ticketId));

    return { ok: true };
  } catch (e) {
    console.error('registerExecutionAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao registrar execução. Tente novamente.',
    };
  }
}

// ---------------------------------------------------------------------------
// pauseTicketAction — unificada (suporta todos os motivos de pausa)
// ---------------------------------------------------------------------------

export async function pauseTicketAction(raw: PauseTicketInput): Promise<ActionResult> {
  try {
    const session = await requireSession();
    if (!isTechnician(session.role) && !canManage(session.role)) {
      return { ok: false, error: 'Acesso negado.' };
    }
    const parsed = PauseTicketSchema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const msg =
        fieldErrors.reason?.[0] ??
        fieldErrors.details?.[0] ??
        fieldErrors.ticketId?.[0] ??
        'Dados inválidos.';
      return { ok: false, error: msg };
    }

    const { ticketId, reason, details } = parsed.data;

    if (reason === 'falta_peca_contratada') {
      return {
        ok: false,
        error:
          'Pausa não permitida: a peça/material é responsabilidade da contratada. Providencie o item; use "Observação de material" para registrar o andamento.',
      };
    }
    if (reason === 'falta_peca_aprovacao_cliente') {
      return {
        ok: false,
        error: 'Use o fluxo "Solicitar Aprovação de Cotação" para este motivo.',
        code: 'REQUIRES_QUOTE',
      };
    }

    await dbConnect();

    const doc = await ChamadoModel.findById(ticketId);
    if (!doc) return { ok: false, error: 'Chamado não encontrado.' };

    if (isTechnician(session.role)) {
      const assignedTo = doc.assignedToUserId;
      if (!assignedTo || String(assignedTo) !== session.userId) {
        return { ok: false, error: 'Você não está atribuído a este chamado.' };
      }
    }

    if (doc.status !== 'em atendimento') {
      return { ok: false, error: 'Somente chamados em atendimento podem ser pausados.' };
    }

    const now = new Date();
    const userId = new Types.ObjectId(session.userId);

    const newStatus =
      reason === 'aguardando_solicitante' ? 'aguardando_solicitante' : 'aguardando_terceiros';
    const historyAction =
      reason === 'aguardando_solicitante' ? 'aguardando_solicitante' : 'pausa_terceiros';

    const pauseFilter = isTechnician(session.role)
      ? { _id: ticketId, status: 'em atendimento', assignedToUserId: userId }
      : { _id: ticketId, status: 'em atendimento' };

    const updateResult = await ChamadoModel.updateOne(pauseFilter, {
      $set: {
        status: newStatus,
        slaPausedAt: now,
        pauseReason: reason,
        pauseDetails: (details ?? '').trim(),
      },
    });

    if (updateResult.matchedCount === 0) {
      return {
        ok: false,
        error: 'Chamado não encontrado ou status já alterado. Atualize a página.',
      };
    }

    // PauseLog para rastreabilidade
    await PauseLogModel.create({
      chamadoId: doc._id,
      reason,
      details: (details ?? '').trim(),
      pausedAt: now,
      pausedByUserId: userId,
    });

    const reasonLabel = PAUSE_REASON_LABELS[reason as PauseReason];
    const obs = details?.trim()
      ? `${reasonLabel}: ${details.trim().slice(0, 200)}`
      : reasonLabel;

    await ChamadoHistoryModel.create({
      chamadoId: doc._id,
      userId,
      action: historyAction,
      statusAnterior: 'em atendimento',
      statusNovo: newStatus,
      observacoes: obs,
    });

    // Notificações
    const actionUser = await UserModel.findById(session.userId).select('name').lean();
    const notifPayload = {
      ticketId: String(ticketId),
      ticketNumber: doc.ticket_number,
      title: doc.titulo,
      pausedBy: { id: session.userId, name: actionUser?.name ?? undefined },
      reason: reasonLabel,
      at: now.toISOString(),
    };
    const notifTitle = doc.ticket_number
      ? `Chamado #${doc.ticket_number} — ${reasonLabel}`
      : `Chamado pausado — ${reasonLabel}`;

    // Notifica solicitante
    await NotificationModel.create({
      userId: doc.solicitanteId,
      type: 'ticket:paused',
      title: notifTitle,
      body: obs.slice(0, 200),
      data: notifPayload,
      readAt: null,
    });
    sendNotificationEmail(String(doc.solicitanteId), 'ticket:paused', notifPayload).catch(() => {});
    await emitToRoom(`user:${String(doc.solicitanteId)}`, 'ticket:paused', notifPayload);

    // Notifica managers
    const managers = await UserModel.find({
      role: { $in: ['Preposto', 'Admin'] },
      isActive: true,
    })
      .select('_id')
      .lean();
    if (managers.length > 0) {
      await NotificationModel.insertMany(
        managers.map((m) => ({
          userId: m._id,
          type: 'ticket:paused',
          title: notifTitle,
          body: obs.slice(0, 200),
          data: notifPayload,
          readAt: null,
        })),
      );
      for (const m of managers) {
        sendNotificationEmail(String(m._id), 'ticket:paused', notifPayload).catch(() => {});
      }
    }
    await emitToRoom('managers', 'ticket:paused', notifPayload);

    revalidateTicketPaths(String(ticketId));
    return { ok: true };
  } catch (e) {
    console.error('pauseTicketAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao pausar chamado. Tente novamente.',
    };
  }
}

// ---------------------------------------------------------------------------
// resumeTicketAction — unificada (retoma de qualquer pausa)
// ---------------------------------------------------------------------------

export async function resumeTicketAction(raw: ResumeTicketInput): Promise<ActionResult> {
  try {
    const session = await requireSession();
    if (!isTechnician(session.role) && !canManage(session.role)) {
      return { ok: false, error: 'Acesso negado.' };
    }
    const parsed = ResumeTicketSchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.flatten().fieldErrors.ticketId?.[0] ?? 'Dados inválidos.';
      return { ok: false, error: msg };
    }

    const { ticketId } = parsed.data;
    await dbConnect();

    const doc = await ChamadoModel.findById(ticketId);
    if (!doc) return { ok: false, error: 'Chamado não encontrado.' };

    if (isTechnician(session.role)) {
      const assignedTo = doc.assignedToUserId;
      if (!assignedTo || String(assignedTo) !== session.userId) {
        return { ok: false, error: 'Você não está atribuído a este chamado.' };
      }
    }

    const pausedStatuses = ['aguardando_solicitante', 'aguardando_terceiros'] as const;
    if (!pausedStatuses.includes(doc.status as (typeof pausedStatuses)[number])) {
      return { ok: false, error: 'Chamado não está pausado.' };
    }

    const slaPausedAt = doc.slaPausedAt;
    if (!slaPausedAt) {
      return { ok: false, error: 'Data de pausa não encontrada. Atualize a página.' };
    }

    const now = new Date();
    const pausedMs = now.getTime() - slaPausedAt.getTime();
    const pausedMinutes = Math.max(0, Math.round(pausedMs / 60000));
    const userId = new Types.ObjectId(session.userId);

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

    const setPayload: Record<string, unknown> = {
      status: 'em atendimento',
    };
    if (newResolutionDueAt) {
      setPayload['sla.resolutionDueAt'] = newResolutionDueAt;
    }

    const previousStatus = doc.status;
    const historyAction =
      previousStatus === 'aguardando_terceiros' ? 'retomada_terceiros' : 'retomada_atendimento';

    const resumeFilter = isTechnician(session.role)
      ? { _id: ticketId, status: previousStatus, assignedToUserId: userId }
      : { _id: ticketId, status: previousStatus };

    const updateResult = await ChamadoModel.updateOne(resumeFilter, {
      $set: setPayload,
      $inc: {
        totalPausedMinutes: pausedMinutes,
        'sla.pausedMinutes': pausedMinutes,
      },
      $unset: { slaPausedAt: 1, pauseReason: 1, pauseDetails: 1 },
    });

    if (updateResult.matchedCount === 0) {
      return {
        ok: false,
        error: 'Chamado não encontrado ou status já alterado. Atualize a página.',
      };
    }

    // Atualizar PauseLog mais recente (findOneAndUpdate suporta sort)
    await PauseLogModel.findOneAndUpdate(
      { chamadoId: doc._id, resumedAt: { $exists: false } },
      {
        $set: {
          resumedAt: now,
          pausedMinutes,
          resumedByUserId: userId,
        },
      },
      { sort: { pausedAt: -1 } },
    );

    const hoursStr =
      pausedMinutes >= 60
        ? `${Math.floor(pausedMinutes / 60)}h${pausedMinutes % 60 > 0 ? ` ${pausedMinutes % 60}min` : ''}`
        : `${pausedMinutes}min`;

    const pauseReasonLabel = doc.pauseReason
      ? PAUSE_REASON_LABELS[doc.pauseReason as PauseReason]
      : '';
    const obs = pauseReasonLabel
      ? `Atendimento retomado (${pauseReasonLabel}). Tempo pausado: ${hoursStr}.`
      : `Atendimento retomado. Tempo pausado: ${hoursStr}.`;

    await ChamadoHistoryModel.create({
      chamadoId: doc._id,
      userId,
      action: historyAction,
      statusAnterior: previousStatus,
      statusNovo: 'em atendimento',
      observacoes: obs,
    });

    // Notificações
    const actionUser = await UserModel.findById(session.userId).select('name').lean();
    const notifPayload = {
      ticketId: String(ticketId),
      ticketNumber: doc.ticket_number,
      title: doc.titulo,
      resumedBy: { id: session.userId, name: actionUser?.name ?? undefined },
      pausedMinutes,
      at: now.toISOString(),
    };
    const notifTitle = doc.ticket_number
      ? `Atendimento retomado no chamado #${doc.ticket_number}`
      : 'Atendimento retomado';

    // Notifica solicitante
    await NotificationModel.create({
      userId: doc.solicitanteId,
      type: 'ticket:resumed',
      title: notifTitle,
      body: `Tempo pausado: ${hoursStr}`,
      data: notifPayload,
      readAt: null,
    });
    sendNotificationEmail(String(doc.solicitanteId), 'ticket:resumed', notifPayload).catch(() => {});
    await emitToRoom(`user:${String(doc.solicitanteId)}`, 'ticket:resumed', notifPayload);

    // Notifica managers
    const managers = await UserModel.find({
      role: { $in: ['Preposto', 'Admin'] },
      isActive: true,
    })
      .select('_id')
      .lean();
    if (managers.length > 0) {
      await NotificationModel.insertMany(
        managers.map((m) => ({
          userId: m._id,
          type: 'ticket:resumed',
          title: notifTitle,
          body: `Tempo pausado: ${hoursStr}`,
          data: notifPayload,
          readAt: null,
        })),
      );
      for (const m of managers) {
        sendNotificationEmail(String(m._id), 'ticket:resumed', notifPayload).catch(() => {});
      }
    }
    await emitToRoom('managers', 'ticket:resumed', notifPayload);

    revalidateTicketPaths(String(ticketId));
    return { ok: true };
  } catch (e) {
    console.error('resumeTicketAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao retomar chamado. Tente novamente.',
    };
  }
}

// ---------------------------------------------------------------------------
// addMaterialObservationAction
// ---------------------------------------------------------------------------

export async function addMaterialObservationAction(
  raw: MaterialObservationInput,
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    if (!isTechnician(session.role) && !canManage(session.role)) {
      return { ok: false, error: 'Acesso negado.' };
    }
    const parsed = MaterialObservationSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg =
        first.description?.[0] ?? first.ticketId?.[0] ?? 'Dados inválidos.';
      return { ok: false, error: msg };
    }

    const { ticketId, description } = parsed.data;
    await dbConnect();

    const doc = await ChamadoModel.findById(ticketId);
    if (!doc) return { ok: false, error: 'Chamado não encontrado.' };

    if (isTechnician(session.role)) {
      const assignedTo = doc.assignedToUserId;
      if (!assignedTo || String(assignedTo) !== session.userId) {
        return { ok: false, error: 'Você não está atribuído a este chamado.' };
      }
    }

    if (doc.status !== 'em atendimento') {
      return {
        ok: false,
        error: 'Somente chamados em atendimento podem receber observação de material.',
      };
    }

    const now = new Date();
    const userId = new Types.ObjectId(session.userId);
    const actionUser = await UserModel.findById(session.userId).select('name').lean();
    const userName = actionUser?.name ?? '';

    const atomicFilter = canManage(session.role)
      ? { _id: ticketId, status: 'em atendimento' }
      : { _id: ticketId, status: 'em atendimento', assignedToUserId: userId };

    const updateResult = await ChamadoModel.updateOne(atomicFilter, {
      $push: {
        materialObservations: {
          description,
          createdByUserId: userId,
          createdByName: userName,
          createdAt: now,
        },
      },
    });

    if (updateResult.matchedCount === 0) {
      return {
        ok: false,
        error: 'Chamado não encontrado ou status alterado. Atualize a página.',
      };
    }

    await ChamadoHistoryModel.create({
      chamadoId: doc._id,
      userId,
      action: 'observacao_material',
      statusAnterior: 'em atendimento',
      statusNovo: 'em atendimento',
      observacoes: `Material necessário: ${description.slice(0, 200)}${description.length > 200 ? '…' : ''}`,
    });
    const notifPayload = {
      ticketId: String(ticketId),
      ticketNumber: doc.ticket_number,
      title: doc.titulo,
      observedBy: { id: session.userId, name: userName || undefined },
      observation: description.slice(0, 200),
      at: now.toISOString(),
    };
    const notifTitle = doc.ticket_number
      ? `Material necessário no chamado #${doc.ticket_number}`
      : 'Material necessário no chamado';

    // Notifica solicitante
    await NotificationModel.create({
      userId: doc.solicitanteId,
      type: 'ticket:material_observation',
      title: notifTitle,
      body: description.slice(0, 200),
      data: notifPayload,
      readAt: null,
    });
    sendNotificationEmail(
      String(doc.solicitanteId),
      'ticket:material_observation',
      notifPayload,
    ).catch(() => {});
    await emitToRoom(
      `user:${String(doc.solicitanteId)}`,
      'ticket:material_observation',
      notifPayload,
    );

    // Notifica managers
    const managers = await UserModel.find({
      role: { $in: ['Preposto', 'Admin'] },
      isActive: true,
    })
      .select('_id')
      .lean();
    if (managers.length > 0) {
      await NotificationModel.insertMany(
        managers.map((m) => ({
          userId: m._id,
          type: 'ticket:material_observation',
          title: notifTitle,
          body: description.slice(0, 200),
          data: notifPayload,
          readAt: null,
        })),
      );
      for (const m of managers) {
        sendNotificationEmail(
          String(m._id),
          'ticket:material_observation',
          notifPayload,
        ).catch(() => {});
      }
    }
    await emitToRoom('managers', 'ticket:material_observation', notifPayload);

    revalidateTicketPaths(String(ticketId));
    return { ok: true };
  } catch (e) {
    console.error('addMaterialObservationAction:', e);
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : 'Erro ao registrar observação de material. Tente novamente.',
    };
  }
}

// ---------------------------------------------------------------------------
// Legacy wrappers (mantidos para imports existentes)
// ---------------------------------------------------------------------------

export async function pauseForRequesterAction(
  raw: PauseForRequesterInput,
): Promise<ActionResult> {
  const parsed = PauseForRequesterSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const msg = first.reason?.[0] ?? first.ticketId?.[0] ?? 'Dados inválidos.';
    return { ok: false, error: msg };
  }
  return pauseTicketAction({
    ticketId: parsed.data.ticketId,
    reason: 'aguardando_solicitante',
    details: parsed.data.reason,
  });
}

export async function resumeFromRequesterAction(
  raw: ResumeFromRequesterInput,
): Promise<ActionResult> {
  const parsed = ResumeFromRequesterSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors.ticketId?.[0] ?? 'Dados inválidos.';
    return { ok: false, error: msg };
  }
  return resumeTicketAction({ ticketId: parsed.data.ticketId });
}
