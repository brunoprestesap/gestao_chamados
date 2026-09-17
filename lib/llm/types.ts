import 'server-only';

import type { DeepPartial } from 'ai';
import type { z } from 'zod';

/** Contrato público de `lib/llm` (spec 0001, "Contrato das funções"). */

export const LLM_LANES = ['interactive', 'batch'] as const;
export type LlmLane = (typeof LLM_LANES)[number];

export const LLM_FAILURE_REASONS = [
  'timeout',
  'unavailable',
  'auth_error',
  'bad_request',
  'circuit_open',
  'busy',
  'rate_limited',
  'invalid_output',
  'interrupted',
] as const;
export type LlmFailureReason = (typeof LLM_FAILURE_REASONS)[number];

export const LLM_CALL_MODES = ['object', 'stream_object'] as const;
export type LlmCallMode = (typeof LLM_CALL_MODES)[number];

export const LLM_CALL_STATUSES = ['success', 'failed', 'cancelled'] as const;
export type LlmCallStatus = (typeof LLM_CALL_STATUSES)[number];

/** Motivo de parada normalizado pelo AI SDK (`FinishReason` de `ai`). */
export const LLM_FINISH_REASONS = [
  'stop',
  'length',
  'content-filter',
  'tool-calls',
  'error',
  'other',
] as const;
export type LlmFinishReason = (typeof LLM_FINISH_REASONS)[number];

/**
 * Amostragem ajustável por chamada (spec 0001, AC-14). `frequency_penalty` e
 * `repetition_penalty` são fixos e não entram aqui. Sem `seed`: o vLLM online
 * não garante reprodução sob concorrência.
 */
export type LlmSampling = {
  /** 0 a 2. */
  temperature: number;
  /** Maior que 0, até 1. */
  topP: number;
  /** Inteiro: -1 (desliga) ou a partir de 1. */
  topK: number;
  /** 0 a 1. */
  minP: number;
  /** -2 a 2. */
  presencePenalty: number;
  /** Inteiro de 1 a 8192. */
  maxOutputTokens: number;
};

export type LlmMessage = { role: 'user' | 'assistant'; content: string };

export type LlmTaskInput<T> = {
  /** Ex.: 'abertura.classificar'. */
  task: string;
  /** Constante da funcionalidade; muda quando o prompt muda. */
  promptVersion: string;
  schema: z.ZodType<T>;
  system: string;
  messages: LlmMessage[];
  /** Padrão 'interactive'. */
  lane?: LlmLane;
  /** Obrigatório na raia interactive; sempre da sessão verificada, nunca do corpo do pedido. */
  userId?: string | null;
  ref?: { type: string; id: string } | null;
  /** Cancelamento vindo de quem chama (tela fechada, conexão caída). */
  signal?: AbortSignal;
  /** Sobrescreve só os campos passados; fora das faixas vira `bad_request` sem tráfego. */
  sampling?: Partial<LlmSampling>;
};

export type LlmMeta = {
  task: string;
  promptVersion: string;
  model: string;
  attempts: number;
  latencyMs: number;
};

export type LlmFailure = {
  ok: false;
  reason: LlmFailureReason | 'disabled' | 'cancelled';
  meta: LlmMeta | null;
};

export type LlmResult<T> = { ok: true; data: T; meta: LlmMeta } | LlmFailure;

export type LlmStream<T> =
  | LlmFailure
  | { ok: true; partial: AsyncIterable<DeepPartial<T>>; final: Promise<LlmResult<T>> };

export type LlmCircuitState = 'closed' | 'open' | 'half_open';

export type LlmStatus = {
  configured: boolean;
  enabled: boolean;
  /** `null` com a IA desligada (não consulta a rede). */
  reachable: boolean | null;
  modelServed: boolean | null;
  circuit: LlmCircuitState;
  activeCalls: number;
  queuedCalls: number;
  latencyMs: number | null;
};
