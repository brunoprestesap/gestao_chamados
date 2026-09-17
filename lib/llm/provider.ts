import 'server-only';

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

import { getLlmConfig, type LlmConfig } from '@/lib/llm/config';

/** Nome do provedor; o AI SDK expõe `model.provider` como `vllm.chat`. */
export const LLM_PROVIDER_NAME = 'vllm';

type VllmProvider = ReturnType<typeof createOpenAICompatible>;
export type LlmModel = ReturnType<VllmProvider['chatModel']>;

let cached: { config: LlmConfig; model: LlmModel } | null = null;

/**
 * O único jeito de obter o modelo. Sempre a instância do provedor `vllm`
 * apontando para a rede interna; nunca um id de modelo em texto, que o AI SDK
 * mandaria ao AI Gateway da Vercel. Devolve `null` com a IA desligada.
 */
export function getLlmModel(): LlmModel | null {
  const config = getLlmConfig();
  if (!config.enabled || !config.baseUrl || !config.apiKey || !config.model) return null;
  if (cached?.config === config) return cached.model;

  const provider = createOpenAICompatible({
    name: LLM_PROVIDER_NAME,
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
    supportsStructuredOutputs: true,
    includeUsage: true,
    // O thinking do Qwen3 fica sempre desligado nesta fundação (spec 0001).
    transformRequestBody: (body) => ({
      ...body,
      chat_template_kwargs: { enable_thinking: false },
    }),
  });

  cached = { config, model: provider.chatModel(config.model) };
  return cached.model;
}
