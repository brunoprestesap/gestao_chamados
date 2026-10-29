import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O calendário do IMR do contrato (spec 0023): o expediente e os feriados
 * ativos do SLA, lidos uma vez para os prazos do mês.
 *
 * covers: AC-2
 */

const calendario = vi.hoisted(() => ({
  cfg: { weekdays: [1, 2, 3, 4, 5], workdayEnd: '18:00', timezone: 'America/Belem' },
  feriados: new Set<string>(),
}));

const getActiveHolidaysForRange = vi.hoisted(() =>
  vi.fn<(de: Date, ate: Date, tz: string) => Promise<Set<string>>>(async () => calendario.feriados),
);

vi.mock('@/lib/expediente-config', () => ({
  getBusinessCalendarConfig: async () => calendario.cfg,
}));
vi.mock('@/lib/holidays', () => ({ getActiveHolidaysForRange }));

import { lerCalendarioImr } from '../calendario';

beforeEach(() => {
  calendario.cfg = { weekdays: [1, 2, 3, 4, 5], workdayEnd: '18:00', timezone: 'America/Belem' };
  calendario.feriados = new Set();
  getActiveHolidaysForRange.mockClear();
});

describe('lerCalendarioImr', () => {
  it('junta os dias úteis e o fim do expediente com os feriados ativos do período', async () => {
    calendario.feriados = new Set(['2026-09-07']);
    const de = new Date('2026-09-01T03:00:00Z');
    const ate = new Date('2026-10-01T03:00:00Z');

    const cal = await lerCalendarioImr(de, ate);

    expect(cal).toEqual({
      weekdays: [1, 2, 3, 4, 5],
      workdayEnd: '18:00',
      feriados: new Set(['2026-09-07']),
    });
    expect(getActiveHolidaysForRange).toHaveBeenCalledWith(de, ate, 'America/Belem');
  });
});
