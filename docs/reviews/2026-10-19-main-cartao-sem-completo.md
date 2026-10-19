# Review, main (uncommitted), 2026-10-19

**Reviewed by**: Sonnet 5.5 (autor na mesma família, revisão sem editar código)
**Scope**: 3 arquivos, uncommitted
**Verdict**: Approve with nits

## Summary

A mudança tira o `completo` do modelo da decisão de gravar o cartão: agora basta serviço válido e `localExato` preenchido. É a decisão que o usuário escolheu, e o código a implementa de forma limpa, com uma função só alterada e sem outro chamador de `propostaProntaParaCartao` ou leitor de `completo` fora do log, da gravação e do schema. Não achei bug nem blocker. Os pontos abaixo são de documentação que ficou velha, de risco de produto que vale registrar e de pequenas lacunas de teste. `npx vitest run lib/assistente` passa (243 testes, 61 pulados por falta de Mongo).

## Minor

### 🟡 Comentários e docs ainda dizem que o cartão exige proposta "completa", `lib/assistente/responder.ts:337`

**Problem**: o comentário do bloco diz "a proposta está pronta (completa, serviço válido, local)". O mesmo vale para `lib/assistente/AGENTS.md` ("quando ela está completa (serviço válido, local preenchido)") e para o AGENTS.md da raiz. A spec 0004 (AC-4 e a linha "decidir se grava cartão") também ainda cita `completo`.
**Why it matters**: o próximo leitor vai achar que o `completo` decide o cartão e pode "consertar" de volta. A spec já está marcada para o /sync, mas o comentário do código e o AGENTS.md são do mesmo commit.
**Suggested fix**: ajustar o comentário de `responder.ts:337` e a frase do AGENTS.md do assistente para "serviço válido e local". Deixar a spec para o /sync, anotando o desvio do AC-4.

### 🟡 O modelo pode continuar perguntando enquanto o cartão aparece, `lib/assistente/prompt.ts:34`

**Problem**: o prompt manda perguntar "só sobre o que falta" e define `completo` como "sabe serviço e local e nada importante falta". Quando o modelo diz `completo: false` (o caso do Qwen sem unidade no perfil), a resposta em texto tende a trazer uma pergunta, e o cartão aparece junto com o resumo para confirmar.
**Why it matters**: a conversa fica com um cartão pronto e uma pergunta pendente. Não quebra nada (a pessoa pode confirmar ou responder, e o cartão é trocado se o local mudar), mas é confuso e foi o sintoma original visto de outro ângulo.
**Suggested fix**: aceitar como está se o usuário já viu isso no teste real; senão, considerar em outra mudança um ajuste do prompt (com `PROMPT_VERSION` novo e a calibração refeita, ver AGENTS.md). Não fazer agora.

### 🟡 Cartão pode aparecer no primeiro turno com local vago, e girar a cada reformulação, `lib/assistente/proposta.ts:187`

**Problem**: qualquer `localExato` não vazio (por exemplo "no prédio", "banheiro") com serviço válido já grava o cartão. O `completo` era o único filtro de qualidade do local. Se o modelo reescreve o local a cada turno, `mesmoConteudo` muda e cada turno gera cartão novo, deixando os antigos como "Substituído" (`responder.ts:428` a `462`).
**Why it matters**: ruído na conversa e, no fim, chamado confirmado com local fraco. O portão de confiança (`lib/assistente/portao.ts`) olha só a confiança de prioridade e o modo `ia`, então um chamado com local vago e boa confiança nasce `validado` e pode ser atribuído sozinho ao técnico (spec 0008). Quem confere o local é a pessoa no cartão, que é editável, então o risco é aceitável e coerente com a decisão tomada.
**Suggested fix**: nada a mudar agora. Registrar na spec (no /sync) que o local vago passou a ser responsabilidade da pessoa. Se aparecer reclamação, um filtro por tamanho mínimo do local é uma saída barata.

### 🟡 Campo `completo` ficou só como dado morto, `lib/assistente/proposta.ts:85`

**Problem**: `completo` segue no schema, em `PropostaIa` (`lib/conversas/proposta-store.ts`, `models/Conversa.ts:64`) e no log, mas nada decide por ele. Conferi `lib/ia-confianca` e `confirmar.ts`: nenhum lê `completo`, então calibração e `DecisaoIa` não mudam.
**Why it matters**: só manutenção (custo de carregar um campo sem uso). O log `completo` ainda é útil para medir a divergência do modelo.
**Suggested fix**: manter, e dizer no comentário do campo (ou na spec) que é só diagnóstico.

## Nits

- ⚪ `lib/assistente/__tests__/responder.test.ts:753`, o teste "invalida o cartão quando o serviço deixa de ser reconhecido" trocou o cenário de "serviço muda para outro" por "serviço some". Vale conferir que a troca de serviço A para B com local presente (que agora gera cartão novo com `substituiId`) tem teste próprio; o db test `abertura-chat.db.test.ts:376` cobre só a troca sem local.
- ⚪ `lib/assistente/__tests__/responder.test.ts:1045`, os comentários "proposta incompleta" nos testes de equipamento e duplicados já não descrevem o cenário (agora é "sem serviço"). Ajustar o texto.
- ⚪ `lib/assistente/__tests__/responder.test.ts:787`, o título "mesmo com serviço e completo" pode virar "mesmo com serviço", já que `completo` não importa mais.
- ⚪ Falta um teste do inverso: `completo: true` com `localExato` nulo já existe (linha 787), mas não há teste de `propostaProntaParaCartao` direto em `proposta` (teste unitário simples da função, três linhas).

## Strengths

- Mudança mínima e no lugar certo: uma função pura, sem tocar em `responder.ts`, `cartao.ts` nem `confirmar.ts`, e o comentário novo explica o porquê (o comportamento do Qwen).
- O teste novo "grava cartão com serviço e local mesmo quando o modelo diz que não está completo" reproduz o bug de produção e falharia no código antigo.
- O ramo manual/`mantido`/`invalidado` e as chaves de ativo e duplicados continuam coerentes, porque todos já dependiam só de `pronta`; `PROMPT_VERSION` corretamente não mudou, pois o prompt não mudou.

## Test coverage

Vitest em `lib/assistente` passa. O caso novo cobre o bug. Os testes que usavam `completo: false` como "não pronta" foram migrados para `servico: null` com cartão manual, o que preserva a intenção (ramo não pronta) mas deixa de exercitar "serviço válido, sem local" nos grupos de equipamento e duplicados; o caso sem local aparece só nos testes de `responder` (linha 787) e no db test (pulado sem `MONGO_TEST_URI`, não rodei). Falta apenas um teste unitário direto da função alterada.
