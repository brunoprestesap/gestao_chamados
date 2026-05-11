import { describe, expect, it } from 'vitest';

import type { BusinessCalendarConfig } from '@/lib/expediente-config';
import {
  addBusinessMinutesWithConfig,
  getBusinessMinutesPerDay,
  getLocalWeekdayAndHour,
  isWithinBusinessHours,
  snapToNextBusinessStart,
  toLocalDateYYYYMMDD,
} from '@/lib/sla-timezone';

const DEFAULT_CONFIG: BusinessCalendarConfig = {
  timezone: 'America/Belem', // UTC-3 (sem horário de verão)
  workdayStart: '08:00',
  workdayEnd: '18:00',
  weekdays: [1, 2, 3, 4, 5], // Seg-Sex
};

/** Helper: cria Date UTC a partir de string ISO */
function utc(iso: string): Date {
  return new Date(iso);
}

// ── toLocalDateYYYYMMDD ──────────────────────────────────────────

describe('toLocalDateYYYYMMDD', () => {
  it('converte UTC para data local em America/Belem (UTC-3)', () => {
    // 2024-03-15T12:00:00Z → 09:00 em Belém → 2024-03-15
    expect(toLocalDateYYYYMMDD(utc('2024-03-15T12:00:00Z'), 'America/Belem')).toBe('2024-03-15');
  });

  it('meia-noite UTC vira dia anterior em Belém (UTC-3)', () => {
    // 2024-03-15T00:00:00Z → 21:00 de 2024-03-14 em Belém
    expect(toLocalDateYYYYMMDD(utc('2024-03-15T00:00:00Z'), 'America/Belem')).toBe('2024-03-14');
  });

  it('02:59 UTC ainda é dia anterior em Belém', () => {
    expect(toLocalDateYYYYMMDD(utc('2024-03-15T02:59:00Z'), 'America/Belem')).toBe('2024-03-14');
  });

  it('03:00 UTC é início do novo dia em Belém', () => {
    expect(toLocalDateYYYYMMDD(utc('2024-03-15T03:00:00Z'), 'America/Belem')).toBe('2024-03-15');
  });
});

// ── getLocalWeekdayAndHour ───────────────────────────────────────

describe('getLocalWeekdayAndHour', () => {
  it('retorna dia da semana correto para segunda-feira em Belém', () => {
    // 2024-03-18 é segunda-feira
    // 12:00 UTC → 09:00 Belém
    const result = getLocalWeekdayAndHour(utc('2024-03-18T12:00:00Z'), DEFAULT_CONFIG);
    expect(result.dayOfWeek).toBe(1); // Segunda = 1
    expect(result.hourFraction).toBeCloseTo(9.0, 1);
  });

  it('retorna domingo = 0', () => {
    // 2024-03-17 é domingo
    const result = getLocalWeekdayAndHour(utc('2024-03-17T15:00:00Z'), DEFAULT_CONFIG);
    expect(result.dayOfWeek).toBe(0);
  });

  it('retorna hora fracionada correta (ex: 14:30 → 14.5)', () => {
    // 17:30 UTC → 14:30 Belém
    const result = getLocalWeekdayAndHour(utc('2024-03-18T17:30:00Z'), DEFAULT_CONFIG);
    expect(result.hourFraction).toBeCloseTo(14.5, 1);
  });
});

// ── isWithinBusinessHours ────────────────────────────────────────

describe('isWithinBusinessHours', () => {
  it('08:00 local está dentro do expediente', () => {
    // 08:00 Belém = 11:00 UTC
    expect(isWithinBusinessHours(utc('2024-03-18T11:00:00Z'), DEFAULT_CONFIG)).toBe(true);
  });

  it('17:59 local está dentro do expediente', () => {
    // 17:59 Belém = 20:59 UTC
    expect(isWithinBusinessHours(utc('2024-03-18T20:59:00Z'), DEFAULT_CONFIG)).toBe(true);
  });

  it('18:00 local está FORA do expediente (exclusive end)', () => {
    // 18:00 Belém = 21:00 UTC
    expect(isWithinBusinessHours(utc('2024-03-18T21:00:00Z'), DEFAULT_CONFIG)).toBe(false);
  });

  it('07:59 local está FORA do expediente', () => {
    // 07:59 Belém = 10:59 UTC
    expect(isWithinBusinessHours(utc('2024-03-18T10:59:00Z'), DEFAULT_CONFIG)).toBe(false);
  });

  it('domingo fora do expediente mesmo em horário comercial', () => {
    // 2024-03-17 é domingo, 12:00 Belém = 15:00 UTC
    expect(isWithinBusinessHours(utc('2024-03-17T15:00:00Z'), DEFAULT_CONFIG)).toBe(false);
  });
});

// ── getBusinessMinutesPerDay ─────────────────────────────────────

describe('getBusinessMinutesPerDay', () => {
  it('08:00-18:00 = 600 minutos', () => {
    expect(getBusinessMinutesPerDay(DEFAULT_CONFIG)).toBe(600);
  });

  it('09:00-17:00 = 480 minutos', () => {
    const config: BusinessCalendarConfig = {
      ...DEFAULT_CONFIG,
      workdayStart: '09:00',
      workdayEnd: '17:00',
    };
    expect(getBusinessMinutesPerDay(config)).toBe(480);
  });

  it('08:30-12:00 = 210 minutos (meio período)', () => {
    const config: BusinessCalendarConfig = {
      ...DEFAULT_CONFIG,
      workdayStart: '08:30',
      workdayEnd: '12:00',
    };
    expect(getBusinessMinutesPerDay(config)).toBe(210);
  });
});

// ── snapToNextBusinessStart ──────────────────────────────────────

describe('snapToNextBusinessStart', () => {
  it('durante expediente, retorna mesma data (sem snap)', () => {
    // Segunda 10:00 Belém = 13:00 UTC
    const input = utc('2024-03-18T13:00:00Z');
    const result = snapToNextBusinessStart(input, DEFAULT_CONFIG);
    expect(result.getTime()).toBe(input.getTime());
  });

  it('antes do expediente, snapa para início do dia', () => {
    // Segunda 06:00 Belém = 09:00 UTC → snap para 08:00 Belém = 11:00 UTC
    const result = snapToNextBusinessStart(utc('2024-03-18T09:00:00Z'), DEFAULT_CONFIG);
    expect(toLocalDateYYYYMMDD(result, 'America/Belem')).toBe('2024-03-18');
    const { hourFraction } = getLocalWeekdayAndHour(result, DEFAULT_CONFIG);
    expect(hourFraction).toBeCloseTo(8.0, 1);
  });

  it('após expediente, snapa para próximo dia útil', () => {
    // Segunda 19:00 Belém = 22:00 UTC → snap para terça 08:00 Belém
    const result = snapToNextBusinessStart(utc('2024-03-18T22:00:00Z'), DEFAULT_CONFIG);
    expect(toLocalDateYYYYMMDD(result, 'America/Belem')).toBe('2024-03-19');
    const { hourFraction } = getLocalWeekdayAndHour(result, DEFAULT_CONFIG);
    expect(hourFraction).toBeCloseTo(8.0, 1);
  });

  it('sábado snapa para segunda', () => {
    // 2024-03-16 é sábado, 10:00 Belém = 13:00 UTC
    const result = snapToNextBusinessStart(utc('2024-03-16T13:00:00Z'), DEFAULT_CONFIG);
    expect(toLocalDateYYYYMMDD(result, 'America/Belem')).toBe('2024-03-18'); // Segunda
    const { hourFraction } = getLocalWeekdayAndHour(result, DEFAULT_CONFIG);
    expect(hourFraction).toBeCloseTo(8.0, 1);
  });

  it('domingo snapa para segunda', () => {
    // 2024-03-17 é domingo
    const result = snapToNextBusinessStart(utc('2024-03-17T15:00:00Z'), DEFAULT_CONFIG);
    expect(toLocalDateYYYYMMDD(result, 'America/Belem')).toBe('2024-03-18');
  });

  it('sexta após expediente snapa para segunda', () => {
    // 2024-03-15 é sexta, 20:00 Belém = 23:00 UTC
    const result = snapToNextBusinessStart(utc('2024-03-15T23:00:00Z'), DEFAULT_CONFIG);
    expect(toLocalDateYYYYMMDD(result, 'America/Belem')).toBe('2024-03-18');
  });

  it('respeita feriados — pula dia marcado', () => {
    const holidays = new Set(['2024-03-18']); // Segunda é feriado
    // Sexta 19:00 → deveria ir para terça 08:00
    const result = snapToNextBusinessStart(utc('2024-03-15T22:00:00Z'), DEFAULT_CONFIG, holidays);
    expect(toLocalDateYYYYMMDD(result, 'America/Belem')).toBe('2024-03-19'); // Terça
  });

  it('pula feriados consecutivos', () => {
    const holidays = new Set(['2024-03-18', '2024-03-19']); // Seg e Ter feriados
    const result = snapToNextBusinessStart(utc('2024-03-15T22:00:00Z'), DEFAULT_CONFIG, holidays);
    expect(toLocalDateYYYYMMDD(result, 'America/Belem')).toBe('2024-03-20'); // Quarta
  });
});

// ── addBusinessMinutesWithConfig ─────────────────────────────────

describe('addBusinessMinutesWithConfig', () => {
  it('minutos = 0 retorna mesma data', () => {
    const input = utc('2024-03-18T13:00:00Z');
    const result = addBusinessMinutesWithConfig(input, 0, DEFAULT_CONFIG);
    expect(result.getTime()).toBe(input.getTime());
  });

  it('minutos negativos retorna mesma data', () => {
    const input = utc('2024-03-18T13:00:00Z');
    const result = addBusinessMinutesWithConfig(input, -10, DEFAULT_CONFIG);
    expect(result.getTime()).toBe(input.getTime());
  });

  it('adiciona 60 min dentro do mesmo dia', () => {
    // Segunda 10:00 Belém = 13:00 UTC → +60min = 11:00 Belém = 14:00 UTC
    const result = addBusinessMinutesWithConfig(utc('2024-03-18T13:00:00Z'), 60, DEFAULT_CONFIG);
    const { hourFraction } = getLocalWeekdayAndHour(result, DEFAULT_CONFIG);
    expect(hourFraction).toBeCloseTo(11.0, 1);
    expect(toLocalDateYYYYMMDD(result, 'America/Belem')).toBe('2024-03-18');
  });

  it('transborda para próximo dia quando restam poucos minutos', () => {
    // Segunda 17:30 Belém = 20:30 UTC → +60min (restam 30 no dia, sobram 30)
    // → terça 08:30 Belém
    const result = addBusinessMinutesWithConfig(utc('2024-03-18T20:30:00Z'), 60, DEFAULT_CONFIG);
    expect(toLocalDateYYYYMMDD(result, 'America/Belem')).toBe('2024-03-19');
    const { hourFraction } = getLocalWeekdayAndHour(result, DEFAULT_CONFIG);
    expect(hourFraction).toBeCloseTo(8.5, 1);
  });

  it('abertura sexta 17:30 + 120min → segunda 09:30', () => {
    // Sexta 17:30 Belém = 20:30 UTC → restam 30min na sexta → sobram 90min
    // → segunda 08:00 + 90min = 09:30
    const result = addBusinessMinutesWithConfig(utc('2024-03-15T20:30:00Z'), 120, DEFAULT_CONFIG);
    expect(toLocalDateYYYYMMDD(result, 'America/Belem')).toBe('2024-03-18');
    const { hourFraction } = getLocalWeekdayAndHour(result, DEFAULT_CONFIG);
    expect(hourFraction).toBeCloseTo(9.5, 1);
  });

  it('adiciona 1 dia útil completo (600 min)', () => {
    // Segunda 08:00 Belém + 600min = 18:00 do MESMO dia (expediente inteiro consumido)
    const result = addBusinessMinutesWithConfig(utc('2024-03-18T11:00:00Z'), 600, DEFAULT_CONFIG);
    expect(toLocalDateYYYYMMDD(result, 'America/Belem')).toBe('2024-03-18');
    const { hourFraction } = getLocalWeekdayAndHour(result, DEFAULT_CONFIG);
    expect(hourFraction).toBeCloseTo(18.0, 1);
  });

  it('abertura no sábado snapa para segunda e conta a partir de 08:00', () => {
    // Sábado 14:00 Belém = 17:00 UTC → snap para Seg 08:00 → +120min = 10:00
    const result = addBusinessMinutesWithConfig(utc('2024-03-16T17:00:00Z'), 120, DEFAULT_CONFIG);
    expect(toLocalDateYYYYMMDD(result, 'America/Belem')).toBe('2024-03-18');
    const { hourFraction } = getLocalWeekdayAndHour(result, DEFAULT_CONFIG);
    expect(hourFraction).toBeCloseTo(10.0, 1);
  });

  it('respeita feriado na segunda — pula para terça', () => {
    const holidays = new Set(['2024-03-18']);
    // Sexta 17:00 Belém + 120min → pula sáb, dom, feriado seg → ter 08:00 + 60 restantes
    // Sexta 17:00, restam 60min no dia → sobram 60
    const result = addBusinessMinutesWithConfig(
      utc('2024-03-15T20:00:00Z'),
      120,
      DEFAULT_CONFIG,
      holidays,
    );
    expect(toLocalDateYYYYMMDD(result, 'America/Belem')).toBe('2024-03-19');
    const { hourFraction } = getLocalWeekdayAndHour(result, DEFAULT_CONFIG);
    expect(hourFraction).toBeCloseTo(9.0, 1);
  });

  it('prazo de múltiplos dias úteis', () => {
    // Segunda 08:00 + 1800min (3 * 600) → consome Seg, Ter, Qua → Qua 18:00
    const result = addBusinessMinutesWithConfig(utc('2024-03-18T11:00:00Z'), 1800, DEFAULT_CONFIG);
    expect(toLocalDateYYYYMMDD(result, 'America/Belem')).toBe('2024-03-20'); // Quarta
    const { hourFraction } = getLocalWeekdayAndHour(result, DEFAULT_CONFIG);
    expect(hourFraction).toBeCloseTo(18.0, 1);
  });

  it('weekdays customizados (seg-sáb)', () => {
    const configSat: BusinessCalendarConfig = {
      ...DEFAULT_CONFIG,
      weekdays: [1, 2, 3, 4, 5, 6], // Inclui sábado
    };
    // Sexta 17:30 Belém + 120min → sobram 90min → sábado 08:00 + 90 = 09:30
    const result = addBusinessMinutesWithConfig(utc('2024-03-15T20:30:00Z'), 120, configSat);
    expect(toLocalDateYYYYMMDD(result, 'America/Belem')).toBe('2024-03-16'); // Sábado
    const { hourFraction } = getLocalWeekdayAndHour(result, configSat);
    expect(hourFraction).toBeCloseTo(9.5, 1);
  });

  it('fim do expediente exato (18:00) snapa para próximo dia', () => {
    // Segunda 18:00 Belém = 21:00 UTC → snap para terça 08:00 → +60min = 09:00
    const result = addBusinessMinutesWithConfig(utc('2024-03-18T21:00:00Z'), 60, DEFAULT_CONFIG);
    expect(toLocalDateYYYYMMDD(result, 'America/Belem')).toBe('2024-03-19');
    const { hourFraction } = getLocalWeekdayAndHour(result, DEFAULT_CONFIG);
    expect(hourFraction).toBeCloseTo(9.0, 1);
  });
});
