import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LlmLimiter, type SlotAcquired } from '@/lib/llm/limiter';

/** Limitador de vagas com duas raias (spec 0001, AC-6, AC-5). Relógio falso. */

const never = () => new AbortController().signal;
const WAIT = { maxWaitMs: 5_000 };

async function acquired(promise: Promise<unknown>): Promise<SlotAcquired> {
  const result = await promise;
  expect(result).toMatchObject({ ok: true });
  return result as SlotAcquired;
}

/** Diz se a promessa já resolveu, sem esperar por ela. */
async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  void promise.then(() => {
    done = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  return done;
}

describe('LlmLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dá vaga na hora com queueMs 0 enquanto há vaga livre', async () => {
    const limiter = new LlmLimiter(() => 4);

    const slot = await acquired(limiter.acquire('interactive', { signal: never(), ...WAIT }));

    expect(slot.queueMs).toBe(0);
    expect(limiter.activeCalls).toBe(1);
    expect(limiter.queuedCalls).toBe(0);
  });

  it('nunca passa do máximo; a quinta interativa espera e ganha a vaga liberada', async () => {
    const limiter = new LlmLimiter(() => 4);
    const slots = await Promise.all(
      Array.from({ length: 4 }, () =>
        acquired(limiter.acquire('interactive', { signal: never(), ...WAIT })),
      ),
    );

    const fifth = limiter.acquire('interactive', { signal: never(), ...WAIT });
    expect(await settled(fifth)).toBe(false);
    expect(limiter.activeCalls).toBe(4);
    expect(limiter.queuedCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(1_200);
    slots[0].release();

    const slot = await acquired(fifth);
    expect(slot.queueMs).toBe(1_200);
    expect(limiter.activeCalls).toBe(4);
    expect(limiter.queuedCalls).toBe(0);
  });

  it('interativa sem vaga em 5s sai da fila como wait_timeout', async () => {
    const limiter = new LlmLimiter(() => 1);
    await acquired(limiter.acquire('interactive', { signal: never(), ...WAIT }));

    const waiting = limiter.acquire('interactive', { signal: never(), ...WAIT });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(await settled(waiting)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await waiting).toEqual({ ok: false, reason: 'wait_timeout', queueMs: 5_000 });
    expect(limiter.queuedCalls).toBe(0);
    expect(limiter.activeCalls).toBe(1);
  });

  it('cancelamento durante a espera sai da fila como aborted com o tempo já esperado', async () => {
    const limiter = new LlmLimiter(() => 1);
    await acquired(limiter.acquire('interactive', { signal: never(), ...WAIT }));
    const controller = new AbortController();

    const waiting = limiter.acquire('interactive', { signal: controller.signal, ...WAIT });
    await vi.advanceTimersByTimeAsync(700);
    controller.abort();

    expect(await waiting).toEqual({ ok: false, reason: 'aborted', queueMs: 700 });
    expect(limiter.queuedCalls).toBe(0);
  });

  it('signal já abortado não entra na fila', async () => {
    const limiter = new LlmLimiter(() => 1);
    const controller = new AbortController();
    controller.abort();

    expect(await limiter.acquire('interactive', { signal: controller.signal, ...WAIT })).toEqual({
      ok: false,
      reason: 'aborted',
      queueMs: 0,
    });
    expect(limiter.activeCalls).toBe(0);
  });

  it('o lote ocupa no máximo 1 vaga, mesmo com vagas livres', async () => {
    const limiter = new LlmLimiter(() => 4);
    const first = await acquired(
      limiter.acquire('batch', { signal: never(), maxWaitMs: Infinity }),
    );

    const second = limiter.acquire('batch', { signal: never(), maxWaitMs: Infinity });
    expect(await settled(second)).toBe(false);
    await acquired(limiter.acquire('interactive', { signal: never(), ...WAIT }));

    first.release();
    await acquired(second);
    expect(limiter.activeCalls).toBe(2);
  });

  it('vaga liberada vai primeiro para a interativa, mesmo com lote esperando antes', async () => {
    const limiter = new LlmLimiter(() => 2);
    const a = await acquired(limiter.acquire('interactive', { signal: never(), ...WAIT }));
    await acquired(limiter.acquire('interactive', { signal: never(), ...WAIT }));

    const batch = limiter.acquire('batch', { signal: never(), maxWaitMs: Infinity });
    const interactive = limiter.acquire('interactive', { signal: never(), ...WAIT });
    a.release();

    await acquired(interactive);
    expect(await settled(batch)).toBe(false);
  });

  it('o lote não pega vaga livre enquanto há interativa esperando', async () => {
    const limiter = new LlmLimiter(() => 1);
    const busy = await acquired(limiter.acquire('interactive', { signal: never(), ...WAIT }));
    const interactive = limiter.acquire('interactive', { signal: never(), ...WAIT });

    // Com uma interativa na fila, o lote não passa na frente nem com vaga livre.
    const batch = limiter.acquire('batch', { signal: never(), maxWaitMs: Infinity });
    busy.release();
    const next = await acquired(interactive);
    expect(await settled(batch)).toBe(false);

    next.release();
    await acquired(batch);
  });

  it('release é idempotente', async () => {
    const limiter = new LlmLimiter(() => 2);
    const slot = await acquired(limiter.acquire('interactive', { signal: never(), ...WAIT }));

    slot.release();
    slot.release();

    expect(limiter.activeCalls).toBe(0);
  });
});
