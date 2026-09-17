# 0001. Integração com a IA local (vLLM com Qwen3)

**Date**: 2026-09-17
**Status**: Accepted

## Summary

O Sigma passa a ter um único caminho, só no servidor, até o modelo Qwen3 servido pelo vLLM da rede interna. Esse caminho usa o AI SDK (biblioteca TypeScript da Vercel), pede respostas em JSON restrito a um schema (formato definido em Zod) e envia em todo pedido a amostragem (os parâmetros que controlam o sorteio das palavras) recomendada pelo fabricante do Qwen3, com um limite de tokens curto o bastante para um laço de repetição falhar rápido. Também entrega a resposta em streaming (aos poucos), protege a GPU compartilhada com prazos, limite de chamadas simultâneas e um disjuntor (desliga a IA por alguns segundos quando ela falha seguidamente), e transforma toda falha em um resultado controlado, nunca em exceção. Assim, cada funcionalidade de IA (abertura por chat, calibração, duplicados) só escreve o seu prompt e o seu schema, e segue sem IA quando o modelo está lento ou fora do ar.

## Requirements

**User stories**:

- Como desenvolvedor de uma funcionalidade de IA, quero um único caminho até o modelo que já valida, protege e registra, para não reimplementar prazo, fallback e log em cada funcionalidade.
- Como solicitante, quero que o chat continue funcionando quando a IA estiver lenta ou fora do ar, para abrir meu chamado de qualquer jeito.
- Como Admin, quero ver se a IA está de pé e quantas chamadas falharam, para agir antes de os usuários reclamarem.
- Como equipe que opera a GPU compartilhada, quero que o Sigma nunca passe de um número combinado de chamadas simultâneas.
- Como desenvolvedor de uma funcionalidade de IA, quero que o modelo não entre em laço de repetição e que, quando entrar, a chamada falhe rápido e fique registrada como corte, para não perder o prazo nem desligar a IA de todos.

**Acceptance criteria**:

- **AC-1**: Com `LLM_BASE_URL`, `LLM_API_KEY` e `LLM_MODEL` definidos, `generateLlmObject` envia as mensagens ao vLLM e devolve `{ ok: true, data, meta }`. O `data` já passou pelo schema Zod da tarefa, e o `meta` traz `model` (valor de `LLM_MODEL`), `task`, `promptVersion`, `attempts` e `latencyMs`. A requisição pede JSON restrito ao schema (`response_format` do tipo `json_schema`) e desliga o thinking do Qwen3 (`chat_template_kwargs: { enable_thinking: false }`).
- **AC-2**: `streamLlmObject` resolve quando chega o primeiro conteúdo ou quando a chamada falha antes disso (neste caso com `ok: false`). No sucesso, ela entrega `partial` (objetos parciais conforme chegam) e `final` (promessa de um `LlmResult` validado pelo Zod). Se o objeto final não passa no schema, `final` resolve `{ ok: false, reason: 'invalid_output' }`.
- **AC-3**: Prazos da raia interativa: primeiro conteúdo em até 20s (fila incluída), no máximo 10s parado entre pedaços e 60s no total. Prazos da raia de lote: 120s, 30s e 180s. Estourar o prazo antes do primeiro conteúdo resulta em `timeout`. Qualquer falha depois que o conteúdo começou resulta em `interrupted`. Nos dois casos a requisição ao vLLM é abortada e nada lança exceção. `generateLlmObject`, que não tem primeiro conteúdo, usa um teto único de 20s na raia interativa e de 180s no lote (fila incluída); estourar esse teto resulta em `timeout`.
- **AC-4**: Uma falha antes de qualquer conteúdo, por conexão recusada ou reiniciada, 429, 502, 503 ou 504, ganha 1 nova tentativa na raia interativa, dentro do mesmo prazo de 20s. Na raia de lote, são até 3 tentativas com espera de 2s e depois 4s. Depois que o conteúdo começou, nunca há nova tentativa.
- **AC-5**: Quando o `signal` de quem chama dispara (o usuário fechou a tela ou a conexão caiu), a requisição ao vLLM é abortada na hora, a vaga é liberada e o registro fica com `status: 'cancelled'`.
- **AC-6**: Nunca há mais de `LLM_MAX_CONCURRENCY` chamadas em andamento (padrão 4). O lote ocupa no máximo 1 vaga e só pega vaga livre quando não há chamada interativa esperando. Uma chamada interativa que não consegue vaga em 5s falha como `busy`.
- **AC-7**: Depois de 3 chamadas lógicas seguidas terminando em `timeout`, `unavailable` ou `interrupted` (somando as duas raias, e contando só o resultado final depois das novas tentativas), novas chamadas falham na hora como `circuit_open` durante 30s. Qualquer resposta HTTP do vLLM (sucesso, `invalid_output`, `auth_error` ou `bad_request` vindo dele) zera a contagem; rejeições locais e cancelamentos não mexem nela. Passados os 30s, uma única chamada de teste segue até o vLLM (as outras continuam falhando na hora). Se ela terminar em uma das três causas, o disjuntor reabre por mais 30s; qualquer resposta HTTP do vLLM fecha o disjuntor; se ela for cancelada, a próxima chamada vira a chamada de teste.
- **AC-8**: Cada usuário tem no máximo 20 chamadas interativas aceitas pela checagem de limite em 60s (janela deslizante). A 21ª falha como `rate_limited` sem chegar ao vLLM, e chamadas rejeitadas por esse limite não contam na janela. Uma entrada com mais de 24.000 caracteres somados (system e mensagens) falha como `bad_request` sem chegar ao vLLM.
- **AC-9**: Sem `LLM_BASE_URL`, `LLM_API_KEY` ou `LLM_MODEL`, ou com `LLM_ENABLED=false`, toda chamada devolve `{ ok: false, reason: 'disabled' }` na hora, sem tráfego de rede e sem registro. A aplicação sobe normalmente, e só aparece um aviso no log quando a configuração está incompleta (parte das variáveis definida).
- **AC-10**: Toda chamada diferente de `disabled` (com sucesso, com falha ou cancelada em qualquer fase, inclusive na fila) grava exatamente um `LlmCall` com os campos do modelo de dados abaixo, sem nenhum texto de prompt ou de resposta. Rejeições locais gravam `attempts: 0`. A única exceção é `rate_limited`: no máximo um documento por usuário a cada 60s. Uma falha ao gravar não altera o resultado entregue. Os documentos expiram 365 dias depois de `createdAt`.
- **AC-11**: Endereço, chave e modelo existem só em variáveis de ambiente lidas no servidor. Todo arquivo de `lib/llm/` importa `server-only`, e não existe nenhuma variável `NEXT_PUBLIC_LLM_*`. Os logs normais (`[llm]`) trazem tarefa, resultado, motivo e latência, nunca texto de relato nem a chave. Com `LLM_DEBUG=true`, o texto enviado e o recebido aparecem em `[LLM:debug]`.
- **AC-12**: `GET /api/llm/status` responde ao Admin com `configured`, `enabled`, `reachable`, `modelServed`, `circuit`, `activeCalls`, `queuedCalls` e `latencyMs`. Quem não tem sessão recebe 401, e quem tem outro perfil recebe 403. A resposta nunca inclui o endereço nem a chave.
- **AC-13**: Nenhuma chamada ao modelo sai da rede interna. Dentro de `lib/llm`, um único ponto interno chama o AI SDK e sempre obtém o modelo por `getLlmModel()` (a instância do provedor `vllm`); nenhuma função aceita modelo como parâmetro, e nunca se usa um id de modelo em texto (que o AI SDK mandaria ao AI Gateway da Vercel). O ESLint barra a importação de `generateText`, `streamText`, `generateObject` e `streamObject` de `ai` fora de `lib/llm/`.
- **AC-14**: Toda requisição ao vLLM leva a amostragem inteira no corpo: `temperature`, `top_p`, `top_k`, `min_p`, `presence_penalty`, `frequency_penalty`, `repetition_penalty` e `max_tokens`. Sem `sampling`, os valores são os de `LLM_SAMPLING_DEFAULTS`: 0.7, 0.8, 20, 0, 0, 0, 1 e 448 (o `maxOutputTokens` começou em 512 e a regra da tarefa 20 baixou para 448; o `presencePenalty` e o `maxOutputTokens` só mudam pelas regras de ajuste das tarefas 20 e 21 do build plan). O parâmetro `sampling` sobrescreve só os campos passados entre `temperature`, `topP`, `topK`, `minP`, `presencePenalty` e `maxOutputTokens`; `frequency_penalty` e `repetition_penalty` são fixos. Um valor fora das faixas falha como `bad_request` sem chegar ao vLLM.
- **AC-15**: Todo `LlmCall` grava `finishReason` (o motivo de parada normalizado pelo AI SDK, ou `null` quando nenhuma resposta terminou) e `sampling` (os valores efetivos da chamada, ou `null` quando a amostragem pedida foi rejeitada). Uma resposta cortada pelo limite de tokens chega a quem chama como `invalid_output`, fica com `finishReason: 'length'`, zera a contagem do disjuntor como qualquer resposta HTTP do vLLM, e o log `[llm]` traz o `finishReason`.
- **AC-16**: Contra o vLLM real (teste de fumaça, só com `LLM_SMOKE=1`): com `LLM_MAX_CONCURRENCY` gerações simultâneas de `maxOutputTokens` tokens na raia interativa, em 3 rodadas, a mediana das latências fica em até 12s; e, com a amostragem padrão, 8 relatos fixos × 5 execuções na raia de lote terminam sem nenhum corte por `length` com conteúdo repetido. Um corte com sobra de espaço em branco não reprova o build, mas cria uma trava de processo: as funcionalidades 11 e 12 não são liberadas até o vLLM ligar `disable_any_whitespace` e a mesma checagem passar sem nenhum corte (as specs delas registram isso como pré-condição; não há trava no código).

## Decision

**Chosen option**: Option 1: AI SDK com o provedor `@ai-sdk/openai-compatible` apontando para o vLLM

Todo acesso ao modelo passa por `lib/llm/`, um módulo só de servidor sobre o AI SDK. Ele expõe `generateLlmObject` e `streamLlmObject`, com saída restrita a um schema Zod, streaming de objeto parcial, prazos e raias, limitador de vagas, disjuntor, limite por usuário e registro `LlmCall`. Nenhuma função do módulo lança exceção.

**Amostragem** (revisão de 2026-09-17): segue o card do Qwen3 para o modo sem thinking (`temperature 0.7`, `top_p 0.8`, `top_k 20`, `min_p 0`), com `presence_penalty 0` e `maxOutputTokens 448`. Tudo vai explícito em todo pedido, sem depender dos padrões do servidor. O teste de fumaça mediu a velocidade e comparou três configurações antes de fixar os valores: com 512 tokens a mediana passou de 12s, e a regra da tarefa 20 baixou o limite para 448 (medições no [verify.md](verify.md)).

**Implementation skills**: `vercel:ai-sdk` (plugin Vercel do Claude Code, nível de usuário, fora do repositório)

## Rationale

Raciocínio e opções: veja [rationale.md](rationale.md).

## Feature design

**Módulo** (`lib/llm/`, todo arquivo com `import 'server-only'`):

| Arquivo              | Responsabilidade                                                                                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `config.ts`          | Lê e valida as variáveis com Zod; expõe `llmConfig` (`configured`, `enabled`, `baseUrl`, `apiKey`, `model`, `maxConcurrency`, `debug`) e as constantes de prazo, amostragem e limites por raia. Os prazos ficam num objeto que os testes podem substituir por valores pequenos |
| `provider.ts`        | `createOpenAICompatible({ name: 'vllm', baseURL, apiKey, supportsStructuredOutputs: true, includeUsage: true })`, injeção de `chat_template_kwargs: { enable_thinking: false }` no corpo de toda requisição e `getLlmModel()`, o único jeito de obter o modelo                 |
| `types.ts`           | `LlmTaskInput`, `LlmResult`, `LlmStream`, `LlmFailureReason`, `LlmMeta`                                                                                                                                                                                                        |
| `limiter.ts`         | Vagas com duas raias, fila interativa de 5s, contadores para o status                                                                                                                                                                                                          |
| `circuit-breaker.ts` | Estados `closed`, `open`, `half_open`                                                                                                                                                                                                                                          |
| `user-rate-limit.ts` | Janela deslizante de 60s por `userId`, em memória                                                                                                                                                                                                                              |
| `call-log.ts`        | Grava o `LlmCall` sem esperar; captura e loga qualquer erro de gravação                                                                                                                                                                                                        |
| `index.ts`           | `generateLlmObject`, `streamLlmObject`, `isLlmEnabled`, `getLlmStatus` (o único ponto de entrada para as funcionalidades)                                                                                                                                                      |

**Contrato das funções**:

```ts
type LlmLane = 'interactive' | 'batch';

type LlmTaskInput<T> = {
  task: string; // ex.: 'abertura.classificar'
  promptVersion: string; // constante da funcionalidade; muda quando o prompt muda
  schema: z.ZodType<T>;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  lane?: LlmLane; // padrão 'interactive'
  userId?: string | null; // obrigatório na raia interactive
  ref?: { type: string; id: string } | null;
  signal?: AbortSignal; // cancelamento vindo de quem chama
  sampling?: {
    temperature?: number; // 0 a 2
    topP?: number; // maior que 0, até 1
    topK?: number; // inteiro: -1 (desliga) ou a partir de 1
    minP?: number; // 0 a 1
    presencePenalty?: number; // -2 a 2
    maxOutputTokens?: number; // inteiro de 1 a 8192
  }; // sem seed: o vLLM online não garante reprodução sob concorrência
};

type LlmFailureReason =
  | 'timeout' | 'unavailable' | 'auth_error' | 'bad_request' | 'circuit_open'
  | 'busy' | 'rate_limited' | 'invalid_output' | 'interrupted';

type LlmMeta = { task: string; promptVersion: string; model: string; attempts: number; latencyMs: number };

type LlmResult<T> =
  | { ok: true; data: T; meta: LlmMeta }
  | { ok: false; reason: LlmFailureReason | 'disabled' | 'cancelled'; meta: LlmMeta | null };

type LlmStream<T> =
  | { ok: false; reason: LlmFailureReason | 'disabled' | 'cancelled'; meta: LlmMeta | null }
  | { ok: true; partial: AsyncIterable<DeepPartial<T>>; final: Promise<LlmResult<T>> };

generateLlmObject<T>(input: LlmTaskInput<T>): Promise<LlmResult<T>>;
streamLlmObject<T>(input: LlmTaskInput<T>): Promise<LlmStream<T>>; // resolve após o primeiro conteúdo
isLlmEnabled(): boolean;
getLlmStatus(): Promise<LlmStatus>;
```

- **Classificação das falhas:**
  - A chamada nem sai do Sigma: sem vaga em 5s vira `busy`; limite do usuário vira `rate_limited`; disjuntor aberto vira `circuit_open`; entrada grande demais, `userId` ausente na raia interativa ou `sampling` fora das faixas vira `bad_request`.
  - Falhas vindas do vLLM: 401 ou 403 viram `auth_error`; 400 ou 422 viram `bad_request`; conexão recusada ou reiniciada, 429 e 5xx viram `unavailable`.
  - Falhas de prazo e de validação: prazo estourado antes do primeiro conteúdo vira `timeout`; qualquer falha depois do primeiro conteúdo vira `interrupted`; objeto final reprovado pelo Zod vira `invalid_output`, inclusive quando a resposta terminou cortada pelo limite de tokens (`finishReason: 'length'`, JSON incompleto).
  - O `signal` de quem chama disparou: `cancelled`.
- **Ordem das checagens** (a primeira que falhar decide o resultado): `disabled` → `cancelled` (sinal já abortado na entrada) → `bad_request` (entrada grande demais, `userId` ausente na raia interativa ou `sampling` fora das faixas) → `circuit_open` → `rate_limited` → fila. Durante a espera na fila, vence o que acontecer primeiro: o cancelamento (`cancelled`) ou os 5s (`busy`). Depois de pegar a vaga, o cancelamento continua valendo a qualquer momento.
- **Novas tentativas:** a vaga é pega uma vez por chamada lógica e mantida em todas as tentativas; a política de novas tentativas embutida no AI SDK fica desligada (`maxRetries: 0`).
- **Amostragem:** `LlmCallRun.sampling()` junta `LLM_SAMPLING_DEFAULTS` com o `sampling` recebido, e a checagem de entrada valida as faixas do contrato antes de qualquer tráfego. Em `model-call.ts`, `temperature`, `topP`, `maxOutputTokens`, `presencePenalty` e `frequencyPenalty` (fixo em 0) vão pelas opções padrão do AI SDK. `top_k`, `min_p` e `repetition_penalty` (fixo em 1) vão em `providerOptions.vllm`, que o provedor copia para o corpo. O `topK` padrão do AI SDK nunca é usado, porque o provedor `openai-compatible` o descarta com um aviso. `temperature: 0` continua aceito, mas o card do Qwen3 desaconselha a decodificação gulosa (sempre a palavra mais provável) por causar repetição; a funcionalidade que usar precisa justificar na própria spec.
- **Uso esperado pelas funcionalidades:** `ok: false` significa seguir sem IA (ex.: abrir o chamado com o texto como descrição). Nenhuma funcionalidade trata exceção vinda de `lib/llm`.

**Data model sketch** (`models/LlmCall.ts`, coleção `llmcalls`, `timestamps: { createdAt: true, updatedAt: false }`, um documento gravado uma única vez e nunca atualizado):

| Campo           | Tipo                                                                                                                                         | Obrigatório        | Observação                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------- |
| `_id`           | ObjectId                                                                                                                                     | sim                | chave primária                                                                    |
| `task`          | String                                                                                                                                       | sim                | maxlength 80                                                                      |
| `promptVersion` | String                                                                                                                                       | sim                | maxlength 40                                                                      |
| `model`         | String                                                                                                                                       | sim                | valor de `LLM_MODEL`                                                              |
| `lane`          | enum `interactive`, `batch`                                                                                                                  | sim                |                                                                                   |
| `mode`          | enum `object`, `stream_object`                                                                                                               | sim                |                                                                                   |
| `status`        | enum `success`, `failed`, `cancelled`                                                                                                        | sim                |                                                                                   |
| `failureReason` | enum `LlmFailureReason`                                                                                                                      | não, padrão `null` | preenchido só quando `status: 'failed'`                                           |
| `attempts`      | Number                                                                                                                                       | sim                | 0 a 3 (0 quando nenhuma requisição saiu)                                          |
| `queueMs`       | Number                                                                                                                                       | sim                | tempo realmente esperado; 0 quando nem entrou na fila                             |
| `firstChunkMs`  | Number                                                                                                                                       | não, padrão `null` | só em `stream_object`                                                             |
| `latencyMs`     | Number                                                                                                                                       | sim                |                                                                                   |
| `inputTokens`   | Number                                                                                                                                       | não, padrão `null` |                                                                                   |
| `outputTokens`  | Number                                                                                                                                       | não, padrão `null` |                                                                                   |
| `finishReason`  | enum `stop`, `length`, `content-filter`, `tool-calls`, `error`, `other`                                                                      | não, padrão `null` | motivo de parada normalizado pelo AI SDK; `null` quando nenhuma resposta terminou |
| `sampling`      | subdocumento sem `_id`: `temperature`, `topP`, `topK`, `minP`, `presencePenalty`, `maxOutputTokens` (Number, todos obrigatórios dentro dele) | não, padrão `null` | valores efetivos da chamada; `null` só quando a amostragem pedida foi rejeitada   |
| `userId`        | ObjectId, ref `User`                                                                                                                         | não, padrão `null` |                                                                                   |
| `refType`       | String                                                                                                                                       | não, padrão `null` | maxlength 40                                                                      |
| `refId`         | String                                                                                                                                       | não, padrão `null` | maxlength 64                                                                      |
| `createdAt`     | Date                                                                                                                                         | sim                |                                                                                   |

- Relações: `LlmCall` N:1 `User` (opcional). `refType` e `refId` são uma referência genérica sem chave estrangeira; a funcionalidade 10 decide o que aponta para a conversa.
- Índices: `{ createdAt: 1 }` com `expireAfterSeconds: 31536000` (365 dias); `{ status: 1, createdAt: -1 }`; `{ task: 1, createdAt: -1 }`; `{ refType: 1, refId: 1 }`. O Mongoose cria os índices ao subir (o projeto não desliga `autoIndex`), então não há migração separada.
- Chamadas `disabled` não geram documento. `rate_limited` gera no máximo um documento por usuário a cada 60s (controle em memória junto do limite por usuário).
- `finishReason` e `sampling` entraram na revisão da amostragem. São opcionais com padrão `null`, sem índice novo; documentos gravados antes deles continuam válidos e são lidos como `null`, então não há migração.

**State transitions**:

- Chamada: `queued` → `running` → (`streaming`, só em `stream_object`) → `success` | `failed` | `cancelled`. Rejeições locais (`rate_limited`, `circuit_open`, `bad_request` de entrada) vão direto a `failed` sem entrar na fila; `busy` sai de `queued` para `failed`; `cancelled` pode sair de `queued`, `running` ou `streaming`.
- Disjuntor: `closed` → (3 chamadas lógicas seguidas terminando em `timeout`, `unavailable` ou `interrupted`) → `open` → (30s) → `half_open`. Em `half_open`, a primeira chamada vira a chamada de teste e as outras recebem `circuit_open`. Chamada de teste com resposta HTTP do vLLM → `closed`; com uma das três causas → `open` por mais 30s; cancelada → continua `half_open` e a próxima chamada vira a de teste. Em `closed`, qualquer resposta HTTP do vLLM zera a contagem; rejeições locais e cancelamentos não mexem nela.

**API surface**:

| Endpoint / função              | Método | Key inputs                                                                                                         | Key outputs                                                                                               | Auth                                                                                                        | Key errors                                                                                     |
| ------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `generateLlmObject` (servidor) | função | `task`, `promptVersion`, `schema`, `system`, `messages` (req); `lane`, `userId`, `ref`, `signal`, `sampling` (opt) | `LlmResult<T>`                                                                                            | chamada só por código de servidor; quem chama já passou por `requireSession()` e passa o `userId` da sessão | `disabled`, `busy`, `rate_limited`, `circuit_open`, `timeout`, `unavailable`, `invalid_output` |
| `streamLlmObject` (servidor)   | função | igual acima                                                                                                        | `LlmStream<T>` (`partial`, `final`)                                                                       | igual acima                                                                                                 | os anteriores mais `interrupted`, `cancelled`                                                  |
| `/api/llm/status`              | GET    | nenhum                                                                                                             | `configured`, `enabled`, `reachable`, `modelServed`, `circuit`, `activeCalls`, `queuedCalls`, `latencyMs` | Admin (`verifySession()` + `isAdmin`, no próprio handler)                                                   | 401 sem sessão, 403 perfil diferente de Admin                                                  |

- O status consulta `GET {LLM_BASE_URL}/models` com a chave e prazo de 5s a cada requisição (é raro e só para Admin). Com a IA desligada, responde sem consultar a rede (`reachable: null`, `modelServed: null`).
- A rota responde JSON com 401 ou 403 em vez de usar `requireAdmin()`, que redireciona. O `proxy.ts` ignora `/api`, então a guarda precisa ficar no handler.

**Value sourcing**:

| Action                                 | Value produced / displayed                            | Source                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generateLlmObject`, `streamLlmObject` | `data`                                                | resposta do vLLM (`response_format` `json_schema` gerado do `schema`), validada pelo `schema` Zod                                                                                                                                                                                                                                                     |
| idem                                   | `meta.model`, `LlmCall.model`                         | variável `LLM_MODEL`                                                                                                                                                                                                                                                                                                                                  |
| idem                                   | `task`, `promptVersion`                               | parâmetros de entrada (constantes da funcionalidade que chama)                                                                                                                                                                                                                                                                                        |
| idem                                   | `lane`                                                | parâmetro `lane`, padrão `interactive`                                                                                                                                                                                                                                                                                                                |
| idem                                   | `userId`                                              | parâmetro `userId`; a funcionalidade tira de `verifySession()`, nunca do corpo do pedido                                                                                                                                                                                                                                                              |
| idem                                   | `refType`, `refId`                                    | parâmetro `ref`                                                                                                                                                                                                                                                                                                                                       |
| idem                                   | `attempts`                                            | contador do laço de novas tentativas: 0 em rejeição local ou cancelamento antes de sair a requisição, 1 por padrão, até 2 na interativa e 3 no lote                                                                                                                                                                                                   |
| idem                                   | `queueMs`                                             | medido: momento em que pegou a vaga (ou saiu da fila por `busy` ou cancelamento) menos o início da chamada; 0 quando nem entrou na fila                                                                                                                                                                                                               |
| idem                                   | `firstChunkMs`                                        | medido: primeiro conteúdo menos o início da chamada (só em streaming)                                                                                                                                                                                                                                                                                 |
| idem                                   | `latencyMs`                                           | medido: fim (sucesso, falha ou cancelamento) menos o início da chamada                                                                                                                                                                                                                                                                                |
| idem                                   | `inputTokens`, `outputTokens`                         | campo `usage` do vLLM (`includeUsage: true`); `null` se ausente                                                                                                                                                                                                                                                                                       |
| idem                                   | `status`, `failureReason`                             | classificação das falhas (seção acima)                                                                                                                                                                                                                                                                                                                |
| idem                                   | prazos por raia                                       | constantes em `lib/llm/config.ts`: streaming interativo 20s, 10s, 60s; streaming em lote 120s, 30s, 180s; `generateLlmObject` com teto único de 20s (interativa) e 180s (lote); fila interativa 5s                                                                                                                                                    |
| idem                                   | limite de vagas                                       | variável `LLM_MAX_CONCURRENCY` (padrão 4, entre 1 e 16); vagas de lote fixas em 1                                                                                                                                                                                                                                                                     |
| idem                                   | novas tentativas                                      | constantes: interativa 1; lote 3 tentativas com espera de 2s e 4s                                                                                                                                                                                                                                                                                     |
| idem                                   | amostragem                                            | `LLM_SAMPLING_DEFAULTS` em `lib/llm/config.ts`: `temperature 0.7`, `topP 0.8`, `topK 20`, `minP 0`, `presencePenalty 0`, `maxOutputTokens 448`, mais os fixos `frequencyPenalty 0` e `repetitionPenalty 1`; o parâmetro `sampling` sobrescreve campo a campo. `presencePenalty` e `maxOutputTokens` só mudam pelas regras da tarefa 20 e da tarefa 21 |
| idem                                   | faixas aceitas de `sampling`                          | constantes: `temperature` 0 a 2; `topP` maior que 0 até 1; `topK` inteiro igual a -1 ou a partir de 1; `minP` 0 a 1; `presencePenalty` -2 a 2; `maxOutputTokens` inteiro de 1 a 8192                                                                                                                                                                  |
| idem                                   | `LlmCall.sampling`                                    | derivado: o resultado de `LlmCallRun.sampling()` (padrões mais sobrescrita); `null` quando a checagem de faixas rejeitou a chamada                                                                                                                                                                                                                    |
| idem                                   | `LlmCall.finishReason`, `finishReason` no log `[llm]` | `generateLlmObject`: `finishReason` do resultado do `generateText` no sucesso, ou do `NoObjectGeneratedError` em `invalid_output`. `streamLlmObject`: parte `finish` do stream. `null` quando nenhuma resposta terminou (rejeição local, fila, `timeout` antes de conteúdo, `unavailable`, cancelamento, `interrupted` sem `finish`)                  |
| idem                                   | limite por usuário, limite de entrada                 | constantes: 20 chamadas aceitas por 60s, janela deslizante, rejeitadas não contam; 24.000 caracteres                                                                                                                                                                                                                                                  |
| idem                                   | gravação de `rate_limited`                            | último registro `rate_limited` por `userId`, em memória; grava de novo só depois de 60s                                                                                                                                                                                                                                                               |
| idem                                   | parâmetros do disjuntor                               | constantes: 3 chamadas lógicas contáveis seguidas, 30s                                                                                                                                                                                                                                                                                                |
| `/api/llm/status`                      | `configured`                                          | presença de `LLM_BASE_URL`, `LLM_API_KEY` e `LLM_MODEL`                                                                                                                                                                                                                                                                                               |
| idem                                   | `enabled`                                             | `configured` e `LLM_ENABLED` diferente de `false`                                                                                                                                                                                                                                                                                                     |
| idem                                   | `reachable`, `latencyMs`                              | consulta ao vivo `GET {LLM_BASE_URL}/models`, prazo de 5s                                                                                                                                                                                                                                                                                             |
| idem                                   | `modelServed`                                         | `LLM_MODEL` presente em `data[].id` da resposta de `/models`                                                                                                                                                                                                                                                                                          |
| idem                                   | `circuit`, `activeCalls`, `queuedCalls`               | estado em memória do disjuntor e do limitador                                                                                                                                                                                                                                                                                                         |

**Key invariants**:

- Nenhuma função exportada por `lib/llm` lança exceção; todo caminho devolve `LlmResult` ou `LlmStream`.
- `ok: true` só existe depois que o objeto passou pelo `schema.safeParse`.
- A vaga é pega uma vez por chamada lógica, mantida em todas as tentativas e sempre liberada (`finally`), em qualquer desfecho.
- Nunca há mais de `LLM_MAX_CONCURRENCY` chamadas em andamento, nem mais de 1 do lote. Vaga que se libera vai primeiro para quem espera na raia interativa.
- Depois que o primeiro conteúdo chegou, não há nova tentativa.
- O disjuntor e o registro olham a chamada lógica, nunca a tentativa isolada.
- Cada chamada lógica gera exatamente um `LlmCall` (exceto `disabled` e o excesso de `rate_limited`), e ele nunca contém texto de mensagem ou de resposta.
- Um único ponto interno de `lib/llm` chama `generateText` ou `streamText`, sempre com `getLlmModel()`; nenhuma função recebe modelo como parâmetro e nunca se usa um id de modelo em texto.
- Todo código que chama `lib/llm` roda no runtime Node.js, nunca no Edge (o estado em memória e o Mongoose dependem disso).
- `chat_template_kwargs.enable_thinking` é sempre `false` nesta fundação.
- Toda requisição leva os oito campos de amostragem do AC-14. O comportamento do Sigma nunca depende do `--generation-config` com que o vLLM foi subido.
- `ok: false` com `invalid_output` é a única forma de um corte por limite de tokens chegar a quem chama; o `finishReason` serve só para registro e log, nunca muda o resultado.
- Com a IA desligada não há tráfego de rede nem registro.
- O estado do limitador, do disjuntor e do limite por usuário vive em memória e vale porque o Next roda em uma única instância (1 container ou 1 processo PM2).

**Security model**:

- **Só servidor:** `lib/llm` nunca chega ao navegador (`server-only`). Esta fundação não cria nenhuma rota que chame o modelo; cada funcionalidade cria a sua, com a sua própria guarda.
- **Status:** `/api/llm/status` é só para Admin, e a guarda fica no handler. A resposta nunca traz endereço nem chave.
- **Usuário:** na raia interativa, o `userId` é obrigatório e sempre vem da sessão verificada na funcionalidade que chama. Isso garante o limite por usuário.
- **Injeção de prompt:** o texto do usuário entra só como mensagem `user`; o `system` é fixo por tarefa. A saída do modelo é tratada como dado não confiável: o schema limita a forma, e a funcionalidade confere no banco todo id que o modelo devolver (ex.: um serviço do catálogo).
- **Dados pessoais (LGPD):** relatos podem conter nomes, telefones e locais. Eles só trafegam dentro da rede interna, não vão para o `LlmCall` e só aparecem em log com `LLM_DEBUG=true`, que deve ficar desligado fora de diagnóstico. Os relatos do teste de fumaça de repetição são fictícios e não citam pessoas.
- **Sem saída externa:** não existe provedor de reserva fora da rede interna. A invariante do provedor e a regra do ESLint impedem que um id de modelo em texto acione o AI Gateway da Vercel.
- **Chave:** `LLM_API_KEY` fica só no `.env`, vai só no cabeçalho `Authorization` e nunca é logada.
- **CNJ:** o engenheiro definiu que a Resolução CNJ 615/2025 não se aplica (uso administrativo interno). Essa premissa está registrada em `rationale.md`.

**Configuration required**:

- `LLM_BASE_URL`: URL da API compatível com a OpenAI no vLLM, com `/v1` no fim (ex.: `http://<host>:8000/v1`). HTTP na rede interna.
- `LLM_API_KEY`: chave emitida pela equipe da GPU (o vLLM roda com `--api-key`).
- `LLM_MODEL`: nome exato do modelo servido (ex.: `Qwen/Qwen3-14B`). É gravado como versão do modelo em cada chamada.
- `LLM_ENABLED`: `false` desliga a IA sem remover as outras variáveis (padrão: ligada quando as três acima existem).
- `LLM_MAX_CONCURRENCY`: máximo de chamadas simultâneas, combinado com a equipe da GPU (padrão 4).
- `LLM_DEBUG`: `true` loga o texto enviado e o recebido (padrão `false`).
- Condições prévias: a equipe da GPU emite a chave do Sigma, confirma o nome servido e o limite de vagas; a VPS (e o container `next-app`) alcança o host do vLLM.
- Nenhuma variável nova para a amostragem: os valores são constantes e mudam com deploy. Se a comparação da tarefa 21 achar corte com espaço em branco, a equipe da GPU precisa subir o vLLM com `--structured-outputs-config.disable_any_whitespace` (vale para todos os clientes daquele servidor e só deixa o JSON compacto). O pedido não consegue ligar isso sozinho, porque o backend xgrammar lê a opção só da configuração do servidor.

**Critical test scenarios** (servidor falso em `e2e/fixtures/llm-stub/`). Os testes de integração com HTTP real usam prazos injetados pequenos, em milissegundos, porque `AbortSignal.timeout` e os sockets não obedecem ao relógio falso do Vitest. O relógio falso fica só para os testes unitários de limitador, disjuntor e limite por usuário. Os tempos abaixo são os de produção; nos testes eles aparecem na mesma proporção.

- Caminho feliz sem streaming: o servidor falso recebe `Authorization: Bearer`, `response_format.type: 'json_schema'` e `chat_template_kwargs.enable_thinking: false`, e a função devolve `ok: true` com `meta.model` igual a `LLM_MODEL`. Verifica **AC-1**.
- Amostragem no corpo: sem `sampling`, o servidor falso recebe `temperature: 0.7`, `top_p: 0.8`, `top_k: 20`, `min_p: 0`, `presence_penalty: 0`, `frequency_penalty: 0`, `repetition_penalty: 1` e `max_tokens: 448`, nas duas funções; com `sampling: { topK: 40, maxOutputTokens: 200 }`, só esses dois mudam (tarefa 19). O `LlmCall` guarda os valores efetivos (asserção acrescentada na tarefa 22). Verifica **AC-14**, **AC-15**.
- Faixas: `temperature: 3`, `topP: 0`, `topK: 0`, `minP: 1.5`, `presencePenalty: 2.5` e `maxOutputTokens: 9000` dão, cada um, `bad_request` sem tráfego, e `temperature: 0` e `topK: -1` passam (tarefa 19). O `LlmCall` dessas rejeições tem `attempts: 0` e `sampling: null` (asserção acrescentada na tarefa 22). Verifica **AC-14**, **AC-15**.
- Corte por limite: o servidor falso devolve JSON incompleto com `finish_reason: 'length'`, sem streaming e com streaming. O resultado é `invalid_output`, o `LlmCall` fica com `finishReason: 'length'`, o log `[llm]` traz `length`, e um corte entre dois timeouts zera a contagem do disjuntor. No caminho feliz, `finishReason` é `stop`; em `timeout` antes de conteúdo e em rejeição local, é `null`. Verifica **AC-15**, **AC-7**.
- Velocidade e repetição (teste de fumaça contra o vLLM real): com `LLM_MAX_CONCURRENCY` gerações simultâneas de `maxOutputTokens` tokens em 3 rodadas, a mediana das latências fica em até 12s; a comparação de três configurações sobre 8 relatos × 5 execuções mostra 0 corte com conteúdo repetido na configuração padrão e imprime as contagens por configuração e por tipo de sobra. Verifica **AC-16**.
- Caminho feliz com streaming: os parciais chegam em ordem, `final` valida, e a promessa só resolve depois do primeiro pedaço. Verifica **AC-2**.
- JSON fora do schema: `final` resolve `invalid_output`. Verifica **AC-2**.
- Primeiro pedaço em 21s dá `timeout`; parada de 11s no meio dá `interrupted`; `generateLlmObject` sem resposta em 20s dá `timeout`; em todos os casos o servidor falso vê a conexão abortada. Verifica **AC-3**.
- 503 seguido de sucesso dá `ok: true` com `attempts: 2`, usando a mesma vaga nas duas tentativas; queda depois do primeiro pedaço não tenta de novo. Verifica **AC-4**.
- Abortar o `signal` no meio do streaming fecha a conexão com o servidor falso, libera a vaga e grava `cancelled`; abortar enquanto espera na fila grava `cancelled` com `attempts: 0` e o `queueMs` já esperado. Verifica **AC-5**, **AC-10**.
- 5 chamadas interativas lentas: a quinta falha como `busy` depois de 5s; um lote em espera não pega vaga enquanto há interativa na fila. Verifica **AC-6**.
- 3 timeouts seguidos: a quarta chamada é `circuit_open` sem tráfego; aos 30s uma chamada de teste passa, e as outras continuam `circuit_open` até ela terminar. Um `invalid_output` entre dois timeouts zera a contagem. Uma chamada de teste que recebe `auth_error` fecha o disjuntor; uma que termina em `timeout` reabre. Verifica **AC-7**.
- A 21ª chamada do mesmo usuário em 60s dá `rate_limited`, e novas tentativas rejeitadas não empurram a janela; 50 rejeições seguidas gravam um único `LlmCall`. Entrada de 24.001 caracteres dá `bad_request`. Nenhum desses casos gera tráfego. Verifica **AC-8**, **AC-10**.
- Ordem das checagens: com o disjuntor aberto e o usuário no limite, o resultado é `circuit_open` e a cota do usuário não é gasta; com entrada grande demais e usuário no limite, o resultado é `bad_request`. Verifica **AC-7**, **AC-8**.
- Sem `LLM_MODEL` ou com `LLM_ENABLED=false`: `disabled`, sem tráfego e sem `LlmCall`. Verifica **AC-9**.
- Gravação de `LlmCall` falhando (mock rejeita): o resultado entregue continua `ok: true`, e nenhum documento contém os textos de teste. Verifica **AC-10**.
- Com `LLM_DEBUG` ausente, os logs capturados não contêm o texto do relato de teste nem a chave. Verifica **AC-11**.
- `/api/llm/status` sem sessão dá 401; como Solicitante dá 403; como Admin dá 200 sem `baseUrl` e sem chave no corpo. Verifica **AC-12**.
- Uma importação de `streamText` de `ai` num arquivo fora de `lib/llm/` falha no `npm run lint`; o teste do provedor confirma que o modelo usado é a instância `vllm`. Verifica **AC-13**.

## Build plan

Tracer Bullet: o primeiro marco atravessa todas as camadas contra o vLLM real (configuração, provedor, schema, registro no banco). Assim, o maior risco (a versão do vLLM aceitar `json_schema` e `chat_template_kwargs`) aparece antes de qualquer proteção ser construída. Os marcos seguintes engrossam o mesmo fio.

**Marco 1: fio fino ponta a ponta**

1. [x] Adicionar `ai` e `@ai-sdk/openai-compatible` com versões exatas (sem `^`) e criar `lib/llm/config.ts`, com leitura das variáveis validada por Zod, `configured`, `enabled`, aviso de configuração incompleta e todas as constantes da tabela de origem dos valores (prazos num objeto que os testes podem substituir). Satisfaz **AC-9**, **AC-11**.
2. [x] Criar `lib/llm/provider.ts` com o provedor `vllm` (`supportsStructuredOutputs: true`, `includeUsage: true`), a injeção de `chat_template_kwargs: { enable_thinking: false }` no corpo (por `providerOptions` ou `transformRequestBody`; o teste da tarefa 5 prova qual funciona) e `getLlmModel()` como único jeito de obter o modelo. Satisfaz **AC-1**, **AC-13**.
3. [x] Criar `models/LlmCall.ts` com os campos, enums, índices e TTL do modelo de dados, e `lib/llm/call-log.ts` com gravação sem esperar. Satisfaz **AC-10**.
4. [x] Criar `lib/llm/types.ts` e `generateLlmObject` na forma mínima: caminho `disabled`, chamada com `Output.object`, validação Zod, `LlmResult` com `meta`, registro `LlmCall` e log `[llm]`. Satisfaz **AC-1**, **AC-9**, **AC-10**.
5. [x] Criar o servidor falso `e2e/fixtures/llm-stub/` (`GET /v1/models`, `POST /v1/chat/completions` sem streaming; confere o Bearer e guarda o corpo recebido para o teste inspecionar) e o teste de integração do caminho feliz em `lib/llm/__tests__/`. Satisfaz **AC-1**.
6. [x] Criar `lib/llm/__tests__/llm.smoke.test.ts`, que só roda com `LLM_SMOKE=1`, e rodar uma vez contra o vLLM real para confirmar `json_schema`, thinking desligado e o `usage`. No mesmo teste, abortar uma geração longa no meio e confirmar em `/metrics` do vLLM (`vllm:num_requests_running`) que a requisição deixou de rodar, ou seja, que cancelar libera a GPU de verdade. Se qualquer confirmação falhar, pare e volte ao `/architect` antes do Marco 2. Satisfaz **AC-1**, **AC-5**.

**Marco 2: streaming, prazos e cancelamento**

7. [x] Implementar `streamLlmObject` (resolve no primeiro conteúdo ou na falha anterior a ele, entrega `partial` e `final`), com prazos por raia combinando o `timeout` do `streamText` (primeiro pedaço e parada) com `AbortSignal.timeout` para o teto total, via `AbortSignal.any`, e a distinção entre `timeout` e `interrupted`. Aplicar o teto único de 20s ou 180s ao `generateLlmObject`. Satisfaz **AC-2**, **AC-3**.
8. [x] Propagar o `signal` de quem chama até a requisição ao vLLM em qualquer fase (fila, requisição, streaming); liberar a vaga e gravar `cancelled` com `attempts` e `queueMs` corretos. Satisfaz **AC-5**, **AC-10**.
9. [x] Estender o servidor falso com SSE (eventos enviados pelo servidor), atraso no primeiro pedaço, parada no meio, queda da conexão, 503 e JSON fora do schema; escrever os testes de integração de streaming, prazos e cancelamento com prazos injetados em milissegundos (sem relógio falso). Satisfaz **AC-2**, **AC-3**, **AC-5**.

**Marco 3: proteção da GPU compartilhada**

10. [x] Criar `lib/llm/limiter.ts` (vagas, raia de lote com 1 vaga, vaga liberada vai primeiro para a interativa em espera, fila de 5s que resulta em `busy`, cancelamento durante a espera, contadores) e ligar às duas funções. Satisfaz **AC-5**, **AC-6**.
11. [x] Implementar a política de novas tentativas por raia (só antes do primeiro conteúdo, só para os códigos definidos, dentro do prazo, mantendo a mesma vaga), passando `maxRetries: 0` ao AI SDK para que a política seja uma só. Satisfaz **AC-4**.
12. [x] Criar `lib/llm/circuit-breaker.ts` (conta só o resultado final da chamada lógica, 3 causas contáveis, zera com qualquer resposta HTTP do vLLM, 30s, uma única chamada de teste com as regras de `half_open`) e ligar às duas funções. Satisfaz **AC-7**.
13. [x] Criar `lib/llm/user-rate-limit.ts` (20 chamadas aceitas por 60s, só na raia interativa, rejeitadas não contam, no máximo um registro `rate_limited` por usuário a cada 60s) e a checagem de 24.000 caracteres de entrada, aplicando a ordem das checagens definida em Feature design. Satisfaz **AC-8**, **AC-10**.
14. [x] Testes unitários com relógio falso do Vitest para limitador, disjuntor e limite por usuário (incluindo as combinações da ordem das checagens), e testes de integração de novas tentativas contra o servidor falso com prazos em milissegundos. Satisfaz **AC-4**, **AC-6**, **AC-7**, **AC-8**.

**Marco 4: operação e guarda**

15. [x] Criar `app/api/llm/status/route.ts` com `getLlmStatus()` (guarda no handler, consulta a `/models` com prazo de 5s, sem endereço nem chave na resposta) e os testes de 401, 403 e 200. Satisfaz **AC-12**.
16. [x] Implementar `LLM_DEBUG` (`[LLM:debug]`) e um teste que captura os logs sem debug e confirma que não há texto de relato nem chave. Satisfaz **AC-11**.
17. [x] Adicionar ao `eslint.config.mjs` a regra `no-restricted-imports` para `generateText`, `streamText`, `generateObject` e `streamObject` de `ai` fora de `lib/llm/**`, e o teste que confirma que o único ponto interno de chamada usa a instância do provedor `vllm` (nenhuma função exportada aceita modelo). Satisfaz **AC-13**.
18. [x] Documentar as variáveis `LLM_*` em `.env.production.example` e repassar essas variáveis ao `next-app` no `docker-compose.yml`. Na VPS, com as variáveis no `.env`, confirmar por `/api/llm/status` que `reachable` e `modelServed` são `true` de dentro do container. Satisfaz **AC-9**, **AC-11**, **AC-12**.

**Marco 5: amostragem revisada** (pode rodar antes da tarefa 18)

Tracer Bullet de novo: a primeira tarefa já leva a amostragem nova até o vLLM real, e as duas seguintes provam, contra o servidor de verdade, se ela resolve a repetição antes de o registro engrossar o fio. A causa do corte visto no teste de fumaça não foi guardada, então nada é dado como resolvido sem essa prova.

19. [x] Estender `sampling` em `lib/llm/types.ts` com `topK`, `minP` e `presencePenalty`; trocar `LLM_SAMPLING_DEFAULTS` pelos valores do AC-14 (com `frequencyPenalty` e `repetitionPenalty` fixos); validar as faixas na checagem de `bad_request` da ordem das checagens; em `model-call.ts`, enviar os campos como descrito em Feature design (opções padrão do AI SDK mais `providerOptions.vllm`), nas duas funções. Tirar o `sampling: { temperature: 0 }` do caso de classificação do teste de fumaça. Atualizar os testes de integração contra o servidor falso só no que esta tarefa entrega: o corpo do pedido e o `bad_request` sem tráfego (as asserções sobre `LlmCall.sampling` entram na tarefa 22). Satisfaz **AC-14**.
20. [x] Adicionar ao teste de fumaça a medição de velocidade com carga: 3 rodadas, cada uma com `LLM_MAX_CONCURRENCY` chamadas simultâneas de `generateLlmObject` na raia interativa, com um `userId` fictício (as 12 chamadas do padrão 4 ficam abaixo do limite de 20 por minuto), o prompt e o schema `{ texto }` do caso de aborto e `maxOutputTokens` igual ao padrão. Só neste caso, chamar `overrideLlmTimings({ interactive: { generateMs: 60_000 } })` e `resetLlmTimings()` no fim, para a medição não parar no teto de 20s. Ler `latencyMs` e `outputTokens` de cada `LlmCall` capturado; se alguma chamada não chegar a `outputTokens` igual ao limite, a medição falha em vez de calcular. Passa se a mediana das latências ficar em até 12.000 ms. Se não passar, calcular tokens por segundo (limite dividido pela mediana em segundos), trocar `LLM_SAMPLING_DEFAULTS.maxOutputTokens` em `lib/llm/config.ts` pelo maior múltiplo de 64 que cabe em 12s (piso de 256) e medir de novo; se nem 256 couber, pare e volte ao `/architect`. Imprimir o resultado com `console.warn('[smoke] …')`, como o teste já faz. É um sinal grosseiro de velocidade com a carga do próprio Sigma, não uma garantia de p95. Satisfaz **AC-16**.
21. [x] Adicionar ao teste de fumaça a comparação de repetição: 8 relatos fixos e fictícios (curto, longo, ambíguo, com lista de itens, com local detalhado, com dois problemas, com erro de digitação, só em minúsculas), cada um com o schema de classificação do caso existente mais um campo `resumo`, 5 execuções cada com `generateLlmObject` na raia de lote (cerca de 120 chamadas em sequência; rode fora do horário de pico da GPU compartilhada), em três configurações passadas por `sampling`: antiga (`temperature 0.2`, `topP 0.8`, `topK 20`, `minP 0`, `presencePenalty 0`, `maxOutputTokens 1024`), gulosa (a antiga com `temperature 0`) e a padrão. Para cada chamada, ler `choices[0].finish_reason` e `choices[0].message.content` do corpo cru da resposta, pela captura de `fetch` que o teste de fumaça já faz (sem streaming, a resposta chega num JSON só). Para cada corte (`finish_reason: 'length'`), classificar a sobra: espaço em branco quando os últimos 200 caracteres não têm nada além de espaço, tabulação e quebra de linha; conteúdo repetido nos outros casos. Imprimir as contagens por configuração e tipo com `console.warn('[smoke] …')`. Regras sobre a configuração padrão, aplicadas nesta ordem e somadas: (a) corte com conteúdo repetido faz `LLM_SAMPLING_DEFAULTS.presencePenalty` em `lib/llm/config.ts` subir para 1.0 e a comparação rodar de novo só para a configuração padrão, e se a nova rodada ainda tiver esse corte, pare e volte ao `/architect`; (b) qualquer corte com espaço em branco, na primeira rodada ou na nova, não para o build, mas marca a pendência da flag do vLLM (veja Follow-up); (c) a última rodada sem corte com conteúdo repetido passa. Anotar no `verify.md`, na linha de contexto do build, as contagens por configuração, a velocidade da tarefa 20, os valores finais e, se for o caso, que a regra (a) disparou. Se a configuração antiga também der 0 corte, anotar que o sintoma original não se reproduziu. Satisfaz **AC-16**.
22. [x] Adicionar `finishReason` e `sampling` ao `models/LlmCall.ts` (sem índice novo); passar os dois pelo `LlmCallRun` até `call-log.ts` e incluir `finishReason` no log `[llm]`; estender o servidor falso com resposta cortada (`finish_reason: 'length'`, com e sem streaming) e cobrir os cenários de corte, de `null` e de disjuntor. Acrescentar aos testes da tarefa 19 as asserções de `LlmCall.sampling` (valores efetivos e `null` nas rejeições de faixa). Satisfaz **AC-15**, **AC-10**.

## Consequences

**Positive**:

- Cada funcionalidade de IA escreve só o prompt e o schema; prazo, fallback, proteção da GPU e registro vêm prontos e iguais para todas.
- `ok: false` é um contrato simples para seguir sem IA, então o chat e o formulário continuam funcionando com o vLLM fora do ar.
- A GPU compartilhada fica protegida por um teto fixo de vagas, e o lote nunca atrasa quem está no chat.
- `LlmCall` dá à funcionalidade 18 a contagem de falhas por período e tarefa, e o `meta` dá à funcionalidade 10 a versão do modelo e do prompt.
- O servidor falso torna os testes de integração e os futuros E2E do chat previsíveis, sem desvio no código de produção.
- A amostragem segue o que o fabricante testou para o modo sem thinking e não muda se a equipe da GPU subir o vLLM com outro `--generation-config`.
- Um laço de repetição termina em 448 tokens como `invalid_output`, dentro do prazo, e não abre o disjuntor para todos; o `finishReason` mostra no registro e no painel da funcionalidade 18 quantos cortes houve.
- O `sampling` no `LlmCall` deixa a calibração (14) e o painel (18) separarem resultados por amostragem, sem depender de disciplina com o `promptVersion`.

**Negative / tradeoffs**:

- O AI SDK muda de versão maior com frequência e quebra API entre versões. As versões ficam fixas, e toda atualização exige rodar o teste de fumaça.
- O streaming traz modos de falha que a tela precisa tratar: o usuário pode ver texto parcial e depois receber `invalid_output` ou `interrupted`. As funcionalidades 11 e 12 precisam substituir o texto parcial pela mensagem de reserva.
- Limitador, disjuntor e limite por usuário vivem em memória: zeram a cada reinício e deixam de valer se o Next um dia rodar em mais de uma instância (aí será preciso um estado compartilhado, como Redis).
- A restrição de JSON depende da versão do vLLM, que não foi confirmada. O Marco 1 existe para descobrir isso cedo.
- `LLM_MODEL` é um rótulo em que se confia: se a equipe da GPU trocar os pesos mantendo o mesmo nome, os registros apontam a versão errada.
- Prazos, limites e amostragem são constantes; mudar qualquer um exige deploy.
- O thinking do Qwen3 fica sempre desligado, o que troca qualidade de raciocínio por latência. Ligar por tarefa exige atualizar esta spec.
- Com `temperature 0.7`, um relato ambíguo pode receber classificações diferentes em chamadas seguidas. Não há como pedir resultado reproduzível: o `seed` não garante reprodução no vLLM online, e a temperatura baixa traz de volta o risco de repetição. A calibração precisa medir com essa variação.
- 448 tokens podem ser pouco para uma resposta de conversa com pergunta e motivo; a funcionalidade que precisar de mais passa o próprio `maxOutputTokens` e confere que cabe no prazo da raia.
- Se o laço for de espaço em branco, a correção depende da equipe da GPU e muda o formato do JSON (compacto) para todos os clientes daquele vLLM. Até lá, as funcionalidades 11 e 12 ficam bloqueadas.
- A comparação da tarefa 21 ocupa a GPU compartilhada com cerca de 120 chamadas, e precisa rodar de novo a cada troca de modelo, de versão do vLLM ou dos valores padrão.

**Neutral**:

- Nova coleção `llmcalls`, com TTL e 4 índices. Mudar a retenção depois não é automático: o Mongoose não altera um índice TTL existente, então a mudança exige `collMod` manual no MongoDB.
- Todo consumidor de `lib/llm` fica preso ao runtime Node.js (nunca Edge).
- Seis variáveis `LLM_*` novas no `.env` da VPS e no `docker-compose.yml`.
- Um servidor falso para manter em `e2e/fixtures/llm-stub/`, que as funcionalidades 11, 12 e 14 vão estender com cenários próprios.
- Nova regra de ESLint sobre importações de `ai`.
- Dois campos opcionais novos no `LlmCall` (`finishReason`, `sampling`), sem índice e sem migração.

## Follow-up

- [ ] Combinar com a equipe da GPU: a chave do Sigma, o nome exato servido (`LLM_MODEL`) e o valor de `LLM_MAX_CONCURRENCY`.
- [ ] Antes do deploy, confirmar que a rede do Docker (`sigma`) não usa uma faixa que se sobreponha à do host do vLLM (a VPS está em 172.18.x.x, faixa que o Docker também costuma usar).
- [ ] Confirmar que o `.env` da VPS não está legível por todos (a auditoria de 2026-05-25 encontrou permissão 644), já que ele passa a guardar `LLM_API_KEY`.
- [ ] Nas specs das funcionalidades 11 e 12: definir como a tela substitui o texto parcial quando `final` falha.
- [ ] Na spec da funcionalidade 14: incluir uma chave na tela do Admin para desligar a IA inteira sem mexer no servidor, lida por `isLlmEnabled()`.
- [ ] Reavaliar `cache_salt` do vLLM se a GPU passar a ser compartilhada com sistemas de fora do tribunal.
- [ ] Só se a tarefa 21 achar corte com espaço em branco: pedir à equipe da GPU que suba o vLLM com `--structured-outputs-config.disable_any_whitespace` e rodar a comparação de novo. Até passar sem nenhum corte, não liberar as funcionalidades 11 e 12 (trava de processo: as specs delas registram como pré-condição).
- [ ] Perguntar à equipe da GPU com que `--generation-config`, `--max-model-len` e opções de structured outputs o vLLM foi subido, para registrar no `verify.md` o ambiente em que a comparação rodou e conferir que 24.000 caracteres de entrada mais 8192 tokens de saída cabem no contexto do servidor.
- [ ] Na spec da funcionalidade 18: mostrar a taxa de cortes por `finishReason` (em especial `length`) por período e tarefa, porque um laço de repetição responde HTTP 200 e nunca abre o disjuntor.
- [ ] Na spec da funcionalidade 14: medir o acerto com a amostragem de produção (nunca com `temperature 0`) e tratar a variação entre chamadas como parte da medida de confiança.
- [ ] Nas specs das funcionalidades 11 e 12: definir o `maxOutputTokens` da tarefa se a resposta passar de 448 tokens, conferindo com a velocidade medida na tarefa 20.
- [ ] `/sync`: registrar as variáveis `LLM_*` e a linha "Integração IA local" na referência rápida do `AGENTS.md` raiz; criar `lib/llm/AGENTS.md` apontando a skill `vercel:ai-sdk` (plugin de usuário, não instalada no projeto) e uma linha `Declined:` com as skills da comunidade oferecidas e não escolhidas (`laguagu/claude-code-nextjs-skills@ai-sdk-6`, `secondsky/claude-skills@ai-sdk-ui`).
