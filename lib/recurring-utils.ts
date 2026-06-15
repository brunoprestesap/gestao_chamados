import type { RecurrenceType } from '@/shared/chamados/recurring-ticket.schemas';

const TIMEZONE = 'America/Belem';

/** Dias úteis padrão: Seg(1) a Sex(5) */
const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Extrai os componentes de "relógio de parede" de `instant` no TIMEZONE e os
 * empacota numa Date cujos campos **UTC** representam esse relógio local.
 *
 * Isso torna toda a aritmética de datas independente do timezone do processo
 * Node (antes, `new Date(toLocaleString(...))` dependia do TZ do servidor e
 * produzia datas erradas fora de UTC).
 */
function toZonedWall(instant: Date): { wall: Date; weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(instant);

  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  const hour = map.hour === '24' ? 0 : Number(map.hour);
  const wall = new Date(
    Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      hour,
      Number(map.minute),
      Number(map.second),
    ),
  );
  return { wall, weekday: WEEKDAY_INDEX[map.weekday] ?? wall.getUTCDay(), hour };
}

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
  // Relógio de parede local (Belém) representado em campos UTC.
  const { wall, hour: nowHour } = toZonedWall(after);

  let result: Date;

  switch (recurrenceType) {
    case 'weekly': {
      const targetDay = opts.dayOfWeek ?? 1; // default segunda
      result = new Date(wall);
      result.setUTCHours(8, 0, 0, 0);

      const currentDay = result.getUTCDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil < 0) daysUntil += 7;
      // Se é hoje e já passou das 8h, pula pra próxima semana
      if (daysUntil === 0 && nowHour >= 8) {
        daysUntil = 7;
      }
      result.setUTCDate(result.getUTCDate() + daysUntil);
      break;
    }

    case 'monthly': {
      const targetDay = opts.dayOfMonth ?? 1;
      result = new Date(wall);
      result.setUTCHours(8, 0, 0, 0);
      result.setUTCDate(targetDay);

      // Se a data já passou no mês atual, vai pro próximo mês.
      // Vai para o dia 1 antes de trocar o mês para evitar overflow do JS
      // (ex.: setMonth(+1) com day=31 num mês curto pularia o mês alvo).
      if (result.getTime() <= wall.getTime()) {
        result.setUTCDate(1);
        result.setUTCMonth(result.getUTCMonth() + 1);
        result.setUTCDate(targetDay);
      }
      break;
    }

    case 'custom': {
      const interval = opts.intervalDays ?? 30;
      result = new Date(wall);
      result.setUTCHours(8, 0, 0, 0);
      result.setUTCDate(result.getUTCDate() + interval);
      break;
    }
  }

  // Avançar até cair em dia útil (pula fins de semana / dias não configurados)
  result = snapToNextWorkday(result, weekdays ?? DEFAULT_WEEKDAYS);

  return fromZonedToUtc(result);
}

/**
 * Se a data cair fora dos dias úteis, avança dia a dia até encontrar um dia útil.
 * Protege contra loop infinito (máx 7 iterações).
 */
function snapToNextWorkday(date: Date, weekdays: number[]): Date {
  if (weekdays.length === 0) return date; // sem restrição
  let attempts = 0;
  while (!weekdays.includes(date.getUTCDay()) && attempts < 7) {
    date.setUTCDate(date.getUTCDate() + 1);
    attempts++;
  }
  return date;
}

/**
 * Converte uma data "de parede" (campos UTC = relógio local do TIMEZONE) para o
 * instante UTC real. O offset é derivado dinamicamente do IANA timezone (em vez
 * de fixado em -03:00), permanecendo correto se o TIMEZONE mudar.
 */
function fromZonedToUtc(wall: Date): Date {
  return new Date(wall.getTime() - zoneOffsetMs(wall));
}

/**
 * Offset do TIMEZONE em relação ao UTC (ms) para o instante de parede dado.
 * Negativo a oeste de Greenwich (America/Belem = -3h, sem horário de verão).
 */
function zoneOffsetMs(wall: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(wall);

  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = map.hour === '24' ? 0 : Number(map.hour);
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - wall.getTime();
}
