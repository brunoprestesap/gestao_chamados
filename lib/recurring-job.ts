import 'server-only';

import { Types } from 'mongoose';

import { generateTicketNumber } from '@/lib/chamado-utils';
import { dbConnect } from '@/lib/db';
import { getBusinessCalendarConfig } from '@/lib/expediente-config';
import { emitToRoom } from '@/lib/realtime-emit';
import { calculateNextRunAt } from '@/lib/recurring-utils';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { NotificationModel } from '@/models/Notification';
import { RecurringTicketModel } from '@/models/RecurringTicket';
import { UserModel } from '@/models/user.model';
import type { RecurrenceType } from '@/shared/chamados/recurring-ticket.schemas';

export type RecurringJobReport = {
  processed: number;
  created: number;
  errors: number;
  details: string[];
};

/**
 * Processa todos os agendamentos recorrentes cujo nextRunAt já passou.
 * Cria chamados automaticamente e atualiza o agendamento.
 */
export async function processRecurringTickets(): Promise<RecurringJobReport> {
  await dbConnect();

  const report: RecurringJobReport = { processed: 0, created: 0, errors: 0, details: [] };

  const templates = await RecurringTicketModel.find({
    nextRunAt: { $lte: new Date() },
    isActive: true,
  }).lean();

  if (templates.length === 0) {
    report.details.push('Nenhum agendamento pendente.');
    return report;
  }

  // Buscar config de expediente (dias úteis) e managers uma vez fora do loop
  const businessConfig = await getBusinessCalendarConfig();
  const { weekdays } = businessConfig;

  const managers = await UserModel.find({
    role: { $in: ['Preposto', 'Admin'] },
    isActive: true,
  })
    .select('_id')
    .lean();

  for (const template of templates) {
    report.processed++;
    try {
      // Validar solicitante ativo antes de criar chamado
      const solicitante = await UserModel.findById(template.solicitanteId)
        .select('_id isActive name')
        .lean();

      if (!solicitante || !solicitante.isActive) {
        throw new Error(`Solicitante ${String(template.solicitanteId)} inativo ou inexistente`);
      }

      const ticketNumber = await generateTicketNumber();

      const chamadoData = {
        ticket_number: ticketNumber,
        titulo: template.titulo,
        descricao: template.descricao,
        status: 'aberto' as const,
        solicitanteId: new Types.ObjectId(String(template.solicitanteId)),
        unitId: new Types.ObjectId(String(template.unitId)),
        localExato: 'Conforme agendamento',
        tipoServico: template.tipoServico,
        naturezaAtendimento: template.naturezaAtendimento,
        grauUrgencia: template.grauUrgencia ?? 'Normal',
        subtypeId: new Types.ObjectId(String(template.subtypeId)),
        catalogServiceId: new Types.ObjectId(String(template.catalogServiceId)),
        originTemplateId: new Types.ObjectId(String(template._id)),
      };

      const doc = await ChamadoModel.create(chamadoData);

      await ChamadoHistoryModel.create({
        chamadoId: doc._id,
        userId: new Types.ObjectId(String(template.createdByUserId)),
        action: 'abertura',
        statusAnterior: null,
        statusNovo: 'aberto',
        observacoes: `Chamado gerado automaticamente por agendamento: ${template.name}`,
      });

      // Notificar managers
      const payload = {
        ticketId: String(doc._id),
        ticketNumber: ticketNumber,
        title: template.titulo,
        openedBy: {
          id: String(template.solicitanteId),
          name: solicitante.name ?? undefined,
        },
        at: new Date().toISOString(),
      };

      const notifyTitle = `Novo chamado #${ticketNumber} (recorrente)`;

      // Criar notificações em batch (evita N+1)
      if (managers.length > 0) {
        await NotificationModel.insertMany(
          managers.map((m) => ({
            userId: m._id,
            type: 'ticket:new',
            title: notifyTitle,
            body: template.titulo,
            data: payload,
            readAt: null,
          })),
        );
      }

      await emitToRoom('managers', 'ticket:new', payload);

      // Calcular próximo slot baseado no slot atual (evita drift acumulado)
      // Passa weekdays para pular fins de semana / dias não úteis
      const nextRun = calculateNextRunAt(
        template.recurrenceType as RecurrenceType,
        {
          dayOfWeek: template.dayOfWeek ?? undefined,
          dayOfMonth: template.dayOfMonth ?? undefined,
          intervalDays: template.intervalDays ?? undefined,
        },
        new Date(template.nextRunAt),
        weekdays,
      );

      await RecurringTicketModel.updateOne(
        { _id: template._id },
        {
          $set: { nextRunAt: nextRun, lastRunAt: new Date() },
          $inc: { totalGenerated: 1 },
        },
      );

      report.created++;
      report.details.push(`OK: ${template.name} → ${ticketNumber}`);
    } catch (err) {
      report.errors++;
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      report.details.push(`ERRO: ${template.name} — ${msg}`);
      console.error(`[recurring-job] Erro ao processar template ${String(template._id)}:`, err);
    }
  }

  return report;
}
