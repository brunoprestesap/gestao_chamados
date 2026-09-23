import 'server-only';

import { Types } from 'mongoose';

import { sendNotificationEmail } from '@/lib/email/send-notification-email';
import { emitToRoom } from '@/lib/realtime-emit';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoCommentModel } from '@/models/ChamadoComment';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { NotificationModel } from '@/models/Notification';
import { UserModel } from '@/models/user.model';
import type { UserRole } from '@/shared/auth/auth.constants';

/**
 * Núcleo do comentário de chamado: grava o comentário, o histórico, as
 * notificações e emite para o socket.
 *
 * Extraído de `addCommentAction` para ter dois caminhos de entrada com o mesmo
 * comportamento: a Server Action da página do chamado e a mensagem que o
 * solicitante escreve na conversa depois de o chamado existir (spec 0002,
 * AC-13). A Server Action segue dona da validação e do `revalidatePath`.
 */

export type CriarComentarioParams = {
  chamadoId: string;
  autorUserId: string;
  autorRole: UserRole;
  content: string;
  visibility: 'publico' | 'interno';
};

export type CriarComentarioResultado =
  | { ok: true; id: string; visibility: 'publico' | 'interno' }
  | { ok: false; error: string };

const gestao = (role: UserRole) => role === 'Admin' || role === 'Preposto';

export async function criarComentario(
  params: CriarComentarioParams,
): Promise<CriarComentarioResultado> {
  const chamado = await ChamadoModel.findById(params.chamadoId)
    .select('solicitanteId assignedToUserId ticket_number titulo')
    .lean();
  if (!chamado) return { ok: false, error: 'Chamado não encontrado.' };

  const isManager = gestao(params.autorRole);
  const isSolicitante = String(chamado.solicitanteId) === params.autorUserId;
  const isAssignedTech = Boolean(
    chamado.assignedToUserId && String(chamado.assignedToUserId) === params.autorUserId,
  );

  if (!isSolicitante && !isAssignedTech && !isManager) {
    return { ok: false, error: 'Você não tem permissão para comentar neste chamado.' };
  }

  // Solicitante puro (sem ser também gestor ou técnico atribuído) sempre cria público
  const isPureRequester = isSolicitante && !isManager && !isAssignedTech;
  const finalVisibility = isPureRequester ? 'publico' : params.visibility;

  const userId = new Types.ObjectId(params.autorUserId);
  const chamadoObjectId = new Types.ObjectId(params.chamadoId);

  const comentario = await ChamadoCommentModel.create({
    chamadoId: chamadoObjectId,
    userId,
    content: params.content,
    visibility: finalVisibility,
  });

  // Registra no histórico
  const preview = params.content.length > 100 ? params.content.slice(0, 100) + '…' : params.content;
  await ChamadoHistoryModel.create({
    chamadoId: chamadoObjectId,
    userId,
    actorType: 'usuario',
    action: 'comentario',
    observacoes: preview,
  });

  // Notificação via Socket.IO (fire-and-forget, em paralelo)
  const user = await UserModel.findById(params.autorUserId).select('name').lean();
  const now = new Date().toISOString();
  const payload = {
    ticketId: params.chamadoId,
    ticketNumber: chamado.ticket_number ?? undefined,
    title: chamado.titulo ?? undefined,
    commentBy: { id: params.autorUserId, name: user?.name ?? undefined },
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
  if (finalVisibility === 'publico' && solicitanteId && solicitanteId !== params.autorUserId) {
    emitPromises.push(emitToRoom(`user:${solicitanteId}`, 'ticket:comment_added', payload));
    notificationRecipients.push(new Types.ObjectId(solicitanteId));
  }

  // Notificar técnico atribuído (se existir e não for o autor)
  const assignedId = chamado.assignedToUserId ? String(chamado.assignedToUserId) : null;
  if (assignedId && assignedId !== params.autorUserId) {
    emitPromises.push(emitToRoom(`user:${assignedId}`, 'ticket:comment_added', payload));
    notificationRecipients.push(new Types.ObjectId(assignedId));
  }

  // Notificar gestores, sempre, independente de quem escreveu e da
  // visibilidade: a leitura (`lerLinhaDoTempo`) já decide quem enxerga
  // comentário interno pelo papel de quem lê (spec 0005). Sem isso, um
  // comentário público de um gestor nunca avisava outro gestor olhando o
  // mesmo chamado.
  emitPromises.push(emitToRoom('managers', 'ticket:comment_added', payload));
  const managers = await UserModel.find({
    role: { $in: ['Preposto', 'Admin'] },
    isActive: true,
  })
    .select('_id')
    .lean();
  for (const m of managers) {
    if (String(m._id) !== params.autorUserId) {
      notificationRecipients.push(m._id as Types.ObjectId);
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

  return { ok: true, id: String(comentario._id), visibility: finalVisibility };
}
