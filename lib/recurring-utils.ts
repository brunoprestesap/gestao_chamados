import type { RecurrenceType } from '@/shared/chamados/recurring-ticket.schemas';

const TIMEZONE = 'America/Belem';

/**
 * Calcula a próxima data de execução com base no tipo de recorrência.
 * Sempre gera datas às 08:00 no timezone do projeto.
 */
export function calculateNextRunAt(
  recurrenceType: RecurrenceType,
  opts: { dayOfWeek?: number; dayOfMonth?: number; intervalDays?: number },
  after: Date = new Date(),
): Date {
  // Trabalha com a data no timezone local
  const localNow = new Date(after.toLocaleString('en-US', { timeZone: TIMEZONE }));

  switch (recurrenceType) {
    case 'weekly': {
      const targetDay = opts.dayOfWeek ?? 1; // default segunda
      const result = new Date(localNow);
      result.setHours(8, 0, 0, 0);

      const currentDay = result.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil < 0) daysUntil += 7;
      // Se é hoje e já passou das 8h, pula pra próxima semana
      if (daysUntil === 0 && localNow.getHours() >= 8) {
        daysUntil = 7;
      }
      result.setDate(result.getDate() + daysUntil);

      return fromLocalToUtc(result);
    }

    case 'monthly': {
      const targetDay = opts.dayOfMonth ?? 1;
      const result = new Date(localNow);
      result.setHours(8, 0, 0, 0);
      result.setDate(targetDay);

      // Se a data já passou no mês atual, vai pro próximo mês
      if (result <= localNow) {
        result.setMonth(result.getMonth() + 1);
        result.setDate(targetDay);
      }

      return fromLocalToUtc(result);
    }

    case 'custom': {
      const interval = opts.intervalDays ?? 30;
      const result = new Date(localNow);
      result.setHours(8, 0, 0, 0);
      result.setDate(result.getDate() + interval);

      return fromLocalToUtc(result);
    }
  }
}

/**
 * Converte uma data "local" (construída como se fosse no timezone do projeto)
 * para UTC, compensando o offset de America/Belem (-03:00).
 */
function fromLocalToUtc(localDate: Date): Date {
  // America/Belem é UTC-3 sem horário de verão
  const utc = new Date(localDate.getTime() + 3 * 60 * 60 * 1000);
  return utc;
}
