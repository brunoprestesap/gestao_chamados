import 'server-only';

import { Types } from 'mongoose';

import { recordLlmCall } from '@/lib/llm/call-log';
import {
  type BreakerAdmission,
  type BreakerSignal,
  llmCircuitBreaker,
} from '@/lib/llm/circuit-breaker';
import { LLM_SAMPLING_DEFAULTS, llmSamplingSchema } from '@/lib/llm/config';
import type { ModelUsage } from '@/lib/llm/model-call';
import type {
  LlmCallMode,
  LlmFailure,
  LlmFailureReason,
  LlmFinishReason,
  LlmLane,
  LlmMeta,
  LlmSampling,
  LlmTaskInput,
} from '@/lib/llm/types';

/**
 * Estado de uma chamada lógica: do início até o registro `LlmCall` e o log `[llm]`.
 * Todas as tentativas usam o mesmo `AbortController`; cancelamento e prazos
 * abortam por ele e deixam a causa anotada para a classificação.
 */

export type AbortCause = 'cancel' | 'deadline';

/** `local` = decidido no Sigma sem resposta do vLLM; `remote` = veio da tentativa. */
export type RunOutcome =
  | { status: 'success' }
  | { status: 'failed'; reason: LlmFailureReason; origin: 'local' | 'remote' }
  | { status: 'cancelled' };

const HTTP_RESPONSE_REASONS = new Set<LlmFailureReason>([
  'invalid_output',
  'auth_error',
  'bad_request',
]);
const COUNTABLE_REASONS = new Set<LlmFailureReason>(['timeout', 'unavailable', 'interrupted']);

/** O disjuntor olha só o resultado final da chamada lógica. */
export function breakerSignalFor(outcome: RunOutcome): BreakerSignal {
  if (outcome.status === 'success') return 'http';
  if (outcome.status === 'cancelled' || outcome.origin === 'local') return 'neutral';
  if (HTTP_RESPONSE_REASONS.has(outcome.reason)) return 'http';
  if (COUNTABLE_REASONS.has(outcome.reason)) return 'countable';
  return 'neutral';
}

export class LlmCallRun {
  readonly startedAt = Date.now();
  /** `_id` do `LlmCall`, gerado antes de qualquer tráfego e devolvido em `meta.callId`. */
  readonly callId = new Types.ObjectId().toString();
  readonly lane: LlmLane;
  readonly controller = new AbortController();
  attempts = 0;
  queueMs = 0;
  firstChunkMs: number | null = null;
  usage: ModelUsage = { inputTokens: null, outputTokens: null };
  /** Motivo de parada da resposta; `null` quando nenhuma resposta terminou. */
  finishReason: LlmFinishReason | null = null;
  /** Vaga do limitador; liberada em `finish`, em qualquer desfecho. */
  releaseSlot: (() => void) | null = null;
  /** Admissão no disjuntor; o resultado final é informado em `finish`. */
  breakerAdmission: Exclude<BreakerAdmission, 'reject'> | null = null;

  private abortCause: AbortCause | null = null;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private unlinkSignal: (() => void) | null = null;
  private finished = false;
  private readonly effectiveSampling: LlmSampling | null;

  constructor(
    readonly input: LlmTaskInput<unknown>,
    readonly mode: LlmCallMode,
    readonly model: string,
  ) {
    this.lane = input.lane ?? 'interactive';
    this.effectiveSampling = resolveSampling(input.sampling);
  }

  cause(): AbortCause | null {
    return this.abortCause;
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  /**
   * Amostragem efetiva: padrões mais a sobrescrita campo a campo. `null` quando
   * algum valor está fora das faixas (a admissão rejeita como `bad_request`).
   */
  sampling(): LlmSampling | null {
    return this.effectiveSampling;
  }

  abort(cause: AbortCause): void {
    if (this.abortCause) return;
    this.abortCause = cause;
    this.controller.abort();
  }

  /** Liga o `signal` de quem chama ao controller desta chamada. */
  linkCallerSignal(): void {
    const signal = this.input.signal;
    if (!signal) return;
    if (signal.aborted) {
      this.abort('cancel');
      return;
    }
    const onAbort = () => this.abort('cancel');
    signal.addEventListener('abort', onAbort, { once: true });
    this.unlinkSignal = () => signal.removeEventListener('abort', onAbort);
  }

  /** Agenda `fn` para `msFromStart` depois do início da chamada. Devolve o cancelamento. */
  at(msFromStart: number, fn: () => void): () => void {
    return this.after(Math.max(0, msFromStart - this.elapsedMs()), fn);
  }

  /** Agenda `fn` para daqui a `ms`. Devolve o cancelamento. */
  after(ms: number, fn: () => void): () => void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, ms);
    this.timers.add(timer);
    return () => {
      clearTimeout(timer);
      this.timers.delete(timer);
    };
  }

  /** Espera `ms` ou até o abort desta chamada. Devolve `false` se abortou. */
  wait(ms: number): Promise<boolean> {
    if (this.signal.aborted) return Promise.resolve(false);
    return new Promise((resolve) => {
      const onAbort = () => {
        cancel();
        resolve(false);
      };
      const cancel = this.after(ms, () => {
        this.signal.removeEventListener('abort', onAbort);
        resolve(true);
      });
      this.signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  meta(): LlmMeta {
    return {
      task: this.input.task,
      promptVersion: this.input.promptVersion,
      model: this.model,
      attempts: this.attempts,
      latencyMs: this.elapsedMs(),
      callId: this.callId,
    };
  }

  /**
   * Fecha a chamada: limpa timers, libera a vaga, informa o disjuntor, grava o
   * `LlmCall` (sem esperar) e loga `[llm]`.
   * Idempotente: a primeira chamada vence.
   */
  finish(outcome: RunOutcome, options: { record?: boolean } = {}): LlmMeta {
    const meta = this.meta();
    if (this.finished) return meta;
    this.finished = true;

    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.unlinkSignal?.();
    this.releaseSlot?.();
    if (this.breakerAdmission) {
      llmCircuitBreaker.record(breakerSignalFor(outcome), this.breakerAdmission);
    }

    const reason = outcome.status === 'failed' ? outcome.reason : null;

    if (options.record !== false) {
      void recordLlmCall({
        callId: this.callId,
        task: this.input.task,
        promptVersion: this.input.promptVersion,
        model: this.model,
        lane: this.lane,
        mode: this.mode,
        status: outcome.status,
        failureReason: reason,
        attempts: this.attempts,
        queueMs: this.queueMs,
        firstChunkMs: this.mode === 'stream_object' ? this.firstChunkMs : null,
        latencyMs: meta.latencyMs,
        inputTokens: this.usage.inputTokens,
        outputTokens: this.usage.outputTokens,
        finishReason: this.finishReason,
        sampling: this.effectiveSampling,
        userId: this.input.userId ?? null,
        refType: this.input.ref?.type ?? null,
        refId: this.input.ref?.id ?? null,
      });
    }

    console.warn(
      '[llm]',
      JSON.stringify({
        task: this.input.task,
        lane: this.lane,
        mode: this.mode,
        status: outcome.status,
        reason,
        finishReason: this.finishReason,
        attempts: this.attempts,
        latencyMs: meta.latencyMs,
      }),
    );

    return meta;
  }

  /** Atalho para devolver uma falha já registrada. */
  fail(
    outcome: Exclude<RunOutcome, { status: 'success' }>,
    options?: { record?: boolean },
  ): LlmFailure {
    const meta = this.finish(outcome, options);
    return {
      ok: false,
      reason: outcome.status === 'cancelled' ? 'cancelled' : outcome.reason,
      meta,
    };
  }
}

function resolveSampling(overrides: Partial<LlmSampling> | undefined): LlmSampling | null {
  // Só os seis campos ajustáveis: chaves extras (ex.: `repetitionPenalty`) nunca passam.
  const pick = <K extends keyof LlmSampling>(key: K) =>
    overrides?.[key] ?? LLM_SAMPLING_DEFAULTS[key];
  const parsed = llmSamplingSchema.safeParse({
    temperature: pick('temperature'),
    topP: pick('topP'),
    topK: pick('topK'),
    minP: pick('minP'),
    presencePenalty: pick('presencePenalty'),
    maxOutputTokens: pick('maxOutputTokens'),
  });
  return parsed.success ? parsed.data : null;
}
