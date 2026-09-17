import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/models/LlmCall', () => ({ LlmCallModel: { create: vi.fn().mockResolvedValue({}) } }));

import { generateLlmObject, getLlmStatus, type LlmTaskInput, streamLlmObject } from '@/lib/llm';
import {
  getLlmConfig,
  LLM_SAMPLING_DEFAULTS,
  overrideLlmTimings,
  resetLlmConfig,
  resetLlmTimings,
} from '@/lib/llm/config';
import type { LlmSampling } from '@/lib/llm/types';
import { LlmCallModel } from '@/models/LlmCall';

/**
 * Teste de fumaça contra o vLLM REAL (spec 0001, tarefas 6, 20 e 21). Só roda com LLM_SMOKE=1:
 *
 *   LLM_SMOKE=1 npx vitest run lib/llm/__tests__/llm.smoke.test.ts
 *
 * Lê LLM_BASE_URL, LLM_API_KEY e LLM_MODEL do ambiente ou do `.env.local`.
 * Confirma: `json_schema` respeitado, thinking desligado, `usage` presente, que
 * abortar uma geração longa libera a GPU (`vllm:num_requests_running` em /metrics),
 * a velocidade com `LLM_MAX_CONCURRENCY` gerações simultâneas e a comparação de
 * repetição entre três amostragens (cerca de 120 chamadas: rode fora do horário de
 * pico da GPU compartilhada). `LLM_SMOKE_CONFIGS=padrao` roda a comparação só para a
 * configuração padrão (nova rodada da regra (a) da tarefa 21).
 * Rode de novo a cada atualização do AI SDK, troca de modelo, de versão do vLLM ou
 * dos valores padrão de amostragem.
 */

const SMOKE = process.env.LLM_SMOKE === '1';

/** `userId` fictício da raia interativa (as chamadas ficam abaixo do limite por usuário). */
const SMOKE_USER_ID = '000000000000000000000001';

type CapturedExchange = { url: string; requestBody: unknown; responseText: string };

type LlmCallDoc = Record<string, unknown>;

function capturedCalls(): LlmCallDoc[] {
  return vi.mocked(LlmCallModel.create).mock.calls.map((call) => call[0] as unknown as LlmCallDoc);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/** Prompt e schema do caso de aborto: pedem um texto longo, que sempre bate no limite. */
const LONG_TEXT_TASK = {
  schema: z.object({ texto: z.string() }),
  system: 'Responda só com o JSON pedido. O campo texto deve ser muito longo.',
  messages: [
    {
      role: 'user' as const,
      content:
        'Escreva no campo texto um manual de manutenção predial com pelo menos 3000 palavras, ' +
        'detalhando cada sistema do prédio (elétrica, hidráulica, climatização, elevadores, ' +
        'telhado, fachada, pintura), com procedimentos passo a passo.',
    },
  ],
};

const CLASSIFY_SYSTEM =
  'Você classifica relatos de manutenção de um tribunal. Responda só com o JSON pedido.';

/** Relatos fixos e fictícios da comparação de repetição (tarefa 21); nenhum cita pessoas. */
const REPETITION_REPORTS: { kind: string; text: string }[] = [
  { kind: 'curto', text: 'Lâmpada queimada no corredor.' },
  {
    kind: 'longo',
    text:
      'Desde a semana passada o ar condicionado da sala de audiências da 2ª vara faz um barulho ' +
      'alto quando liga, e depois de uns vinte minutos começa a sair ar quente em vez de frio. ' +
      'Hoje de manhã percebemos também uma mancha de umidade no teto logo abaixo do aparelho, e ' +
      'o carpete perto da parede está molhado. A sala tem audiências marcadas a tarde toda e ' +
      'fica muito abafada com as janelas fechadas, então precisamos de uma solução ainda hoje.',
  },
  { kind: 'ambiguo', text: 'Tem alguma coisa estranha lá em cima, faz barulho às vezes.' },
  {
    kind: 'lista',
    text:
      'Problemas no banheiro masculino do 3º andar: 1) torneira da pia pingando; 2) descarga ' +
      'do segundo box não para de correr; 3) suporte de papel toalha solto; 4) lâmpada piscando.',
  },
  {
    kind: 'local detalhado',
    text:
      'Bloco B, 4º andar, ala leste, sala 412, ao lado da janela do fundo: a tomada da parede ' +
      'está soltando faísca quando liga o computador.',
  },
  {
    kind: 'dois problemas',
    text:
      'O elevador social está parando desnivelado no térreo e o ar condicionado do hall de ' +
      'entrada não liga desde ontem.',
  },
  {
    kind: 'erro de digitacao',
    text: 'o ar condisionado da sala de reuniao nao esta gelando e ta pingano agua no xão',
  },
  {
    kind: 'minusculas',
    text: 'porta de vidro da entrada principal travada, ninguem consegue abrir pelo lado de fora',
  },
];

const REPETITION_SCHEMA = z.object({
  tipoServico: z.enum(['Manutenção Predial', 'Ar-Condicionado', 'Elevador']),
  localExato: z.string(),
  urgente: z.boolean(),
  resumo: z.string(),
});

const REPETITION_RUNS = 5;

const OLD_SAMPLING: LlmSampling = {
  temperature: 0.2,
  topP: 0.8,
  topK: 20,
  minP: 0,
  presencePenalty: 0,
  maxOutputTokens: 1024,
};

const REPETITION_CONFIGS: { name: string; sampling: LlmSampling }[] = [
  { name: 'antiga', sampling: OLD_SAMPLING },
  { name: 'gulosa', sampling: { ...OLD_SAMPLING, temperature: 0 } },
  {
    name: 'padrao',
    sampling: {
      temperature: LLM_SAMPLING_DEFAULTS.temperature,
      topP: LLM_SAMPLING_DEFAULTS.topP,
      topK: LLM_SAMPLING_DEFAULTS.topK,
      minP: LLM_SAMPLING_DEFAULTS.minP,
      presencePenalty: LLM_SAMPLING_DEFAULTS.presencePenalty,
      maxOutputTokens: LLM_SAMPLING_DEFAULTS.maxOutputTokens,
    },
  },
];

type RepetitionTally = {
  calls: number;
  ok: number;
  corteRepeticao: number;
  corteEspaco: number;
  outrasFalhas: number;
};

/** Corte com sobra só de espaço em branco nos últimos 200 caracteres, ou com conteúdo repetido. */
function classifyCut(content: string): 'corteEspaco' | 'corteRepeticao' {
  return /^[ \t\r\n]*$/.test(content.slice(-200)) ? 'corteEspaco' : 'corteRepeticao';
}

function metricsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/v1\/?$/, '')}/metrics`;
}

async function runningRequests(baseUrl: string): Promise<number> {
  const res = await fetch(metricsUrl(baseUrl), { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`/metrics respondeu ${res.status}`);
  const text = await res.text();
  const lines = text.split('\n').filter((line) => line.startsWith('vllm:num_requests_running'));
  if (lines.length === 0) throw new Error('/metrics sem vllm:num_requests_running');
  return lines.reduce((sum, line) => sum + Number(line.trim().split(/\s+/).pop()), 0);
}

describe.skipIf(!SMOKE)('fumaça: vLLM real', () => {
  const exchanges: CapturedExchange[] = [];
  const originalFetch = globalThis.fetch;

  beforeAll(() => {
    if (!process.env.LLM_BASE_URL && existsSync('.env.local')) loadEnvFile('.env.local');
    resetLlmConfig();

    // Captura pedido e resposta crus para inspecionar o que o vLLM devolveu.
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const response = await originalFetch(url, init);
      const target = String(url);
      if (target.endsWith('/chat/completions') && init?.body && typeof init.body === 'string') {
        const clone = response.clone();
        const exchange: CapturedExchange = {
          url: target,
          requestBody: JSON.parse(init.body),
          responseText: '',
        };
        exchanges.push(exchange);
        void clone
          .text()
          .then((text) => {
            exchange.responseText = text;
          })
          .catch(() => {});
      }
      return response;
    }) as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('a configuração está completa', () => {
    const config = getLlmConfig();
    expect(config.enabled, 'defina LLM_BASE_URL, LLM_API_KEY e LLM_MODEL').toBe(true);
  });

  it('getLlmStatus alcança o vLLM e encontra o modelo servido', async () => {
    const status = await getLlmStatus();
    console.warn('[smoke] status:', JSON.stringify(status));

    expect(status).toMatchObject({
      configured: true,
      enabled: true,
      reachable: true,
      modelServed: true,
      circuit: 'closed',
    });
  });

  it('json_schema respeitado, thinking desligado e usage presente', async () => {
    const schema = z.object({
      tipoServico: z.enum(['Manutenção Predial', 'Ar-Condicionado', 'Elevador']),
      localExato: z.string(),
      urgente: z.boolean(),
    });

    const result = await generateLlmObject({
      task: 'smoke.classificar',
      promptVersion: 'smoke-1',
      schema,
      system: CLASSIFY_SYSTEM,
      messages: [
        {
          role: 'user',
          content: 'O ar condicionado da sala de audiências 3 está pingando água no carpete.',
        },
      ],
      lane: 'batch',
    });

    const exchange = exchanges.at(-1);
    await vi.waitFor(() => expect(exchange?.responseText).not.toBe(''));
    const body = JSON.parse(exchange!.responseText);
    const message = body.choices?.[0]?.message ?? {};

    console.warn('[smoke] resultado:', JSON.stringify(result));
    console.warn('[smoke] finish_reason:', body.choices?.[0]?.finish_reason, 'usage:', body.usage);

    expect((exchange!.requestBody as Record<string, unknown>).chat_template_kwargs).toEqual({
      enable_thinking: false,
    });
    // O vLLM real aceita os oito campos de amostragem do AC-14 (senão responderia 400).
    expect(exchange!.requestBody).toMatchObject({
      temperature: 0.7,
      top_p: 0.8,
      top_k: 20,
      min_p: 0,
      presence_penalty: LLM_SAMPLING_DEFAULTS.presencePenalty,
      frequency_penalty: 0,
      repetition_penalty: 1,
      max_tokens: LLM_SAMPLING_DEFAULTS.maxOutputTokens,
    });
    // `ok: true` já garante o schema (enum respeitado). O acerto da classificação
    // não é desta fundação: é medido na calibração (funcionalidade 14).
    expect(result.ok, `resultado: ${JSON.stringify(result)}`).toBe(true);
    expect(body.choices?.[0]?.finish_reason).toBe('stop');
    expect(String(message.content)).not.toContain('<think>');
    expect(message.reasoning_content ?? message.reasoning ?? null).toBeNull();

    await vi.waitFor(() => expect(LlmCallModel.create).toHaveBeenCalled());
    const doc = vi.mocked(LlmCallModel.create).mock.calls.at(-1)![0] as unknown as Record<
      string,
      number | null
    >;
    expect(doc.inputTokens).toBeGreaterThan(0);
    expect(doc.outputTokens).toBeGreaterThan(0);
  }, 200_000);

  it('streaming: parciais chegam, final valida e usage vem no stream', async () => {
    const schema = z.object({
      tipoServico: z.enum(['Manutenção Predial', 'Ar-Condicionado', 'Elevador']),
      localExato: z.string(),
      resumo: z.string(),
    });
    vi.mocked(LlmCallModel.create).mockClear();

    const stream = await streamLlmObject({
      task: 'smoke.stream',
      promptVersion: 'smoke-1',
      schema,
      system: CLASSIFY_SYSTEM,
      messages: [{ role: 'user', content: 'O elevador do bloco B parou entre o 2º e o 3º andar.' }],
      lane: 'batch',
    });

    expect(stream.ok, JSON.stringify(stream)).toBe(true);
    if (!stream.ok) return;
    let partials = 0;
    for await (const partialObject of stream.partial) if (partialObject) partials += 1;
    const final = await stream.final;
    console.warn('[smoke] stream parciais:', partials, 'final:', JSON.stringify(final));

    expect(final.ok, JSON.stringify(final)).toBe(true);
    expect(partials).toBeGreaterThan(1);
    await vi.waitFor(() => expect(LlmCallModel.create).toHaveBeenCalled());
    const doc = vi.mocked(LlmCallModel.create).mock.calls.at(-1)![0] as unknown as Record<
      string,
      number | null
    >;
    expect(doc.firstChunkMs).toBeGreaterThan(0);
    expect(doc.inputTokens).toBeGreaterThan(0);
    expect(doc.outputTokens).toBeGreaterThan(0);
  }, 200_000);

  it('abortar uma geração longa tira a requisição de execução no vLLM', async () => {
    const baseUrl = getLlmConfig().baseUrl!;
    const baseline = await runningRequests(baseUrl);
    const controller = new AbortController();

    const pending = generateLlmObject({
      task: 'smoke.cancelar',
      promptVersion: 'smoke-1',
      ...LONG_TEXT_TASK,
      lane: 'batch',
      signal: controller.signal,
      sampling: { maxOutputTokens: 4096 },
    });

    let during = baseline;
    await vi.waitFor(
      async () => {
        during = await runningRequests(baseUrl);
        expect(during).toBeGreaterThan(baseline);
      },
      { timeout: 15_000, interval: 100 },
    );

    // Deixa gerar um pouco para o aborto cair no meio da geração.
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(await runningRequests(baseUrl), 'a geração terminou antes do aborto').toBeGreaterThan(
      baseline,
    );
    controller.abort();
    const result = await pending;
    expect(result).toMatchObject({ ok: false, reason: 'cancelled' });

    let after = during;
    await vi.waitFor(
      async () => {
        after = await runningRequests(baseUrl);
        expect(after).toBeLessThanOrEqual(baseline);
      },
      { timeout: 10_000, interval: 250 },
    );
    console.warn('[smoke] num_requests_running antes/durante/depois:', baseline, during, after);
  }, 60_000);

  it('velocidade com carga: mediana das latências em até 12s (AC-16, tarefa 20)', async () => {
    const concurrency = getLlmConfig().maxConcurrency;
    const limit = LLM_SAMPLING_DEFAULTS.maxOutputTokens;
    const latencies: number[] = [];
    // Só aqui: a medição não pode parar no teto de 20s da raia interativa.
    overrideLlmTimings({ interactive: { generateMs: 60_000 } });

    try {
      for (let round = 1; round <= 3; round += 1) {
        vi.mocked(LlmCallModel.create).mockClear();
        const input: LlmTaskInput<{ texto: string }> = {
          task: 'smoke.velocidade',
          promptVersion: 'smoke-1',
          ...LONG_TEXT_TASK,
          lane: 'interactive',
          userId: SMOKE_USER_ID,
        };

        await Promise.all(Array.from({ length: concurrency }, () => generateLlmObject(input)));

        await vi.waitFor(() => expect(capturedCalls()).toHaveLength(concurrency));
        for (const doc of capturedCalls()) {
          // Sem chegar ao limite de tokens a latência não mede a geração inteira.
          expect(doc.outputTokens, `rodada ${round}: ${JSON.stringify(doc)}`).toBe(limit);
          latencies.push(doc.latencyMs as number);
        }
      }
    } finally {
      resetLlmTimings();
    }

    const medianMs = median(latencies);
    const tokensPerSecond = limit / (medianMs / 1_000);
    const fitting = Math.max(256, Math.floor((tokensPerSecond * 12) / 64) * 64);
    console.warn(
      '[smoke] velocidade:',
      JSON.stringify({
        concurrency,
        maxOutputTokens: limit,
        latenciesMs: latencies,
        medianMs,
        tokensPerSecond: Math.round(tokensPerSecond * 10) / 10,
        maiorLimiteEm12s: fitting,
      }),
    );

    expect(
      medianMs,
      `mediana ${medianMs}ms; limite que cabe em 12s: ${fitting}`,
    ).toBeLessThanOrEqual(12_000);
  }, 240_000);

  it('repetição: a amostragem padrão não tem corte com conteúdo repetido (AC-16, tarefa 21)', async () => {
    const only = process.env.LLM_SMOKE_CONFIGS?.split(',').map((name) => name.trim());
    const configs = REPETITION_CONFIGS.filter((config) => !only || only.includes(config.name));
    const tallies: Record<string, RepetitionTally> = {};

    for (const config of configs) {
      const tally: RepetitionTally = {
        calls: 0,
        ok: 0,
        corteRepeticao: 0,
        corteEspaco: 0,
        outrasFalhas: 0,
      };
      tallies[config.name] = tally;

      for (const report of REPETITION_REPORTS) {
        for (let run = 0; run < REPETITION_RUNS; run += 1) {
          const before = exchanges.length;
          const result = await generateLlmObject({
            task: 'smoke.repeticao',
            promptVersion: 'smoke-1',
            schema: REPETITION_SCHEMA,
            system: CLASSIFY_SYSTEM,
            messages: [{ role: 'user', content: report.text }],
            lane: 'batch',
            sampling: config.sampling,
          });
          tally.calls += 1;

          // Sem streaming, a resposta chega num JSON só; a última troca é a tentativa final.
          const exchange = exchanges.length > before ? exchanges.at(-1)! : null;
          if (exchange) {
            await vi
              .waitFor(() => expect(exchange.responseText).not.toBe(''), { timeout: 10_000 })
              .catch(() => {});
          }
          let choice: { finish_reason?: string; message?: { content?: string } } | undefined;
          try {
            choice = exchange ? JSON.parse(exchange.responseText).choices?.[0] : undefined;
          } catch {
            choice = undefined;
          }

          if (choice?.finish_reason === 'length') {
            const kind = classifyCut(String(choice.message?.content ?? ''));
            tally[kind] += 1;
            console.warn(
              `[smoke] corte ${config.name}/${report.kind}#${run + 1}: ${kind}`,
              JSON.stringify(String(choice.message?.content ?? '').slice(-120)),
            );
          } else if (result.ok) {
            tally.ok += 1;
          } else {
            tally.outrasFalhas += 1;
            console.warn(
              `[smoke] falha ${config.name}/${report.kind}#${run + 1}:`,
              result.reason,
              choice?.finish_reason ?? null,
            );
          }
        }
      }
      console.warn(`[smoke] repetição ${config.name}:`, JSON.stringify(tally));
    }

    console.warn('[smoke] repetição por configuração:', JSON.stringify(tallies));
    const padrao = tallies.padrao;
    if (tallies.antiga && tallies.antiga.corteRepeticao + tallies.antiga.corteEspaco === 0) {
      console.warn(
        '[smoke] a configuração antiga não cortou: o sintoma original não se reproduziu.',
      );
    }
    if (padrao && padrao.corteEspaco > 0) {
      console.warn(
        '[smoke] PENDÊNCIA: corte com espaço em branco na configuração padrão. Peça à equipe da GPU ' +
          '--structured-outputs-config.disable_any_whitespace; funcionalidades 11 e 12 ficam travadas.',
      );
    }

    expect(padrao, 'a configuração padrão precisa estar na comparação').toBeDefined();
    expect(padrao.corteRepeticao, JSON.stringify(tallies)).toBe(0);
  }, 2_700_000);
});
