import 'server-only';

import { Types } from 'mongoose';

import { sendNotificationEmail } from '@/lib/email/send-notification-email';
import { emitToRoom } from '@/lib/realtime-emit';
import { NotificationModel } from '@/models/Notification';
import { UserModel } from '@/models/user.model';

/**
 * Avisa a gestão de que um chamado novo nasceu: um `Notification` `ticket:new`
 * para cada Preposto e Admin ativo, o email de cada um e o evento no socket.
 *
 * Extraída de `createTicketAction` para o formulário e a conversa (spec 0004,
 * AC-11) avisarem do mesmo jeito, com o mesmo formato de payload. O socket e o
 * email são disparos que não seguram a regra de negócio: falha neles não
 * desfaz o chamado.
 */

export type NotificarNovoChamadoParams = {
  chamadoId: string;
  ticketNumber: string;
  titulo: string;
  solicitanteId: string;
  /** Chamado já nasceu `validado` sozinho pela IA (spec 0007, AC-13): não precisa de triagem. */
  jaValidado?: boolean;
};

export async function notificarNovoChamado(params: NotificarNovoChamadoParams): Promise<void> {
  const { chamadoId, ticketNumber, titulo, solicitanteId, jaValidado = false } = params;

  const solicitante = Types.ObjectId.isValid(solicitanteId)
    ? await UserModel.findById(solicitanteId).select('name').lean()
    : null;

  const payload = {
    ticketId: chamadoId,
    ticketNumber,
    title: titulo,
    openedBy: { id: solicitanteId, name: solicitante?.name ?? undefined },
    jaValidado,
    at: new Date().toISOString(),
  };

  const gestores = await UserModel.find({
    role: { $in: ['Preposto', 'Admin'] },
    isActive: true,
  })
    .select('_id')
    .lean();

  const tituloDaNotificacao = jaValidado
    ? ticketNumber
      ? `Chamado #${ticketNumber} validado automaticamente`
      : 'Chamado validado automaticamente'
    : ticketNumber
      ? `Novo chamado #${ticketNumber} aberto`
      : 'Novo chamado aberto';

  if (gestores.length > 0) {
    await NotificationModel.insertMany(
      gestores.map((gestor) => ({
        userId: gestor._id,
        type: 'ticket:new',
        title: tituloDaNotificacao,
        body: titulo,
        data: payload,
        readAt: null,
      })),
    );
    for (const gestor of gestores) {
      sendNotificationEmail(String(gestor._id), 'ticket:new', payload).catch(() => {});
    }
  }

  await emitToRoom('managers', 'ticket:new', payload);
}
