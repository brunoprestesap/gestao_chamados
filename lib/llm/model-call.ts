import 'server-only';

import {
  generateText,
  type LanguageModelUsage,
  NoObjectGeneratedError,
  Output,
  streamText,
} from 'ai';
import type { z } from 'zod';

import { getLlmConfig, LLM_SAMPLING_DEFAULTS } from '@/lib/llm/config';
import { getLlmModel, LLM_PROVIDER_NAME } from '@/lib/llm/provider';
import type { LlmFinishReason, LlmMessage, LlmSampling } from '@/lib/llm/types';

/**
 * O único ponto de `lib/llm` que chama o AI SDK (spec 0001, AC-13).
 * Sempre usa `getLlmModel()`; nenhuma função aceita modelo como parâmetro.
 * Novas tentativas, prazos e classificação ficam em quem chama: aqui o AI SDK
 * roda sem retry próprio (`maxRetries: 0`) e sem telemetria (o texto do relato
 * não pode sair por uma integração registrada no futuro).
 *
 * Com `LLM_DEBUG=true`, o texto enviado e o recebido aparecem em `[LLM:debug]`.
 * Fora disso, nenhum texto de relato ou de resposta vai para o log.
 */

export type ModelCallArgs<T> = {
  schema: z.ZodType<T>;
  system: string;
  messages: LlmMessage[];
  sampling: LlmSampling;
  abortSignal: AbortSignal;
};

export type ModelUsage = { inputTokens: number | null; outputTokens: number | null };

export type ObjectCallOutcome =
  | {
      kind: 'output';
      value: unknown;
      text: string;
      usage: ModelUsage;
      finishReason: LlmFinishReason;
    }
  | {
      kind: 'invalid_output';
      text: string | undefined;
      usage: ModelUsage;
      finishReason: LlmFinishReason | null;
    }
  | { kind: 'error'; error: unknown };

function llmDebug(label: string, payload: unknown): void {
  if (getLlmConfig().debug) console.warn('[LLM:debug]', label, JSON.stringify(payload));
}

/**
 * Os oito campos de amostragem do AC-14, explícitos em todo pedido. `top_k`,
 * `min_p` e `repetition_penalty` vão em `providerOptions.vllm`, que o provedor
 * copia para o corpo; o `topK` padrão do AI SDK seria descartado com aviso.
 */
function samplingSettings(sampling: LlmSampling) {
  return {
    temperature: sampling.temperature,
    topP: sampling.topP,
    presencePenalty: sampling.presencePenalty,
    frequencyPenalty: LLM_SAMPLING_DEFAULTS.frequencyPenalty,
    maxOutputTokens: sampling.maxOutputTokens,
    providerOptions: {
      [LLM_PROVIDER_NAME]: {
        top_k: sampling.topK,
        min_p: sampling.minP,
        repetition_penalty: LLM_SAMPLING_DEFAULTS.repetitionPenalty,
      },
    },
  };
}

export const NO_MODEL_ERROR = new Error('LLM desligado: getLlmModel() devolveu null');

export function toModelUsage(usage: LanguageModelUsage | undefined): ModelUsage {
  return {
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
  };
}

export async function callModelForObject<T>(args: ModelCallArgs<T>): Promise<ObjectCallOutcome> {
  const model = getLlmModel();
  if (!model) return { kind: 'error', error: NO_MODEL_ERROR };

  llmDebug('enviado', { system: args.system, messages: args.messages });
  try {
    const result = await generateText({
      model,
      output: Output.object({ schema: args.schema }),
      instructions: args.system,
      messages: args.messages,
      ...samplingSettings(args.sampling),
      maxRetries: 0,
      abortSignal: args.abortSignal,
      telemetry: { isEnabled: false },
    });
    llmDebug('recebido', result.text);
    return {
      kind: 'output',
      value: result.output,
      text: result.text,
      usage: toModelUsage(result.totalUsage),
      finishReason: result.finishReason,
    };
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      llmDebug('recebido fora do schema', error.text ?? null);
      return {
        kind: 'invalid_output',
        text: error.text,
        usage: toModelUsage(error.usage),
        finishReason: error.finishReason ?? null,
      };
    }
    return { kind: 'error', error };
  }
}

export type StreamCallEvent =
  | { type: 'delta'; text: string }
  | { type: 'finish'; finishReason: LlmFinishReason; usage: ModelUsage }
  | { type: 'error'; error: unknown }
  | { type: 'abort' };

/**
 * Streaming do texto JSON restrito ao schema. Normaliza as partes do AI SDK e
 * transforma exceções da iteração (ex.: conexão caída no meio) em `error`.
 * A validação do objeto final fica com quem chama.
 */
export async function* callModelForStream<T>(
  args: ModelCallArgs<T>,
): AsyncGenerator<StreamCallEvent> {
  const model = getLlmModel();
  if (!model) {
    yield { type: 'error', error: NO_MODEL_ERROR };
    return;
  }

  llmDebug('enviado', { system: args.system, messages: args.messages });
  let received = '';
  try {
    const result = streamText({
      model,
      output: Output.object({ schema: args.schema }),
      instructions: args.system,
      messages: args.messages,
      ...samplingSettings(args.sampling),
      maxRetries: 0,
      abortSignal: args.abortSignal,
      telemetry: { isEnabled: false },
      // Sem o padrão (console.error do erro inteiro): quem chama classifica e loga.
      onError: () => {},
    });

    for await (const part of result.stream) {
      switch (part.type) {
        case 'text-delta':
          received += part.text;
          yield { type: 'delta', text: part.text };
          break;
        case 'finish':
          yield {
            type: 'finish',
            finishReason: part.finishReason,
            usage: toModelUsage(part.totalUsage),
          };
          break;
        case 'error':
          yield { type: 'error', error: part.error };
          break;
        case 'abort':
          yield { type: 'abort' };
          break;
      }
    }
  } catch (error) {
    yield { type: 'error', error };
  } finally {
    llmDebug('recebido (stream)', received);
  }
}
