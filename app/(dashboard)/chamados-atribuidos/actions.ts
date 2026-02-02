'use server';

import { revalidatePath } from 'next/cache';
import { Types } from 'mongoose';

import { requireTechnician } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { emitToRoom } from '@/lib/realtime-emit';
import { evaluateResolutionBreach } from '@/lib/sla-utils';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { NotificationModel } from '@/models/Notification';
import { UserModel } from '@/models/user.model';
import {
  RegisterExecutionSchema,
  type RegisterExecutionInput,
} from '@/shared/chamados/execution.schemas';

export type RegisterExecutionResult = { ok: true } | { ok: false; error: string };

export async function registerExecutionAction(
  raw: RegisterExecutionInput,
): Promise<RegisterExecutionResult> {
  try {
    const session = await requireTechnician();
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
      return { ok: false, error: 'Você não está atribuído a este chamado.' };
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

    const updateResult = await ChamadoModel.updateOne(
      { _id: ticketId, status: 'em atendimento', assignedToUserId: userId },
      {
        $set: updatePayload,
        $push: {
          executions: executionDoc,
        },
      },
    );

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

    revalidatePath('/chamados-atribuidos');
    revalidatePath(`/chamados-atribuidos/${ticketId}`);
    revalidatePath('/gestao');
    revalidatePath(`/meus-chamados/${ticketId}`);

    return { ok: true };
  } catch (e) {
    console.error('registerExecutionAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao registrar execução. Tente novamente.',
    };
  }
}
