import { APICallError, NoOutputGeneratedError, TypeValidationError } from 'ai';
import { describe, expect, it } from 'vitest';

import { classifyRemoteError, describeError } from '@/lib/llm/errors';

/** Classificação das falhas vindas do vLLM (spec 0001, "Classificação das falhas"). */

function apiError(statusCode: number | undefined, cause?: unknown) {
  return new APICallError({
    message: statusCode ? `status ${statusCode}` : 'Cannot connect to API',
    url: 'http://vllm/v1/chat/completions',
    requestBodyValues: { messages: [{ content: 'relato sigiloso' }] },
    statusCode,
    cause,
  });
}

describe('classifyRemoteError', () => {
  it.each([
    [401, 'auth_error', false],
    [403, 'auth_error', false],
    [400, 'bad_request', false],
    [422, 'bad_request', false],
    [404, 'bad_request', false],
    [429, 'unavailable', true],
    [500, 'unavailable', false],
    [502, 'unavailable', true],
    [503, 'unavailable', true],
    [504, 'unavailable', true],
  ] as const)('HTTP %i vira %s (nova tentativa: %s)', (status, reason, retryable) => {
    expect(classifyRemoteError(apiError(status))).toEqual({ reason, retryable });
  });

  it('conexão recusada embrulhada pelo AI SDK ganha nova tentativa', () => {
    const cause = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });

    expect(classifyRemoteError(apiError(undefined, cause))).toEqual({
      reason: 'unavailable',
      retryable: true,
    });
  });

  it('queda da conexão no meio de uma resposta 200 vira unavailable, não bad_request', () => {
    const cause = { name: 'SocketError', code: 'UND_ERR_SOCKET' };

    expect(classifyRemoteError(apiError(200, cause))).toEqual({
      reason: 'unavailable',
      retryable: true,
    });
  });

  it('reconhece erro de outro realm (sem instanceof Error) pelo formato', () => {
    const foreign = {
      name: 'TypeError',
      message: 'fetch failed',
      cause: { name: 'SocketError', code: 'ECONNRESET' },
    };

    expect(classifyRemoteError(foreign)).toEqual({ reason: 'unavailable', retryable: true });
  });

  it('procura o código dentro de AggregateError', () => {
    const aggregate = new AggregateError([
      Object.assign(new Error('v6'), { code: 'ENETUNREACH' }),
      Object.assign(new Error('v4'), { code: 'ECONNREFUSED' }),
    ]);

    expect(classifyRemoteError({ message: 'fetch failed', cause: aggregate })).toEqual({
      reason: 'unavailable',
      retryable: true,
    });
  });

  it('erro desconhecido vira unavailable sem nova tentativa', () => {
    expect(classifyRemoteError(new Error('???'))).toEqual({
      reason: 'unavailable',
      retryable: false,
    });
  });

  it('resposta fora do formato vira invalid_output', () => {
    expect(
      classifyRemoteError(new TypeValidationError({ value: { x: 1 }, cause: new Error('x') })),
    ).toEqual({ reason: 'invalid_output', retryable: false });
    expect(classifyRemoteError(new NoOutputGeneratedError())).toEqual({
      reason: 'invalid_output',
      retryable: false,
    });
  });
});

describe('describeError', () => {
  it('não repete corpo de requisição nem valor validado', () => {
    const validation = new TypeValidationError({
      value: { relato: 'relato sigiloso' },
      cause: new Error('x'),
    });

    expect(describeError(apiError(503))).toBe('APICallError status=503');
    expect(describeError(validation)).not.toContain('sigiloso');
    expect(describeError(apiError(401))).not.toContain('sigiloso');
  });
});
