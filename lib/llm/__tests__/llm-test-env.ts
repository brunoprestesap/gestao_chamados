import { llmCircuitBreaker } from '@/lib/llm/circuit-breaker';
import { resetLlmConfig, resetLlmTimings } from '@/lib/llm/config';
import { llmLimiter } from '@/lib/llm/limiter';
import { llmUserRateLimit } from '@/lib/llm/user-rate-limit';

/** Utilitários compartilhados pelos testes de `lib/llm`. */

export const TEST_API_KEY = 'chave-de-teste-sigma';
export const TEST_MODEL = 'Qwen/Qwen3-14B';

const LLM_ENV_KEYS = [
  'LLM_BASE_URL',
  'LLM_API_KEY',
  'LLM_MODEL',
  'LLM_ENABLED',
  'LLM_MAX_CONCURRENCY',
  'LLM_DEBUG',
] as const;

export function clearLlmEnv(): void {
  for (const key of LLM_ENV_KEYS) delete process.env[key];
  resetLlmConfig();
}

export function setLlmEnv(values: Partial<Record<(typeof LLM_ENV_KEYS)[number], string>>): void {
  clearLlmEnv();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
  resetLlmConfig();
}

export function useStubEnv(baseUrl: string, extra: Parameters<typeof setLlmEnv>[0] = {}): void {
  setLlmEnv({ LLM_BASE_URL: baseUrl, LLM_API_KEY: TEST_API_KEY, LLM_MODEL: TEST_MODEL, ...extra });
}

/** Zera limitador, disjuntor e limite por usuário (estado em memória do módulo). */
export function resetLlmRuntimeState(): void {
  llmLimiter.reset();
  llmCircuitBreaker.reset();
  llmUserRateLimit.reset();
}

export function restoreLlmDefaults(): void {
  clearLlmEnv();
  resetLlmTimings();
  resetLlmRuntimeState();
}
