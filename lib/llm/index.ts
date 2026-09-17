import 'server-only';

import { llmCircuitBreaker } from '@/lib/llm/circuit-breaker';
import { getLlmConfig, llmTimings } from '@/lib/llm/config';
import { describeError } from '@/lib/llm/errors';
import { llmLimiter } from '@/lib/llm/limiter';
import { runGenerate } from '@/lib/llm/run-generate';
import { runStream } from '@/lib/llm/run-stream';
import type { LlmFailure, LlmResult, LlmStatus, LlmStream, LlmTaskInput } from '@/lib/llm/types';

/**
 * Único ponto de entrada das funcionalidades de IA (spec 0001).
 * Nenhuma função exportada lança exceção: `ok: false` significa seguir sem IA.
 * Todo código que chama este módulo roda no runtime Node.js, nunca no Edge.
 */

export type {
  LlmFailure,
  LlmFailureReason,
  LlmLane,
  LlmMessage,
  LlmMeta,
  LlmResult,
  LlmStatus,
  LlmStream,
  LlmTaskInput,
} from '@/lib/llm/types';

const DISABLED: LlmFailure = { ok: false, reason: 'disabled', meta: null };

export function isLlmEnabled(): boolean {
  return getLlmConfig().enabled;
}

/** Gera um objeto validado pelo `schema`, sem streaming. */
export async function generateLlmObject<T>(input: LlmTaskInput<T>): Promise<LlmResult<T>> {
  try {
    const config = getLlmConfig();
    if (!config.enabled || !config.model) return DISABLED;
    return await runGenerate(input, config.model);
  } catch (error) {
    console.error('[llm] erro inesperado em generateLlmObject:', describeError(error));
    return { ok: false, reason: 'unavailable', meta: null };
  }
}

/**
 * Gera um objeto em streaming. Resolve no primeiro conteúdo (`partial` e `final`)
 * ou na falha anterior a ele. Com `ok: true`, a tela precisa trocar o texto parcial
 * pela mensagem de reserva se `final` vier com `ok: false`.
 */
export async function streamLlmObject<T>(input: LlmTaskInput<T>): Promise<LlmStream<T>> {
  try {
    const config = getLlmConfig();
    if (!config.enabled || !config.model) return DISABLED;
    return await runStream(input, config.model);
  } catch (error) {
    console.error('[llm] erro inesperado em streamLlmObject:', describeError(error));
    return { ok: false, reason: 'unavailable', meta: null };
  }
}

/**
 * Saúde da integração para o Admin (spec 0001, AC-12). Consulta `GET /models`
 * a cada chamada, com prazo curto; com a IA desligada não usa a rede.
 * Nunca devolve endereço nem chave.
 */
export async function getLlmStatus(): Promise<LlmStatus> {
  const config = getLlmConfig();
  const base = {
    configured: config.configured,
    enabled: config.enabled,
    circuit: llmCircuitBreaker.getState(),
    activeCalls: llmLimiter.activeCalls,
    queuedCalls: llmLimiter.queuedCalls,
  };

  if (!config.enabled || !config.baseUrl || !config.apiKey) {
    return { ...base, reachable: null, modelServed: null, latencyMs: null };
  }

  const startedAt = Date.now();
  try {
    const response = await fetch(`${config.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(llmTimings.statusProbeMs),
      cache: 'no-store',
    });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      console.warn('[llm] status: /models respondeu', response.status);
      return { ...base, reachable: false, modelServed: null, latencyMs };
    }
    const body = (await response.json().catch(() => null)) as { data?: { id?: unknown }[] } | null;
    const ids = Array.isArray(body?.data) ? body.data.map((model) => model?.id) : [];
    return { ...base, reachable: true, modelServed: ids.includes(config.model), latencyMs };
  } catch (error) {
    console.warn('[llm] status: /models inacessível', describeError(error));
    return { ...base, reachable: false, modelServed: null, latencyMs: null };
  }
}
