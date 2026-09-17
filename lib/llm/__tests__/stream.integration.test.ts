import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/models/LlmCall', () => ({ LlmCallModel: { create: vi.fn().mockResolvedValue({}) } }));

import { type LlmStub, startLlmStub } from '@/e2e/fixtures/llm-stub';
import { generateLlmObject, type LlmTaskInput, streamLlmObject } from '@/lib/llm';
import { overrideLlmTimings } from '@/lib/llm/config';
import { llmLimiter } from '@/lib/llm/limiter';
import { LlmCallModel } from '@/models/LlmCall';

import {
  resetLlmRuntimeState,
  restoreLlmDefaults,
  setLlmEnv,
  TEST_API_KEY,
  TEST_MODEL,
  useStubEnv,
} from './llm-test-env';

/**
 * Streaming, prazos e cancelamento contra o servidor falso (spec 0001, AC-2, AC-3, AC-5).
 * Prazos injetados em milissegundos, na mesma proporção dos de produção
 * (sockets e AbortSignal não obedecem ao relógio falso do Vitest).
 */

const schema = z.object({
  servico: z.enum(['iluminacao', 'ar_condicionado', 'elevador']),
  local: z.string(),
});
type Classificacao = z.infer<typeof schema>;

const CHUNKS = ['{"servico":', '"iluminacao",', '"local":"sala', ' 204"}'];

function input(overrides: Partial<LlmTaskInput<Classificacao>> = {}): LlmTaskInput<Classificacao> {
  return {
    task: 'teste.stream',
    promptVersion: 'v1',
    schema,
    system: 'Classifique o relato.',
    messages: [{ role: 'user', content: 'A lâmpada da sala 204 queimou' }],
    userId: '507f1f77bcf86cd799439011',
    ...overrides,
  };
}

const create = vi.mocked(LlmCallModel.create);

async function lastRecord(): Promise<Record<string, unknown>> {
  await vi.waitFor(() => expect(create).toHaveBeenCalled());
  return create.mock.calls.at(-1)![0] as unknown as Record<string, unknown>;
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

describe('streamLlmObject e prazos contra o servidor falso', () => {
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
      interactive: { firstChunkMs: 300, chunkMs: 250, totalMs: 700, generateMs: 300 },
      batch: { firstChunkMs: 600, chunkMs: 400, totalMs: 1200, generateMs: 900 },
    });
  });

  afterEach(async () => {
    await stub.waitForIdle().catch(() => {});
    vi.restoreAllMocks();
    restoreLlmDefaults();
  });

  describe('caminho feliz (AC-2)', () => {
    it('entrega parciais em ordem, final validado e só abre depois do primeiro pedaço', async () => {
      stub.enqueue({ type: 'stream', chunks: CHUNKS, firstChunkDelayMs: 80, chunkDelayMs: 20 });
      const startedAt = Date.now();

      const stream = await streamLlmObject(input());

      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(60);
      expect(stream.ok).toBe(true);
      if (!stream.ok) return;
      const partials = await collect(stream.partial);
      const final = await stream.final;

      expect(partials.length).toBeGreaterThanOrEqual(2);
      expect(partials.at(-1)).toEqual({ servico: 'iluminacao', local: 'sala 204' });
      expect(partials.map((p) => JSON.stringify(p))).toEqual([
        ...new Set(partials.map((p) => JSON.stringify(p))),
      ]);
      expect(final).toMatchObject({
        ok: true,
        data: { servico: 'iluminacao', local: 'sala 204' },
        meta: { model: TEST_MODEL, attempts: 1 },
      });
      expect(stub.completionRequests()[0].body).toMatchObject({
        stream: true,
        stream_options: { include_usage: true },
        response_format: { type: 'json_schema' },
        chat_template_kwargs: { enable_thinking: false },
        // Os oito campos do AC-14 com os valores padrão.
        temperature: 0.7,
        top_p: 0.8,
        top_k: 20,
        min_p: 0,
        presence_penalty: 0,
        frequency_penalty: 0,
        repetition_penalty: 1,
        max_tokens: 448,
      });

      const record = await lastRecord();
      expect(record).toMatchObject({
        mode: 'stream_object',
        status: 'success',
        attempts: 1,
        inputTokens: 42,
        outputTokens: 7,
        finishReason: 'stop',
        sampling: {
          temperature: 0.7,
          topP: 0.8,
          topK: 20,
          minP: 0,
          presencePenalty: 0,
          maxOutputTokens: 448,
        },
      });
      expect(record.firstChunkMs).toBeGreaterThanOrEqual(60);
    });

    it('final continua resolvendo quando quem chama ignora os parciais', async () => {
      stub.enqueue({ type: 'stream', chunks: CHUNKS, chunkDelayMs: 5 });

      const stream = await streamLlmObject(input());

      expect(stream.ok && (await stream.final).ok).toBe(true);
    });

    it('JSON fora do schema: abre, mas final resolve invalid_output', async () => {
      stub.enqueue({ type: 'stream', chunks: ['{"servico":"telhado",', '"local":"x"}'] });

      const stream = await streamLlmObject(input());

      expect(stream.ok).toBe(true);
      expect(stream.ok && (await stream.final)).toMatchObject({
        ok: false,
        reason: 'invalid_output',
      });
      expect(await lastRecord()).toMatchObject({
        status: 'failed',
        failureReason: 'invalid_output',
      });
    });

    it('JSON truncado com finish normal vira invalid_output', async () => {
      stub.enqueue({ type: 'stream', chunks: ['{"servico":"iluminacao","local":"sa'] });

      const stream = await streamLlmObject(input());

      expect(stream.ok && (await stream.final)).toMatchObject({ reason: 'invalid_output' });
    });

    it('o parâmetro sampling sobrescreve só os campos passados (AC-14)', async () => {
      stub.enqueue({ type: 'stream', chunks: CHUNKS });

      const stream = await streamLlmObject(input({ sampling: { topK: 40, maxOutputTokens: 200 } }));

      expect(stream.ok && (await stream.final).ok).toBe(true);
      expect(stub.completionRequests()[0].body).toMatchObject({
        temperature: 0.7,
        top_p: 0.8,
        top_k: 40,
        min_p: 0,
        presence_penalty: 0,
        frequency_penalty: 0,
        repetition_penalty: 1,
        max_tokens: 200,
      });
      expect((await lastRecord()).sampling).toMatchObject({ topK: 40, maxOutputTokens: 200 });
    });

    it('sampling fora das faixas dá bad_request sem tráfego (AC-14, AC-15)', async () => {
      const stream = await streamLlmObject(input({ sampling: { presencePenalty: 2.5 } }));

      expect(stream).toMatchObject({ ok: false, reason: 'bad_request', meta: { attempts: 0 } });
      expect(stub.requests).toHaveLength(0);
      expect(await lastRecord()).toMatchObject({ sampling: null, finishReason: null, attempts: 0 });
    });

    it('corte pelo limite de tokens: abre, final resolve invalid_output e registra length (AC-15)', async () => {
      stub.enqueue({
        type: 'stream',
        chunks: ['{"servico":"iluminacao",', '"local":"sala 204 sala 204', ' sala 204 sala'],
        finishReason: 'length',
      });

      const stream = await streamLlmObject(input());

      expect(stream.ok).toBe(true);
      expect(stream.ok && (await stream.final)).toMatchObject({
        ok: false,
        reason: 'invalid_output',
      });
      expect(await lastRecord()).toMatchObject({
        status: 'failed',
        failureReason: 'invalid_output',
        finishReason: 'length',
      });
      expect(console.warn).toHaveBeenCalledWith(
        '[llm]',
        expect.stringContaining('"finishReason":"length"'),
      );
    });
  });

  describe('prazos (AC-3)', () => {
    it('primeiro pedaço depois do prazo vira timeout e aborta a conexão', async () => {
      stub.enqueue({ type: 'stream', chunks: CHUNKS, firstChunkDelayMs: 2_000 });
      const startedAt = Date.now();

      const stream = await streamLlmObject(input());

      expect(stream).toMatchObject({ ok: false, reason: 'timeout', meta: { attempts: 1 } });
      // Prazo do primeiro pedaço (300ms), não o teto total (700ms).
      expect(Date.now() - startedAt).toBeLessThan(550);
      await vi.waitFor(() => expect(stub.completionRequests()[0].aborted).toBe(true));
      expect(await lastRecord()).toMatchObject({
        status: 'failed',
        failureReason: 'timeout',
        finishReason: null,
      });
    });

    it('parada no meio do streaming vira interrupted e aborta a conexão', async () => {
      stub.enqueue({ type: 'stream', chunks: CHUNKS, stallAfterChunks: 2 });
      const startedAt = Date.now();

      const stream = await streamLlmObject(input());

      expect(stream.ok).toBe(true);
      expect(stream.ok && (await stream.final)).toMatchObject({ ok: false, reason: 'interrupted' });
      // Detectado pela parada (250ms), não pelo teto total (700ms).
      expect(Date.now() - startedAt).toBeLessThan(550);
      await vi.waitFor(() => expect(stub.completionRequests()[0].aborted).toBe(true));
      const record = await lastRecord();
      expect(record).toMatchObject({
        status: 'failed',
        failureReason: 'interrupted',
        finishReason: null,
      });
      expect(record.firstChunkMs).not.toBeNull();
    });

    it('teto total estourado com pedaços chegando vira interrupted', async () => {
      const slow = Array.from({ length: 15 }, (_, i) => (i === 0 ? '{"local":"' : 'a'));
      stub.enqueue({ type: 'stream', chunks: slow, chunkDelayMs: 100 });
      const startedAt = Date.now();

      const stream = await streamLlmObject(input());

      expect(stream.ok && (await stream.final)).toMatchObject({ ok: false, reason: 'interrupted' });
      expect(Date.now() - startedAt).toBeLessThan(1_300);
      await vi.waitFor(() => expect(stub.completionRequests()[0].aborted).toBe(true));
    });

    it('queda da conexão depois do primeiro pedaço vira interrupted, sem nova tentativa (AC-4)', async () => {
      stub.enqueue(
        { type: 'stream', chunks: CHUNKS, dropAfterChunks: 1 },
        { type: 'stream', chunks: CHUNKS },
      );

      const stream = await streamLlmObject(input());

      expect(stream.ok && (await stream.final)).toMatchObject({
        ok: false,
        reason: 'interrupted',
        meta: { attempts: 1 },
      });
      expect(stub.completionRequests()).toHaveLength(1);
    });

    it('generateLlmObject sem resposta dentro do teto vira timeout e aborta a conexão', async () => {
      stub.enqueue({ type: 'hang' });
      const startedAt = Date.now();

      const result = await generateLlmObject(input());

      expect(result).toMatchObject({ ok: false, reason: 'timeout', meta: { attempts: 1 } });
      expect(Date.now() - startedAt).toBeLessThan(550);
      await vi.waitFor(() => expect(stub.completionRequests()[0].aborted).toBe(true));
      expect(await lastRecord()).toMatchObject({ failureReason: 'timeout', finishReason: null });
    });

    it('a raia de lote usa os próprios prazos', async () => {
      stub.enqueue({ type: 'stream', chunks: CHUNKS, firstChunkDelayMs: 450 });

      const stream = await streamLlmObject(input({ lane: 'batch', userId: null }));

      expect(stream.ok && (await stream.final)).toMatchObject({ ok: true, meta: { attempts: 1 } });
    });
  });

  describe('cancelamento (AC-5, AC-10)', () => {
    it('abortar no meio do streaming fecha a conexão e grava cancelled', async () => {
      stub.enqueue({ type: 'stream', chunks: CHUNKS, chunkDelayMs: 150 });
      const controller = new AbortController();

      const stream = await streamLlmObject(input({ signal: controller.signal }));
      expect(stream.ok).toBe(true);
      controller.abort();

      expect(stream.ok && (await stream.final)).toMatchObject({ ok: false, reason: 'cancelled' });
      await vi.waitFor(() => expect(stub.completionRequests()[0].aborted).toBe(true));
      expect(await lastRecord()).toMatchObject({
        status: 'cancelled',
        failureReason: null,
        attempts: 1,
      });
    });

    it('abortar antes do primeiro pedaço resolve a abertura com cancelled', async () => {
      stub.enqueue({ type: 'stream', chunks: CHUNKS, firstChunkDelayMs: 250 });
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 60);

      const stream = await streamLlmObject(input({ signal: controller.signal }));

      expect(stream).toMatchObject({ ok: false, reason: 'cancelled', meta: { attempts: 1 } });
      await vi.waitFor(() => expect(stub.completionRequests()[0].aborted).toBe(true));
    });

    it('abortar generateLlmObject durante a requisição grava cancelled', async () => {
      stub.enqueue({ type: 'hang' });
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 60);

      const result = await generateLlmObject(input({ signal: controller.signal }));

      expect(result).toMatchObject({ ok: false, reason: 'cancelled' });
      await vi.waitFor(() => expect(stub.completionRequests()[0].aborted).toBe(true));
      expect(await lastRecord()).toMatchObject({ status: 'cancelled', mode: 'object' });
    });

    it.each([
      ['generateLlmObject', generateLlmObject],
      ['streamLlmObject', streamLlmObject],
    ] as const)('%s com signal já abortado não gera tráfego e grava attempts 0', async (_, fn) => {
      const controller = new AbortController();
      controller.abort();

      const result = await fn(input({ signal: controller.signal }));

      expect(result).toMatchObject({ ok: false, reason: 'cancelled', meta: { attempts: 0 } });
      expect(stub.requests).toHaveLength(0);
      expect(await lastRecord()).toMatchObject({ status: 'cancelled', attempts: 0, queueMs: 0 });
    });
  });

  it('IA desligada devolve disabled sem tráfego e sem registro (AC-9)', async () => {
    setLlmEnv({
      LLM_BASE_URL: stub.baseUrl,
      LLM_API_KEY: TEST_API_KEY,
      LLM_MODEL: TEST_MODEL,
      LLM_ENABLED: 'false',
    });

    const stream = await streamLlmObject(input());

    expect(stream).toEqual({ ok: false, reason: 'disabled', meta: null });
    expect(stub.requests).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(create).not.toHaveBeenCalled();
  });

  describe('erro inesperado: nenhuma função lança (AC-3)', () => {
    const fns = [
      ['generateLlmObject', generateLlmObject],
      ['streamLlmObject', streamLlmObject],
    ] as const;

    it.each(fns)(
      '%s com system ausente em tempo de execução devolve unavailable sem tráfego',
      async (name, fn) => {
        const relato = 'A lâmpada da sala 204 queimou';

        const result = await fn(input({ system: undefined as unknown as string }));

        expect(result).toEqual({ ok: false, reason: 'unavailable', meta: null });
        expect(stub.requests).toHaveLength(0);
        expect(llmLimiter.activeCalls).toBe(0);
        expect(console.error).toHaveBeenCalledWith(
          `[llm] erro inesperado em ${name}:`,
          expect.any(String),
        );
        expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(relato);
      },
    );

    it.each(fns)(
      '%s com schema que lança na validação resolve falha e libera a vaga',
      async (_, fn) => {
        stub.setFallback({ type: 'json', content: '{"servico":"iluminacao","local":"sala 204"}' });
        const schemaQueLanca = schema.refine(() => {
          throw new RangeError('data inválida');
        });

        const opened = await fn(input({ schema: schemaQueLanca }));
        const result = 'final' in opened ? await opened.final : opened;

        expect(result.ok).toBe(false);
        expect(llmLimiter.activeCalls).toBe(0);
        expect(await lastRecord()).toMatchObject({ status: 'failed' });
      },
    );
  });
});
