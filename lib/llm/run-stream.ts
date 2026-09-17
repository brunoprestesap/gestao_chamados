import 'server-only';

import { type DeepPartial, parsePartialJson } from 'ai';

import { admitCall } from '@/lib/llm/admission';
import { AsyncChannel, createDeferred } from '@/lib/llm/async-channel';
import { LlmCallRun, type RunOutcome } from '@/lib/llm/call-run';
import { llmTimings } from '@/lib/llm/config';
import { classifyRemoteError, describeError } from '@/lib/llm/errors';
import { callModelForStream } from '@/lib/llm/model-call';
import type { LlmResult, LlmStream, LlmTaskInput } from '@/lib/llm/types';

/**
 * `streamLlmObject` (spec 0001, AC-2, AC-3, AC-5).
 * A promessa devolvida resolve no primeiro conteúdo (`ok: true` com `partial` e
 * `final`) ou na falha anterior a ele. Depois do primeiro conteúdo não há nova
 * tentativa e qualquer falha vira `interrupted`.
 */
export async function runStream<T>(input: LlmTaskInput<T>, model: string): Promise<LlmStream<T>> {
  const run = new LlmCallRun(input as LlmTaskInput<unknown>, 'stream_object', model);
  const timings = llmTimings[run.lane];

  run.linkCallerSignal();
  // Primeiro conteúdo e teto total contam desde o início da chamada (fila incluída).
  run.at(timings.firstChunkMs, () => {
    if (run.firstChunkMs === null) run.abort('deadline');
  });
  run.at(timings.totalMs, () => run.abort('deadline'));

  const rejected = await admitCall(run);
  if (rejected) return rejected;
  // A admissão já rejeitou amostragem fora das faixas.
  const sampling = run.sampling()!;

  const opened = createDeferred<LlmStream<T>>();
  const final = createDeferred<LlmResult<T>>();
  const partial = new AsyncChannel<DeepPartial<T>>();

  function settle(outcome: RunOutcome, data?: T): void {
    partial.close();
    const meta = run.finish(outcome);
    const result: LlmResult<T> =
      outcome.status === 'success'
        ? { ok: true, data: data as T, meta }
        : {
            ok: false,
            reason: outcome.status === 'cancelled' ? 'cancelled' : outcome.reason,
            meta,
          };
    final.resolve(result);
    // Sem primeiro conteúdo, a falha sai pela própria promessa de abertura.
    if (!result.ok) opened.resolve(result);
  }

  function settleFinalText(text: string): void {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      settle({ status: 'failed', reason: 'invalid_output', origin: 'remote' });
      return;
    }
    const parsed = input.schema.safeParse(value);
    if (parsed.success) settle({ status: 'success' }, parsed.data);
    else settle({ status: 'failed', reason: 'invalid_output', origin: 'remote' });
  }

  async function pump(): Promise<void> {
    for (;;) {
      run.attempts += 1;
      run.finishReason = null;
      let text = '';
      let lastPartial = '';
      let finished = false;
      let failed = false;
      let failure: unknown;
      let cancelStall: (() => void) | null = null;

      for await (const event of callModelForStream({
        schema: input.schema,
        system: input.system,
        messages: input.messages,
        sampling,
        abortSignal: run.signal,
      })) {
        if (event.type === 'delta') {
          if (event.text === '') continue;
          if (run.firstChunkMs === null) {
            run.firstChunkMs = run.elapsedMs();
            opened.resolve({ ok: true, partial, final: final.promise });
          }
          cancelStall?.();
          cancelStall = run.after(timings.chunkMs, () => run.abort('deadline'));

          text += event.text;
          const { value, state } = await parsePartialJson(text);
          if (value != null && (state === 'successful-parse' || state === 'repaired-parse')) {
            const serialized = JSON.stringify(value);
            if (serialized !== lastPartial) {
              lastPartial = serialized;
              partial.push(value as DeepPartial<T>);
            }
          }
        } else if (event.type === 'finish') {
          finished = true;
          run.finishReason = event.finishReason;
          run.usage = event.usage;
        } else if (event.type === 'error') {
          failed = true;
          failure = event.error;
        }
        // 'abort': a causa (cancelamento ou prazo) já está em run.cause().
      }
      cancelStall?.();

      // Um corte por limite de tokens (`length`) também cai aqui e vira `invalid_output`.
      if (finished && !failed) {
        settleFinalText(text);
        return;
      }

      const started = run.firstChunkMs !== null;
      const cause = run.cause();
      if (cause === 'cancel') return settle({ status: 'cancelled' });
      if (cause === 'deadline' || started) {
        return settle({
          status: 'failed',
          reason: started ? 'interrupted' : 'timeout',
          origin: 'remote',
        });
      }

      const classified = classifyRemoteError(failure);
      if (classified.retryable && run.attempts < timings.maxAttempts) {
        const delayMs = timings.retryDelaysMs[run.attempts - 1] ?? 0;
        if (await run.wait(delayMs)) continue;
        return run.cause() === 'cancel'
          ? settle({ status: 'cancelled' })
          : settle({ status: 'failed', reason: 'timeout', origin: 'remote' });
      }
      return settle({ status: 'failed', reason: classified.reason, origin: 'remote' });
    }
  }

  void pump().catch((error: unknown) => {
    console.error('[llm] erro inesperado no streaming:', describeError(error));
    settle({
      status: 'failed',
      reason: run.firstChunkMs === null ? 'unavailable' : 'interrupted',
      origin: 'remote',
    });
  });

  return opened.promise;
}
