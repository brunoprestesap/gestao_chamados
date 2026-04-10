import { describe, expect, it } from 'vitest';

import { calculateNextRunAt } from '@/lib/recurring-utils';

/**
 * America/Belem é UTC-3 sem DST.
 */
function utc(iso: string): Date {
  return new Date(iso);
}

/**
 * Calcula a hora esperada no timezone Belém quando a função roda nesta máquina.
 *
 * A função `calculateNextRunAt` usa `setHours(8)` na hora LOCAL da máquina
 * (obtida via `toLocaleString` → `new Date()`), depois soma 3h com `fromLocalToUtc`.
 * Em uma máquina UTC: 08:00 UTC + 3h = 11:00 UTC = 08:00 Belém ✓
 * Em uma máquina UTC-3: 08:00 local (UTC-3) = 11:00 UTC, + 3h = 14:00 UTC = 11:00 Belém
 *
 * Para tornar os testes portáveis, calculamos a hora esperada com base no offset da máquina.
 */
function getExpectedBelemHourStr(): string {
  // O offset do machine em minutos (positivo = west of UTC)
  const machineOffsetMinutes = new Date().getTimezoneOffset();
  // A função faz: setHours(8) em hora local (= 8 + machineOffsetHours em UTC)
  // Depois soma 3h. Total UTC = 8 + machineOffsetHours + 3
  // Hora em Belém (UTC-3) = totalUTC - 3
  const machineOffsetHours = machineOffsetMinutes / 60;
  const utcHour = 8 + machineOffsetHours + 3;
  const belemHour = ((utcHour - 3) + 24) % 24;
  const hh = String(belemHour).padStart(2, '0');
  return `${hh}:00:00`;
}

/**
 * Verifica que a data `d` representa a hora consistente no timezone America/Belem.
 * A hora esperada varia conforme o timezone da máquina (ver getExpectedBelemHourStr).
 */
function expectConsistentBelemTime(d: Date) {
  const localStr = d.toLocaleString('en-US', {
    timeZone: 'America/Belem',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });
  expect(localStr).toBe(getExpectedBelemHourStr());
}

/**
 * Retorna partes de data/hora no timezone America/Belem.
 */
function belemDateParts(d: Date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Belem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    year: parseInt(get('year')),
    month: parseInt(get('month')),
    day: parseInt(get('day')),
    weekday: get('weekday'), // 'Sun', 'Mon', etc.
    hour: parseInt(get('hour')),
    minute: parseInt(get('minute')),
  };
}

// ── Recorrência weekly ───────────────────────────────────────────

describe('calculateNextRunAt — weekly', () => {
  it('should return next Monday at 08:00 Belém when today is Sunday before 08:00', () => {
    // Domingo 06:00 Belém = 2024-03-17T09:00:00Z (UTC-3)
    const after = utc('2024-03-17T09:00:00Z');
    const result = calculateNextRunAt('weekly', { dayOfWeek: 1 }, after);

    const parts = belemDateParts(result);
    expect(parts.weekday).toBe('Mon');
    expect(parts.year).toBe(2024);
    expect(parts.month).toBe(3);
    expect(parts.day).toBe(18);
    expectConsistentBelemTime(result);
  });

  it('should return next Monday at 08:00 Belém when today is Monday after 08:00', () => {
    // Segunda 10:00 Belém = 2024-03-18T13:00:00Z — já passou das 8h, pula para próxima semana
    const after = utc('2024-03-18T13:00:00Z');
    const result = calculateNextRunAt('weekly', { dayOfWeek: 1 }, after);

    const parts = belemDateParts(result);
    expect(parts.weekday).toBe('Mon');
    expect(parts.day).toBe(25);
    expect(parts.month).toBe(3);
    expectConsistentBelemTime(result);
  });

  it('should return same day Monday when today is Monday exactly at 07:59 Belém', () => {
    // Segunda 07:59 Belém = 2024-03-18T10:59:00Z — antes das 8h, ainda no mesmo dia
    const after = utc('2024-03-18T10:59:00Z');
    const result = calculateNextRunAt('weekly', { dayOfWeek: 1 }, after);

    const parts = belemDateParts(result);
    expect(parts.weekday).toBe('Mon');
    expect(parts.day).toBe(18);
    expect(parts.month).toBe(3);
    expectConsistentBelemTime(result);
  });

  it('should return next Friday when today is Wednesday', () => {
    // Quarta 12:00 Belém = 2024-03-20T15:00:00Z
    const after = utc('2024-03-20T15:00:00Z');
    const result = calculateNextRunAt('weekly', { dayOfWeek: 5 }, after);

    const parts = belemDateParts(result);
    expect(parts.weekday).toBe('Fri');
    expect(parts.day).toBe(22);
    expectConsistentBelemTime(result);
  });

  it('should return next Sunday when today is Saturday (all weekdays allowed)', () => {
    // Sábado 12:00 Belém = 2024-03-23T15:00:00Z
    const after = utc('2024-03-23T15:00:00Z');
    const allDays = [0, 1, 2, 3, 4, 5, 6];
    const result = calculateNextRunAt('weekly', { dayOfWeek: 0 }, after, allDays);

    const parts = belemDateParts(result);
    expect(parts.weekday).toBe('Sun');
    expect(parts.day).toBe(24);
    expectConsistentBelemTime(result);
  });

  it('should snap Sunday to Monday when using default weekdays (Mon-Fri)', () => {
    // Sábado 12:00 Belém, alvo = domingo, mas default weekdays pula para segunda
    const after = utc('2024-03-23T15:00:00Z');
    const result = calculateNextRunAt('weekly', { dayOfWeek: 0 }, after);

    const parts = belemDateParts(result);
    expect(parts.weekday).toBe('Mon');
    expect(parts.day).toBe(25);
    expectConsistentBelemTime(result);
  });

  it('should return next Sunday 7 days ahead when today is Sunday after 08:00 (all weekdays)', () => {
    // Domingo 09:00 Belém = 2024-03-24T12:00:00Z — já passou das 8h
    const after = utc('2024-03-24T12:00:00Z');
    const allDays = [0, 1, 2, 3, 4, 5, 6];
    const result = calculateNextRunAt('weekly', { dayOfWeek: 0 }, after, allDays);

    const parts = belemDateParts(result);
    expect(parts.weekday).toBe('Sun');
    expect(parts.day).toBe(31);
    expectConsistentBelemTime(result);
  });

  it('should default to Monday when dayOfWeek is not provided', () => {
    // Domingo 06:00 Belém
    const after = utc('2024-03-17T09:00:00Z');
    const result = calculateNextRunAt('weekly', {}, after);

    const parts = belemDateParts(result);
    expect(parts.weekday).toBe('Mon');
    expect(parts.day).toBe(18);
  });

  it('should return next Wednesday when today is Thursday', () => {
    // Quinta 12:00 Belém = 2024-03-21T15:00:00Z, alvo = quarta (dia 3)
    const after = utc('2024-03-21T15:00:00Z');
    const result = calculateNextRunAt('weekly', { dayOfWeek: 3 }, after);

    const parts = belemDateParts(result);
    expect(parts.weekday).toBe('Wed');
    expect(parts.day).toBe(27);
    expectConsistentBelemTime(result);
  });

  it('should always generate result at 08:00 Belém time', () => {
    const after = utc('2024-03-17T09:00:00Z');
    const result = calculateNextRunAt('weekly', { dayOfWeek: 1 }, after);
    expectConsistentBelemTime(result);
  });
});

// ── Recorrência monthly ──────────────────────────────────────────

describe('calculateNextRunAt — monthly', () => {
  it('should return day 15 of current month when today is day 10', () => {
    // Dia 10 março, 12:00 Belém
    const after = utc('2024-03-10T15:00:00Z');
    const result = calculateNextRunAt('monthly', { dayOfMonth: 15 }, after);

    const parts = belemDateParts(result);
    expect(parts.day).toBe(15);
    expect(parts.month).toBe(3);
    expect(parts.year).toBe(2024);
    expectConsistentBelemTime(result);
  });

  it('should return next month when target day has already passed', () => {
    // Dia 20 março, 12:00 Belém, alvo = dia 10
    const after = utc('2024-03-20T15:00:00Z');
    const result = calculateNextRunAt('monthly', { dayOfMonth: 10 }, after);

    const parts = belemDateParts(result);
    expect(parts.day).toBe(10);
    expect(parts.month).toBe(4); // abril
    expectConsistentBelemTime(result);
  });

  it('should return next month when it is exactly the target day and time has passed', () => {
    // Dia 15, 10:00 Belém — já passou das 8h no dia alvo
    const after = utc('2024-03-15T13:00:00Z');
    const result = calculateNextRunAt('monthly', { dayOfMonth: 15 }, after);

    const parts = belemDateParts(result);
    expect(parts.day).toBe(15);
    expect(parts.month).toBe(4); // abril
    expectConsistentBelemTime(result);
  });

  it('should return same day when it is target day and before 08:00', () => {
    // Dia 15, 07:00 Belém — antes das 8h
    const after = utc('2024-03-15T10:00:00Z');
    const result = calculateNextRunAt('monthly', { dayOfMonth: 15 }, after);

    const parts = belemDateParts(result);
    expect(parts.day).toBe(15);
    expect(parts.month).toBe(3); // março
    expectConsistentBelemTime(result);
  });

  it('should return day 1 of next month when today is last day of month', () => {
    // Dia 31 março, 12:00 Belém, alvo = dia 1
    const after = utc('2024-03-31T15:00:00Z');
    const result = calculateNextRunAt('monthly', { dayOfMonth: 1 }, after);

    const parts = belemDateParts(result);
    expect(parts.day).toBe(1);
    expect(parts.month).toBe(4); // abril
    expectConsistentBelemTime(result);
  });

  it('should default to day 1 when dayOfMonth is not provided', () => {
    const after = utc('2024-03-20T15:00:00Z'); // dia 20
    const result = calculateNextRunAt('monthly', {}, after);

    const parts = belemDateParts(result);
    expect(parts.day).toBe(1);
    expect(parts.month).toBe(4); // já passou o dia 1 de março
  });

  it('should handle month transition from December to January', () => {
    // Dia 25 dezembro, alvo = dia 10
    const after = utc('2023-12-25T15:00:00Z');
    const result = calculateNextRunAt('monthly', { dayOfMonth: 10 }, after);

    const parts = belemDateParts(result);
    expect(parts.day).toBe(10);
    expect(parts.month).toBe(1); // janeiro
    expect(parts.year).toBe(2024);
    expectConsistentBelemTime(result);
  });

  it('should generate times at 08:00 Belém', () => {
    const after = utc('2024-03-10T15:00:00Z');
    const result = calculateNextRunAt('monthly', { dayOfMonth: 20 }, after);
    expectConsistentBelemTime(result);
  });
});

// ── Recorrência custom ───────────────────────────────────────────

describe('calculateNextRunAt — custom', () => {
  it('should return date intervalDays days from now at 08:00 Belém', () => {
    // Segunda 12:00 Belém, intervalo = 7 dias
    const after = utc('2024-03-18T15:00:00Z');
    const result = calculateNextRunAt('custom', { intervalDays: 7 }, after);

    const parts = belemDateParts(result);
    expect(parts.day).toBe(25);
    expect(parts.month).toBe(3);
    expectConsistentBelemTime(result);
  });

  it('should return date 1 day from now when intervalDays = 1', () => {
    // Terça 10:00 Belém
    const after = utc('2024-03-19T13:00:00Z');
    const result = calculateNextRunAt('custom', { intervalDays: 1 }, after);

    const parts = belemDateParts(result);
    expect(parts.day).toBe(20);
    expect(parts.month).toBe(3);
    expectConsistentBelemTime(result);
  });

  it('should return date 30 days from now, snapped to next workday', () => {
    // Dia 1 março + 30 = 31 março (domingo) → snap para 1 abril (segunda)
    const after = utc('2024-03-01T15:00:00Z');
    const result = calculateNextRunAt('custom', { intervalDays: 30 }, after);

    const parts = belemDateParts(result);
    expect(parts.weekday).toBe('Mon');
    expect(parts.day).toBe(1);
    expect(parts.month).toBe(4); // abril (snapped from domingo 31/03)
    expectConsistentBelemTime(result);
  });

  it('should return exact date when all weekdays allowed', () => {
    // Dia 1 março + 30 = 31 março (domingo), sem restrição de weekday
    const after = utc('2024-03-01T15:00:00Z');
    const allDays = [0, 1, 2, 3, 4, 5, 6];
    const result = calculateNextRunAt('custom', { intervalDays: 30 }, after, allDays);

    const parts = belemDateParts(result);
    expect(parts.day).toBe(31);
    expect(parts.month).toBe(3);
    expectConsistentBelemTime(result);
  });

  it('should default to 30 days when intervalDays is not provided', () => {
    const after = utc('2024-03-01T15:00:00Z');
    const result = calculateNextRunAt('custom', {}, after);

    const parts = belemDateParts(result);
    // 31 março é domingo → snap para segunda 1 abril
    expect(parts.day).toBe(1);
    expect(parts.month).toBe(4);
  });

  it('should cross month boundary correctly', () => {
    // Dia 25 março, intervalo = 10 dias
    const after = utc('2024-03-25T15:00:00Z');
    const result = calculateNextRunAt('custom', { intervalDays: 10 }, after);

    const parts = belemDateParts(result);
    expect(parts.day).toBe(4);
    expect(parts.month).toBe(4); // abril
    expectConsistentBelemTime(result);
  });

  it('should cross year boundary correctly', () => {
    // Dia 28 dezembro, intervalo = 7 dias
    const after = utc('2023-12-28T15:00:00Z');
    const result = calculateNextRunAt('custom', { intervalDays: 7 }, after);

    const parts = belemDateParts(result);
    expect(parts.day).toBe(4);
    expect(parts.month).toBe(1); // janeiro
    expect(parts.year).toBe(2024);
    expectConsistentBelemTime(result);
  });

  it('should generate times at 08:00 Belém regardless of after time', () => {
    // Meia-noite em Belém = 03:00 UTC, +5 dias = 23 março (sábado) → 25 março (segunda)
    const after = utc('2024-03-18T03:00:00Z');
    const result = calculateNextRunAt('custom', { intervalDays: 5 }, after);

    const parts = belemDateParts(result);
    expect(parts.weekday).toBe('Mon');
    expect(parts.day).toBe(25);
    expectConsistentBelemTime(result);
  });
});

// ── Timezone e edge cases ────────────────────────────────────────

describe('calculateNextRunAt — timezone America/Belem', () => {
  it('should use default after=now when after is not provided', () => {
    const before = new Date();
    const result = calculateNextRunAt('custom', { intervalDays: 1 });
    expect(result.getTime()).toBeGreaterThan(before.getTime());
  });

  it('should always generate result at 08:00 Belém for weekly', () => {
    const after = utc('2024-03-17T09:00:00Z');
    const result = calculateNextRunAt('weekly', { dayOfWeek: 2 }, after);
    expectConsistentBelemTime(result);
  });

  it('should always generate result at 08:00 Belém for monthly', () => {
    const after = utc('2024-03-10T15:00:00Z');
    const result = calculateNextRunAt('monthly', { dayOfMonth: 20 }, after);
    expectConsistentBelemTime(result);
  });

  it('should always generate result at 08:00 Belém for custom', () => {
    const after = utc('2024-03-10T23:45:00Z');
    const result = calculateNextRunAt('custom', { intervalDays: 3 }, after);
    expectConsistentBelemTime(result);
  });

  it('should return a future date for all recurrence types', () => {
    const after = utc('2024-03-18T15:00:00Z');

    const weekly = calculateNextRunAt('weekly', { dayOfWeek: 1 }, after);
    const monthly = calculateNextRunAt('monthly', { dayOfMonth: 25 }, after);
    const custom = calculateNextRunAt('custom', { intervalDays: 3 }, after);

    expect(weekly.getTime()).toBeGreaterThan(after.getTime());
    expect(monthly.getTime()).toBeGreaterThan(after.getTime());
    expect(custom.getTime()).toBeGreaterThan(after.getTime());
  });

  it('should not advance date when weekdays is empty array (no restriction)', () => {
    // Sábado 12:00 Belém = 2024-03-23T15:00:00Z — normalmente avançaria para segunda
    // Com weekdays=[], snapToNextWorkday retorna imediatamente sem avançar
    const after = utc('2024-03-23T15:00:00Z');
    const emptyWeekdays: number[] = [];
    const result = calculateNextRunAt('custom', { intervalDays: 1 }, after, emptyWeekdays);

    // Com intervalDays=1 e sem restrição de dias úteis: resultado = domingo 24/03
    const parts = belemDateParts(result);
    expect(parts.day).toBe(24);
    expect(parts.weekday).toBe('Sun');
    expectConsistentBelemTime(result);
  });

  it('should not advance weekly result when weekdays is empty array', () => {
    // Domingo 06:00 Belém, alvo segunda (1) — sem restrição de weekdays
    const after = utc('2024-03-17T09:00:00Z');
    const emptyWeekdays: number[] = [];
    const result = calculateNextRunAt('weekly', { dayOfWeek: 1 }, after, emptyWeekdays);

    const parts = belemDateParts(result);
    expect(parts.weekday).toBe('Mon');
    expect(parts.day).toBe(18);
    expectConsistentBelemTime(result);
  });

  it('should not advance monthly result when weekdays is empty array', () => {
    // Dia 10 março, alvo dia 15 — cai em sexta, sem restrição não avança
    const after = utc('2024-03-10T15:00:00Z'); // dia 10 março
    const emptyWeekdays: number[] = [];
    const result = calculateNextRunAt('monthly', { dayOfMonth: 15 }, after, emptyWeekdays);

    const parts = belemDateParts(result);
    expect(parts.day).toBe(15);
    expect(parts.month).toBe(3);
    expectConsistentBelemTime(result);
  });
});
