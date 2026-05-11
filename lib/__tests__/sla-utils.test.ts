import { describe, expect, it } from 'vitest';

import type { BusinessCalendarConfig } from '@/lib/expediente-config';
import {
  addBusinessDays,
  addBusinessHours,
  addElapsedHours,
  addElapsedMinutes,
  addRealMinutes,
  computeSlaDueDatesFromConfig,
  evaluateResolutionBreach,
  evaluateResponseBreach,
  getSlaResolutionStatus,
} from '@/lib/sla-utils';

const DEFAULT_CONFIG: BusinessCalendarConfig = {
  timezone: 'America/Belem',
  workdayStart: '08:00',
  workdayEnd: '18:00',
  weekdays: [1, 2, 3, 4, 5],
};

function utc(iso: string): Date {
  return new Date(iso);
}

// ── addElapsedMinutes / addRealMinutes / addElapsedHours ─────────

describe('addElapsedMinutes', () => {
  it('adiciona minutos corridos (24x7)', () => {
    const from = utc('2024-03-18T10:00:00Z');
    const result = addElapsedMinutes(from, 90);
    expect(result.toISOString()).toBe('2024-03-18T11:30:00.000Z');
  });

  it('cruza meia-noite', () => {
    const from = utc('2024-03-18T23:30:00Z');
    const result = addElapsedMinutes(from, 60);
    expect(result.toISOString()).toBe('2024-03-19T00:30:00.000Z');
  });
});

describe('addRealMinutes', () => {
  it('é alias de addElapsedMinutes', () => {
    const from = utc('2024-03-18T10:00:00Z');
    expect(addRealMinutes(from, 120).getTime()).toBe(addElapsedMinutes(from, 120).getTime());
  });
});

describe('addElapsedHours', () => {
  it('converte horas para minutos e adiciona', () => {
    const from = utc('2024-03-18T10:00:00Z');
    const result = addElapsedHours(from, 2.5);
    expect(result.toISOString()).toBe('2024-03-18T12:30:00.000Z');
  });
});

// ── addBusinessHours / addBusinessDays ───────────────────────────

describe('addBusinessHours', () => {
  it('converte horas para minutos e delega para addBusinessMinutes', () => {
    // Seg 10:00 Belém (13:00 UTC) + 2h = 12:00 Belém (15:00 UTC)
    const result = addBusinessHours(utc('2024-03-18T13:00:00Z'), 2, DEFAULT_CONFIG);
    expect(result.toISOString()).toBe('2024-03-18T15:00:00.000Z');
  });
});

describe('addBusinessDays', () => {
  it('1 dia útil = 600 minutos no config padrão', () => {
    // Seg 08:00 Belém (11:00 UTC) + 600min = Seg 18:00 Belém (21:00 UTC)
    const result = addBusinessDays(utc('2024-03-18T11:00:00Z'), 1, DEFAULT_CONFIG);
    expect(result.toISOString()).toBe('2024-03-18T21:00:00.000Z');
  });
});

// ── computeSlaDueDatesFromConfig ─────────────────────────────────

describe('computeSlaDueDatesFromConfig', () => {
  it('businessHoursOnly = true usa horário comercial', () => {
    // Seg 10:00 Belém (13:00 UTC), response 120min, resolution 480min
    const from = utc('2024-03-18T13:00:00Z');
    const { responseDueAt, resolutionDueAt } = computeSlaDueDatesFromConfig(
      from,
      120,
      480,
      true,
      DEFAULT_CONFIG,
    );

    // 10:00 + 120min = 12:00 Belém (15:00 UTC)
    expect(responseDueAt.toISOString()).toBe('2024-03-18T15:00:00.000Z');

    // 10:00 + 480min = 10:00 + 8h = 18:00 Belém (21:00 UTC)
    expect(resolutionDueAt.toISOString()).toBe('2024-03-18T21:00:00.000Z');
  });

  it('businessHoursOnly = false usa minutos corridos (24x7)', () => {
    const from = utc('2024-03-18T13:00:00Z');
    const { responseDueAt, resolutionDueAt } = computeSlaDueDatesFromConfig(from, 120, 480, false);

    expect(responseDueAt.toISOString()).toBe('2024-03-18T15:00:00.000Z');
    expect(resolutionDueAt.toISOString()).toBe('2024-03-18T21:00:00.000Z');
  });

  it('businessHoursOnly com feriados pula dias', () => {
    const holidays = new Set(['2024-03-19']); // Terça é feriado
    const from = utc('2024-03-18T20:00:00Z'); // Seg 17:00 Belém, restam 60min
    const { responseDueAt } = computeSlaDueDatesFromConfig(
      from,
      120,
      480,
      true,
      DEFAULT_CONFIG,
      holidays,
    );

    // Seg 17:00, restam 60min no dia, sobram 60min → pula feriado ter → Qua 08:00 + 60 = 09:00
    expect(responseDueAt.toISOString()).toBe('2024-03-20T12:00:00.000Z'); // Qua 09:00 Belém
  });

  it('sem calendarConfig usa defaults', () => {
    const from = utc('2024-03-18T13:00:00Z');
    const result = computeSlaDueDatesFromConfig(from, 60, 120, true);
    // Deve funcionar sem erro (usa default config)
    expect(result.responseDueAt).toBeInstanceOf(Date);
    expect(result.resolutionDueAt).toBeInstanceOf(Date);
  });
});

// ── evaluateResponseBreach ───────────────────────────────────────

describe('evaluateResponseBreach', () => {
  const due = utc('2024-03-18T15:00:00Z');

  it('retorna null se responseDueAt é null', () => {
    expect(evaluateResponseBreach(utc('2024-03-18T16:00:00Z'), null, null)).toBeNull();
  });

  it('retorna null se respondido antes do prazo', () => {
    const startedAt = utc('2024-03-18T14:00:00Z');
    expect(evaluateResponseBreach(utc('2024-03-18T16:00:00Z'), due, startedAt)).toBeNull();
  });

  it('retorna data do breach se respondido DEPOIS do prazo', () => {
    const startedAt = utc('2024-03-18T16:00:00Z'); // 1h após o due
    const result = evaluateResponseBreach(utc('2024-03-18T17:00:00Z'), due, startedAt);
    expect(result).toEqual(startedAt);
  });

  it('retorna now se não respondido e now > due', () => {
    const now = utc('2024-03-18T16:00:00Z');
    expect(evaluateResponseBreach(now, due, null)).toEqual(now);
  });

  it('retorna null se não respondido mas now <= due', () => {
    const now = utc('2024-03-18T14:00:00Z');
    expect(evaluateResponseBreach(now, due, null)).toBeNull();
  });

  it('retorna null se respondido no exato momento do prazo', () => {
    // responseStartedAt === responseDueAt → não breach (<=)
    expect(evaluateResponseBreach(utc('2024-03-18T16:00:00Z'), due, due)).toBeNull();
  });
});

// ── evaluateResolutionBreach ─────────────────────────────────────

describe('evaluateResolutionBreach', () => {
  const due = utc('2024-03-18T21:00:00Z');

  it('retorna null se resolutionDueAt é null', () => {
    expect(evaluateResolutionBreach(utc('2024-03-19T00:00:00Z'), null, null)).toBeNull();
  });

  it('retorna null se resolvido antes do prazo', () => {
    const resolvedAt = utc('2024-03-18T20:00:00Z');
    expect(evaluateResolutionBreach(utc('2024-03-19T00:00:00Z'), due, resolvedAt)).toBeNull();
  });

  it('retorna resolvedAt se resolvido DEPOIS do prazo', () => {
    const resolvedAt = utc('2024-03-18T22:00:00Z');
    expect(evaluateResolutionBreach(utc('2024-03-19T00:00:00Z'), due, resolvedAt)).toEqual(
      resolvedAt,
    );
  });

  it('retorna now se não resolvido e now > due', () => {
    const now = utc('2024-03-18T22:00:00Z');
    expect(evaluateResolutionBreach(now, due, null)).toEqual(now);
  });

  it('retorna null se não resolvido mas now <= due', () => {
    expect(evaluateResolutionBreach(utc('2024-03-18T20:00:00Z'), due, null)).toBeNull();
  });
});

// ── getSlaResolutionStatus ───────────────────────────────────────

describe('getSlaResolutionStatus', () => {
  const dueAt = utc('2024-03-18T21:00:00Z');
  const startAt = utc('2024-03-18T11:00:00Z'); // 10h total

  it('retorna "atrasado" se resolutionBreachedAt não é null', () => {
    const result = getSlaResolutionStatus(
      utc('2024-03-18T22:00:00Z'),
      dueAt,
      null,
      utc('2024-03-18T21:01:00Z'),
      'NORMAL',
    );
    expect(result).toBe('atrasado');
  });

  it('retorna "atrasado" se now > due e não resolvido', () => {
    const result = getSlaResolutionStatus(utc('2024-03-18T22:00:00Z'), dueAt, null, null, 'NORMAL');
    expect(result).toBe('atrasado');
  });

  it('retorna "no_prazo" se já resolvido sem breach', () => {
    const result = getSlaResolutionStatus(
      utc('2024-03-18T22:00:00Z'),
      dueAt,
      utc('2024-03-18T20:00:00Z'), // resolvido antes do prazo
      null,
      'NORMAL',
    );
    expect(result).toBe('no_prazo');
  });

  it('retorna "no_prazo" se resolutionDueAt é null', () => {
    const result = getSlaResolutionStatus(utc('2024-03-18T22:00:00Z'), null, null, null, 'NORMAL');
    expect(result).toBe('no_prazo');
  });

  it('retorna "proximo_vencimento" quando falta <= 20% do tempo total', () => {
    // Total: 10h (11:00 → 21:00), 20% = 2h, threshold = 19:00 UTC
    const now = utc('2024-03-18T19:30:00Z'); // faltam 1.5h (< 2h = 20%)
    const result = getSlaResolutionStatus(now, dueAt, null, null, 'NORMAL', startAt);
    expect(result).toBe('proximo_vencimento');
  });

  it('retorna "no_prazo" quando falta > 20% do tempo total', () => {
    const now = utc('2024-03-18T15:00:00Z'); // faltam 6h (60% restante)
    const result = getSlaResolutionStatus(now, dueAt, null, null, 'NORMAL', startAt);
    expect(result).toBe('no_prazo');
  });

  it('prioridade ALTA: "proximo_vencimento" se faltam <= 4h', () => {
    const now = utc('2024-03-18T17:30:00Z'); // faltam 3.5h
    const result = getSlaResolutionStatus(now, dueAt, null, null, 'ALTA');
    expect(result).toBe('proximo_vencimento');
  });

  it('prioridade ALTA: "no_prazo" se faltam > 4h', () => {
    const now = utc('2024-03-18T15:00:00Z'); // faltam 6h
    const result = getSlaResolutionStatus(now, dueAt, null, null, 'ALTA');
    expect(result).toBe('no_prazo');
  });

  it('prioridade NORMAL sem resolutionStartAt: sem regra dos 20%', () => {
    // Sem startAt, não calcula 20%, apenas verifica breach
    const now = utc('2024-03-18T20:59:00Z'); // 1 minuto antes do prazo
    const result = getSlaResolutionStatus(now, dueAt, null, null, 'NORMAL');
    // Sem startAt e não é ALTA, portanto no_prazo
    expect(result).toBe('no_prazo');
  });
});
