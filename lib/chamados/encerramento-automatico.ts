import 'server-only';

import { revalidatePath } from 'next/cache';

import { dbConnect } from '@/lib/db';
import { getBusinessCalendarConfig } from '@/lib/expediente-config';
import { emitToRoom } from '@/lib/realtime-emit';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import {
  calcularPrazoAvaliacao,
  formatarPrazoAvaliacao,
  PRAZO_AVALIACAO_HORAS_PADRAO,
} from '@/shared/chamados/janela-avaliacao';
import type { TicketClosedPayload } from '@/shared/socket';

/** Quantos chamados vencidos uma execução encerra; o resto fica para a próxima (AC-6). */
export const LOTE_ENCERRAMENTO_AUTOMATICO = 200;

export type EncerramentoAutomaticoResultado = {
  encerrados: number;
  prazosPreenchidos: number;
};

/**
 * O cron do prazo para avaliar (spec 0010, AC-6 e AC-7).
 *
 * 1. Preenche `agora + prazoAvaliacaoHoras` nos `concluído` sem prazo (os que
 *    já estavam concluídos no deploy).
 * 2. Encerra os `concluído` de prazo vencido, do mais antigo ao mais novo, um a
 *    um com filtro atômico: rodar duas vezes, ou correr junto de uma avaliação,
 *    nunca encerra duas vezes nem apaga a nota. `closedAt` é o próprio prazo,
 *    então o resultado é o mesmo em qualquer atraso do cron.
 *
 * O chamado é gravado antes do histórico, sem transação (Mongo standalone): se
 * o processo cair entre as duas escritas, sobra um `encerrado` sem a entrada.
 */
export async function executarEncerramentoAutomatico(
  agora: Date = new Date(),
): Promise<EncerramentoAutomaticoResultado> {
  await dbConnect();

  let horas = PRAZO_AVALIACAO_HORAS_PADRAO;
  let timezone: string | undefined;
  try {
    const expediente = await getBusinessCalendarConfig();
    horas = expediente.prazoAvaliacaoHoras;
    timezone = expediente.timezone;
  } catch (err) {
    console.error('[encerramento-automatico] configuração indisponível, prazo padrão:', err);
  }

  // `null` no filtro casa também o campo ausente (chamado anterior à spec 0010).
  const preenchimento = await ChamadoModel.updateMany(
    { status: 'concluído', prazoAvaliacaoAte: null },
    { $set: { prazoAvaliacaoAte: calcularPrazoAvaliacao(agora, horas) } },
  );
  const prazosPreenchidos = preenchimento.modifiedCount ?? 0;

  const vencidos = await ChamadoModel.find({
    status: 'concluído',
    prazoAvaliacaoAte: { $lte: agora },
  })
    .sort({ prazoAvaliacaoAte: 1 })
    .limit(LOTE_ENCERRAMENTO_AUTOMATICO)
    .select('_id ticket_number titulo solicitanteId prazoAvaliacaoAte')
    .lean();

  let encerrados = 0;
  // Os avisos saem juntos depois do loop: em série, com o socket lento (até
  // 1,2 s cada), um lote de 200 passaria do `--max-time 60` do crontab.
  const avisos: Promise<unknown>[] = [];
  for (const v of vencidos) {
    const prazo = v.prazoAvaliacaoAte;
    if (!prazo) continue;
    try {
      const encerrado = await ChamadoModel.findOneAndUpdate(
        { _id: v._id, status: 'concluído', prazoAvaliacaoAte: prazo },
        {
          $set: {
            status: 'encerrado',
            closedAt: prazo,
            closedByUserId: null,
            closureNotes: '',
          },
        },
        { new: true },
      )
        .select('_id')
        .lean();
      // Outra execução, uma avaliação ou uma recusa chegou antes: nada a fazer.
      if (!encerrado) continue;
      encerrados += 1;

      await ChamadoHistoryModel.create({
        chamadoId: v._id,
        userId: null,
        actorType: 'sistema',
        action: 'encerramento_automatico',
        statusAnterior: 'concluído',
        statusNovo: 'encerrado',
        observacoes: `Prazo para avaliar terminou em ${formatarPrazoAvaliacao(prazo, timezone)}. Encerrado sem avaliação.`,
      });

      // Só a sala do solicitante, para as telas abertas (AC-9b). Sem `Notification` nem e-mail.
      const payload: TicketClosedPayload = {
        ticketId: String(v._id),
        ticketNumber: v.ticket_number ?? undefined,
        title: v.titulo ?? undefined,
        closedBy: null,
        motivo: 'automatico',
        at: agora.toISOString(),
      };
      avisos.push(emitToRoom(`user:${String(v.solicitanteId)}`, 'ticket:closed', payload));
    } catch (err) {
      console.error(`[encerramento-automatico] falha no chamado ${String(v._id)}:`, err);
    }
  }

  await Promise.allSettled(avisos);

  if (encerrados > 0) {
    revalidatePath('/meus-chamados');
    revalidatePath('/gestao');
  }

  return { encerrados, prazosPreenchidos };
}
