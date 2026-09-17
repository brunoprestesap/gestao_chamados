import 'server-only';

import { LLM_CIRCUIT_THRESHOLD, llmTimings } from '@/lib/llm/config';
import type { LlmCircuitState } from '@/lib/llm/types';

/**
 * Disjuntor da chamada lógica (spec 0001, AC-7).
 * - `closed`: 3 chamadas seguidas terminando em timeout, unavailable ou
 *   interrupted abrem o disjuntor; qualquer resposta HTTP do vLLM zera a contagem.
 * - `open`: tudo falha na hora como `circuit_open` por 30s.
 * - `half_open`: uma única chamada de teste segue; as outras continuam rejeitadas.
 *   Teste com resposta HTTP fecha; com causa contável reabre; neutro (cancelado ou
 *   rejeitado no Sigma) libera a vez para a próxima chamada.
 */

export type BreakerAdmission = 'allow' | 'probe' | 'reject';
/** `countable` = timeout/unavailable/interrupted; `http` = o vLLM respondeu; `neutral` = resto. */
export type BreakerSignal = 'countable' | 'http' | 'neutral';

export class LlmCircuitBreaker {
  private state: LlmCircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt = 0;
  private probeInFlight = false;

  getState(): LlmCircuitState {
    this.refresh();
    return this.state;
  }

  admit(): BreakerAdmission {
    this.refresh();
    if (this.state === 'closed') return 'allow';
    if (this.state === 'open' || this.probeInFlight) return 'reject';
    this.probeInFlight = true;
    return 'probe';
  }

  record(signal: BreakerSignal, admission: Exclude<BreakerAdmission, 'reject'>): void {
    if (admission === 'probe') {
      if (this.state !== 'half_open') return;
      this.probeInFlight = false;
      if (signal === 'countable') this.open();
      else if (signal === 'http') this.close();
      return;
    }

    if (this.state !== 'closed') return;
    if (signal === 'http') {
      this.consecutiveFailures = 0;
    } else if (signal === 'countable') {
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= LLM_CIRCUIT_THRESHOLD) this.open();
    }
  }

  /** Só para testes. */
  reset(): void {
    this.close();
    this.openedAt = 0;
  }

  private refresh(): void {
    if (this.state === 'open' && Date.now() - this.openedAt >= llmTimings.circuitOpenMs) {
      this.state = 'half_open';
      this.probeInFlight = false;
    }
  }

  private open(): void {
    this.state = 'open';
    this.openedAt = Date.now();
    this.consecutiveFailures = 0;
    this.probeInFlight = false;
  }

  private close(): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.probeInFlight = false;
  }
}

export const llmCircuitBreaker = new LlmCircuitBreaker();
