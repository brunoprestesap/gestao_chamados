# lib/llm: integração com a IA local

Acesso do servidor ao modelo Qwen3 servido por vLLM na rede interna. Toda funcionalidade de IA do Sigma passa por aqui. Decisões e critérios de aceite: [spec 0001](../../docs/specs/0001-integracao-ia-local/index.md).

## Como chamar

- As funcionalidades importam só de `@/lib/llm` (`index.ts`): `generateLlmObject` (sem streaming), `streamLlmObject` (objeto parcial em streaming), `getLlmStatus`, `isLlmEnabled` e os tipos. Os outros arquivos são internos.
- Toda chamada leva `task` (ex.: `abertura.classificar`, até 80 caracteres), `promptVersion` (constante da funcionalidade, até 40 caracteres, muda quando o prompt muda), `schema` Zod, `system` e `messages`.
- `userId` é obrigatório na raia `interactive` (a padrão) e vem sempre da sessão verificada, nunca do corpo do pedido. A raia `batch` aceita `userId` nulo.
- O `signal` de quem chama (tela fechada, conexão caída) aborta a requisição ao vLLM na hora e libera a vaga.
- `ref: { type, id }` liga o registro a um documento (até 40 e 64 caracteres).
- Nenhuma função lança exceção. `ok: false` traz `reason` (`disabled`, `cancelled`, `timeout`, `unavailable`, `auth_error`, `bad_request`, `circuit_open`, `busy`, `rate_limited`, `invalid_output`, `interrupted`) e significa seguir sem IA.
- `streamLlmObject` resolve no primeiro conteúdo, com `partial` e `final`. Se `final` vier com `ok: false`, a tela troca o texto parcial pela mensagem de reserva.
- Quem chama roda no runtime Node.js, nunca no Edge (rotas declaram `export const runtime = 'nodejs'`).

## Regras que o código e os testes garantem

- Só `model-call.ts` chama `generateText` ou `streamText`, sempre com `getLlmModel()` (a instância do provedor `vllm`). Um id de modelo em texto iria para o AI Gateway da Vercel. O ESLint barra essas importações de `ai` fora desta pasta, e `__tests__/guard.test.ts` confere o resto.
- Todo arquivo importa `server-only`. Endereço, chave e modelo existem só nas `LLM_*` lidas no servidor (`config.ts`); não existe `NEXT_PUBLIC_LLM_*`.
- O thinking do Qwen3 fica desligado (`chat_template_kwargs.enable_thinking: false` em `provider.ts`).
- `ai` e `@ai-sdk/openai-compatible` ficam com versão exata no `package.json` (sem `^`).
- Log normal: uma linha `[llm] {...}` por chamada (tarefa, raia, resultado, motivo, `finishReason`, tentativas, latência), nunca texto de relato nem a chave. O texto só aparece com `LLM_DEBUG=true`, em `[LLM:debug]`.

## Proteções da GPU compartilhada

- Prazos, amostragem padrão e limites ficam em `config.ts` (`llmTimings`, `LLM_SAMPLING_DEFAULTS` e constantes). Um valor novo entra lá, não espalhado pelo código.
- Checagens antes de qualquer tráfego, nesta ordem (`admission.ts`): cancelado, `bad_request` (entrada acima de 24.000 caracteres, `userId` ausente na raia interativa ou `sampling` fora das faixas), `circuit_open`, `rate_limited` e fila (`busy`).
- Vagas (`limiter.ts`): até `LLM_MAX_CONCURRENCY` (padrão 4). O lote ocupa no máximo 1 e só pega vaga livre quando não há interativa esperando.
- Disjuntor (`circuit-breaker.ts`): 3 chamadas seguidas em `timeout`, `unavailable` ou `interrupted` abrem por 30s. Qualquer resposta HTTP do vLLM zera a contagem.
- Limite por usuário (`user-rate-limit.ts`): 20 chamadas interativas aceitas em 60s.
- Esse estado fica em memória: vale enquanto o Next roda em uma única instância.
- Amostragem: `sampling` sobrescreve só `temperature`, `topP`, `topK`, `minP`, `presencePenalty` e `maxOutputTokens`; `frequencyPenalty` e `repetitionPenalty` são fixos.

## Registro `LlmCall`

- `models/LlmCall.ts`: um documento por chamada lógica (menos `disabled`; `rate_limited` no máximo um por usuário a cada 60s), gravado sem esperar por `call-log.ts`. Uma falha ao gravar não muda o resultado. Nunca guarda texto de prompt nem de resposta.
- Expira em 365 dias. Mudar o TTL depois exige `collMod` manual no MongoDB (o Mongoose não altera índice TTL existente).

## Status e operação

- `GET /api/llm/status` (`app/api/llm/status/route.ts`): só Admin, responde 401 ou 403 em JSON e nunca mostra endereço nem chave.
- Na VPS, `sudo bash /opt/severino/scripts/update-llm-env.sh` grava as `LLM_*` no `.env`, recria o `next-app` e confere o vLLM de dentro do container. A rede Docker do projeto não pode cobrir a faixa de IP do vLLM, senão o container não o alcança.

## Testes

- `__tests__/` tem unitários com relógio falso e testes de integração contra o servidor falso do vLLM (`e2e/fixtures/llm-stub`, `startLlmStub`).
- Nos testes de integração, os prazos entram por `overrideLlmTimings` em milissegundos (sockets e `AbortSignal` não obedecem ao relógio falso), com os utilitários de `__tests__/llm-test-env.ts` (`useStubEnv`, `resetLlmRuntimeState`, `restoreLlmDefaults`) e mocks de `@/lib/db` e `@/models/LlmCall`.
- Fumaça contra o vLLM real (lê `LLM_*` do ambiente ou do `.env.local`): `LLM_SMOKE=1 npx vitest run lib/llm/__tests__/llm.smoke.test.ts --reporter=default`. No PowerShell: `$env:LLM_SMOKE='1'; npx vitest run lib/llm/__tests__/llm.smoke.test.ts --reporter=default`. O `--reporter=default` mostra as linhas `[smoke]`.

_Drafted by /sync from the introducing change, worth a quick human pass._
