import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/models/LlmCall', () => ({ LlmCallModel: { create: vi.fn().mockResolvedValue({}) } }));

import { type LlmStub, startLlmStub } from '@/e2e/fixtures/llm-stub';
import { generateLlmObject, streamLlmObject } from '@/lib/llm';

import {
  resetLlmRuntimeState,
  restoreLlmDefaults,
  TEST_API_KEY,
  TEST_MODEL,
  useStubEnv,
} from './llm-test-env';

/** Logs sem dados pessoais nem chave (spec 0001, AC-11). */

const RELATO = 'Vazamento na copa do gabinete da Dra. Fulana, telefone 98888-7777';
const RESPOSTA = 'copa do gabinete';
const schema = z.object({ local: z.string() });

const input = () => ({
  task: 'teste.logs',
  promptVersion: 'v1',
  schema,
  system: 'Extraia o local.',
  messages: [{ role: 'user' as const, content: RELATO }],
  userId: '507f1f77bcf86cd799439011',
});

describe('logs de lib/llm', () => {
  let stub: LlmStub;
  let logs: string[];

  beforeAll(async () => {
    stub = await startLlmStub({ apiKey: TEST_API_KEY, model: TEST_MODEL });
  });

  afterAll(async () => {
    await stub.close();
  });

  beforeEach(() => {
    logs = [];
    const capture = (...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
    vi.spyOn(console, 'warn').mockImplementation(capture);
    vi.spyOn(console, 'error').mockImplementation(capture);
    vi.spyOn(console, 'info').mockImplementation(capture);
    stub.reset();
    resetLlmRuntimeState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreLlmDefaults();
  });

  async function exercise() {
    stub.enqueue(
      { type: 'json', content: JSON.stringify({ local: RESPOSTA }) },
      { type: 'json', content: JSON.stringify({ outro: RESPOSTA }) },
      { type: 'status', status: 400, message: `Invalid request: ${RELATO}` },
      { type: 'stream', chunks: ['{"local":', JSON.stringify(RESPOSTA), '}'] },
    );
    await generateLlmObject(input());
    await generateLlmObject(input());
    await generateLlmObject(input());
    const stream = await streamLlmObject(input());
    if (stream.ok) await stream.final;
  }

  it('sem LLM_DEBUG os logs trazem tarefa, resultado, motivo e latência, sem texto nem chave', async () => {
    useStubEnv(stub.baseUrl);

    await exercise();

    const all = logs.join('\n');
    expect(all).not.toContain('Fulana');
    expect(all).not.toContain('98888');
    expect(all).not.toContain(RESPOSTA);
    expect(all).not.toContain(TEST_API_KEY);
    expect(all).not.toContain('[LLM:debug]');

    const callLogs = logs
      .filter((line) => line.startsWith('[llm] {'))
      .map((line) => JSON.parse(line.slice('[llm] '.length)));
    expect(callLogs).toHaveLength(4);
    expect(callLogs.map((l) => [l.task, l.status, l.reason])).toEqual([
      ['teste.logs', 'success', null],
      ['teste.logs', 'failed', 'invalid_output'],
      ['teste.logs', 'failed', 'bad_request'],
      ['teste.logs', 'success', null],
    ]);
    expect(callLogs.every((l) => typeof l.latencyMs === 'number')).toBe(true);
  });

  it('com LLM_DEBUG=true o texto enviado e o recebido aparecem em [LLM:debug], sem a chave', async () => {
    useStubEnv(stub.baseUrl, { LLM_DEBUG: 'true' });

    await exercise();

    const debug = logs.filter((line) => line.startsWith('[LLM:debug]')).join('\n');
    expect(debug).toContain('Fulana');
    expect(debug).toContain(RESPOSTA);
    expect(logs.join('\n')).not.toContain(TEST_API_KEY);
  });
});
