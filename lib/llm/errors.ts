import 'server-only';

import {
  APICallError,
  EmptyResponseBodyError,
  InvalidResponseDataError,
  JSONParseError,
  NoOutputGeneratedError,
  TypeValidationError,
} from 'ai';

import type { LlmFailureReason } from '@/lib/llm/types';

/**
 * Classificação das falhas vindas do vLLM (spec 0001, "Classificação das falhas").
 * Prazo estourado e cancelamento são decididos por quem chama, pela causa do abort.
 */

export type RemoteFailure = {
  reason: Extract<
    LlmFailureReason,
    'unavailable' | 'auth_error' | 'bad_request' | 'invalid_output'
  >;
  /** Ganha nova tentativa (só antes do primeiro conteúdo e dentro do prazo). */
  retryable: boolean;
};

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

/** Conexão recusada ou reiniciada (códigos do Node/undici e do Bun). */
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'UND_ERR_SOCKET',
  'ConnectionRefused',
  'ConnectionClosed',
]);

/**
 * Percorre `cause` e `errors` (AggregateError, host com vários endereços).
 * Checa pelo formato, não por `instanceof`: o erro do `fetch` pode vir de outro
 * realm do V8 (ex.: testes em `vmForks`), onde `instanceof Error` falha.
 */
function hasRetryableNetworkCode(error: unknown, seen = new Set<unknown>()): boolean {
  if (typeof error !== 'object' || error === null || seen.has(error)) return false;
  seen.add(error);
  const { code, cause, errors } = error as { code?: unknown; cause?: unknown; errors?: unknown };
  if (typeof code === 'string' && RETRYABLE_NETWORK_CODES.has(code)) return true;
  if (Array.isArray(errors) && errors.some((inner) => hasRetryableNetworkCode(inner, seen))) {
    return true;
  }
  return hasRetryableNetworkCode(cause, seen);
}

export function classifyRemoteError(error: unknown): RemoteFailure {
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    // Sem status: não conectou. Com 2xx: a conexão caiu no meio do corpo da resposta.
    if (status == null || (status >= 200 && status < 300)) {
      return { reason: 'unavailable', retryable: hasRetryableNetworkCode(error) };
    }
    if (status === 401 || status === 403) return { reason: 'auth_error', retryable: false };
    if (RETRYABLE_STATUS.has(status)) return { reason: 'unavailable', retryable: true };
    if (status >= 500) return { reason: 'unavailable', retryable: false };
    // 400, 422 e demais 4xx: o vLLM recusou o pedido.
    return { reason: 'bad_request', retryable: false };
  }

  // Resposta HTTP chegou, mas fora do formato esperado.
  if (
    InvalidResponseDataError.isInstance(error) ||
    EmptyResponseBodyError.isInstance(error) ||
    JSONParseError.isInstance(error) ||
    TypeValidationError.isInstance(error) ||
    NoOutputGeneratedError.isInstance(error)
  ) {
    return { reason: 'invalid_output', retryable: false };
  }

  if (hasRetryableNetworkCode(error)) return { reason: 'unavailable', retryable: true };
  return { reason: 'unavailable', retryable: false };
}

/**
 * Descrição curta para log. Só nome e status: a mensagem de erros de validação
 * repete o texto gerado, e o corpo da requisição traz o relato.
 */
export function describeError(error: unknown): string {
  if (APICallError.isInstance(error)) {
    return error.statusCode == null
      ? `APICallError connection ${error.message.slice(0, 80)}`
      : `APICallError status=${error.statusCode}`;
  }
  const name = (error as { name?: unknown } | null)?.name;
  return typeof name === 'string' ? name : 'unknown';
}
