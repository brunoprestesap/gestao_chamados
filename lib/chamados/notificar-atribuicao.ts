import 'server-only';

import { sendNotificationEmail } from '@/lib/email/send-notification-email';
import { emitToRoom } from '@/lib/realtime-emit';
import { NotificationModel } from '@/models/Notification';
import {
  atribuidoPeloSistema,
  tituloDeAtribuicaoAoTecnico,
} from '@/shared/chamados/aviso-atribuicao';
import type { TicketAssignedPayload } from '@/shared/socket';

/**
 * Avisa da atribuição de um chamado a um técnico: um `Notification`
 * `ticket:assigned` persistido, o email do técnico e o evento no socket, para o
 * técnico e, na sala própria, para o solicitante (spec 0005, AC-2).
 *
 * Extraída de `assignTicketAction` para a atribuição manual e a automática
 * (spec 0008) avisarem do mesmo jeito, com o mesmo formato de payload. Só o
 * texto muda quando `assignedBy.id` é `ATRIBUIDO_POR_SISTEMA.id`.
 *
 * O email é disparado sem aguardar, e os dois eventos partem juntos. Na atribuição
 * manual, a falha na gravação ou no socket lança na hora, como sempre lançou. Na
 * automática (autor sistema) cada aviso tem o seu `try`: a falha de um não impede
 * os outros, e o primeiro erro sobe no fim, para quem chamou registrar.
 */

export type NotificarAtribuicaoParams = {
  chamadoId: string;
  ticketNumber?: string | null;
  titulo?: string | null;
  solicitanteId: string;
  tecnico: { id: string; name: string };
  assignedBy: { id: string; name?: string };
  at: Date;
};

export async function notificarAtribuicao(params: NotificarAtribuicaoParams): Promise<void> {
  const { chamadoId, ticketNumber, titulo, solicitanteId, tecnico, assignedBy, at } = params;

  const payload: TicketAssignedPayload = {
    ticketId: chamadoId,
    ticketNumber: ticketNumber ?? undefined,
    title: titulo ?? undefined,
    assignedBy,
    assignedTo: { id: tecnico.id, name: tecnico.name },
    at: at.toISOString(),
  };

  const automatica = atribuidoPeloSistema(assignedBy);
  const falhas: unknown[] = [];
  const aviso = async (passo: () => Promise<unknown>) => {
    try {
      await passo();
    } catch (err) {
      if (!automatica) throw err;
      falhas.push(err);
    }
  };

  await aviso(() =>
    NotificationModel.create({
      userId: tecnico.id,
      type: 'ticket:assigned',
      title: tituloDeAtribuicaoAoTecnico(ticketNumber, automatica),
      body: titulo ?? '',
      data: payload,
      readAt: null,
    }),
  );
  sendNotificationEmail(tecnico.id, 'ticket:assigned', payload).catch(() => {});
  // O solicitante recebe o mesmo aviso, para ver a atribuição ao vivo na própria
  // conversa (spec 0005, AC-2). O cliente decide texto e link pelo `userId`
  // recebido, comparado a `assignedTo.id`.
  await Promise.all([
    aviso(() => emitToRoom(`user:${tecnico.id}`, 'ticket:assigned', payload)),
    aviso(() => emitToRoom(`user:${solicitanteId}`, 'ticket:assigned', payload)),
  ]);

  if (falhas.length > 0) throw falhas[0];
}
