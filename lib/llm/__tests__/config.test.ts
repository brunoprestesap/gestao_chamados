import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getLlmConfig, loadLlmConfig, resetLlmConfig } from '@/lib/llm/config';

import { clearLlmEnv, setLlmEnv, TEST_API_KEY, TEST_MODEL } from './llm-test-env';

const FULL_ENV = {
  LLM_BASE_URL: 'http://10.0.0.5:8000/v1',
  LLM_API_KEY: TEST_API_KEY,
  LLM_MODEL: TEST_MODEL,
};

describe('lib/llm/config', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    clearLlmEnv();
  });

  afterEach(() => {
    warn.mockRestore();
    clearLlmEnv();
  });

  it('sem nenhuma variável fica desligada e não avisa', () => {
    const config = loadLlmConfig();

    expect(config).toMatchObject({
      configured: false,
      enabled: false,
      baseUrl: null,
      apiKey: null,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('com as três variáveis fica configurada e ligada', () => {
    setLlmEnv(FULL_ENV);

    const config = loadLlmConfig();

    expect(config).toMatchObject({
      configured: true,
      enabled: true,
      baseUrl: 'http://10.0.0.5:8000/v1',
      apiKey: TEST_API_KEY,
      model: TEST_MODEL,
      maxConcurrency: 4,
      debug: false,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(['LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL'] as const)(
    'sem %s fica desligada e avisa que a configuração está incompleta',
    (missing) => {
      setLlmEnv({ ...FULL_ENV, [missing]: undefined });

      const config = loadLlmConfig();

      expect(config.configured).toBe(false);
      expect(config.enabled).toBe(false);
      expect(warn).toHaveBeenCalledTimes(1);
      const logged = warn.mock.calls.flat().join(' ');
      expect(logged).toContain(missing);
      expect(logged).not.toContain(TEST_API_KEY);
    },
  );

  it('variável vazia conta como ausente', () => {
    setLlmEnv({ ...FULL_ENV, LLM_MODEL: '   ' });

    expect(loadLlmConfig().configured).toBe(false);
  });

  it('LLM_ENABLED=false desliga sem perder a configuração', () => {
    setLlmEnv({ ...FULL_ENV, LLM_ENABLED: 'false' });

    expect(loadLlmConfig()).toMatchObject({ configured: true, enabled: false });
  });

  it('URL inválida desliga e avisa', () => {
    setLlmEnv({ ...FULL_ENV, LLM_BASE_URL: 'vllm-sem-protocolo:8000' });

    expect(loadLlmConfig().configured).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('remove barras do fim da URL', () => {
    setLlmEnv({ ...FULL_ENV, LLM_BASE_URL: 'http://10.0.0.5:8000/v1/' });

    expect(loadLlmConfig().baseUrl).toBe('http://10.0.0.5:8000/v1');
  });

  it.each([
    ['8', 8],
    ['1', 1],
    ['16', 16],
    ['0', 4],
    ['17', 4],
    ['abc', 4],
  ])('LLM_MAX_CONCURRENCY=%s resulta em %i', (value, expected) => {
    setLlmEnv({ ...FULL_ENV, LLM_MAX_CONCURRENCY: value });

    expect(loadLlmConfig().maxConcurrency).toBe(expected);
  });

  it('LLM_DEBUG=true liga o debug', () => {
    setLlmEnv({ ...FULL_ENV, LLM_DEBUG: 'true' });

    expect(loadLlmConfig().debug).toBe(true);
  });

  it('getLlmConfig lê uma vez e resetLlmConfig força nova leitura', () => {
    setLlmEnv(FULL_ENV);
    const first = getLlmConfig();

    process.env.LLM_ENABLED = 'false';
    expect(getLlmConfig()).toBe(first);

    resetLlmConfig();
    expect(getLlmConfig().enabled).toBe(false);
  });
});
