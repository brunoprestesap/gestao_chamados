import 'server-only';

import { Types } from 'mongoose';

import { sendNotificationEmail } from '@/lib/email/send-notification-email';
import { emitToRoom } from '@/lib/realtime-emit';
import { NotificationModel } from '@/models/Notification';
import { UserModel } from '@/models/user.model';
import {
  ATRIBUICAO_MOTIVO_LABELS,
  type AtribuicaoResultado,
  rotuloDoTecnico,
} from '@/shared/chamados/atribuicao-automatica.constants';
import { tituloDeChamadoValidado } from '@/shared/chamados/aviso-atribuicao';
import type { TicketNewPayload } from '@/shared/socket';
import { textoSemPontuacaoFinal } from '@/shared/texto';

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
  /**
   * O resultado da atribuição automática (spec 0008, AC-13). `nao_tentada` e
   * ausente mantêm o texto da 0007. Só vale com `jaValidado`.
   */
  atribuicao?: AtribuicaoResultado;
};

/** O resultado que entra no payload e no texto, ou `null` quando vale o texto da 0007. */
function atribuicaoDoAviso(
  jaValidado: boolean,
  atribuicao: AtribuicaoResultado | undefined,
): TicketNewPayload['atribuicao'] | null {
  if (!jaValidado || !atribuicao || atribuicao.resultado === 'nao_tentada') return null;
  if (atribuicao.resultado === 'atribuido') {
    return { resultado: 'atribuido', tecnicoNome: rotuloDoTecnico(atribuicao.tecnicoNome) };
  }
  return { resultado: 'sem_tecnico', motivo: atribuicao.motivo };
}

function tituloDoAviso(
  ticketNumber: string,
  jaValidado: boolean,
  atribuicao: TicketNewPayload['atribuicao'] | null,
): string {
  if (jaValidado) return tituloDeChamadoValidado(ticketNumber, atribuicao);
  return ticketNumber ? `Novo chamado #${ticketNumber} aberto` : 'Novo chamado aberto';
}

export async function notificarNovoChamado(params: NotificarNovoChamadoParams): Promise<void> {
  const { chamadoId, ticketNumber, titulo, solicitanteId, jaValidado = false } = params;
  const atribuicao = atribuicaoDoAviso(jaValidado, params.atribuicao);

  const solicitante = Types.ObjectId.isValid(solicitanteId)
    ? await UserModel.findById(solicitanteId).select('name').lean()
    : null;

  const payload = {
    ticketId: chamadoId,
    ticketNumber,
    title: titulo,
    openedBy: { id: solicitanteId, name: solicitante?.name ?? undefined },
    jaValidado,
    ...(atribuicao ? { atribuicao } : {}),
    at: new Date().toISOString(),
  };

  const gestores = await UserModel.find({
    role: { $in: ['Preposto', 'Admin'] },
    isActive: true,
  })
    .select('_id')
    .lean();

  const tituloDaNotificacao = tituloDoAviso(ticketNumber, jaValidado, atribuicao);
  // O motivo do `sem_tecnico` é para a gestão: fica no corpo, ao lado do título do chamado.
  const corpo =
    atribuicao?.resultado === 'sem_tecnico'
      ? `${textoSemPontuacaoFinal(titulo)}. Motivo: ${ATRIBUICAO_MOTIVO_LABELS[atribuicao.motivo]}.`
      : titulo;

  if (gestores.length > 0) {
    await NotificationModel.insertMany(
      gestores.map((gestor) => ({
        userId: gestor._id,
        type: 'ticket:new',
        title: tituloDaNotificacao,
        body: corpo,
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
