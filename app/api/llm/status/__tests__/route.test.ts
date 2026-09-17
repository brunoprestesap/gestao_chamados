import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/dal', () => ({
  verifySession: vi.fn(),
  isAdmin: (role?: string) => role === 'Admin',
}));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/models/LlmCall', () => ({ LlmCallModel: { create: vi.fn().mockResolvedValue({}) } }));

import { type LlmStub, startLlmStub } from '@/e2e/fixtures/llm-stub';
import { verifySession } from '@/lib/dal';
import {
  resetLlmRuntimeState,
  restoreLlmDefaults,
  setLlmEnv,
  TEST_API_KEY,
  TEST_MODEL,
  useStubEnv,
} from '@/lib/llm/__tests__/llm-test-env';
import { llmCircuitBreaker } from '@/lib/llm/circuit-breaker';
import { overrideLlmTimings } from '@/lib/llm/config';

import { GET } from '../route';

/** GET /api/llm/status (spec 0001, AC-12). */

const session = (role: string) => ({
  userId: '507f1f77bcf86cd799439011',
  username: 'admin',
  role,
  unitId: null,
  isActive: true,
});

const STATUS_KEYS = [
  'activeCalls',
  'circuit',
  'configured',
  'enabled',
  'latencyMs',
  'modelServed',
  'queuedCalls',
  'reachable',
].sort();

describe('GET /api/llm/status', () => {
  let stub: LlmStub;

  beforeAll(async () => {
    stub = await startLlmStub({ apiKey: TEST_API_KEY, model: TEST_MODEL });
  });

  afterAll(async () => {
    await stub.close();
  });

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stub.reset();
    resetLlmRuntimeState();
    useStubEnv(stub.baseUrl);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreLlmDefaults();
  });

  it('sem sessão responde 401 sem consultar o vLLM', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(stub.requests).toHaveLength(0);
  });

  it.each(['Preposto', 'Solicitante', 'Técnico'])('perfil %s responde 403', async (role) => {
    vi.mocked(verifySession).mockResolvedValue(session(role) as never);

    const response = await GET();

    expect(response.status).toBe(403);
    expect(stub.requests).toHaveLength(0);
  });

  it('Admin recebe 200 com os campos do status e sem endereço nem chave', async () => {
    vi.mocked(verifySession).mockResolvedValue(session('Admin') as never);

    const response = await GET();
    const text = await response.text();
    const body = JSON.parse(text);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(Object.keys(body).sort()).toEqual(STATUS_KEYS);
    expect(body).toMatchObject({
      configured: true,
      enabled: true,
      reachable: true,
      modelServed: true,
      circuit: 'closed',
      activeCalls: 0,
      queuedCalls: 0,
    });
    expect(body.latencyMs).toEqual(expect.any(Number));
    expect(text).not.toContain(TEST_API_KEY);
    expect(text).not.toContain('127.0.0.1');
    expect(stub.requests.map((r) => [r.method, r.path, r.authorization])).toEqual([
      ['GET', '/v1/models', `Bearer ${TEST_API_KEY}`],
    ]);
  });

  describe('getLlmStatus pela rota', () => {
    beforeEach(() => {
      vi.mocked(verifySession).mockResolvedValue(session('Admin') as never);
    });

    it('IA desligada responde sem consultar a rede', async () => {
      setLlmEnv({
        LLM_BASE_URL: stub.baseUrl,
        LLM_API_KEY: TEST_API_KEY,
        LLM_MODEL: TEST_MODEL,
        LLM_ENABLED: 'false',
      });

      const body = await (await GET()).json();

      expect(body).toMatchObject({
        configured: true,
        enabled: false,
        reachable: null,
        modelServed: null,
        latencyMs: null,
      });
      expect(stub.requests).toHaveLength(0);
    });

    it('sem configuração responde configured false', async () => {
      setLlmEnv({});

      expect(await (await GET()).json()).toMatchObject({ configured: false, enabled: false });
    });

    it('modelo diferente do servido dá modelServed false', async () => {
      useStubEnv(stub.baseUrl, { LLM_MODEL: 'outro-modelo' });

      expect(await (await GET()).json()).toMatchObject({ reachable: true, modelServed: false });
    });

    it('chave recusada dá reachable false', async () => {
      useStubEnv(stub.baseUrl, { LLM_API_KEY: 'chave-errada' });

      expect(await (await GET()).json()).toMatchObject({ reachable: false, modelServed: null });
    });

    it('host sem resposta dentro do prazo dá reachable false', async () => {
      overrideLlmTimings({ statusProbeMs: 50 });
      useStubEnv('http://10.255.255.1:8000/v1');

      expect(await (await GET()).json()).toMatchObject({ reachable: false, latencyMs: null });
    });

    it('mostra o estado do disjuntor', async () => {
      for (let i = 0; i < 3; i += 1) {
        llmCircuitBreaker.admit();
        llmCircuitBreaker.record('countable', 'allow');
      }

      expect(await (await GET()).json()).toMatchObject({ circuit: 'open' });
    });
  });
});
