import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatRelativeTime } from '@/lib/format-relative-time';

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── "agora" ──────────────────────────────────────────────────────

  it('should return "agora" when diff is 0 seconds', () => {
    const now = new Date('2024-03-15T12:00:00Z');
    vi.setSystemTime(now);

    expect(formatRelativeTime(now)).toBe('agora');
  });

  it('should return "agora" when diff is 59 seconds', () => {
    const now = new Date('2024-03-15T12:00:59Z');
    vi.setSystemTime(now);
    const then = new Date('2024-03-15T12:00:00Z');

    expect(formatRelativeTime(then)).toBe('agora');
  });

  it('should return "agora" when diff is exactly 59 seconds (boundary)', () => {
    vi.setSystemTime(new Date('2024-03-15T12:00:59.999Z'));
    const then = new Date('2024-03-15T12:00:00Z');

    expect(formatRelativeTime(then)).toBe('agora');
  });

  // ── "há X min" ───────────────────────────────────────────────────

  it('should return "há 1 min" when diff is exactly 60 seconds', () => {
    vi.setSystemTime(new Date('2024-03-15T12:01:00Z'));
    const then = new Date('2024-03-15T12:00:00Z');

    expect(formatRelativeTime(then)).toBe('há 1 min');
  });

  it('should return "há 5 min" when diff is 5 minutes', () => {
    vi.setSystemTime(new Date('2024-03-15T12:05:00Z'));
    const then = new Date('2024-03-15T12:00:00Z');

    expect(formatRelativeTime(then)).toBe('há 5 min');
  });

  it('should return "há 59 min" when diff is 59 minutes 59 seconds (boundary)', () => {
    vi.setSystemTime(new Date('2024-03-15T12:59:59Z'));
    const then = new Date('2024-03-15T12:00:00Z');

    expect(formatRelativeTime(then)).toBe('há 59 min');
  });

  // ── "há Xh" ───────────────────────────────────────────────────────

  it('should return "há 1h" when diff is exactly 1 hour', () => {
    vi.setSystemTime(new Date('2024-03-15T13:00:00Z'));
    const then = new Date('2024-03-15T12:00:00Z');

    expect(formatRelativeTime(then)).toBe('há 1h');
  });

  it('should return "há 3h" when diff is 3 hours', () => {
    vi.setSystemTime(new Date('2024-03-15T15:00:00Z'));
    const then = new Date('2024-03-15T12:00:00Z');

    expect(formatRelativeTime(then)).toBe('há 3h');
  });

  it('should return "há 23h" when diff is 23 hours 59 minutes (boundary)', () => {
    vi.setSystemTime(new Date('2024-03-15T11:59:00Z'));
    const then = new Date('2024-03-14T12:00:00Z');

    expect(formatRelativeTime(then)).toBe('há 23h');
  });

  // ── "há Xd" ───────────────────────────────────────────────────────

  it('should return "há 1d" when diff is exactly 24 hours', () => {
    vi.setSystemTime(new Date('2024-03-16T12:00:00Z'));
    const then = new Date('2024-03-15T12:00:00Z');

    expect(formatRelativeTime(then)).toBe('há 1d');
  });

  it('should return "há 3d" when diff is 3 days', () => {
    vi.setSystemTime(new Date('2024-03-18T12:00:00Z'));
    const then = new Date('2024-03-15T12:00:00Z');

    expect(formatRelativeTime(then)).toBe('há 3d');
  });

  it('should return "há 6d" when diff is 6 days 23 hours (boundary before 7d)', () => {
    // 6 dias e 23h = 6 * 24h + 23h = 167h a partir de 2024-03-15T12:00Z
    // now = 2024-03-22T11:00:00Z → diff = 167h → 6 dias (floor(167/24))
    vi.setSystemTime(new Date('2024-03-22T11:00:00Z'));
    const then = new Date('2024-03-15T12:00:00Z');

    expect(formatRelativeTime(then)).toBe('há 6d');
  });

  // ── data pt-BR ───────────────────────────────────────────────────

  it('should return localized pt-BR date when diff is exactly 7 days', () => {
    vi.setSystemTime(new Date('2024-03-22T12:00:00Z'));
    const then = new Date('2024-03-15T12:00:00Z');
    const expected = then.toLocaleDateString('pt-BR');

    expect(formatRelativeTime(then)).toBe(expected);
  });

  it('should return localized pt-BR date when diff is 30 days', () => {
    vi.setSystemTime(new Date('2024-04-14T12:00:00Z'));
    const then = new Date('2024-03-15T12:00:00Z');
    const expected = then.toLocaleDateString('pt-BR');

    expect(formatRelativeTime(then)).toBe(expected);
  });

  it('should return localized pt-BR date when diff is 1 year', () => {
    vi.setSystemTime(new Date('2025-03-15T12:00:00Z'));
    const then = new Date('2024-03-15T12:00:00Z');
    const expected = then.toLocaleDateString('pt-BR');

    expect(formatRelativeTime(then)).toBe(expected);
  });

  // ── input como string ISO ────────────────────────────────────────

  it('should accept ISO string input and return "há 2h"', () => {
    vi.setSystemTime(new Date('2024-03-15T14:00:00Z'));

    expect(formatRelativeTime('2024-03-15T12:00:00Z')).toBe('há 2h');
  });

  it('should accept ISO string input and return "agora"', () => {
    const now = new Date('2024-03-15T12:00:00Z');
    vi.setSystemTime(now);

    expect(formatRelativeTime(now.toISOString())).toBe('agora');
  });
});
