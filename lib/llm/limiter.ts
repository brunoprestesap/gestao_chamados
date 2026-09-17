import 'server-only';

import { getLlmConfig, LLM_BATCH_SLOTS } from '@/lib/llm/config';
import type { LlmLane } from '@/lib/llm/types';

/**
 * Vagas de chamadas simultâneas ao vLLM com duas raias (spec 0001, AC-6).
 * - Nunca mais de `LLM_MAX_CONCURRENCY` em andamento, nem mais de 1 do lote.
 * - O lote só pega vaga livre quando não há chamada interativa esperando.
 * - Vaga que se libera vai primeiro para quem espera na raia interativa.
 * Estado em memória: vale porque o Next roda em uma única instância.
 */

export type SlotAcquired = { ok: true; release: () => void; queueMs: number };
export type SlotDenied = { ok: false; reason: 'wait_timeout' | 'aborted'; queueMs: number };

type Waiter = { grant: () => void };

export class LlmLimiter {
  private active = 0;
  private activeBatch = 0;
  private readonly interactiveQueue: Waiter[] = [];
  private readonly batchQueue: Waiter[] = [];

  constructor(private readonly maxConcurrency: () => number) {}

  get activeCalls(): number {
    return this.active;
  }

  get queuedCalls(): number {
    return this.interactiveQueue.length + this.batchQueue.length;
  }

  /**
   * Pega uma vaga. Sem vaga livre, espera na fila da raia até `maxWaitMs`
   * (`wait_timeout`) ou até `signal` abortar (`aborted`). `queueMs` é 0 quando
   * a vaga saiu na hora.
   */
  acquire(
    lane: LlmLane,
    options: { signal: AbortSignal; maxWaitMs: number },
  ): Promise<SlotAcquired | SlotDenied> {
    if (options.signal.aborted)
      return Promise.resolve({ ok: false, reason: 'aborted', queueMs: 0 });
    if (this.canStart(lane)) return Promise.resolve(this.take(lane, 0));

    const enqueuedAt = Date.now();
    const queue = lane === 'interactive' ? this.interactiveQueue : this.batchQueue;

    return new Promise((resolve) => {
      const leave = (reason: SlotDenied['reason']) => {
        const index = queue.indexOf(waiter);
        if (index === -1) return;
        queue.splice(index, 1);
        cleanup();
        resolve({ ok: false, reason, queueMs: Date.now() - enqueuedAt });
        // Sem interativa esperando, um lote na fila pode ter ficado liberado.
        this.dispatch();
      };
      const onAbort = () => leave('aborted');
      const timer = Number.isFinite(options.maxWaitMs)
        ? setTimeout(() => leave('wait_timeout'), options.maxWaitMs)
        : null;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        options.signal.removeEventListener('abort', onAbort);
      };
      const waiter: Waiter = {
        grant: () => {
          cleanup();
          resolve(this.take(lane, Date.now() - enqueuedAt));
        },
      };

      options.signal.addEventListener('abort', onAbort, { once: true });
      queue.push(waiter);
    });
  }

  /** Só para testes: zera contadores e filas. */
  reset(): void {
    this.active = 0;
    this.activeBatch = 0;
    this.interactiveQueue.length = 0;
    this.batchQueue.length = 0;
  }

  private canStart(lane: LlmLane): boolean {
    if (this.active >= this.maxConcurrency()) return false;
    if (lane === 'interactive') return true;
    return this.activeBatch < LLM_BATCH_SLOTS && this.interactiveQueue.length === 0;
  }

  private take(lane: LlmLane, queueMs: number): SlotAcquired {
    this.active += 1;
    if (lane === 'batch') this.activeBatch += 1;
    let released = false;
    return {
      ok: true,
      queueMs,
      release: () => {
        if (released) return;
        released = true;
        this.active -= 1;
        if (lane === 'batch') this.activeBatch -= 1;
        this.dispatch();
      },
    };
  }

  private dispatch(): void {
    while (this.active < this.maxConcurrency()) {
      const next =
        this.interactiveQueue.shift() ??
        (this.activeBatch < LLM_BATCH_SLOTS ? this.batchQueue.shift() : undefined);
      if (!next) return;
      next.grant();
    }
  }
}

export const llmLimiter = new LlmLimiter(() => getLlmConfig().maxConcurrency);
