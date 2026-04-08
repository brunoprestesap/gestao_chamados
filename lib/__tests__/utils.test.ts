import { describe, expect, it } from 'vitest';

import {
  formatDate,
  formatDateShort,
  formatDateTime,
  formatTime,
  INSTITUTIONAL_TIMEZONE,
  truncate,
} from '@/lib/utils';

// ── truncate ─────────────────────────────────────────────────────

describe('truncate', () => {
  it('retorna "—" para string vazia', () => {
    expect(truncate('', 10)).toBe('—');
  });

  it('retorna "—" para string falsy', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(truncate(null as any, 10)).toBe('—');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(truncate(undefined as any, 10)).toBe('—');
  });

  it('retorna string inteira se menor ou igual ao max', () => {
    expect(truncate('abc', 5)).toBe('abc');
    expect(truncate('abcde', 5)).toBe('abcde');
  });

  it('trunca e adiciona reticências se maior que max', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcde…');
  });

  it('max = 0 trunca tudo', () => {
    expect(truncate('abc', 0)).toBe('…');
  });
});

// ── INSTITUTIONAL_TIMEZONE ───────────────────────────────────────

describe('INSTITUTIONAL_TIMEZONE', () => {
  it('é America/Belem', () => {
    expect(INSTITUTIONAL_TIMEZONE).toBe('America/Belem');
  });
});

// ── formatDate ───────────────────────────────────────────────────

describe('formatDate', () => {
  it('formata Date em dd/mm/yyyy no timezone institucional', () => {
    // 2024-03-15T15:00:00Z → 12:00 em Belém → 15/03/2024
    const result = formatDate(new Date('2024-03-15T15:00:00Z'));
    expect(result).toBe('15/03/2024');
  });

  it('aceita string ISO', () => {
    const result = formatDate('2024-03-15T15:00:00Z');
    expect(result).toBe('15/03/2024');
  });

  it('meia-noite UTC pode cair no dia anterior em Belém', () => {
    // 2024-03-15T00:00:00Z → 21:00 de 14/03 em Belém (UTC-3)
    const result = formatDate(new Date('2024-03-15T00:00:00Z'));
    expect(result).toBe('14/03/2024');
  });

  it('respeita timeZone customizado', () => {
    const result = formatDate(new Date('2024-03-15T15:00:00Z'), { timeZone: 'UTC' });
    expect(result).toBe('15/03/2024');
  });
});

// ── formatDateTime ───────────────────────────────────────────────

describe('formatDateTime', () => {
  it('formata com data e hora', () => {
    // 15:00 UTC → 12:00 Belém
    const result = formatDateTime(new Date('2024-03-15T15:00:00Z'));
    expect(result).toMatch(/15\/03\/2024/);
    expect(result).toMatch(/12:00/);
  });

  it('aceita string ISO', () => {
    const result = formatDateTime('2024-03-15T15:30:00Z');
    expect(result).toMatch(/12:30/);
  });
});

// ── formatDateShort ──────────────────────────────────────────────

describe('formatDateShort', () => {
  it('formata com ano de 2 dígitos', () => {
    const result = formatDateShort(new Date('2024-03-15T15:00:00Z'));
    expect(result).toMatch(/15\/03\/24/);
  });
});

// ── formatTime ───────────────────────────────────────────────────

describe('formatTime', () => {
  it('formata apenas hora:minuto', () => {
    // 15:00 UTC → 12:00 Belém
    const result = formatTime(new Date('2024-03-15T15:00:00Z'));
    expect(result).toBe('12:00');
  });

  it('aceita string ISO', () => {
    const result = formatTime('2024-03-15T17:45:00Z');
    expect(result).toBe('14:45');
  });
});
