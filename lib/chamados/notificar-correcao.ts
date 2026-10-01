import 'server-only';

import { emitToRoom } from '@/lib/realtime-emit';
import { NotificationModel } from '@/models/Notification';
import { tituloDeCorrecaoAoTecnico } from '@/shared/chamados/aviso-atribuicao';
import type { FinalPriority } from '@/shared/chamados/chamado.constants';
import type { TicketCorrectedPayload } from '@/shared/socket';

/**
 * Avisa o técnico quando a prioridade ou o serviço do chamado dele mudam sem
 * trocar de técnico (spec 0009, AC-14): um `Notification` `ticket:corrected` e
 * o evento ao vivo, sem email e sem motivo. Lança em qualquer falha — quem
 * chama decide (a fatia sempre trata como passo isolado: log e segue, nunca
 * desfaz a correção, AC-21).
 */

export type NotificarCorrecaoParams = {
  chamadoId: string;
  ticketNumber?: string | null;
  titulo?: string | null;
  tecnicoId: string;
  campo: 'prioridade' | 'servico';
  finalPriority?: FinalPriority;
  correctedBy: { id: string; name?: string };
  at: Date;
};

export async function notificarCorrecaoAoTecnico(params: NotificarCorrecaoParams): Promise<void> {
  const { chamadoId, ticketNumber, titulo, tecnicoId, campo, finalPriority, correctedBy, at } =
    params;

  const payload: TicketCorrectedPayload = {
    ticketId: chamadoId,
    ticketNumber: ticketNumber ?? undefined,
    title: titulo ?? undefined,
    campo,
    finalPriority,
    correctedBy,
    at: at.toISOString(),
  };

  await NotificationModel.create({
    userId: tecnicoId,
    type: 'ticket:corrected',
    title: tituloDeCorrecaoAoTecnico(ticketNumber, campo, finalPriority),
    body: titulo ?? '',
    data: payload,
    readAt: null,
  });
  await emitToRoom(`user:${tecnicoId}`, 'ticket:corrected', payload);
}
