import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/models/LlmCall', () => ({ LlmCallModel: { create: vi.fn().mockResolvedValue({}) } }));

import { type LlmStub, startLlmStub } from '@/e2e/fixtures/llm-stub';
import { generateLlmObject, isLlmEnabled } from '@/lib/llm';
import { LlmCallModel } from '@/models/LlmCall';

import {
  resetLlmRuntimeState,
  restoreLlmDefaults,
  setLlmEnv,
  TEST_API_KEY,
  TEST_MODEL,
  useStubEnv,
} from './llm-test-env';

const RELATO = 'A lâmpada da sala 204 do Fórum queimou, ramal 5555, falar com Maria';

const schema = z.object({
  servico: z.enum(['iluminacao', 'ar_condicionado', 'elevador']),
  local: z.string(),
});

function input(
  overrides: Partial<Parameters<typeof generateLlmObject<z.infer<typeof schema>>>[0]> = {},
) {
  return {
    task: 'teste.classificar',
    promptVersion: 'v1',
    schema,
    system: 'Classifique o relato.',
    messages: [{ role: 'user' as const, content: RELATO }],
    userId: '507f1f77bcf86cd799439011',
    ...overrides,
  };
}

const create = vi.mocked(LlmCallModel.create);

/** Os oito campos do AC-14 com os valores padrão, como chegam ao vLLM. */
const DEFAULT_SAMPLING_BODY = {
  temperature: 0.7,
  top_p: 0.8,
  top_k: 20,
  min_p: 0,
  presence_penalty: 0,
  frequency_penalty: 0,
  repetition_penalty: 1,
  max_tokens: 448,
};

const DEFAULT_SAMPLING_RECORD = {
  temperature: 0.7,
  topP: 0.8,
  topK: 20,
  minP: 0,
  presencePenalty: 0,
  maxOutputTokens: 448,
};

async function lastRecord(): Promise<Record<string, unknown>> {
  await vi.waitFor(() => expect(create).toHaveBeenCalled());
  return create.mock.calls.at(-1)![0] as unknown as Record<string, unknown>;
}

describe('generateLlmObject contra o servidor falso', () => {
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreLlmDefaults();
  });

  it('caminho feliz: envia json_schema, desliga o thinking e devolve dados validados com meta (AC-1)', async () => {
    stub.enqueue({ type: 'json', content: '{"servico":"iluminacao","local":"sala 204"}' });

    const result = await generateLlmObject(input());

    expect(result).toMatchObject({
      ok: true,
      data: { servico: 'iluminacao', local: 'sala 204' },
      meta: { task: 'teste.classificar', promptVersion: 'v1', model: TEST_MODEL, attempts: 1 },
    });
    expect(result.ok && result.meta.latencyMs).toBeGreaterThanOrEqual(0);

    const [request] = stub.completionRequests();
    expect(request.authorization).toBe(`Bearer ${TEST_API_KEY}`);
    expect(request.body.model).toBe(TEST_MODEL);
    expect(request.body.response_format.type).toBe('json_schema');
    expect(request.body.response_format.json_schema.schema.properties).toHaveProperty('servico');
    expect(request.body.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(request.body).toMatchObject(DEFAULT_SAMPLING_BODY);
    expect(request.body.messages).toEqual([
      { role: 'system', content: 'Classifique o relato.' },
      { role: 'user', content: RELATO },
    ]);
  });

  it('grava um LlmCall de sucesso com tokens e sem nenhum texto (AC-10)', async () => {
    stub.enqueue({
      type: 'json',
      content: '{"servico":"iluminacao","local":"sala 204"}',
      usage: { prompt_tokens: 120, completion_tokens: 15 },
    });

    await generateLlmObject(input({ ref: { type: 'conversa', id: 'abc123' } }));

    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const doc = create.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(doc).toMatchObject({
      task: 'teste.classificar',
      promptVersion: 'v1',
      model: TEST_MODEL,
      lane: 'interactive',
      mode: 'object',
      status: 'success',
      failureReason: null,
      attempts: 1,
      queueMs: 0,
      firstChunkMs: null,
      inputTokens: 120,
      outputTokens: 15,
      finishReason: 'stop',
      sampling: DEFAULT_SAMPLING_RECORD,
      refType: 'conversa',
      refId: 'abc123',
    });
    expect(String(doc.userId)).toBe('507f1f77bcf86cd799439011');
    const serialized = JSON.stringify(doc);
    expect(serialized).not.toContain('lâmpada');
    expect(serialized).not.toContain('Classifique');
    expect(serialized).not.toContain('sala 204');
  });

  describe('amostragem (AC-14, AC-15)', () => {
    it('o parâmetro sampling sobrescreve só os campos passados', async () => {
      stub.enqueue({ type: 'json', content: '{"servico":"elevador","local":"hall"}' });

      await generateLlmObject(input({ sampling: { topK: 40, maxOutputTokens: 200 } }));

      expect(stub.completionRequests()[0].body).toMatchObject({
        ...DEFAULT_SAMPLING_BODY,
        top_k: 40,
        max_tokens: 200,
      });
      expect(await lastRecord()).toMatchObject({
        sampling: { ...DEFAULT_SAMPLING_RECORD, topK: 40, maxOutputTokens: 200 },
      });
    });

    it('frequency_penalty e repetition_penalty ficam fixos mesmo se alguém tentar passar', async () => {
      stub.enqueue({ type: 'json', content: '{"servico":"elevador","local":"hall"}' });
      const sampling = { frequencyPenalty: 1.5, repetitionPenalty: 1.3 } as Record<string, number>;

      await generateLlmObject(input({ sampling }));

      expect(stub.completionRequests()[0].body).toMatchObject(DEFAULT_SAMPLING_BODY);
      expect((await lastRecord()).sampling).toEqual(DEFAULT_SAMPLING_RECORD);
    });

    it.each([
      ['temperature: 3', { temperature: 3 }],
      ['topP: 0', { topP: 0 }],
      ['topK: 0', { topK: 0 }],
      ['topK: 2.5', { topK: 2.5 }],
      ['minP: 1.5', { minP: 1.5 }],
      ['presencePenalty: 2.5', { presencePenalty: 2.5 }],
      ['maxOutputTokens: 9000', { maxOutputTokens: 9000 }],
      ['maxOutputTokens: 0', { maxOutputTokens: 0 }],
      ['temperature: NaN', { temperature: Number.NaN }],
    ])('%s dá bad_request sem tráfego e grava sampling null', async (_label, sampling) => {
      const result = await generateLlmObject(input({ sampling }));

      expect(result).toMatchObject({ ok: false, reason: 'bad_request', meta: { attempts: 0 } });
      expect(stub.requests).toHaveLength(0);
      expect(await lastRecord()).toMatchObject({
        status: 'failed',
        failureReason: 'bad_request',
        attempts: 0,
        sampling: null,
        finishReason: null,
      });
    });

    it.each([
      ['temperature: 0', { temperature: 0 }, { temperature: 0 }],
      ['topK: -1', { topK: -1 }, { top_k: -1 }],
      [
        'limites das faixas',
        { topP: 1, minP: 1, presencePenalty: -2, maxOutputTokens: 8192 },
        {
          top_p: 1,
          min_p: 1,
          presence_penalty: -2,
          max_tokens: 8192,
        },
      ],
    ])('%s é aceito e chega ao vLLM', async (_label, sampling, body) => {
      stub.enqueue({ type: 'json', content: '{"servico":"elevador","local":"hall"}' });

      const result = await generateLlmObject(input({ sampling }));

      expect(result.ok).toBe(true);
      expect(stub.completionRequests()[0].body).toMatchObject(body);
    });
  });

  describe('corte pelo limite de tokens (AC-15)', () => {
    it('JSON incompleto com finish_reason length vira invalid_output e registra length', async () => {
      stub.enqueue({
        type: 'json',
        content: '{"servico":"iluminacao","local":"sala 204 sala 204 sala 204',
        finishReason: 'length',
      });

      const result = await generateLlmObject(input());

      expect(result).toMatchObject({ ok: false, reason: 'invalid_output', meta: { attempts: 1 } });
      expect(await lastRecord()).toMatchObject({
        status: 'failed',
        failureReason: 'invalid_output',
        finishReason: 'length',
        sampling: DEFAULT_SAMPLING_RECORD,
        outputTokens: 7,
      });
      expect(console.warn).toHaveBeenCalledWith(
        '[llm]',
        expect.stringContaining('"finishReason":"length"'),
      );
    });

    it('no caminho feliz o log [llm] traz finishReason stop', async () => {
      stub.enqueue({ type: 'json', content: '{"servico":"iluminacao","local":"sala 204"}' });

      await generateLlmObject(input());

      expect(console.warn).toHaveBeenCalledWith(
        '[llm]',
        expect.stringContaining('"finishReason":"stop"'),
      );
    });
  });

  it('JSON fora do schema vira invalid_output e ainda grava o registro', async () => {
    stub.enqueue({ type: 'json', content: '{"servico":"telhado","local":"sala 204"}' });

    const result = await generateLlmObject(input());

    expect(result).toMatchObject({ ok: false, reason: 'invalid_output', meta: { attempts: 1 } });
    await vi.waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', failureReason: 'invalid_output' }),
      ),
    );
  });

  it('falha ao gravar o LlmCall não altera o resultado entregue (AC-10)', async () => {
    create.mockRejectedValueOnce(new Error('mongo fora do ar'));
    stub.enqueue({ type: 'json', content: '{"servico":"iluminacao","local":"sala 204"}' });

    const result = await generateLlmObject(input());

    expect(result.ok).toBe(true);
    await vi.waitFor(() =>
      expect(console.error).toHaveBeenCalledWith(
        '[llm] falha ao gravar LlmCall:',
        expect.stringContaining('mongo fora do ar'),
      ),
    );
  });

  describe('IA desligada (AC-9)', () => {
    it.each([
      ['sem LLM_MODEL', { LLM_MODEL: undefined }],
      ['sem LLM_API_KEY', { LLM_API_KEY: undefined }],
      ['com LLM_ENABLED=false', { LLM_ENABLED: 'false' }],
    ])('%s devolve disabled sem tráfego e sem registro', async (_label, extra) => {
      setLlmEnv({
        LLM_BASE_URL: stub.baseUrl,
        LLM_API_KEY: TEST_API_KEY,
        LLM_MODEL: TEST_MODEL,
        ...extra,
      });

      const result = await generateLlmObject(input());

      expect(result).toEqual({ ok: false, reason: 'disabled', meta: null });
      expect(isLlmEnabled()).toBe(false);
      expect(stub.requests).toHaveLength(0);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(create).not.toHaveBeenCalled();
    });
  });
});
