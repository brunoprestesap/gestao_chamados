/**
 * Helpers para cálculo de SLA com timezone dinâmica (IANA).
 * Usa Intl API para suportar qualquer timezone sem bibliotecas externas.
 */

import type { BusinessCalendarConfig } from '@/lib/expediente-config';

function parseHHmm(s: string): { hours: number; minutes: number } {
  const [h, m] = s.split(':').map(Number);
  return { hours: h ?? 0, minutes: m ?? 0 };
}

/** Retorna offset em ms (UTC - local) para a timezone na data dada. Positivo = timezone atrás de UTC. */
function getTimezoneOffsetMs(timezone: string, date: Date): number {
  const utcNoon = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0, 0));
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(utcNoon);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  const localMins = hour * 60 + minute;
  const utcMins = 12 * 60;
  const offsetMinutes = utcMins - localMins;
  return offsetMinutes * 60 * 1000;
}

/** Retorna (dia da semana 0=Dom..6=Sab, hora fracionada 0-24) na timezone configurada. */
export function getLocalWeekdayAndHour(date: Date, config: BusinessCalendarConfig): { dayOfWeek: number; hourFraction: number } {
  const offsetMs = getTimezoneOffsetMs(config.timezone, date);
  const localRef = new Date(date.getTime() - offsetMs);
  const dayOfWeek = localRef.getUTCDay();
  const hourFraction =
    localRef.getUTCHours() +
    localRef.getUTCMinutes() / 60 +
    localRef.getUTCSeconds() / 3600 +
    localRef.getUTCMilliseconds() / 3600000;
  return { dayOfWeek, hourFraction };
}

/** Verifica se dayOfWeek está em weekdays (1=Seg..5=Sex para [1,2,3,4,5]). */
function isWeekday(dayOfWeek: number, weekdays: number[]): boolean {
  return weekdays.includes(dayOfWeek);
}

/** Verifica se hourFraction está entre workdayStart e workdayEnd (exclusive end). */
function isWithinWorkHours(hourFraction: number, config: BusinessCalendarConfig): boolean {
  const start = parseHHmm(config.workdayStart);
  const end = parseHHmm(config.workdayEnd);
  const startFraction = start.hours + start.minutes / 60;
  const endFraction = end.hours + end.minutes / 60;
  return hourFraction >= startFraction && hourFraction < endFraction;
}

export function isWithinBusinessHours(date: Date, config: BusinessCalendarConfig): boolean {
  const { dayOfWeek, hourFraction } = getLocalWeekdayAndHour(date, config);
  return isWeekday(dayOfWeek, config.weekdays) && isWithinWorkHours(hourFraction, config);
}

function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

/** Define hora local (h, m, s, ms) no dia local de date; retorna UTC. */
function setLocalTimeTo(date: Date, h: number, m: number, s: number, ms: number, config: BusinessCalendarConfig): Date {
  const offsetMs = getTimezoneOffsetMs(config.timezone, date);
  const localRef = new Date(date.getTime() - offsetMs);
  const dayStartUtc = Date.UTC(
    localRef.getUTCFullYear(),
    localRef.getUTCMonth(),
    localRef.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  const offsetMinutes = Math.round(offsetMs / 60000);
  const localMins = h * 60 + m + s / 60 + ms / 60000;
  const utcMins = localMins + offsetMinutes;
  return new Date(dayStartUtc + utcMins * 60 * 1000);
}

/** Encontra o próximo dia que está em weekdays a partir de d. */
function nextWeekday(d: Date, config: BusinessCalendarConfig): Date {
  let current = new Date(d.getTime());
  for (let i = 0; i < 8; i++) {
    const { dayOfWeek } = getLocalWeekdayAndHour(current, config);
    if (isWeekday(dayOfWeek, config.weekdays)) return current;
    current = addDays(current, 1);
  }
  return current;
}

export function snapToNextBusinessStart(date: Date, config: BusinessCalendarConfig): Date {
  const { dayOfWeek, hourFraction } = getLocalWeekdayAndHour(date, config);
  let d = new Date(date.getTime());
  const cameFromNonWorkday = !isWeekday(dayOfWeek, config.weekdays);

  if (cameFromNonWorkday) {
    d = nextWeekday(d, config);
  }

  const start = parseHHmm(config.workdayStart);
  const end = parseHHmm(config.workdayEnd);
  const startFraction = start.hours + start.minutes / 60;
  const endFraction = end.hours + end.minutes / 60;

  let again = getLocalWeekdayAndHour(d, config);
  if (isWeekday(again.dayOfWeek, config.weekdays)) {
    if (cameFromNonWorkday) {
      d = setLocalTimeTo(d, start.hours, start.minutes, 0, 0, config);
    } else if (again.hourFraction < startFraction) {
      d = setLocalTimeTo(d, start.hours, start.minutes, 0, 0, config);
    } else if (again.hourFraction >= endFraction) {
      d = addDays(d, 1);
      d = nextWeekday(d, config);
      d = setLocalTimeTo(d, start.hours, start.minutes, 0, 0, config);
    }
  } else {
    d = nextWeekday(d, config);
    d = setLocalTimeTo(d, start.hours, start.minutes, 0, 0, config);
  }
  return d;
}

export function addBusinessMinutesWithConfig(from: Date, minutes: number, config: BusinessCalendarConfig): Date {
  if (minutes <= 0) return new Date(from.getTime());

  const start = parseHHmm(config.workdayStart);
  const end = parseHHmm(config.workdayEnd);
  const startFraction = start.hours + start.minutes / 60;
  const endFraction = end.hours + end.minutes / 60;
  const minutesPerWorkday = (endFraction - startFraction) * 60;

  let current = snapToNextBusinessStart(new Date(from.getTime()), config);
  let remaining = minutes;

  while (remaining > 0) {
    const { dayOfWeek, hourFraction } = getLocalWeekdayAndHour(current, config);
    if (isWeekday(dayOfWeek, config.weekdays)) {
      const minutesUntilEOD = (endFraction - hourFraction) * 60;
      if (remaining <= minutesUntilEOD) {
        current = new Date(current.getTime() + remaining * 60 * 1000);
        remaining = 0;
      } else {
        remaining -= minutesUntilEOD;
        current = new Date(current.getTime() + minutesUntilEOD * 60 * 1000);
        current = snapToNextBusinessStart(current, config);
      }
    } else {
      current = snapToNextBusinessStart(current, config);
    }
  }
  return current;
}

/** Calcula minutos úteis por dia a partir da config. */
export function getBusinessMinutesPerDay(config: BusinessCalendarConfig): number {
  const start = parseHHmm(config.workdayStart);
  const end = parseHHmm(config.workdayEnd);
  return (end.hours - start.hours) * 60 + (end.minutes - start.minutes);
}
