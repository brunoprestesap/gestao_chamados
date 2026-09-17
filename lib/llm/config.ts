import 'server-only';

import { z } from 'zod';

/**
 * Configuração da integração com a IA local (vLLM com Qwen3). Spec 0001.
 *
 * Endereço, chave e modelo vêm só de variáveis de ambiente lidas no servidor.
 * Sem `LLM_BASE_URL`, `LLM_API_KEY` ou `LLM_MODEL` (ou com `LLM_ENABLED=false`)
 * a IA fica desligada e toda chamada devolve `disabled` sem tráfego de rede.
 */

// ── Variáveis de ambiente ──────────────────────────────────────

const envSchema = z.object({
  LLM_BASE_URL: z.url({ protocol: /^https?$/ }).optional(),
  LLM_API_KEY: z.string().min(1).optional(),
  LLM_MODEL: z.string().min(1).optional(),
  LLM_ENABLED: z.string().optional(),
  LLM_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(16).optional(),
  LLM_DEBUG: z.string().optional(),
});

export const LLM_DEFAULT_MAX_CONCURRENCY = 4;

export type LlmConfig = {
  /** As três variáveis obrigatórias existem e são válidas. */
  configured: boolean;
  /** `configured` e `LLM_ENABLED` diferente de `false`. */
  enabled: boolean;
  baseUrl: string | null;
  apiKey: string | null;
  model: string | null;
  maxConcurrency: number;
  debug: boolean;
};

/** Variável vazia conta como ausente (padrão do `.env` e do `docker-compose.yml`). */
function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function loadLlmConfig(): LlmConfig {
  const raw = {
    LLM_BASE_URL: readEnv('LLM_BASE_URL'),
    LLM_API_KEY: readEnv('LLM_API_KEY'),
    LLM_MODEL: readEnv('LLM_MODEL'),
    LLM_ENABLED: readEnv('LLM_ENABLED'),
    LLM_MAX_CONCURRENCY: readEnv('LLM_MAX_CONCURRENCY'),
    LLM_DEBUG: readEnv('LLM_DEBUG'),
  };

  const invalid: string[] = [];
  const env: z.infer<typeof envSchema> = {};
  for (const key of Object.keys(envSchema.shape) as (keyof typeof envSchema.shape)[]) {
    const parsed = envSchema.shape[key].safeParse(raw[key]);
    if (parsed.success) {
      Object.assign(env, { [key]: parsed.data });
    } else {
      invalid.push(key);
    }
  }

  const present = [raw.LLM_BASE_URL, raw.LLM_API_KEY, raw.LLM_MODEL].filter(Boolean).length;
  const configured = Boolean(env.LLM_BASE_URL && env.LLM_API_KEY && env.LLM_MODEL);

  // Aviso só quando a configuração está pela metade ou inválida; sem nenhuma
  // variável a IA simplesmente fica desligada, sem ruído no log.
  if ((present > 0 && !configured) || invalid.length > 0) {
    const missing = ['LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL'].filter(
      (key) => !raw[key as keyof typeof raw],
    );
    console.warn(
      '[llm] configuração incompleta ou inválida; IA desligada onde necessário.',
      JSON.stringify({ missing, invalid }),
    );
  }

  return {
    configured,
    enabled: configured && env.LLM_ENABLED?.toLowerCase() !== 'false',
    baseUrl: configured ? env.LLM_BASE_URL!.replace(/\/+$/, '') : null,
    apiKey: configured ? env.LLM_API_KEY! : null,
    model: configured ? env.LLM_MODEL! : null,
    maxConcurrency: env.LLM_MAX_CONCURRENCY ?? LLM_DEFAULT_MAX_CONCURRENCY,
    debug: env.LLM_DEBUG?.toLowerCase() === 'true',
  };
}

let cachedConfig: LlmConfig | null = null;

/** Configuração lida uma vez por processo (as variáveis não mudam com o app no ar). */
export function getLlmConfig(): LlmConfig {
  cachedConfig ??= loadLlmConfig();
  return cachedConfig;
}

/** Só para testes: força nova leitura das variáveis. */
export function resetLlmConfig(): void {
  cachedConfig = null;
}

// ── Constantes (tabela "Value sourcing" da spec 0001) ──────────

export type LlmLaneTimings = {
  /** Streaming: primeiro conteúdo em até N ms desde o início da chamada (fila incluída). */
  firstChunkMs: number;
  /** Streaming: máximo parado entre pedaços de conteúdo. */
  chunkMs: number;
  /** Streaming: teto total desde o início da chamada. */
  totalMs: number;
  /** `generateLlmObject`: teto único desde o início da chamada (fila incluída). */
  generateMs: number;
  /** Máximo de tentativas por chamada lógica (a primeira conta). */
  maxAttempts: number;
  /** Espera antes de cada nova tentativa (índice 0 = antes da 2ª tentativa). */
  retryDelaysMs: number[];
};

export type LlmTimings = {
  interactive: LlmLaneTimings;
  batch: LlmLaneTimings;
  /** Espera máxima por vaga na raia interativa antes de `busy`. */
  interactiveQueueMs: number;
  /** Tempo com o disjuntor aberto antes da chamada de teste. */
  circuitOpenMs: number;
  /** Janela deslizante do limite por usuário (e do registro de `rate_limited`). */
  userRateWindowMs: number;
  /** Prazo da consulta `GET /models` do status. */
  statusProbeMs: number;
};

const DEFAULT_TIMINGS: LlmTimings = {
  interactive: {
    firstChunkMs: 20_000,
    chunkMs: 10_000,
    totalMs: 60_000,
    generateMs: 20_000,
    maxAttempts: 2,
    retryDelaysMs: [0],
  },
  batch: {
    firstChunkMs: 120_000,
    chunkMs: 30_000,
    totalMs: 180_000,
    generateMs: 180_000,
    maxAttempts: 3,
    retryDelaysMs: [2_000, 4_000],
  },
  interactiveQueueMs: 5_000,
  circuitOpenMs: 30_000,
  userRateWindowMs: 60_000,
  statusProbeMs: 5_000,
};

/**
 * Prazos em uso. Os testes de integração substituem por valores pequenos com
 * `overrideLlmTimings`, porque `AbortSignal` e sockets não obedecem ao relógio falso.
 */
export const llmTimings: LlmTimings = structuredClone(DEFAULT_TIMINGS);

export function overrideLlmTimings(overrides: {
  interactive?: Partial<LlmLaneTimings>;
  batch?: Partial<LlmLaneTimings>;
  interactiveQueueMs?: number;
  circuitOpenMs?: number;
  userRateWindowMs?: number;
  statusProbeMs?: number;
}): void {
  const { interactive, batch, ...rest } = overrides;
  Object.assign(llmTimings.interactive, interactive);
  Object.assign(llmTimings.batch, batch);
  Object.assign(llmTimings, rest);
}

export function resetLlmTimings(): void {
  const { interactive, batch, ...rest } = structuredClone(DEFAULT_TIMINGS);
  overrideLlmTimings({ interactive, batch, ...rest });
}

/**
 * Amostragem do card do Qwen3 para o modo sem thinking, enviada inteira em todo
 * pedido (o Sigma não depende do `--generation-config` do vLLM). `presencePenalty`
 * e `maxOutputTokens` só mudam pelas regras das tarefas 20 e 21 da spec 0001.
 * `frequencyPenalty` e `repetitionPenalty` são fixos: o parâmetro `sampling` não
 * os altera.
 */
export const LLM_SAMPLING_DEFAULTS = {
  temperature: 0.7,
  topP: 0.8,
  topK: 20,
  minP: 0,
  presencePenalty: 0,
  // 512 não coube em 12s (tarefa 20, 2026-09-17: 41,4 tokens/s com 4 simultâneas no qwen3-8b).
  maxOutputTokens: 448,
  frequencyPenalty: 0,
  repetitionPenalty: 1,
} as const;

/** Faixas aceitas de `sampling`; fora delas a chamada falha como `bad_request`. */
export const llmSamplingSchema = z.object({
  temperature: z.number().min(0).max(2),
  topP: z.number().gt(0).max(1),
  topK: z
    .number()
    .int()
    .refine((value) => value === -1 || value >= 1),
  minP: z.number().min(0).max(1),
  presencePenalty: z.number().min(-2).max(2),
  maxOutputTokens: z.number().int().min(1).max(8192),
});

/** Vagas fixas da raia de lote. */
export const LLM_BATCH_SLOTS = 1;
/** Chamadas interativas aceitas por usuário na janela. */
export const LLM_USER_RATE_LIMIT = 20;
/** Soma de caracteres de `system` e mensagens. */
export const LLM_MAX_INPUT_CHARS = 24_000;
/** Chamadas lógicas contáveis seguidas que abrem o disjuntor. */
export const LLM_CIRCUIT_THRESHOLD = 3;
