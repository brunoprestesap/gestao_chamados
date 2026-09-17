import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LlmUserRateLimit } from '@/lib/llm/user-rate-limit';

/** Limite por usuário (spec 0001, AC-8, AC-10). Relógio falso, janela de produção (60s). */

const MARIA = '507f1f77bcf86cd799439011';
const JOAO = '507f1f77bcf86cd799439012';

describe('LlmUserRateLimit', () => {
  let limit: LlmUserRateLimit;

  function accept(userId: string, times: number) {
    for (let i = 0; i < times; i += 1) expect(limit.tryAcquire(userId)).toBe(true);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    limit = new LlmUserRateLimit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aceita 20 chamadas em 60s e rejeita a 21ª', () => {
    accept(MARIA, 20);

    expect(limit.tryAcquire(MARIA)).toBe(false);
  });

  it('a janela é deslizante: a vaga volta 60s depois da chamada mais antiga', () => {
    accept(MARIA, 1);
    vi.advanceTimersByTime(10_000);
    accept(MARIA, 19);

    vi.advanceTimersByTime(49_999);
    expect(limit.tryAcquire(MARIA)).toBe(false);

    vi.advanceTimersByTime(1);
    expect(limit.tryAcquire(MARIA)).toBe(true);
    expect(limit.tryAcquire(MARIA)).toBe(false);
  });

  it('chamadas rejeitadas não contam na janela', () => {
    accept(MARIA, 20);
    for (let i = 0; i < 50; i += 1) {
      vi.advanceTimersByTime(1_000);
      expect(limit.tryAcquire(MARIA)).toBe(false);
    }

    // 60s depois das 20 aceitas, a janela está vazia apesar das 50 rejeitadas.
    vi.advanceTimersByTime(10_000);
    accept(MARIA, 20);
  });

  it('cada usuário tem a própria janela', () => {
    accept(MARIA, 20);

    accept(JOAO, 20);
    expect(limit.tryAcquire(MARIA)).toBe(false);
  });

  it('registra no máximo uma rejeição por usuário a cada 60s', () => {
    expect(limit.shouldRecordRejection(MARIA)).toBe(true);
    expect(limit.shouldRecordRejection(MARIA)).toBe(false);
    expect(limit.shouldRecordRejection(JOAO)).toBe(true);

    vi.advanceTimersByTime(59_999);
    expect(limit.shouldRecordRejection(MARIA)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(limit.shouldRecordRejection(MARIA)).toBe(true);
  });

  it('a varredura acima de 5.000 usuários mantém quem ainda está na janela e libera quem saiu (AC-8, AC-10)', () => {
    accept(JOAO, 20);
    expect(limit.shouldRecordRejection(JOAO)).toBe(true);
    accept(MARIA, 1);
    vi.advanceTimersByTime(40_000);
    accept(MARIA, 19);
    expect(limit.shouldRecordRejection(MARIA)).toBe(true);

    // Aos 65s só a primeira chamada da Maria saiu da janela; o usuário 5.000 dispara a varredura.
    vi.advanceTimersByTime(25_000);
    for (let i = 0; i < 5_000; i += 1) limit.tryAcquire(`usuario-${i}`);

    expect(limit.tryAcquire(MARIA)).toBe(true);
    expect(limit.tryAcquire(MARIA)).toBe(false);
    expect(limit.shouldRecordRejection(MARIA)).toBe(false);
    accept(JOAO, 20);
    expect(limit.shouldRecordRejection(JOAO)).toBe(true);
  });
});
