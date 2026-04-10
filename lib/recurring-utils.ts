import type { RecurrenceType } from '@/shared/chamados/recurring-ticket.schemas';

const TIMEZONE = 'America/Belem';

/** Dias úteis padrão: Seg(1) a Sex(5) */
const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];

/**
 * Calcula a próxima data de execução com base no tipo de recorrência.
 * Sempre gera datas às 08:00 no timezone do projeto.
 * Se `weekdays` for informado, avança a data até cair em dia útil.
 */
export function calculateNextRunAt(
  recurrenceType: RecurrenceType,
  opts: {
    dayOfWeek?: number;
    dayOfMonth?: number;
    intervalDays?: number;
  },
  after: Date = new Date(),
  weekdays?: number[],
): Date {
  // Trabalha com a data no timezone local
  const localNow = new Date(after.toLocaleString('en-US', { timeZone: TIMEZONE }));

  let result: Date;

  switch (recurrenceType) {
    case 'weekly': {
      const targetDay = opts.dayOfWeek ?? 1; // default segunda
      result = new Date(localNow);
      result.setHours(8, 0, 0, 0);

      const currentDay = result.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil < 0) daysUntil += 7;
      // Se é hoje e já passou das 8h, pula pra próxima semana
      if (daysUntil === 0 && localNow.getHours() >= 8) {
        daysUntil = 7;
      }
      result.setDate(result.getDate() + daysUntil);
      break;
    }

    case 'monthly': {
      const targetDay = opts.dayOfMonth ?? 1;
      result = new Date(localNow);
      result.setHours(8, 0, 0, 0);
      result.setDate(targetDay);

      // Se a data já passou no mês atual, vai pro próximo mês
      if (result <= localNow) {
        result.setMonth(result.getMonth() + 1);
        result.setDate(targetDay);
      }
      break;
    }

    case 'custom': {
      const interval = opts.intervalDays ?? 30;
      result = new Date(localNow);
      result.setHours(8, 0, 0, 0);
      result.setDate(result.getDate() + interval);
      break;
    }
  }

  // Avançar até cair em dia útil (pula fins de semana / dias não configurados)
  result = snapToNextWorkday(result, weekdays ?? DEFAULT_WEEKDAYS);

  return fromLocalToUtc(result);
}

/**
 * Se a data cair fora dos dias úteis, avança dia a dia até encontrar um dia útil.
 * Protege contra loop infinito (máx 7 iterações).
 */
function snapToNextWorkday(date: Date, weekdays: number[]): Date {
  if (weekdays.length === 0) return date; // sem restrição
  let attempts = 0;
  while (!weekdays.includes(date.getDay()) && attempts < 7) {
    date.setDate(date.getDate() + 1);
    attempts++;
  }
  return date;
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
