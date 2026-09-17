# Verify: Integração com a IA local · spec 0001 · updated 2026-09-17

_Steps derived from spec 0001 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Contexto do build: vLLM 0.25.1 em `http://172.18.5.240:8000/v1`, modelo `qwen3-8b`. O teste de fumaça lê `LLM_BASE_URL`, `LLM_API_KEY` e `LLM_MODEL` do ambiente ou do `.env.local`.

Amostragem revisada (Marco 5, 2026-09-17, 13h, `LLM_MAX_CONCURRENCY=4`): valores finais `temperature 0.7`, `topP 0.8`, `topK 20`, `minP 0`, `presencePenalty 0`, `maxOutputTokens 448`, mais os fixos `frequencyPenalty 0` e `repetitionPenalty 1`. Velocidade (tarefa 20): com 512 tokens a mediana deu 12.373,5 ms (41,4 tokens/s), acima de 12s, então `maxOutputTokens` caiu para 448; com 448 a mediana deu 10.989,5 ms (40,8 tokens/s). Repetição (tarefa 21, 8 relatos × 5 execuções na raia de lote, 210s no total): antiga 40 ok, 0 corte; gulosa 40 ok, 0 corte; padrão 40 ok, 0 corte com conteúdo repetido e 0 com espaço em branco. A regra (a) não disparou (`presencePenalty` ficou em 0) e não há pendência da flag `disable_any_whitespace`. A configuração antiga também deu 0 corte: o sintoma original não se reproduziu. Ainda falta registrar com que `--generation-config`, `--max-model-len` e opções de structured outputs o vLLM foi subido (Follow-up da spec).

## UI / manual

- [x] Logado como Admin, abrir `GET /api/llm/status` → 200 com exatamente `configured`, `enabled`, `reachable`, `modelServed`, `circuit`, `activeCalls`, `queuedCalls`, `latencyMs`; `reachable` e `modelServed` `true`; o corpo não tem o endereço nem a chave → AC-12
- [x] Sem sessão, `GET /api/llm/status` → 401 JSON (sem redirecionar) → AC-12
- [x] Logado como Preposto, Solicitante ou Técnico, `GET /api/llm/status` → 403 JSON → AC-12
- [x] Na VPS, com as variáveis `LLM_*` no `.env` e o `next-app` recriado, abrir `/api/llm/status` como Admin → `reachable: true` e `modelServed: true` de dentro do container → AC-9, AC-12
- [ ] Na VPS, `LLM_ENABLED=false` e recriar o `next-app` → o status mostra `enabled: false`, `reachable: null`, e o app sobe normal → AC-9
- [x] Na VPS, confirmar que a rede Docker `sigma` não usa faixa que cubra `172.18.5.240` (`docker network inspect` do projeto): se usar, o container não alcança o vLLM → AC-9, AC-12
- [ ] Na VPS, `docker logs` do `next-app` depois de chamadas de IA → linhas `[llm] {...}` com `task`, `status`, `reason`, `attempts`, `latencyMs` e nenhum texto de relato nem a chave → AC-11

## Commands

- [x] `npx vitest run lib/llm models/__tests__/LlmCall.test.ts app/api/llm` → tudo verde, com o teste de fumaça pulado → AC-1 a AC-13
- [x] `$env:LLM_SMOKE='1'; npx vitest run lib/llm/__tests__/llm.smoke.test.ts` (PowerShell) ou `LLM_SMOKE=1 npx vitest run lib/llm/__tests__/llm.smoke.test.ts` → 5 verdes: status alcança o modelo, `json_schema` respeitado com `finish_reason: stop`, sem `<think>` nem `reasoning_content`, `usage` com tokens de entrada e de saída maiores que 0, streaming com parciais e `final` válido, e `vllm:num_requests_running` volta ao valor de antes depois do aborto → AC-1, AC-2, AC-5, AC-12
- [x] `npx vitest run lib/llm/__tests__/stream.integration.test.ts` → timeout do primeiro pedaço abaixo do teto total, `interrupted` pela parada antes do teto total, servidor falso vê a conexão abortada → AC-2, AC-3, AC-5
- [x] `npx vitest run lib/llm/__tests__/protection.integration.test.ts` → 503/429/502/504 e conexão recusada ou reiniciada ganham nova tentativa na mesma vaga; 500/401/403/400/422 não; lote com 3 tentativas e esperas crescentes; quinta chamada `busy`; disjuntor abre, testa e fecha ou reabre; 21ª chamada `rate_limited`; 50 rejeições geram 1 registro; 24.001 caracteres dão `bad_request` → AC-4, AC-6, AC-7, AC-8, AC-10
- [x] `npx vitest run lib/llm/__tests__/limiter.test.ts lib/llm/__tests__/circuit-breaker.test.ts lib/llm/__tests__/user-rate-limit.test.ts` (relógio falso, prazos de produção) → verdes → AC-6, AC-7, AC-8
- [x] `npx vitest run lib/llm/__tests__/logging.integration.test.ts` → sem `LLM_DEBUG` os logs não têm relato, resposta nem chave; com `LLM_DEBUG=true` o texto aparece só em `[LLM:debug]` → AC-11
- [x] Criar um arquivo fora de `lib/llm/` com `import { streamText } from 'ai'` e rodar `npx eslint <arquivo>` → erro `no-restricted-imports` citando `lib/llm` (apagar o arquivo depois) → AC-13
- [x] `npx vitest run lib/llm/__tests__/guard.test.ts` → só `lib/llm/model-call.ts` chama o AI SDK, o modelo é a instância `vllm.chat`, todo arquivo importa `server-only` e não há `NEXT_PUBLIC_LLM_*` → AC-11, AC-13
- [x] Com `MONGODB_URI` local, subir o app (ou `LlmCallModel.init()`) e listar os índices de `llmcalls` → `{ createdAt: 1 }` com `expireAfterSeconds: 31536000`, `{ status: 1, createdAt: -1 }`, `{ task: 1, createdAt: -1 }`, `{ refType: 1, refId: 1 }` → AC-10
- [x] `npm run build` → compila, e `/api/llm/status` aparece como rota dinâmica (`ƒ`) → AC-11, AC-12
- [ ] `npx vitest run lib/llm/__tests__/generate.integration.test.ts lib/llm/__tests__/stream.integration.test.ts` → o servidor falso recebe os oito campos de amostragem com os valores padrão nas duas funções; a sobrescrita muda só os campos passados; cada valor fora das faixas dá `bad_request` sem tráfego com `LlmCall` `attempts: 0` e `sampling: null` → AC-14, AC-15
- [ ] Mesmos testes: resposta com `finish_reason: 'length'` e JSON incompleto, com e sem streaming, dá `invalid_output`, grava `finishReason: 'length'` e o log `[llm]` traz `"finishReason":"length"` → AC-15
- [ ] `npx vitest run lib/llm/__tests__/protection.integration.test.ts -t "corte"` → timeout, timeout, corte, timeout, timeout e depois `ok: true` (o corte zerou a contagem do disjuntor); `finishReason` gravado `null, null, length, null, null, stop` → AC-7, AC-15
- [ ] `npx vitest run models/__tests__/LlmCall.test.ts` → `finishReason` e `sampling` existem, são `null` por padrão, o enum recusa valor desconhecido, o subdocumento não tem `_id` e recusa amostragem incompleta, e continuam 4 índices → AC-10, AC-15
- [ ] `LLM_SMOKE=1 npx vitest run lib/llm/__tests__/llm.smoke.test.ts -t "json_schema" --reporter=default` → o vLLM real aceita os oito campos de amostragem e responde `finish_reason: stop` com `ok: true` → AC-14
- [ ] `LLM_SMOKE=1 npx vitest run lib/llm/__tests__/llm.smoke.test.ts -t "velocidade" --reporter=default` → 3 rodadas de `LLM_MAX_CONCURRENCY` chamadas interativas, todas com `outputTokens` igual ao limite, e mediana até 12.000 ms (a linha `[smoke] velocidade` mostra latências e tokens por segundo) → AC-16
- [ ] Fora do horário de pico: `LLM_SMOKE=1 npx vitest run lib/llm/__tests__/llm.smoke.test.ts -t "repeti" --reporter=default` → contagens impressas por configuração (antiga, gulosa, padrão) e 0 corte com conteúdo repetido na padrão; corte com espaço em branco imprime a `PENDÊNCIA` e não reprova → AC-16

_Dica: no Claude Code o Vitest 4 escolhe um reporter que esconde o log de testes que passam; use `--reporter=default` para ver as linhas `[smoke]`._

## Value sourcing

- [x] `data`: no teste de fumaça, um relato com enum no schema devolve só valores do enum; no servidor falso, JSON fora do schema vira `invalid_output` → AC-1, AC-2
- [x] `meta.model` / `LlmCall.model`: trocar `LLM_MODEL` para outro nome servido muda o valor gravado; um nome não servido dá `modelServed: false` no status → AC-1, AC-12
- [x] `task`, `promptVersion`, `lane`, `refType`, `refId`: o registro grava exatamente os parâmetros de entrada; sem `lane`, grava `interactive` → AC-10
- [x] `userId`: chamada interativa sem `userId` dá `bad_request` sem tráfego; no lote, `userId` nulo é aceito → AC-8
- [x] `attempts`: 0 em rejeição local e em cancelamento na fila; 2 depois de um 503; 3 no lote com três falhas → AC-4, AC-10
- [x] `queueMs`: 0 quando a vaga sai na hora; próximo do tempo realmente esperado quando cancela na fila ou sai por `busy` → AC-5, AC-6, AC-10
- [x] `firstChunkMs`: preenchido só em `stream_object`, perto do atraso do primeiro pedaço; nulo em `object` → AC-10
- [x] `latencyMs`: medido do início ao fim em sucesso, falha e cancelamento → AC-1, AC-10
- [x] `inputTokens`, `outputTokens`: vêm do `usage` do vLLM, com e sem streaming; nulos quando o servidor não manda `usage` → AC-10
- [x] `status`, `failureReason`: `failureReason` só existe com `status: 'failed'`; `cancelled` grava `failureReason: null` → AC-10
- [x] Prazos por raia: interativa com 20s, 10s e 60s, e 20s em `generateLlmObject`; lote com 120s, 30s e 180s, e 180s em `generateLlmObject`; fila interativa de 5s (conferir em `lib/llm/config.ts`) → AC-3, AC-6
- [x] Limite de vagas: `LLM_MAX_CONCURRENCY=2` limita a 2 pedidos simultâneos; `0`, `17` ou texto voltam ao padrão 4 com aviso; o lote nunca passa de 1 → AC-6
- [x] Novas tentativas: 1 na interativa, sem espera, dentro do mesmo prazo; lote com 3 tentativas e esperas de 2s e 4s → AC-4
- [ ] Amostragem: o pedido sai com os oito campos `temperature: 0.7`, `top_p: 0.8`, `top_k: 20`, `min_p: 0`, `presence_penalty: 0`, `frequency_penalty: 0`, `repetition_penalty: 1` e `max_tokens: 448`, nas duas funções; `sampling: { topK: 40, maxOutputTokens: 200 }` muda só esses dois; `frequencyPenalty` ou `repetitionPenalty` passados à força não mudam nada (conferir também em `lib/llm/config.ts`) → AC-1, AC-14
- [ ] Faixas aceitas de `sampling`: `temperature: 3`, `topP: 0`, `topK: 0`, `topK: 2.5`, `minP: 1.5`, `presencePenalty: 2.5`, `maxOutputTokens: 9000` ou `0` e `NaN` dão `bad_request` sem tráfego; `temperature: 0`, `topK: -1` e os limites exatos (`topP: 1`, `minP: 1`, `presencePenalty: -2`, `maxOutputTokens: 8192`) chegam ao vLLM → AC-14
- [ ] `LlmCall.sampling`: grava os seis valores efetivos (padrão mais sobrescrita) em sucesso, falha e cancelamento; `null` só quando a faixa foi rejeitada → AC-15
- [ ] `LlmCall.finishReason` e o log `[llm]`: `stop` no caminho feliz; `length` no corte, com e sem streaming; `null` em `timeout` antes de conteúdo, `interrupted` sem `finish`, `circuit_open`, `bad_request` e cancelamento → AC-15
- [x] Limites de usuário e de entrada: 20 chamadas aceitas em 60s com janela deslizante, e as rejeitadas não contam; 24.000 caracteres passam e 24.001 não → AC-8
- [x] Registro de `rate_limited`: no máximo 1 por usuário a cada 60s, e cada usuário tem o próprio controle → AC-10
- [x] Parâmetros do disjuntor: 3 falhas contáveis seguidas abrem por 30s; `invalid_output` e `auth_error` zeram a contagem; rejeições locais e cancelamentos não mexem nela → AC-7
- [x] `configured` / `enabled`: com só parte das três variáveis, `configured: false` e aviso no log; com `LLM_ENABLED=false`, `configured: true` e `enabled: false` → AC-9, AC-12
- [x] `reachable`, `latencyMs`: host fora do ar dá `reachable: false` em até 5s; chave recusada dá `reachable: false` → AC-12
- [x] `circuit`, `activeCalls`, `queuedCalls`: com o disjuntor aberto o status mostra `open`; com chamadas em andamento, os contadores refletem o limitador → AC-12

## Acceptance-criteria coverage

- AC-1: fumaça (json_schema, thinking, usage) · `generate.integration` caminho feliz · sourcing de `data`, `model`, amostragem
- AC-2: fumaça streaming · `stream.integration` caminho feliz e `invalid_output`
- AC-3: `stream.integration` prazos (timeout, parada, teto total, teto do generate, raia de lote)
- AC-4: `protection.integration` novas tentativas · sourcing de `attempts`
- AC-5: fumaça do aborto (GPU liberada) · `stream.integration` cancelamento · `protection.integration` cancelamento na fila
- AC-6: `limiter.test` · `protection.integration` vagas · sourcing do limite de vagas
- AC-7: `circuit-breaker.test` · `protection.integration` disjuntor e ordem das checagens
- AC-8: `user-rate-limit.test` · `protection.integration` limite e entrada
- AC-9: `config.test` · `generate.integration` IA desligada · passos da VPS
- AC-10: registros conferidos em todos os testes de integração · índices vivos no MongoDB
- AC-11: `logging.integration` · `guard.test` (server-only) · passo dos logs na VPS
- AC-12: `app/api/llm/status` route test · fumaça do status · passos manuais e da VPS
- AC-13: `guard.test` (ponto único, instância vllm, ESLint) · passo do ESLint pela linha de comando
- AC-14: `generate.integration` e `stream.integration` (corpo e faixas) · fumaça do `json_schema` (vLLM real aceita os campos) · sourcing da amostragem e das faixas
- AC-15: `generate.integration` e `stream.integration` (corte e `null`) · `protection.integration` (corte zera o disjuntor) · `LlmCall.test` · sourcing de `LlmCall.sampling` e `finishReason`
- AC-16: fumaça da velocidade e da repetição (resultados na linha de contexto do topo)
