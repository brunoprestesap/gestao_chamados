'use server';

import { Types } from 'mongoose';
import { revalidatePath } from 'next/cache';

import { generateTicketNumber } from '@/lib/chamado-utils';
import { canManage, requireSession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { sendNotificationEmail } from '@/lib/email/send-notification-email';
import { emitToRoom } from '@/lib/realtime-emit';
import { AttachmentModel } from '@/models/Attachment';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoCommentModel } from '@/models/ChamadoComment';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { NotificationModel } from '@/models/Notification';
import { UserModel } from '@/models/user.model';
import {
  type NotifyAttachmentInput,
  NotifyAttachmentSchema,
} from '@/shared/chamados/attachment.schemas';
import { toAttendanceNature } from '@/shared/chamados/chamado.constants';
import { type AddCommentInput, AddCommentSchema } from '@/shared/chamados/comment.schemas';
import {
  type SubmitEvaluationInput,
  SubmitEvaluationSchema,
} from '@/shared/chamados/evaluation.schemas';
import {
  NewTicketFormSchema,
  type NewTicketFormValues,
} from '@/shared/chamados/new-ticket.schemas';
import {
  type RefuseServiceInput,
  RefuseServiceSchema,
} from '@/shared/chamados/service-refusal.schemas';

/**
 * Gera um título automático para o chamado baseado nos dados do formulário.
 */
function generateTitulo(data: NewTicketFormValues): string {
  const partes: string[] = [data.tipoServico];
  if (data.localExato) {
    partes.push(`— ${data.localExato}`);
  }
  if (data.naturezaAtendimento === 'Urgente') {
    partes.push('[URGENTE]');
  }
  return partes.join(' ');
}

/**
 * Persiste um novo chamado no banco de dados.
 */
export async function createTicketAction(
  raw: NewTicketFormValues,
): Promise<{ ok: true; ticketId: string } | { ok: false; error: string }> {
  try {
    const parsed = NewTicketFormSchema.safeParse(raw);
    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      return { ok: false, error: first ?? 'Dados inválidos. Verifique os campos.' };
    }
    const data = parsed.data;

    const session = await requireSession();
    await dbConnect();

    // Gera título automático
    const titulo = generateTitulo(data);

    // Gera número único do ticket
    const ticket_number = await generateTicketNumber();

    if (!ticket_number || ticket_number.trim() === '') {
      throw new Error('Falha ao gerar número do ticket');
    }

    // Prepara os dados do chamado (natureza SOLICITADA apenas informativa)
    const chamadoData = {
      ticket_number: ticket_number.trim(),
      titulo,
      descricao: data.descricao,
      unitId: new Types.ObjectId(data.unitId),
      localExato: data.localExato,
      tipoServico: data.tipoServico,
      naturezaAtendimento: data.naturezaAtendimento,
      requestedAttendanceNature: toAttendanceNature(data.naturezaAtendimento),
      grauUrgencia: data.grauUrgencia,
      telefoneContato: data.telefoneContato ?? '',
      subtypeId: new Types.ObjectId(data.subtypeId),
      catalogServiceId: new Types.ObjectId(data.catalogServiceId),
      status: 'aberto' as const,
      solicitanteId: new Types.ObjectId(session.userId),
    };

    // Cria o documento do chamado
    const doc = await ChamadoModel.create(chamadoData);

    // Validação de urgência: se for urgente, pode precisar de autorização
    // Por enquanto apenas criamos o chamado, validação pode ser implementada depois
    if (data.naturezaAtendimento === 'Urgente') {
      // TODO: Implementar validação/autorização por papel (Fiscal/Gestor)
      // Por enquanto apenas registramos o chamado como urgente
    }

    // Cria registro de histórico para auditoria
    await ChamadoHistoryModel.create({
      chamadoId: doc._id,
      userId: new Types.ObjectId(session.userId),
      action: 'abertura',
      statusAnterior: null,
      statusNovo: 'aberto',
      observacoes: `Chamado criado: ${titulo}`,
    });

    // Notificação para Preposto e Admin: novo chamado aberto pelo solicitante
    const solicitanteUser = await UserModel.findById(session.userId).select('name').lean();
    const ticketNewPayload = {
      ticketId: String(doc._id),
      ticketNumber: doc.ticket_number,
      title: titulo,
      openedBy: { id: session.userId, name: solicitanteUser?.name ?? undefined },
      at: new Date().toISOString(),
    };
    const managers = await UserModel.find({
      role: { $in: ['Preposto', 'Admin'] },
      isActive: true,
    })
      .select('_id')
      .lean();
    const notificationTitle = doc.ticket_number
      ? `Novo chamado #${doc.ticket_number} aberto`
      : 'Novo chamado aberto';
    for (const manager of managers) {
      await NotificationModel.create({
        userId: manager._id,
        type: 'ticket:new',
        title: notificationTitle,
        body: titulo,
        data: ticketNewPayload,
        readAt: null,
      });
      sendNotificationEmail(String(manager._id), 'ticket:new', ticketNewPayload).catch(() => {});
    }
    await emitToRoom('managers', 'ticket:new', ticketNewPayload);

    revalidatePath('/meus-chamados');
    revalidatePath('/gestao');

    return { ok: true, ticketId: String(doc._id) };
  } catch (error) {
    console.error('Erro ao criar chamado:', error);
    if (error instanceof Error) {
      console.error('Detalhes do erro:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Erro ao criar chamado. Tente novamente.',
    };
  }
}

export type SubmitEvaluationResult = { ok: true } | { ok: false; error: string };

/**
 * Registra avaliação do chamado pelo solicitante (criador).
 * Apenas chamados encerrados, ainda não avaliados; só o criador pode avaliar.
 */
export async function submitTicketEvaluationAction(
  raw: SubmitEvaluationInput,
): Promise<SubmitEvaluationResult> {
  try {
    const session = await requireSession();
    const parsed = SubmitEvaluationSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg =
        first.ticketId?.[0] ?? first.rating?.[0] ?? first.comment?.[0] ?? 'Dados inválidos.';
      return { ok: false, error: msg };
    }

    const { ticketId, rating, comment } = parsed.data;
    await dbConnect();

    const userId = new Types.ObjectId(session.userId);

    const updated = await ChamadoModel.findOneAndUpdate(
      {
        _id: ticketId,
        status: 'encerrado',
        solicitanteId: userId,
        'evaluation.rating': { $exists: false },
      },
      {
        $set: {
          evaluation: {
            rating,
            notes: (comment ?? '').trim() || '',
            createdAt: new Date(),
            createdByUserId: userId,
          },
        },
      },
      { new: true },
    );

    if (!updated) {
      const existing = await ChamadoModel.findById(ticketId).lean();
      if (!existing) return { ok: false, error: 'Chamado não encontrado.' };
      if (String(existing.solicitanteId) !== session.userId) {
        return { ok: false, error: 'Apenas o criador do chamado pode avaliar.' };
      }
      if (existing.status !== 'encerrado') {
        return {
          ok: false,
          error: 'Somente chamados com status "Encerrado" podem ser avaliados.',
        };
      }
      if (existing.evaluation?.rating != null) {
        return { ok: false, error: 'Este chamado já foi avaliado.' };
      }
      return { ok: false, error: 'Não foi possível registrar a avaliação. Tente novamente.' };
    }

    await ChamadoHistoryModel.create({
      chamadoId: updated._id,
      userId,
      action: 'avaliado',
      statusAnterior: 'encerrado',
      statusNovo: 'encerrado',
      observacoes: `Avaliação: ${rating}/5`,
    });

    revalidatePath('/meus-chamados');
    revalidatePath(`/meus-chamados/${ticketId}`);

    return { ok: true };
  } catch (e) {
    console.error('submitTicketEvaluationAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao enviar avaliação. Tente novamente.',
    };
  }
}

/**
 * Adiciona um comentário a um chamado.
 * Regras de acesso: solicitante, técnico atribuído, Admin ou Preposto.
 * Comentários internos só podem ser criados por Técnico, Admin ou Preposto.
 */
export async function addCommentAction(
  raw: AddCommentInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await requireSession();
    const parsed = AddCommentSchema.safeParse(raw);
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      const msg =
        flat.chamadoId?.[0] ?? flat.content?.[0] ?? flat.visibility?.[0] ?? 'Dados inválidos.';
      return { ok: false, error: msg };
    }

    const { chamadoId, content, visibility } = parsed.data;
    await dbConnect();

    const chamado = await ChamadoModel.findById(chamadoId)
      .select('solicitanteId assignedToUserId ticket_number titulo')
      .lean();
    if (!chamado) {
      return { ok: false, error: 'Chamado não encontrado.' };
    }

    const isManager = canManage(session.role);
    const isSolicitante = String(chamado.solicitanteId) === session.userId;
    const isAssignedTech =
      chamado.assignedToUserId && String(chamado.assignedToUserId) === session.userId;

    if (!isSolicitante && !isAssignedTech && !isManager) {
      return { ok: false, error: 'Você não tem permissão para comentar neste chamado.' };
    }

    // Solicitante puro (sem ser também gestor ou técnico atribuído) sempre cria público
    const isPureRequester = isSolicitante && !isManager && !isAssignedTech;
    const finalVisibility = isPureRequester ? 'publico' : visibility;

    const userId = new Types.ObjectId(session.userId);

    await ChamadoCommentModel.create({
      chamadoId: new Types.ObjectId(chamadoId),
      userId,
      content,
      visibility: finalVisibility,
    });

    // Registra no histórico
    const preview = content.length > 100 ? content.slice(0, 100) + '…' : content;
    await ChamadoHistoryModel.create({
      chamadoId: new Types.ObjectId(chamadoId),
      userId,
      action: 'comentario',
      observacoes: preview,
    });

    // Notificação via Socket.IO (fire-and-forget, em paralelo)
    const user = await UserModel.findById(session.userId).select('name').lean();
    const now = new Date().toISOString();
    const payload = {
      ticketId: chamadoId,
      ticketNumber: chamado.ticket_number ?? undefined,
      title: chamado.titulo ?? undefined,
      commentBy: { id: session.userId, name: user?.name ?? undefined },
      visibility: finalVisibility as 'publico' | 'interno',
      at: now,
    };

    const notifyTitle = chamado.ticket_number
      ? `Novo comentário no chamado #${chamado.ticket_number}`
      : 'Novo comentário no chamado';

    const emitPromises: Promise<unknown>[] = [];
    const notificationRecipients: Types.ObjectId[] = [];

    // Notificar solicitante (se não for o autor e se o comentário for público)
    const solicitanteId = chamado.solicitanteId ? String(chamado.solicitanteId) : null;
    if (finalVisibility === 'publico' && solicitanteId && solicitanteId !== session.userId) {
      emitPromises.push(emitToRoom(`user:${solicitanteId}`, 'ticket:comment_added', payload));
      notificationRecipients.push(new Types.ObjectId(solicitanteId));
    }

    // Notificar técnico atribuído (se existir e não for o autor)
    const assignedId = chamado.assignedToUserId ? String(chamado.assignedToUserId) : null;
    if (assignedId && assignedId !== session.userId) {
      emitPromises.push(emitToRoom(`user:${assignedId}`, 'ticket:comment_added', payload));
      notificationRecipients.push(new Types.ObjectId(assignedId));
    }

    // Notificar gestores para comentários públicos (se o autor não for gestor)
    if (finalVisibility === 'publico' && !isManager) {
      emitPromises.push(emitToRoom('managers', 'ticket:comment_added', payload));
      // Persistir notificações para gestores
      const managers = await UserModel.find({
        role: { $in: ['Preposto', 'Admin'] },
        isActive: true,
      })
        .select('_id')
        .lean();
      for (const m of managers) {
        if (String(m._id) !== session.userId) {
          notificationRecipients.push(m._id as Types.ObjectId);
        }
      }
    }

    // Socket emit em paralelo (fire-and-forget)
    await Promise.allSettled(emitPromises);

    // Persistir notificações no MongoDB como fallback
    if (notificationRecipients.length > 0) {
      const uniqueIds = [...new Set(notificationRecipients.map(String))];
      await Promise.allSettled(
        uniqueIds.map((recipientId) =>
          NotificationModel.create({
            userId: new Types.ObjectId(recipientId),
            type: 'ticket:comment_added',
            title: notifyTitle,
            body: preview,
            data: payload,
            readAt: null,
          }),
        ),
      );
      for (const recipientId of uniqueIds) {
        sendNotificationEmail(recipientId, 'ticket:comment_added', payload).catch(() => {});
      }
    }

    revalidatePath(`/meus-chamados/${chamadoId}`);
    revalidatePath(`/chamados-atribuidos/${chamadoId}`);
    revalidatePath('/gestao');

    return { ok: true };
  } catch (e) {
    console.error('addCommentAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao adicionar comentário. Tente novamente.',
    };
  }
}

/**
 * Registra um attachment no histórico do chamado e emite notificação.
 * Chamado após o upload via API /api/upload ter sido bem-sucedido.
 * Busca dados do attachment no DB (não confia em dados do cliente).
 */
export async function notifyAttachmentAction(
  raw: NotifyAttachmentInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await requireSession();
    const parsed = NotifyAttachmentSchema.safeParse(raw);
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      const msg = flat.chamadoId?.[0] ?? flat.attachmentId?.[0] ?? 'Dados inválidos.';
      return { ok: false, error: msg };
    }

    const { chamadoId, attachmentId } = parsed.data;
    await dbConnect();

    // Busca o attachment no banco — dados confiáveis do servidor
    const attachment = await AttachmentModel.findOne({
      _id: attachmentId,
      chamadoId: new Types.ObjectId(chamadoId),
    }).lean();

    if (!attachment) {
      return { ok: false, error: 'Anexo não encontrado.' };
    }

    const chamado = await ChamadoModel.findById(chamadoId)
      .select('solicitanteId assignedToUserId ticket_number titulo')
      .lean();

    if (!chamado) {
      return { ok: false, error: 'Chamado não encontrado.' };
    }

    // Verificar acesso: apenas solicitante, técnico atribuído ou gestor
    const isSolicitante = String(chamado.solicitanteId) === session.userId;
    const isAssignedTech =
      chamado.assignedToUserId && String(chamado.assignedToUserId) === session.userId;
    const isManager = canManage(session.role);

    if (!isSolicitante && !isAssignedTech && !isManager) {
      return { ok: false, error: 'Sem permissão para registrar anexo neste chamado.' };
    }

    const userId = new Types.ObjectId(session.userId);
    const originalName = attachment.originalName;

    // Registra no histórico
    await ChamadoHistoryModel.create({
      chamadoId: new Types.ObjectId(chamadoId),
      userId,
      action: 'anexo',
      observacoes: `Anexo adicionado: ${originalName}`,
    });

    // Notificação via Socket.IO (fire-and-forget)
    const user = await UserModel.findById(session.userId).select('name').lean();
    const payload = {
      ticketId: chamadoId,
      ticketNumber: chamado.ticket_number ?? undefined,
      title: chamado.titulo ?? undefined,
      addedBy: { id: session.userId, name: user?.name ?? undefined },
      filename: originalName,
      mimeType: attachment.mimeType,
      at: new Date().toISOString(),
    };

    const emitPromises: Promise<unknown>[] = [];

    // Notificar solicitante se não for o autor
    const solicitanteId = chamado.solicitanteId ? String(chamado.solicitanteId) : null;
    if (solicitanteId && solicitanteId !== session.userId) {
      emitPromises.push(emitToRoom(`user:${solicitanteId}`, 'ticket:attachment_added', payload));
    }

    // Notificar técnico atribuído se não for o autor
    const assignedId = chamado.assignedToUserId ? String(chamado.assignedToUserId) : null;
    if (assignedId && assignedId !== session.userId) {
      emitPromises.push(emitToRoom(`user:${assignedId}`, 'ticket:attachment_added', payload));
    }

    // Notificar gestores
    if (!isManager) {
      emitPromises.push(emitToRoom('managers', 'ticket:attachment_added', payload));
    }

    await Promise.allSettled(emitPromises);

    // Persistir notificações
    const notifyTitle = chamado.ticket_number
      ? `Novo anexo no chamado #${chamado.ticket_number}`
      : 'Novo anexo no chamado';

    const recipients: string[] = [];
    if (solicitanteId && solicitanteId !== session.userId) recipients.push(solicitanteId);
    if (assignedId && assignedId !== session.userId) recipients.push(assignedId);

    if (!isManager) {
      const managers = await UserModel.find({
        role: { $in: ['Preposto', 'Admin'] },
        isActive: true,
      })
        .select('_id')
        .lean();
      for (const m of managers) {
        if (String(m._id) !== session.userId) {
          recipients.push(String(m._id));
        }
      }
    }

    const uniqueRecipients = [...new Set(recipients)];
    if (uniqueRecipients.length > 0) {
      await Promise.allSettled(
        uniqueRecipients.map((recipientId) =>
          NotificationModel.create({
            userId: new Types.ObjectId(recipientId),
            type: 'ticket:attachment_added',
            title: notifyTitle,
            body: `Arquivo: ${originalName}`,
            data: payload,
            readAt: null,
          }),
        ),
      );
      for (const recipientId of uniqueRecipients) {
        sendNotificationEmail(recipientId, 'ticket:attachment_added', payload).catch(() => {});
      }
    }

    revalidatePath(`/meus-chamados/${chamadoId}`);
    revalidatePath(`/chamados-atribuidos/${chamadoId}`);
    revalidatePath('/gestao');

    return { ok: true };
  } catch (e) {
    console.error('notifyAttachmentAction:', e);
    return {
      ok: false,
      error: 'Erro ao registrar anexo. Tente novamente.',
    };
  }
}

export type RefuseServiceResult = { ok: true } | { ok: false; error: string };

/**
 * Recusa o serviço de um chamado encerrado pelo solicitante (criador).
 * O chamado volta para "em atendimento" com o mesmo técnico para retrabalho.
 * Apenas chamados encerrados e ainda não avaliados podem ser recusados.
 */
export async function refuseServiceAction(raw: RefuseServiceInput): Promise<RefuseServiceResult> {
  try {
    const session = await requireSession();
    const parsed = RefuseServiceSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg = first.ticketId?.[0] ?? first.reason?.[0] ?? 'Dados inválidos.';
      return { ok: false, error: msg };
    }

    const { ticketId, reason } = parsed.data;
    await dbConnect();

    const userId = new Types.ObjectId(session.userId);
    const now = new Date();

    const updated = await ChamadoModel.findOneAndUpdate(
      {
        _id: ticketId,
        status: 'encerrado',
        solicitanteId: userId,
        'evaluation.rating': { $exists: false },
      },
      {
        $set: {
          status: 'em atendimento',
          closedAt: null,
          closedByUserId: null,
          closureNotes: '',
          concludedAt: null,
          'sla.resolvedAt': null,
        },
        $push: {
          serviceRefusals: {
            reason,
            createdAt: now,
            createdByUserId: userId,
          },
        },
      },
      { new: true },
    );

    if (!updated) {
      const existing = await ChamadoModel.findById(ticketId).lean();
      if (!existing) return { ok: false, error: 'Chamado não encontrado.' };
      if (String(existing.solicitanteId) !== session.userId) {
        return { ok: false, error: 'Apenas o criador do chamado pode recusar o serviço.' };
      }
      if (existing.status !== 'encerrado') {
        return {
          ok: false,
          error: 'Somente chamados com status "Encerrado" podem ter o serviço recusado.',
        };
      }
      if (existing.evaluation?.rating != null) {
        return { ok: false, error: 'Este chamado já foi avaliado. Não é possível recusar.' };
      }
      return { ok: false, error: 'Não foi possível recusar o serviço. Tente novamente.' };
    }

    // Registro de auditoria
    await ChamadoHistoryModel.create({
      chamadoId: updated._id,
      userId,
      action: 'recusa_servico',
      statusAnterior: 'encerrado',
      statusNovo: 'em atendimento',
      observacoes: `Serviço recusado pelo solicitante. Motivo: ${reason.length > 200 ? reason.slice(0, 200) + '…' : reason}`,
    });

    // Notificações (fire-and-forget)
    const solicitanteUser = await UserModel.findById(session.userId).select('name').lean();
    const payload = {
      ticketId: String(updated._id),
      ticketNumber: updated.ticket_number ?? undefined,
      title: updated.titulo ?? undefined,
      refusedBy: { id: session.userId, name: solicitanteUser?.name ?? undefined },
      reason,
      at: now.toISOString(),
    };

    const notifyTitle = updated.ticket_number
      ? `Serviço recusado no chamado #${updated.ticket_number}`
      : 'Serviço recusado no chamado';
    const notifyBody = reason.length > 200 ? reason.slice(0, 200) + '…' : reason;

    const emitPromises: Promise<unknown>[] = [];
    const notificationRecipients: string[] = [];

    // Notificar técnico atribuído
    const assignedId = updated.assignedToUserId ? String(updated.assignedToUserId) : null;
    if (assignedId) {
      emitPromises.push(emitToRoom(`user:${assignedId}`, 'ticket:service_refused', payload));
      notificationRecipients.push(assignedId);
    }

    // Notificar gestores
    emitPromises.push(emitToRoom('managers', 'ticket:service_refused', payload));
    const managers = await UserModel.find({
      role: { $in: ['Preposto', 'Admin'] },
      isActive: true,
    })
      .select('_id')
      .lean();
    for (const m of managers) {
      notificationRecipients.push(String(m._id));
    }

    await Promise.allSettled(emitPromises);

    // Persistir notificações no MongoDB
    const uniqueRecipients = [...new Set(notificationRecipients)];
    if (uniqueRecipients.length > 0) {
      await Promise.allSettled(
        uniqueRecipients.map((recipientId) =>
          NotificationModel.create({
            userId: new Types.ObjectId(recipientId),
            type: 'ticket:service_refused',
            title: notifyTitle,
            body: notifyBody,
            data: payload,
            readAt: null,
          }),
        ),
      );
      for (const recipientId of uniqueRecipients) {
        sendNotificationEmail(recipientId, 'ticket:service_refused', payload).catch(() => {});
      }
    }

    revalidatePath('/meus-chamados');
    revalidatePath(`/meus-chamados/${ticketId}`);
    revalidatePath('/gestao');
    revalidatePath('/chamados-atribuidos');

    return { ok: true };
  } catch (e) {
    console.error('refuseServiceAction:', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao recusar serviço. Tente novamente.',
    };
  }
}
