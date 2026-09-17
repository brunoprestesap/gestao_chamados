import 'server-only';

import type { LlmCallRun } from '@/lib/llm/call-run';
import { llmCircuitBreaker } from '@/lib/llm/circuit-breaker';
import { LLM_MAX_INPUT_CHARS, llmTimings } from '@/lib/llm/config';
import { llmLimiter } from '@/lib/llm/limiter';
import type { LlmFailure, LlmTaskInput } from '@/lib/llm/types';
import { llmUserRateLimit } from '@/lib/llm/user-rate-limit';

/** Soma de caracteres de `system` e mensagens. */
export function inputChars(input: LlmTaskInput<unknown>): number {
  return input.messages.reduce((sum, message) => sum + message.content.length, input.system.length);
}

/**
 * Checagens antes de qualquer tráfego, na ordem da spec 0001 (a primeira que
 * falhar decide): `cancelled` → `bad_request` (entrada grande demais, `userId`
 * ausente na raia interativa ou `sampling` fora das faixas) → `circuit_open` → `rate_limited`
 * → fila (`busy`, `cancelled` ou `timeout` enquanto espera).
 * `disabled` é decidido antes, em `index.ts`.
 *
 * Devolve `null` com a vaga já pega (liberada em `run.finish`), ou a falha já
 * registrada. Os prazos da chamada precisam estar agendados antes: a espera na
 * fila conta no prazo.
 */
export async function admitCall(run: LlmCallRun): Promise<LlmFailure | null> {
  const { input } = run;

  if (run.cause() === 'cancel') return run.fail({ status: 'cancelled' });

  if (
    inputChars(input) > LLM_MAX_INPUT_CHARS ||
    (run.lane === 'interactive' && !input.userId) ||
    run.sampling() === null
  ) {
    return run.fail({ status: 'failed', reason: 'bad_request', origin: 'local' });
  }

  const admission = llmCircuitBreaker.admit();
  if (admission === 'reject') {
    return run.fail({ status: 'failed', reason: 'circuit_open', origin: 'local' });
  }
  run.breakerAdmission = admission;

  if (run.lane === 'interactive' && !llmUserRateLimit.tryAcquire(input.userId!)) {
    return run.fail(
      { status: 'failed', reason: 'rate_limited', origin: 'local' },
      { record: llmUserRateLimit.shouldRecordRejection(input.userId!) },
    );
  }

  const slot = await llmLimiter.acquire(run.lane, {
    signal: run.signal,
    // O lote espera até o próprio prazo abortar a chamada.
    maxWaitMs:
      run.lane === 'interactive' ? llmTimings.interactiveQueueMs : Number.POSITIVE_INFINITY,
  });
  run.queueMs = slot.queueMs;

  if (slot.ok) {
    run.releaseSlot = slot.release;
    return null;
  }
  if (slot.reason === 'wait_timeout') {
    return run.fail({ status: 'failed', reason: 'busy', origin: 'local' });
  }
  return run.cause() === 'cancel'
    ? run.fail({ status: 'cancelled' })
    : run.fail({ status: 'failed', reason: 'timeout', origin: 'local' });
}
