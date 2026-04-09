'use server';

import { Types } from 'mongoose';
import { revalidatePath } from 'next/cache';

import { canManage, isTechnician, requireSession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { emitToRoom } from '@/lib/realtime-emit';
import { addElapsedMinutes, evaluateResolutionBreach } from '@/lib/sla-utils';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { NotificationModel } from '@/models/Notification';
import { UserModel } from '@/models/user.model';
import {
  type RegisterExecutionInput,
  RegisterExecutionSchema,
} from '@/shared/chamados/execution.schemas';
import {
  type PauseForRequesterInput,
  PauseForRequesterSchema,
  type ResumeFromRequesterInput,
  ResumeFromRequesterSchema,
} from '@/shared/chamados/pause.schemas';

export type ActionResult = { ok: true } | { ok: false; error: string };
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

    // Bloquear se aguardando solicitante — deve retomar antes
    if (doc.status === 'aguardando_solicitante') {
      return {
        ok: false,
        error: 'Chamado aguardando solicitante. Retome o atendimento antes de registrar execução.',
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
    }
    await NotificationModel.create({
      userId: doc.solicitanteId,
      type: 'ticket:execution_registered',
      title: notificationTitle,
      body: doc.titulo ?? '',
      data: payload,
      readAt: null,
    });
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
// pauseForRequesterAction
// ---------------------------------------------------------------------------

export async function pauseForRequesterAction(
  raw: PauseForRequesterInput,
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    if (!isTechnician(session.role) && !canManage(session.role)) {
      return { ok: false, error: 'Acesso negado.' };
    }
    const parsed = PauseForRequesterSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg = first.reason?.[0] ?? first.ticketId?.[0] ?? 'Dados inválidos.';
      return { ok: false, error: msg };
    }

    const { ticketId, reason } = parsed.data;
    await dbConnect();

    const doc = await ChamadoModel.findById(ticketId);
    if (!doc) return { ok: false, error: 'Chamado não encontrado.' };

    // Apenas técnico atribuído, Admin ou Preposto
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

    const pauseFilter = isTechnician(session.role)
      ? { _id: ticketId, status: 'em atendimento', assignedToUserId: userId }
      : { _id: ticketId, status: 'em atendimento' };

    const updateResult = await ChamadoModel.updateOne(pauseFilter, {
      $set: {
        status: 'aguardando_solicitante',
        slaPausedAt: now,
      },
    });

    if (updateResult.matchedCount === 0) {
      return { ok: false, error: 'Chamado não encontrado ou status já alterado. Atualize a página.' };
    }

    await ChamadoHistoryModel.create({
      chamadoId: doc._id,
      userId,
      action: 'aguardando_solicitante',
      statusAnterior: 'em atendimento',
      statusNovo: 'aguardando_solicitante',
      observacoes: reason.trim(),
    });

    // Notificações
    const actionUser = await UserModel.findById(session.userId).select('name').lean();
    const payload = {
      ticketId: String(ticketId),
      ticketNumber: doc.ticket_number,
      title: doc.titulo,
      pausedBy: { id: session.userId, name: actionUser?.name ?? undefined },
      reason: reason.trim(),
      at: now.toISOString(),
    };
    const notifTitle = doc.ticket_number
      ? `Chamado #${doc.ticket_number} aguardando solicitante`
      : 'Chamado aguardando solicitante';

    // Notifica solicitante
    await NotificationModel.create({
      userId: doc.solicitanteId,
      type: 'ticket:paused',
      title: notifTitle,
      body: reason.trim().slice(0, 200),
      data: payload,
      readAt: null,
    });
    await emitToRoom(`user:${String(doc.solicitanteId)}`, 'ticket:paused', payload);

    // Notifica managers
    const managers = await UserModel.find({
      role: { $in: ['Preposto', 'Admin'] },
      isActive: true,
    })
      .select('_id')
      .lean();
    for (const manager of managers) {
      await NotificationModel.create({
        userId: manager._id,
        type: 'ticket:paused',
        title: notifTitle,
        body: reason.trim().slice(0, 200),
        data: payload,
        readAt: null,
      });
    }
    await emitToRoom('managers', 'ticket:paused', payload);

    revalidateTicketPaths(String(ticketId));
    return { ok: true };
  } catch (e) {
    console.error('pauseForRequesterAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao pausar chamado. Tente novamente.',
    };
  }
}

// ---------------------------------------------------------------------------
// resumeFromRequesterAction
// ---------------------------------------------------------------------------

export async function resumeFromRequesterAction(
  raw: ResumeFromRequesterInput,
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    if (!isTechnician(session.role) && !canManage(session.role)) {
      return { ok: false, error: 'Acesso negado.' };
    }
    const parsed = ResumeFromRequesterSchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.flatten().fieldErrors.ticketId?.[0] ?? 'Dados inválidos.';
      return { ok: false, error: msg };
    }

    const { ticketId } = parsed.data;
    await dbConnect();

    const doc = await ChamadoModel.findById(ticketId);
    if (!doc) return { ok: false, error: 'Chamado não encontrado.' };

    // Apenas técnico atribuído, Admin ou Preposto
    if (isTechnician(session.role)) {
      const assignedTo = doc.assignedToUserId;
      if (!assignedTo || String(assignedTo) !== session.userId) {
        return { ok: false, error: 'Você não está atribuído a este chamado.' };
      }
    }

    if (doc.status !== 'aguardando_solicitante') {
      return { ok: false, error: 'Chamado não está aguardando solicitante.' };
    }

    const slaPausedAt = doc.slaPausedAt;
    if (!slaPausedAt) {
      return { ok: false, error: 'Data de pausa não encontrada. Atualize a página.' };
    }

    const now = new Date();
    const pausedMs = now.getTime() - slaPausedAt.getTime();
    const pausedMinutes = Math.max(0, Math.round(pausedMs / 60000));
    const userId = new Types.ObjectId(session.userId);

    // Ajustar resolutionDueAt: sempre desloca pelo tempo real (calendario) da pausa,
    // pois a pausa ocorreu em tempo real — independente de businessHoursOnly.
    const currentDueAt = doc.sla?.resolutionDueAt;
    const newResolutionDueAt = currentDueAt
      ? addElapsedMinutes(currentDueAt, pausedMinutes)
      : undefined;

    const setPayload: Record<string, unknown> = {
      status: 'em atendimento',
    };
    if (newResolutionDueAt) {
      setPayload['sla.resolutionDueAt'] = newResolutionDueAt;
    }

    const resumeFilter = isTechnician(session.role)
      ? { _id: ticketId, status: 'aguardando_solicitante', assignedToUserId: userId }
      : { _id: ticketId, status: 'aguardando_solicitante' };

    const updateResult = await ChamadoModel.updateOne(resumeFilter, {
      $set: setPayload,
      $inc: {
        totalPausedMinutes: pausedMinutes,
        'sla.pausedMinutes': pausedMinutes,
      },
      $unset: { slaPausedAt: 1 },
    });

    if (updateResult.matchedCount === 0) {
      return { ok: false, error: 'Chamado não encontrado ou status já alterado. Atualize a página.' };
    }

    const hoursStr =
      pausedMinutes >= 60
        ? `${Math.floor(pausedMinutes / 60)}h${pausedMinutes % 60 > 0 ? ` ${pausedMinutes % 60}min` : ''}`
        : `${pausedMinutes}min`;

    await ChamadoHistoryModel.create({
      chamadoId: doc._id,
      userId,
      action: 'retomada_atendimento',
      statusAnterior: 'aguardando_solicitante',
      statusNovo: 'em atendimento',
      observacoes: `Atendimento retomado. Tempo pausado: ${hoursStr}.`,
    });

    // Notificações
    const actionUser = await UserModel.findById(session.userId).select('name').lean();
    const payload = {
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
      data: payload,
      readAt: null,
    });
    await emitToRoom(`user:${String(doc.solicitanteId)}`, 'ticket:resumed', payload);

    // Notifica managers
    const managers = await UserModel.find({
      role: { $in: ['Preposto', 'Admin'] },
      isActive: true,
    })
      .select('_id')
      .lean();
    for (const manager of managers) {
      await NotificationModel.create({
        userId: manager._id,
        type: 'ticket:resumed',
        title: notifTitle,
        body: `Tempo pausado: ${hoursStr}`,
        data: payload,
        readAt: null,
      });
    }
    await emitToRoom('managers', 'ticket:resumed', payload);

    revalidateTicketPaths(String(ticketId));
    return { ok: true };
  } catch (e) {
    console.error('resumeFromRequesterAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao retomar chamado. Tente novamente.',
    };
  }
}
