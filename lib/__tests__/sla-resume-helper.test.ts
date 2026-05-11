import { describe, expect, it } from 'vitest';

import type { BusinessCalendarConfig } from '@/lib/expediente-config';
import { computeNewResolutionDueAtOnResume } from '@/lib/sla-utils';

const BELEM_CONFIG: BusinessCalendarConfig = {
  timezone: 'America/Belem', // UTC-3 sem DST
  workdayStart: '08:00',
  workdayEnd: '18:00',
  weekdays: [1, 2, 3, 4, 5],
};

// Datas abaixo usam UTC explícito. America/Belem é UTC-3, então 10:00 Belém = 13:00 UTC.

// ── businessHoursOnly = false (24x7) ─────────────────────────────

describe('computeNewResolutionDueAtOnResume — 24x7', () => {
  it('deve estender o prazo pelos minutos corridos da pausa', () => {
    // Arrange
    const currentDueAt = new Date('2026-04-23T15:00:00.000Z');
    const slaPausedAt = new Date('2026-04-23T10:00:00.000Z');
    const now = new Date('2026-04-23T12:30:00.000Z');
    const pausedMinutes = 150; // 2h30 em tempo real

    // Act
    const result = computeNewResolutionDueAtOnResume(
      currentDueAt,
      slaPausedAt,
      now,
      false,
      pausedMinutes,
    );

    // Assert — prazo estendido em 150 min corridos
    expect(result.getTime()).toBe(new Date('2026-04-23T17:30:00.000Z').getTime());
  });

  it('ignora calendarConfig quando businessHoursOnly é false', () => {
    // Arrange
    const currentDueAt = new Date('2026-04-23T15:00:00.000Z');
    const slaPausedAt = new Date('2026-04-24T20:00:00.000Z'); // noite
    const now = new Date('2026-04-27T09:00:00.000Z'); // segunda manhã (pula fim de semana)
    const pausedMinutes = 61 * 60; // ~61h corridos

    // Act
    const result = computeNewResolutionDueAtOnResume(
      currentDueAt,
      slaPausedAt,
      now,
      false,
      pausedMinutes,
      BELEM_CONFIG,
    );

    // Assert — 61h corridos adicionados
    expect(result.getTime()).toBe(currentDueAt.getTime() + pausedMinutes * 60_000);
  });
});

// ── businessHoursOnly = true ─────────────────────────────────────

describe('computeNewResolutionDueAtOnResume — businessHoursOnly', () => {
  it('pausa inteiramente fora do expediente NÃO move o prazo', () => {
    // Arrange — pausa das 20h (terça) às 6h (quarta) em Belém (UTC-3)
    // 20h Belém = 23:00 UTC, 6h Belém = 09:00 UTC
    const currentDueAt = new Date('2026-04-23T15:00:00.000Z'); // terça 12:00 Belém
    const slaPausedAt = new Date('2026-04-21T23:00:00.000Z'); // terça 20:00 Belém (fora expediente)
    const now = new Date('2026-04-22T09:00:00.000Z'); // quarta 06:00 Belém (ainda antes do expediente)
    const pausedMinutes = 10 * 60; // 10h em wall clock

    // Act
    const result = computeNewResolutionDueAtOnResume(
      currentDueAt,
      slaPausedAt,
      now,
      true,
      pausedMinutes,
      BELEM_CONFIG,
    );

    // Assert — nenhum minuto útil decorreu durante a pausa; prazo intacto
    expect(result.getTime()).toBe(currentDueAt.getTime());
  });

  it('pausa inteiramente em fim de semana NÃO move o prazo', () => {
    // Arrange — pausa de sábado 10h a domingo 18h (Belém)
    // Sábado 10:00 Belém = 13:00 UTC; Domingo 18:00 Belém = 21:00 UTC
    const currentDueAt = new Date('2026-04-27T17:00:00.000Z'); // segunda 14:00 Belém
    const slaPausedAt = new Date('2026-04-25T13:00:00.000Z'); // sábado 10:00 Belém
    const now = new Date('2026-04-26T21:00:00.000Z'); // domingo 18:00 Belém
    const pausedMinutes = 32 * 60; // 32h corridos

    // Act
    const result = computeNewResolutionDueAtOnResume(
      currentDueAt,
      slaPausedAt,
      now,
      true,
      pausedMinutes,
      BELEM_CONFIG,
    );

    // Assert — nenhum minuto útil no fim de semana; prazo intacto
    expect(result.getTime()).toBe(currentDueAt.getTime());
  });

  it('pausa integralmente durante expediente estende pelo mesmo tempo', () => {
    // Arrange — pausa das 10h às 12h (terça Belém) — 2h integralmente em expediente
    // 10:00 Belém = 13:00 UTC; 12:00 Belém = 15:00 UTC
    const currentDueAt = new Date('2026-04-22T19:00:00.000Z'); // quarta 16:00 Belém
    const slaPausedAt = new Date('2026-04-21T13:00:00.000Z'); // terça 10:00 Belém
    const now = new Date('2026-04-21T15:00:00.000Z'); // terça 12:00 Belém
    const pausedMinutes = 120;

    // Act
    const result = computeNewResolutionDueAtOnResume(
      currentDueAt,
      slaPausedAt,
      now,
      true,
      pausedMinutes,
      BELEM_CONFIG,
    );

    // Assert — prazo estendido em 2h úteis = quinta 10h Belém? Não — currentDueAt era quarta 16h
    // Adicionando 2h úteis a quarta 16h: 16h + 2h = 18h (fim do expediente), então continua quinta 08h
    // Espera-se quarta 18h (parou exatamente no fim do dia)
    const expected = new Date('2026-04-22T21:00:00.000Z'); // quarta 18:00 Belém
    expect(result.getTime()).toBe(expected.getTime());
  });

  it('pausa que atravessa fim de expediente conta apenas minutos úteis', () => {
    // Arrange — pausa das 17h (terça) às 09h (quarta) em Belém
    // Minutos úteis: 17-18 (1h terça) + 08-09 (1h quarta) = 2h
    // 17:00 Belém = 20:00 UTC; 09:00 Belém = 12:00 UTC
    const currentDueAt = new Date('2026-04-22T17:00:00.000Z'); // quarta 14:00 Belém
    const slaPausedAt = new Date('2026-04-21T20:00:00.000Z'); // terça 17:00 Belém
    const now = new Date('2026-04-22T12:00:00.000Z'); // quarta 09:00 Belém
    const pausedMinutes = 16 * 60; // 16h wall clock

    // Act
    const result = computeNewResolutionDueAtOnResume(
      currentDueAt,
      slaPausedAt,
      now,
      true,
      pausedMinutes,
      BELEM_CONFIG,
    );

    // Assert — só 2h úteis, então prazo estende de quarta 14h → quarta 16h Belém
    const expected = new Date('2026-04-22T19:00:00.000Z'); // quarta 16:00 Belém
    expect(result.getTime()).toBe(expected.getTime());
  });
});
