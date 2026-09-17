import 'server-only';

import { LLM_USER_RATE_LIMIT, llmTimings } from '@/lib/llm/config';

/**
 * Limite por usuário na raia interativa (spec 0001, AC-8, AC-10).
 * Janela deslizante de 60s com até 20 chamadas aceitas; rejeitadas não contam.
 * Também controla o registro de `rate_limited`: no máximo um por usuário a cada 60s.
 * Estado em memória: vale porque o Next roda em uma única instância.
 */

/** Acima disso, entradas expiradas de todos os usuários são varridas. */
const SWEEP_THRESHOLD = 5_000;

export class LlmUserRateLimit {
  private readonly accepted = new Map<string, number[]>();
  private readonly lastRejectionRecord = new Map<string, number>();

  /** Aceita e conta a chamada, ou devolve `false` sem contar. */
  tryAcquire(userId: string): boolean {
    const now = Date.now();
    const window = llmTimings.userRateWindowMs;
    const recent = (this.accepted.get(userId) ?? []).filter((at) => now - at < window);

    if (recent.length >= LLM_USER_RATE_LIMIT) {
      this.accepted.set(userId, recent);
      return false;
    }

    recent.push(now);
    this.accepted.set(userId, recent);
    if (this.accepted.size > SWEEP_THRESHOLD) this.sweep(now);
    return true;
  }

  /** `true` se esta rejeição deve gravar `LlmCall` (e marca o momento). */
  shouldRecordRejection(userId: string): boolean {
    const now = Date.now();
    const last = this.lastRejectionRecord.get(userId);
    if (last !== undefined && now - last < llmTimings.userRateWindowMs) return false;
    this.lastRejectionRecord.set(userId, now);
    return true;
  }

  /** Só para testes. */
  reset(): void {
    this.accepted.clear();
    this.lastRejectionRecord.clear();
  }

  private sweep(now: number): void {
    const window = llmTimings.userRateWindowMs;
    for (const [userId, times] of this.accepted) {
      if (times.every((at) => now - at >= window)) this.accepted.delete(userId);
    }
    for (const [userId, at] of this.lastRejectionRecord) {
      if (now - at >= window) this.lastRejectionRecord.delete(userId);
    }
  }
}

export const llmUserRateLimit = new LlmUserRateLimit();
