import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LlmCircuitBreaker } from '@/lib/llm/circuit-breaker';

/** Disjuntor (spec 0001, AC-7). Relógio falso, prazos de produção (30s). */

describe('LlmCircuitBreaker', () => {
  let breaker: LlmCircuitBreaker;

  function fail(times: number) {
    for (let i = 0; i < times; i += 1) {
      expect(breaker.admit()).toBe('allow');
      breaker.record('countable', 'allow');
    }
  }

  function openBreaker() {
    fail(3);
    expect(breaker.getState()).toBe('open');
  }

  beforeEach(() => {
    vi.useFakeTimers();
    breaker = new LlmCircuitBreaker();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('começa fechado e deixa passar', () => {
    expect(breaker.getState()).toBe('closed');
    expect(breaker.admit()).toBe('allow');
  });

  it('abre depois de 3 falhas contáveis seguidas e rejeita a quarta', () => {
    fail(2);
    expect(breaker.getState()).toBe('closed');

    fail(1);

    expect(breaker.getState()).toBe('open');
    expect(breaker.admit()).toBe('reject');
  });

  it('uma resposta HTTP do vLLM (ex.: invalid_output) entre falhas zera a contagem', () => {
    fail(2);
    breaker.record('http', 'allow');
    fail(2);

    expect(breaker.getState()).toBe('closed');
  });

  it('rejeições locais e cancelamentos (neutros) não mexem na contagem', () => {
    fail(2);
    breaker.record('neutral', 'allow');
    breaker.record('neutral', 'allow');

    fail(1);

    expect(breaker.getState()).toBe('open');
  });

  it('fica aberto por 30s e depois libera uma única chamada de teste', () => {
    openBreaker();

    vi.advanceTimersByTime(29_999);
    expect(breaker.admit()).toBe('reject');

    vi.advanceTimersByTime(1);
    expect(breaker.getState()).toBe('half_open');
    expect(breaker.admit()).toBe('probe');
    expect(breaker.admit()).toBe('reject');
    expect(breaker.admit()).toBe('reject');
  });

  it('chamada de teste com resposta HTTP fecha o disjuntor', () => {
    openBreaker();
    vi.advanceTimersByTime(30_000);
    expect(breaker.admit()).toBe('probe');

    breaker.record('http', 'probe');

    expect(breaker.getState()).toBe('closed');
    expect(breaker.admit()).toBe('allow');
  });

  it('chamada de teste com causa contável reabre por mais 30s', () => {
    openBreaker();
    vi.advanceTimersByTime(30_000);
    expect(breaker.admit()).toBe('probe');

    breaker.record('countable', 'probe');

    expect(breaker.getState()).toBe('open');
    vi.advanceTimersByTime(29_999);
    expect(breaker.admit()).toBe('reject');
    vi.advanceTimersByTime(1);
    expect(breaker.admit()).toBe('probe');
  });

  it('chamada de teste cancelada mantém half_open e a próxima vira a de teste', () => {
    openBreaker();
    vi.advanceTimersByTime(30_000);
    expect(breaker.admit()).toBe('probe');

    breaker.record('neutral', 'probe');

    expect(breaker.getState()).toBe('half_open');
    expect(breaker.admit()).toBe('probe');
  });

  it('resultados de chamadas comuns que terminam com o disjuntor aberto são ignorados', () => {
    expect(breaker.admit()).toBe('allow');
    expect(breaker.admit()).toBe('allow');
    openBreaker();

    breaker.record('http', 'allow');
    breaker.record('countable', 'allow');

    expect(breaker.getState()).toBe('open');
    vi.advanceTimersByTime(30_000);
    expect(breaker.admit()).toBe('probe');
  });

  it('abrir de novo depois de fechar exige 3 novas falhas', () => {
    openBreaker();
    vi.advanceTimersByTime(30_000);
    breaker.admit();
    breaker.record('http', 'probe');

    fail(2);

    expect(breaker.getState()).toBe('closed');
  });
});
