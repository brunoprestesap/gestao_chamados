import { createServer } from 'node:net';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/models/LlmCall', () => ({ LlmCallModel: { create: vi.fn().mockResolvedValue({}) } }));

import { type LlmStub, type LlmStubReply, startLlmStub } from '@/e2e/fixtures/llm-stub';
import { generateLlmObject, type LlmTaskInput, streamLlmObject } from '@/lib/llm';
import { llmCircuitBreaker } from '@/lib/llm/circuit-breaker';
import { LLM_MAX_INPUT_CHARS, overrideLlmTimings } from '@/lib/llm/config';
import { llmLimiter } from '@/lib/llm/limiter';
import { llmUserRateLimit } from '@/lib/llm/user-rate-limit';
import { LlmCallModel } from '@/models/LlmCall';

import {
  resetLlmRuntimeState,
  restoreLlmDefaults,
  TEST_API_KEY,
  TEST_MODEL,
  useStubEnv,
} from './llm-test-env';

/**
 * Proteção da GPU compartilhada contra o servidor falso (spec 0001, AC-4 a AC-8, AC-10).
 * Prazos injetados em milissegundos.
 */

const schema = z.object({ servico: z.string() });
const OK: LlmStubReply = { type: 'json', content: '{"servico":"iluminacao"}' };
const MARIA = '507f1f77bcf86cd799439011';

function input(overrides: Partial<LlmTaskInput<{ servico: string }>> = {}) {
  return {
    task: 'teste.protecao',
    promptVersion: 'v1',
    schema,
    system: 'Classifique.',
    messages: [{ role: 'user' as const, content: 'A lâmpada queimou' }],
    userId: MARIA,
    ...overrides,
  };
}

const create = vi.mocked(LlmCallModel.create);

function records(): Record<string, unknown>[] {
  return create.mock.calls.map((call) => call[0] as unknown as Record<string, unknown>);
}

/** Maior número de pedidos de completion abertos ao mesmo tempo no servidor falso. */
function maxOverlap(stub: LlmStub): number {
  const edges = stub
    .completionRequests()
    .flatMap((r) => [
      { at: r.startedAt, delta: 1 },
      { at: r.endedAt ?? Number.POSITIVE_INFINITY, delta: -1 },
    ])
    .sort((a, b) => a.at - b.at || a.delta - b.delta);
  let current = 0;
  let max = 0;
  for (const edge of edges) {
    current += edge.delta;
    max = Math.max(max, current);
  }
  return max;
}

async function closedPortUrl(): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return `http://127.0.0.1:${port}/v1`;
}

describe('proteção da GPU compartilhada contra o servidor falso', () => {
  let stub: LlmStub;

  beforeAll(async () => {
    stub = await startLlmStub({ apiKey: TEST_API_KEY, model: TEST_MODEL });
  });

  afterAll(async () => {
    await stub.close();
  });

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    create.mockClear();
    stub.reset();
    resetLlmRuntimeState();
    useStubEnv(stub.baseUrl);
    overrideLlmTimings({
      interactive: {
        firstChunkMs: 400,
        chunkMs: 300,
        totalMs: 1_000,
        generateMs: 400,
        retryDelaysMs: [0],
      },
      batch: {
        firstChunkMs: 800,
        chunkMs: 400,
        totalMs: 1_500,
        generateMs: 800,
        retryDelaysMs: [40, 80],
      },
      interactiveQueueMs: 150,
      circuitOpenMs: 200,
    });
  });

  afterEach(async () => {
    await stub.waitForIdle(3_000).catch(() => {});
    vi.restoreAllMocks();
    restoreLlmDefaults();
  });

  describe('novas tentativas (AC-4)', () => {
    it('503 seguido de sucesso dá ok com attempts 2, usando a mesma vaga', async () => {
      stub.enqueue({ type: 'status', status: 503 }, { ...OK, delayMs: 100 });

      const pending = generateLlmObject(input());
      await stub.waitForCompletions(2);
      expect(llmLimiter.activeCalls).toBe(1);
      const result = await pending;

      expect(result).toMatchObject({ ok: true, meta: { attempts: 2 } });
      expect(llmLimiter.activeCalls).toBe(0);
      await vi.waitFor(() =>
        expect(records().at(-1)).toMatchObject({ status: 'success', attempts: 2 }),
      );
      expect(create).toHaveBeenCalledTimes(1);
    });

    it.each([429, 502, 504])('%i ganha nova tentativa', async (status) => {
      stub.enqueue({ type: 'status', status }, OK);

      expect(await generateLlmObject(input())).toMatchObject({ ok: true, meta: { attempts: 2 } });
    });

    it('conexão reiniciada antes do conteúdo ganha nova tentativa no streaming', async () => {
      stub.enqueue({ type: 'reset' }, { type: 'stream', chunks: ['{"servico":', '"x"}'] });

      const stream = await streamLlmObject(input());

      expect(stream.ok && (await stream.final)).toMatchObject({ ok: true, meta: { attempts: 2 } });
    });

    it('conexão recusada vira unavailable depois de 2 tentativas na raia interativa', async () => {
      useStubEnv(await closedPortUrl());

      expect(await generateLlmObject(input())).toMatchObject({
        ok: false,
        reason: 'unavailable',
        meta: { attempts: 2 },
      });
    });

    it('na raia interativa são no máximo 2 tentativas', async () => {
      stub.enqueue({ type: 'status', status: 503 }, { type: 'status', status: 503 }, OK);

      expect(await generateLlmObject(input())).toMatchObject({
        ok: false,
        reason: 'unavailable',
        meta: { attempts: 2 },
      });
      expect(stub.completionRequests()).toHaveLength(2);
    });

    it('na raia de lote são até 3 tentativas, com espera crescente entre elas', async () => {
      stub.enqueue(
        { type: 'status', status: 503 },
        { type: 'status', status: 502 },
        { type: 'status', status: 503 },
      );

      const result = await generateLlmObject(input({ lane: 'batch', userId: null }));

      expect(result).toMatchObject({ ok: false, reason: 'unavailable', meta: { attempts: 3 } });
      const [first, second, third] = stub.completionRequests();
      expect(second.startedAt - first.startedAt).toBeGreaterThanOrEqual(35);
      expect(third.startedAt - second.startedAt).toBeGreaterThanOrEqual(75);
    });

    it.each([
      [500, 'unavailable'],
      [401, 'auth_error'],
      [403, 'auth_error'],
      [400, 'bad_request'],
      [422, 'bad_request'],
    ])('%i não ganha nova tentativa e vira %s', async (status, reason) => {
      stub.enqueue({ type: 'status', status }, OK);

      expect(await generateLlmObject(input())).toMatchObject({
        ok: false,
        reason,
        meta: { attempts: 1 },
      });
      expect(stub.completionRequests()).toHaveLength(1);
    });

    it('a nova tentativa fica dentro do mesmo prazo e vira timeout quando ele acaba', async () => {
      stub.enqueue({ type: 'status', status: 503, delayMs: 250 }, { type: 'hang' });
      const startedAt = Date.now();

      const result = await generateLlmObject(input());

      expect(result).toMatchObject({ ok: false, reason: 'timeout', meta: { attempts: 2 } });
      expect(Date.now() - startedAt).toBeLessThan(700);
    });
  });

  describe('vagas (AC-6)', () => {
    it('com 4 chamadas lentas em andamento, a quinta falha como busy sem chegar ao vLLM', async () => {
      overrideLlmTimings({ interactive: { generateMs: 3_000 } });
      stub.setFallback({ ...OK, delayMs: 700 });

      const slow = Array.from({ length: 4 }, () => generateLlmObject(input()));
      await stub.waitForCompletions(4);
      const startedAt = Date.now();
      const fifth = await generateLlmObject(input());

      expect(fifth).toMatchObject({ ok: false, reason: 'busy', meta: { attempts: 0 } });
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(140);
      expect(stub.completionRequests()).toHaveLength(4);
      await vi.waitFor(() =>
        expect(records().find((r) => r.failureReason === 'busy')).toMatchObject({
          attempts: 0,
          queueMs: expect.any(Number),
        }),
      );
      expect((records().find((r) => r.failureReason === 'busy')!.queueMs as number) >= 140).toBe(
        true,
      );
      expect((await Promise.all(slow)).every((r) => r.ok)).toBe(true);
    });

    it('LLM_MAX_CONCURRENCY limita os pedidos simultâneos e quem espera segue depois', async () => {
      useStubEnv(stub.baseUrl, { LLM_MAX_CONCURRENCY: '2' });
      overrideLlmTimings({ interactive: { generateMs: 3_000 }, interactiveQueueMs: 2_000 });
      stub.setFallback({ ...OK, delayMs: 80 });

      const results = await Promise.all(
        Array.from({ length: 5 }, () => generateLlmObject(input())),
      );

      expect(results.every((r) => r.ok)).toBe(true);
      expect(maxOverlap(stub)).toBe(2);
      await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(5));
      expect(records().some((r) => (r.queueMs as number) > 0)).toBe(true);
    });

    it('a vaga é liberada em qualquer desfecho', async () => {
      stub.enqueue(
        { type: 'status', status: 500 },
        { type: 'json', content: '{"outro":1}' },
        { type: 'stream', chunks: ['{"servico":'], stallAfterChunks: 1 },
        { type: 'hang' },
      );

      await generateLlmObject(input());
      await generateLlmObject(input());
      const stream = await streamLlmObject(input());
      if (stream.ok) await stream.final;
      await generateLlmObject(input());

      expect(llmLimiter.activeCalls).toBe(0);
      expect(llmLimiter.queuedCalls).toBe(0);
    });
  });

  describe('cancelamento na fila (AC-5, AC-10)', () => {
    it('abortar enquanto espera vaga grava cancelled com attempts 0 e o queueMs já esperado', async () => {
      useStubEnv(stub.baseUrl, { LLM_MAX_CONCURRENCY: '1' });
      overrideLlmTimings({ interactive: { generateMs: 3_000 }, interactiveQueueMs: 2_000 });
      stub.enqueue({ type: 'hang' });
      const holder = new AbortController();
      const first = generateLlmObject(input({ signal: holder.signal }));
      await stub.waitForCompletions(1);

      const waiter = new AbortController();
      setTimeout(() => waiter.abort(), 80);
      const second = await generateLlmObject(input({ signal: waiter.signal }));

      expect(second).toMatchObject({ ok: false, reason: 'cancelled', meta: { attempts: 0 } });
      expect(llmLimiter.queuedCalls).toBe(0);
      expect(stub.completionRequests()).toHaveLength(1);
      await vi.waitFor(() =>
        expect(records().find((r) => r.status === 'cancelled')).toMatchObject({ attempts: 0 }),
      );
      expect(
        records().find((r) => r.status === 'cancelled')!.queueMs as number,
      ).toBeGreaterThanOrEqual(70);

      holder.abort();
      expect(await first).toMatchObject({ reason: 'cancelled' });
      expect(llmLimiter.activeCalls).toBe(0);
    });
  });

  describe('disjuntor (AC-7)', () => {
    const FAIL: LlmStubReply = { type: 'status', status: 500 };

    it('3 falhas seguidas abrem; a quarta é circuit_open sem tráfego', async () => {
      stub.enqueue(FAIL, FAIL, FAIL);
      for (let i = 0; i < 3; i += 1) {
        expect(await generateLlmObject(input())).toMatchObject({ reason: 'unavailable' });
      }

      const fourth = await generateLlmObject(input());

      expect(fourth).toMatchObject({ ok: false, reason: 'circuit_open', meta: { attempts: 0 } });
      expect(stub.completionRequests()).toHaveLength(3);
      await vi.waitFor(() =>
        expect(records().at(-1)).toMatchObject({
          failureReason: 'circuit_open',
          attempts: 0,
          finishReason: null,
        }),
      );
    });

    it('timeouts contam como falha', async () => {
      stub.enqueue({ type: 'hang' }, { type: 'hang' }, { type: 'hang' });
      for (let i = 0; i < 3; i += 1) {
        expect(await generateLlmObject(input())).toMatchObject({ reason: 'timeout' });
      }

      expect(await generateLlmObject(input())).toMatchObject({ reason: 'circuit_open' });
    });

    it('um invalid_output entre falhas zera a contagem', async () => {
      stub.enqueue(FAIL, FAIL, { type: 'json', content: '{"outro":1}' }, FAIL, FAIL, OK);

      for (const expected of [
        'unavailable',
        'unavailable',
        'invalid_output',
        'unavailable',
        'unavailable',
      ]) {
        expect(await generateLlmObject(input())).toMatchObject({ reason: expected });
      }

      expect(await generateLlmObject(input())).toMatchObject({ ok: true });
    });

    it('um corte pelo limite de tokens entre timeouts zera a contagem (AC-15)', async () => {
      const HANG: LlmStubReply = { type: 'hang' };
      const CUT: LlmStubReply = {
        type: 'json',
        content: '{"servico":"iluminacao iluminacao iluminacao',
        finishReason: 'length',
      };
      stub.enqueue(HANG, HANG, CUT, HANG, HANG, OK);

      for (const expected of ['timeout', 'timeout', 'invalid_output', 'timeout', 'timeout']) {
        expect(await generateLlmObject(input())).toMatchObject({ reason: expected });
      }

      expect(await generateLlmObject(input())).toMatchObject({ ok: true });
      await vi.waitFor(() =>
        expect(records().map((record) => record.finishReason)).toEqual([
          null,
          null,
          'length',
          null,
          null,
          'stop',
        ]),
      );
    });

    it('depois do tempo aberto, uma chamada de teste passa e as outras seguem rejeitadas até ela terminar', async () => {
      stub.enqueue(FAIL, FAIL, FAIL, { ...OK, delayMs: 150 });
      for (let i = 0; i < 3; i += 1) await generateLlmObject(input());
      await new Promise((resolve) => setTimeout(resolve, 220));

      const probe = generateLlmObject(input());
      await stub.waitForCompletions(4);
      expect(await generateLlmObject(input())).toMatchObject({ reason: 'circuit_open' });

      expect(await probe).toMatchObject({ ok: true });
      expect(llmCircuitBreaker.getState()).toBe('closed');
      stub.enqueue(OK);
      expect(await generateLlmObject(input())).toMatchObject({ ok: true });
    });

    it('chamada de teste com auth_error fecha o disjuntor', async () => {
      stub.enqueue(FAIL, FAIL, FAIL, { type: 'status', status: 401 });
      for (let i = 0; i < 3; i += 1) await generateLlmObject(input());
      await new Promise((resolve) => setTimeout(resolve, 220));

      expect(await generateLlmObject(input())).toMatchObject({ reason: 'auth_error' });

      expect(llmCircuitBreaker.getState()).toBe('closed');
    });

    it('chamada de teste com timeout reabre o disjuntor', async () => {
      stub.enqueue(FAIL, FAIL, FAIL, { type: 'hang' });
      for (let i = 0; i < 3; i += 1) await generateLlmObject(input());
      await new Promise((resolve) => setTimeout(resolve, 220));

      expect(await generateLlmObject(input())).toMatchObject({ reason: 'timeout' });

      expect(llmCircuitBreaker.getState()).toBe('open');
      expect(await generateLlmObject(input())).toMatchObject({ reason: 'circuit_open' });
    });
  });

  describe('limite por usuário e tamanho da entrada (AC-8, AC-10)', () => {
    it('a 21ª chamada do mesmo usuário em 60s dá rate_limited sem tráfego', async () => {
      stub.setFallback(OK);
      for (let i = 0; i < 20; i += 1) {
        expect(await generateLlmObject(input())).toMatchObject({ ok: true });
      }

      expect(await generateLlmObject(input())).toMatchObject({
        ok: false,
        reason: 'rate_limited',
        meta: { attempts: 0 },
      });
      expect(stub.completionRequests()).toHaveLength(20);
      expect(await generateLlmObject(input({ userId: '507f1f77bcf86cd799439099' }))).toMatchObject({
        ok: true,
      });
    });

    it('50 rejeições seguidas gravam um único LlmCall rate_limited', async () => {
      for (let i = 0; i < 20; i += 1) llmUserRateLimit.tryAcquire(MARIA);

      for (let i = 0; i < 50; i += 1) {
        expect(await streamLlmObject(input())).toMatchObject({ reason: 'rate_limited' });
      }

      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(records().filter((r) => r.failureReason === 'rate_limited')).toHaveLength(1);
      expect(stub.requests).toHaveLength(0);
    });

    it('entrada acima de 24.000 caracteres dá bad_request sem tráfego; no limite passa', async () => {
      stub.setFallback(OK);
      const system = 'Classifique.';
      const over = 'x'.repeat(LLM_MAX_INPUT_CHARS - system.length + 1);

      expect(
        await generateLlmObject(input({ system, messages: [{ role: 'user', content: over }] })),
      ).toMatchObject({ ok: false, reason: 'bad_request', meta: { attempts: 0 } });
      expect(stub.requests).toHaveLength(0);

      expect(
        await generateLlmObject(
          input({ system, messages: [{ role: 'user', content: over.slice(1) }] }),
        ),
      ).toMatchObject({ ok: true });
    });

    it('raia interativa sem userId dá bad_request; lote sem userId segue', async () => {
      stub.setFallback(OK);

      expect(await generateLlmObject(input({ userId: null }))).toMatchObject({
        reason: 'bad_request',
      });
      expect(await generateLlmObject(input({ userId: null, lane: 'batch' }))).toMatchObject({
        ok: true,
      });
    });
  });

  describe('ordem das checagens (AC-7, AC-8)', () => {
    function openBreaker() {
      for (let i = 0; i < 3; i += 1) {
        llmCircuitBreaker.admit();
        llmCircuitBreaker.record('countable', 'allow');
      }
    }

    it('disjuntor aberto com usuário no limite dá circuit_open e não gasta a cota', async () => {
      for (let i = 0; i < 19; i += 1) llmUserRateLimit.tryAcquire(MARIA);
      openBreaker();

      expect(await generateLlmObject(input())).toMatchObject({ reason: 'circuit_open' });
      expect(await generateLlmObject(input())).toMatchObject({ reason: 'circuit_open' });

      llmCircuitBreaker.reset();
      stub.setFallback(OK);
      expect(await generateLlmObject(input())).toMatchObject({ ok: true });
      expect(await generateLlmObject(input())).toMatchObject({ reason: 'rate_limited' });
    });

    it('entrada grande demais com usuário no limite dá bad_request', async () => {
      for (let i = 0; i < 20; i += 1) llmUserRateLimit.tryAcquire(MARIA);

      const result = await generateLlmObject(
        input({ messages: [{ role: 'user', content: 'x'.repeat(LLM_MAX_INPUT_CHARS + 1) }] }),
      );

      expect(result).toMatchObject({ reason: 'bad_request' });
    });

    it('signal já abortado vence a entrada grande demais', async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await generateLlmObject(
        input({
          signal: controller.signal,
          messages: [{ role: 'user', content: 'x'.repeat(LLM_MAX_INPUT_CHARS + 1) }],
        }),
      );

      expect(result).toMatchObject({ reason: 'cancelled' });
    });
  });
});
