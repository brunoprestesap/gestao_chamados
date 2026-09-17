import 'server-only';

import { admitCall } from '@/lib/llm/admission';
import { LlmCallRun } from '@/lib/llm/call-run';
import { llmTimings } from '@/lib/llm/config';
import { classifyRemoteError } from '@/lib/llm/errors';
import { callModelForObject } from '@/lib/llm/model-call';
import type { LlmResult, LlmTaskInput } from '@/lib/llm/types';

/**
 * `generateLlmObject` (spec 0001, AC-1, AC-3, AC-4, AC-5).
 * A vaga é pega uma vez e mantida em todas as tentativas; só há nova tentativa
 * para as falhas de conexão e status definidos, dentro do mesmo teto.
 */
export async function runGenerate<T>(input: LlmTaskInput<T>, model: string): Promise<LlmResult<T>> {
  const run = new LlmCallRun(input as LlmTaskInput<unknown>, 'object', model);
  const timings = llmTimings[run.lane];

  run.linkCallerSignal();
  // Teto único da chamada lógica, fila e novas tentativas incluídas.
  run.at(timings.generateMs, () => run.abort('deadline'));

  const rejected = await admitCall(run);
  if (rejected) return rejected;
  // A admissão já rejeitou amostragem fora das faixas.
  const sampling = run.sampling()!;

  for (;;) {
    run.attempts += 1;
    const outcome = await callModelForObject({
      schema: input.schema,
      system: input.system,
      messages: input.messages,
      sampling,
      abortSignal: run.signal,
    });

    if (outcome.kind === 'output' || outcome.kind === 'invalid_output') {
      run.usage = outcome.usage;
      run.finishReason = outcome.finishReason;
      if (outcome.kind === 'output') {
        const parsed = input.schema.safeParse(outcome.value);
        if (parsed.success) {
          const meta = run.finish({ status: 'success' });
          return { ok: true, data: parsed.data, meta };
        }
      }
      return run.fail({ status: 'failed', reason: 'invalid_output', origin: 'remote' });
    }

    if (run.cause() === 'cancel') return run.fail({ status: 'cancelled' });
    if (run.cause() === 'deadline') {
      return run.fail({ status: 'failed', reason: 'timeout', origin: 'remote' });
    }

    const failure = classifyRemoteError(outcome.error);
    if (failure.retryable && run.attempts < timings.maxAttempts) {
      const delayMs = timings.retryDelaysMs[run.attempts - 1] ?? 0;
      if (await run.wait(delayMs)) continue;
      return run.cause() === 'cancel'
        ? run.fail({ status: 'cancelled' })
        : run.fail({ status: 'failed', reason: 'timeout', origin: 'remote' });
    }

    return run.fail({ status: 'failed', reason: failure.reason, origin: 'remote' });
  }
}
