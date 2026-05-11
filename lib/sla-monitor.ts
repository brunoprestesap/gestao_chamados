/**
 * Serviço de monitoramento proativo de SLA.
 * Detecta chamados próximos do vencimento (≤20% restante) e breaches,
 * registra escalonamento e notifica gestores/admins via socket + DB.
 *
 * Executado periodicamente via cron (POST /api/cron/sla-monitor).
 */

import { dbConnect } from '@/lib/db';
import { sendNotificationEmail } from '@/lib/email/send-notification-email';
import { emitToRoom } from '@/lib/realtime-emit';
import { ChamadoModel } from '@/models/Chamado';
import { NotificationModel } from '@/models/Notification';
import { SlaEscalationModel } from '@/models/SlaEscalation';
import { UserModel } from '@/models/user.model';
import type { SlaBreachPayload, SlaWarningPayload } from '@/shared/socket';

/** Statuses de chamados ativos para monitoramento SLA. */
const MONITORED_STATUSES = [
  'validado',
  'em atendimento',
  'aguardando_solicitante',
  'aguardando_terceiros',
] as const;

export interface SlaMonitorReport {
  checked: number;
  warnings: number;
  breaches: number;
}

/**
 * Tenta criar SlaEscalation atomicamente.
 * Retorna true se criou (deve notificar), false se já existia (duplicate key 11000).
 */
async function tryCreateEscalation(
  doc: Parameters<typeof SlaEscalationModel.create>[0],
): Promise<boolean> {
  try {
    await SlaEscalationModel.create(doc);
    return true;
  } catch (err: unknown) {
    const code = (err as { code?: number }).code;
    if (code === 11000) return false; // Já notificado — idempotência OK
    console.error('[sla-monitor] erro ao criar escalação:', err);
    return false;
  }
}

export async function checkSlaEscalations(): Promise<SlaMonitorReport> {
  await dbConnect();

  const now = new Date();
  const report: SlaMonitorReport = { checked: 0, warnings: 0, breaches: 0 };

  // Busca chamados com SLA computado e status ativo
  const chamados = await ChamadoModel.find({
    status: { $in: MONITORED_STATUSES },
    'sla.resolutionDueAt': { $ne: null },
    'sla.resolvedAt': null,
  }).lean();

  report.checked = chamados.length;
  if (chamados.length === 0) return report;

  // Busca escalações existentes para evitar duplicatas (batch)
  const chamadoIds = chamados.map((c) => c._id);
  const existingEscalations = await SlaEscalationModel.find({
    chamadoId: { $in: chamadoIds },
  }).lean();

  const escalationSet = new Set(existingEscalations.map((e) => `${String(e.chamadoId)}:${e.type}`));

  // Pré-busca gestores (Preposto + Admin) — admins derivados do mesmo resultado
  const managers = await UserModel.find(
    { role: { $in: ['Preposto', 'Admin'] } },
    '_id role',
  ).lean();
  const managerIds = managers.map((u) => u._id);
  const adminIds = managers.filter((u) => u.role === 'Admin').map((u) => u._id);

  for (const chamado of chamados) {
    const sla = chamado.sla;
    if (!sla?.resolutionDueAt || !sla.computedAt) continue;

    const chamadoIdStr = String(chamado._id);
    const resolutionDueAt = new Date(sla.resolutionDueAt);
    const computedAt = new Date(sla.computedAt);
    const responseDueAt = sla.responseDueAt ? new Date(sla.responseDueAt) : null;

    // Calcula tempo decorrido descontando pausas (totalPausedMinutes = campo canônico raiz)
    const pausedMs = (chamado.totalPausedMinutes ?? 0) * 60_000;
    // Se pausa ativa (slaPausedAt está set), desconta tempo desde slaPausedAt até now
    const activePauseMs = chamado.slaPausedAt
      ? now.getTime() - new Date(chamado.slaPausedAt).getTime()
      : 0;
    const totalPauseMs = pausedMs + activePauseMs;
    // "Agora efetivo" = wall clock menos todo o tempo pausado. Usado para comparar com
    // os prazos do SLA (responseDueAt, resolutionDueAt) de forma coerente com o warning.
    const effectiveNowMs = now.getTime() - totalPauseMs;

    const totalMs = resolutionDueAt.getTime() - computedAt.getTime();
    const elapsedMs = now.getTime() - computedAt.getTime() - totalPauseMs;
    const remainingPercent = totalMs > 0 ? Math.max(0, (1 - elapsedMs / totalMs) * 100) : 0;

    const basePayload = {
      ticketId: chamadoIdStr,
      ticketNumber: chamado.ticket_number,
      title: chamado.titulo,
      priority: sla.priority ?? 'NORMAL',
    };

    // --- Regra 80% (warning): remainingPercent <= 20 e > 0 (não disparar se já em breach) ---
    if (
      remainingPercent <= 20 &&
      remainingPercent > 0 &&
      !escalationSet.has(`${chamadoIdStr}:warning_80`)
    ) {
      const created = await tryCreateEscalation({
        chamadoId: chamado._id,
        type: 'warning_80',
        level: 'manager',
        notifiedAt: now,
        notifiedUserIds: managerIds,
      });

      if (created) {
        const warningPayload: SlaWarningPayload = {
          ...basePayload,
          type: 'resolution',
          dueAt: resolutionDueAt.toISOString(),
          remainingPercent: Math.round(remainingPercent * 100) / 100,
          at: now.toISOString(),
        };

        const notifications = managerIds.map((userId) => ({
          userId,
          type: 'sla:warning' as const,
          title: `SLA do chamado ${chamado.ticket_number ?? chamadoIdStr} próximo do vencimento`,
          body: `Restam ~${Math.round(remainingPercent)}% do prazo de resolução.`,
          data: { ticketId: chamadoIdStr },
        }));
        if (notifications.length > 0) {
          await NotificationModel.insertMany(notifications, { ordered: false }).catch(() => {});
          for (const uid of managerIds) {
            sendNotificationEmail(String(uid), 'sla:warning', warningPayload).catch(() => {});
          }
        }

        await emitToRoom('managers', 'sla:warning', warningPayload);
        report.warnings++;
      }
    }

    // --- Breach de resposta ---
    // Usa effectiveNowMs (tempo decorrido descontando pausa) para não disparar breach
    // enquanto o chamado estiver pausado por dependência de terceiros/solicitante.
    // E ignora chamados que já tiveram a resposta iniciada no prazo (responseStartedAt
    // ≤ responseDueAt): nesses casos `responseBreachedAt` permanece null por design.
    const responseStartedAt = sla.responseStartedAt ? new Date(sla.responseStartedAt) : null;
    const responseAlreadyAnsweredOnTime =
      responseStartedAt !== null && responseDueAt !== null && responseStartedAt <= responseDueAt;
    if (
      responseDueAt !== null &&
      effectiveNowMs > responseDueAt.getTime() &&
      sla.responseBreachedAt == null &&
      !responseAlreadyAnsweredOnTime &&
      !escalationSet.has(`${chamadoIdStr}:breach_response`)
    ) {
      const created = await tryCreateEscalation({
        chamadoId: chamado._id,
        type: 'breach_response',
        level: 'admin',
        notifiedAt: now,
        notifiedUserIds: adminIds,
      });

      if (created) {
        const breachPayload: SlaBreachPayload = {
          ...basePayload,
          type: 'response',
          dueAt: responseDueAt.toISOString(),
          breachedAt: now.toISOString(),
          at: now.toISOString(),
        };

        const notifications = adminIds.map((userId) => ({
          userId,
          type: 'sla:breach' as const,
          title: `SLA de resposta do chamado ${chamado.ticket_number ?? chamadoIdStr} estourou`,
          body: `Prazo de resposta expirou sem atendimento iniciado.`,
          data: { ticketId: chamadoIdStr },
        }));
        if (notifications.length > 0) {
          await NotificationModel.insertMany(notifications, { ordered: false }).catch(() => {});
          for (const uid of adminIds) {
            sendNotificationEmail(String(uid), 'sla:breach', breachPayload).catch(() => {});
          }
        }

        // Marca breach no chamado
        await ChamadoModel.updateOne(
          { _id: chamado._id, 'sla.responseBreachedAt': null },
          { $set: { 'sla.responseBreachedAt': now } },
        );

        await emitToRoom('managers', 'sla:breach', breachPayload);
        report.breaches++;
      }
    }

    // --- Breach de resolução ---
    // Compara o tempo decorrido descontando pausa (effectiveNowMs) com resolutionDueAt.
    // resolutionDueAt só é estendido na retomada (resumeTicketAction); enquanto o chamado
    // está pausado, usar `now` direto marcaria breach indevido — coerente com o cálculo
    // do warning_80 logo acima.
    if (
      effectiveNowMs > resolutionDueAt.getTime() &&
      sla.resolutionBreachedAt == null &&
      !escalationSet.has(`${chamadoIdStr}:breach_resolution`)
    ) {
      const created = await tryCreateEscalation({
        chamadoId: chamado._id,
        type: 'breach_resolution',
        level: 'admin',
        notifiedAt: now,
        notifiedUserIds: adminIds,
      });

      if (created) {
        const breachPayload: SlaBreachPayload = {
          ...basePayload,
          type: 'resolution',
          dueAt: resolutionDueAt.toISOString(),
          breachedAt: now.toISOString(),
          at: now.toISOString(),
        };

        const notifications = adminIds.map((userId) => ({
          userId,
          type: 'sla:breach' as const,
          title: `SLA de resolução do chamado ${chamado.ticket_number ?? chamadoIdStr} estourou`,
          body: `Prazo de resolução expirou sem conclusão do chamado.`,
          data: { ticketId: chamadoIdStr },
        }));
        if (notifications.length > 0) {
          await NotificationModel.insertMany(notifications, { ordered: false }).catch(() => {});
          for (const uid of adminIds) {
            sendNotificationEmail(String(uid), 'sla:breach', breachPayload).catch(() => {});
          }
        }

        // Marca breach no chamado
        await ChamadoModel.updateOne(
          { _id: chamado._id, 'sla.resolutionBreachedAt': null },
          { $set: { 'sla.resolutionBreachedAt': now } },
        );

        await emitToRoom('managers', 'sla:breach', breachPayload);
        report.breaches++;
      }
    }
  }

  return report;
}
