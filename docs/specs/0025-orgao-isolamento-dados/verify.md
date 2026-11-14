# Verify: Órgão e isolamento dos dados · spec 0025 · updated 2026-11-14 (fatia 3)

_Passos derivados dos critérios de aceite da spec 0025. O `/check verify` roda estes passos; o `/test` trava os duráveis. Esta versão cobre as fatias 1 (`Chamado` e `User`) 2 (o plugin nos 55 modelos de órgão) e 3 (índices únicos e `Contador` por órgão); as fatias seguintes acrescentam os seus._

## Comandos

- [ ] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/orgaos` → 50 testes passam (contexto, modo, falha fechada, e o teste de banco com dois órgãos) → AC-2, AC-3, AC-4, AC-5, AC-6, AC-8, AC-10, AC-15
- [ ] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npm test` → a suíte inteira passa em `observacao` (padrão do `vitest.config.ts` até a fatia 5) → AC-8
- [x] `npm run typecheck && npm run lint && MONGODB_URI=mongodb://placeholder:27017/build npm run build` → sem erro
- [ ] Rodar `mongosh <banco> < scripts/criar-orgao-1.js` duas vezes → a primeira imprime "criado", a segunda "já existia"; `db.orgaos.find()` mostra um só documento `SJAP` com `_id` `000000000000000000000001` → AC-1
- [x] Num banco novo, `mongosh <banco> < scripts/seed.js` → `db.orgaos.countDocuments({ sigla: 'SJAP' })` é 1 → AC-1

## Fatia 2: o plugin em todos os modelos

- [x] `npx vitest run lib/orgaos/__tests__/varredura-modelos.test.ts` → 4 testes passam: todo modelo de `models/` usa `pluginOrgao` ou é de plataforma, só `Orgao` é de plataforma, e todo modelo de órgão tem `orgaoId` com índice → AC-14
- [ ] Tirar a linha `UnitSchema.plugin(pluginOrgao);` de `models/unit.ts` e rodar a varredura de novo → quebra apontando `Unit`; devolver a linha → AC-14
- [ ] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/orgaos` → 50 testes passam, inclusive "o plugin nos outros modelos": `populate` de uma `Unit` de outro órgão vem `null`, `estimatedDocumentCount` é recusado, e no modelo só de inclusão (`FaixaCompetencia`) a escrita própria não alcança outro órgão e o `deleteOne` segue recusado → AC-4, AC-5, AC-6, AC-15
- [ ] `grep -rnE '\$lookup' app lib` → os dois `$lookup` de código (`app/(dashboard)/dashboard/actions.ts` e `lib/material/relatorio.ts`) são simples e juntam por `foreignField: '_id'`; com `ORGAO_ISOLAMENTO=estrito`, abrir `/dashboard` como técnico e `/relatorios/material` como Admin → as telas carregam sem `OrgaoRecusaError` no log → AC-6
- [ ] Com `ORGAO_ISOLAMENTO=observacao` no banco de hoje, navegar por `/ativos`, `/cotacoes`, `/relatorios/imr`, `/configuracoes/material` e o sino de notificações → tudo como antes, e no log só avisos `[Orgao:observacao]` (um por modelo e operação) → AC-8
- [ ] Criar uma unidade, um ativo e uma notificação em `observacao` → no mongosh, os três saem com `orgaoId: ObjectId('000000000000000000000001')` → AC-8

## Fatia 3: unicidade e numeração por órgão

- [x] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/orgaos` → 69 testes passam, inclusive `orgao-unicidade.db.test.ts` (9 casos) → AC-11, AC-12, AC-15
- [x] `npx vitest run lib/orgaos/__tests__/indices-unicos.test.ts` → 4 testes passam: os 22 índices alvo existem com `orgaoId` na frente, nenhum único de modelo de órgão fica sem órgão fora da lista da spec, nenhum campo tem `unique: true` no path, e o índice da importação de material se chama `uma_aberta_por_tipo_por_orgao` → AC-11
- [ ] Tirar `'Ativo:origemOpId'` da lista `UNICOS_QUE_JA_ISOLAM` e rodar a varredura de novo → quebra apontando `Ativo:origemOpId`; devolver a linha → AC-11
- [ ] Com dois órgãos no banco, cadastrar a mesma matrícula em cada um → aceita; repetir a matrícula no mesmo órgão → recusada (E11000) → AC-11
- [ ] Gravar o mesmo `ticket_number` em dois órgãos → aceito; repetir no mesmo órgão → recusado → AC-11
- [ ] Subir o Next sobre o banco de hoje (com os índices antigos, inclusive `uma_aberta_por_tipo`) → nenhum erro de conflito de índice no log; `db.importacoes_material.getIndexes()` mostra o antigo e o novo `uma_aberta_por_tipo_por_orgao` lado a lado → AC-11
- [ ] Abrir um chamado pelo chat com número já usado (forçar a colisão) → a abertura tenta o próximo número em vez de falhar (o leitor do E11000 em `lib/conversas/abertura.ts` ignora `orgaoId`) → AC-11

## UI / manual

- [ ] Com `ORGAO_ISOLAMENTO=observacao` e o banco de desenvolvimento de hoje (sem `orgaoId`), entrar como `admin` → login funciona, `/gestao` lista os mesmos chamados de antes → AC-8, AC-9
- [ ] Abrir um chamado novo pelo formulário em `observacao` → no mongosh, `db.chamados.findOne({}, { sort: { _id: -1 } }).orgaoId` é `ObjectId('000000000000000000000001')` → AC-8
- [ ] No log do Next em `observacao`, cada par modelo e operação sem órgão aparece uma vez só como `[Orgao:observacao] operação sem órgão: …`, sem filtro nem dado pessoal → AC-8
- [x] Depois do login novo, decodificar a sessão (`/api/auth/session`) → `user.orgaoId` é `000000000000000000000001` → AC-9
- [ ] Com uma sessão aberta antes do deploy (cookie antigo, sem `orgaoId`), recarregar `/dashboard` → continua logado, sem pedir senha → AC-10
- [ ] Com `ORGAO_ISOLAMENTO=estrito` e um `User` sem `orgaoId`, recarregar com a sessão antiga → cai em `/login` → AC-10
- [x] Com `ORGAO_ISOLAMENTO=estritox` (inválido) → o Next registra um `console.error` `[Orgao] ORGAO_ISOLAMENTO com valor inválido` uma vez e se comporta como `estrito` → AC-3

## Value sourcing (a fonte de cada valor)

- [ ] Órgão da leitura na requisição vem do JWT: com dois órgãos no banco (o B criado à mão, um `User` e um `Chamado` em cada), em `estrito`, o usuário do órgão B vê só o chamado do B em `/gestao` e recebe "não encontrado" ao abrir o id do chamado do órgão 1 → AC-2, AC-4
- [x] Login: o `authorize` busca o usuário no órgão 1 (`comOrgao(ORGAO_1_ID)`): em `estrito`, um usuário só do órgão B não consegue entrar → AC-9
- [ ] JWT antigo: o órgão sai do `User.orgaoId` (vale o órgão do `User`, não o 1, quando o `User` é do B) → AC-10
- [ ] Gravação sem contexto em `observacao` sai com o órgão 1 (passo de UI acima) → AC-8
- [ ] Modo do plugin vem de `ORGAO_ISOLAMENTO`, lido uma vez por processo: mudar a variável exige reiniciar o Next → AC-3
- [x] Órgão 1: `_id`, sigla e nome batem com `shared/orgaos/orgao.constants.ts` no banco → AC-1
- [ ] Número do chamado: no órgão 1 o `Contador` segue com `_id` `chamado_<ano>` e continua de onde parou; no órgão B o primeiro chamado sai `CHM-<ano>-00001` e o contador tem `_id` `<orgaoIdB>:chamado_<ano>` e `orgaoId` do B → AC-12
- [ ] Código `MNT`: cadastrar um ativo no órgão B → `MNT-0001`, enquanto o órgão 1 segue do `ativo_mnt` de hoje → AC-12
- [ ] Número da cotação: a primeira cotação de material do órgão B sai `COT-<ano>-0001` → AC-12
- [ ] Contador novo de chamado parte do maior número já gravado no próprio órgão, nunca no outro → AC-12
- [ ] Em `observacao` sem contexto, o contador antigo sem `orgaoId` segue de onde parou (produção de hoje); no banco de desenvolvimento em `estrito`, gerar número falha até a spec 39 preencher o campo → AC-8, AC-12
- [x] Rodada do cron: as voltas saem de `Orgao` com `ativo: true`, em ordem de sigla; com o órgão B marcado `ativo: false`, a resposta não traz a sigla dele → AC-13
- [ ] Resumo do cron: a chave de cada órgão em `porOrgao` é a `sigla`, e a falha aparece como `{ erro }` com o texto fixo, sem a mensagem do erro (que fica só no log) → AC-13
- [ ] Gravação tardia: o órgão é o de quem disparou, lido do JWT no momento do disparo (passo do e-mail e do `LlmCall` abaixo) → AC-13

## Fatia 4: cron por órgão e gravações depois da resposta (adicionado em 14/11/2026)

### Comandos

- [x] `npx vitest run lib/orgaos/__tests__/cron.test.ts` → passa: cada volta roda no próprio órgão, a falha de um não impede o outro, sem órgão ativo responde 500 → AC-13
- [x] `npx vitest run lib/orgaos/__tests__/disparos-tardios.test.ts` → passa: e-mail, aviso de fim aos interessados, os quatro avisos de material, `LlmCall` e o corpo NDJSON da conversa gravam no órgão B mesmo com o `auth()` lançando depois do disparo, e o JWT é lido uma vez só → AC-13, AC-15
- [x] `npx vitest run app/api/cron` → passa, com a resposta no formato `{ ok, porOrgao: { SJAP: ... } }` → AC-13

### Manual (dev, com o órgão 1 criado por `scripts/criar-orgao-1.js`)

- [x] `curl -s -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/sla-monitor` → 200 e `{ "ok": true, "porOrgao": { "SJAP": { ... } } }` → AC-13
- [x] Repetir nas outras 4 rotas (`recurring-tickets`, `encerramento-automatico`, `documentos-vencimento`, `material-conciliacao`) → 200, cada uma com o resumo em `porOrgao.SJAP` → AC-13
- [x] Criar um órgão B ativo à mão no mongosh (`db.orgaos.insertOne({ sigla: 'TESTEB', nome: 'Teste', ativo: true, criadoEm: new Date() })`) e chamar `sla-monitor` → a resposta traz `SJAP` e `TESTEB`, e nada do órgão 1 é escalonado na volta do B → AC-13
- [x] Marcar todos os órgãos `ativo: false` e chamar uma rota → 500 com `{ "ok": false, "porOrgao": {} }` e o log `nenhum órgão ativo` → AC-13
- [ ] Com o SMTP configurado, encerrar um chamado → o e-mail ao solicitante sai e nenhum `[Orgao:observacao]` de `User.findOne` aparece no log por causa dele → AC-13
- [ ] Enviar uma mensagem em `/conversas` com a IA ligada → o `LlmCall` gravado tem o `orgaoId` do usuário logado (`db.llmcalls.find().sort({_id:-1}).limit(1)`) → AC-13

## Fatia 5: travas e suíte em estrito (adicionado em 14/11/2026)

### Comandos

- [x] `npx vitest run lib/orgaos/__tests__/varredura-apis.test.ts` → passa; acrescentar `Model.collection.insertOne(x)` num arquivo de `lib/` faz o teste quebrar apontando arquivo e linha → AC-7, AC-14
- [x] `npm test` (sem `MONGO_TEST_URI`) → tudo passa em `estrito` (`vitest.config.ts` com `ORGAO_ISOLAMENTO: 'estrito'`) → AC-16
- [x] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npm test` → os 57 `*.db.test.ts` passam, no projeto `db` com a sessão simulada do órgão 1 (`tests/setup-db-orgao.ts`) → AC-16
- [x] `npx vitest run lib/orgaos/__tests__/contexto.test.ts -t "segunda cópia"` → passa; prova que duas cópias do `contexto.ts` dividem o mesmo `AsyncLocalStorage` (o login no `estrito` depende disso) → AC-2, AC-9
- [x] Num banco vazio, `mongosh <banco> < scripts/seed.js` e depois `scripts/carga-tipos-documento.js` → toda coleção semeada tem 0 documentos com `orgaoId` diferente do órgão 1; rodar a carga de novo cria 0 → AC-1, AC-16
- [x] `MONGO_TEST_URI=... npx vitest run lib/ativos/__tests__/carga-script.db.test.ts` → a carga do Tier A grava o órgão 1 em categorias, ativos, histórico e contador, e não duplica o ativo antigo sem órgão → AC-16
- [x] E2E num banco próprio, semeado pelo `seed.js`, com o servidor em `ORGAO_ISOLAMENTO=estrito` → passa como na CI (129 de 132 em 14/11/2026, 2 pulados, 1 instável no PDF do IMR do contrato) e o log do servidor não tem `OrgaoAusenteError` → AC-16

### UI / manual

- [x] Servidor local com `ORGAO_ISOLAMENTO=estrito`, banco semeado: entrar como `admin`, `preposto01`, `tecnico01` e `solicitante01` → as quatro entradas funcionam e as telas mostram os dados do seed → AC-9, AC-16
- [ ] Na VPS, depois do deploy: `docker compose exec next-app printenv ORGAO_ISOLAMENTO` → `observacao`; os logs sem "ORGAO_ISOLAMENTO com valor inválido" (seção 2.1 de `DOCKER_PRODUCAO.md`) → AC-3
- [ ] Na VPS, `scripts/criar-orgao-1.js` rodado de novo → não cria nem altera nada → AC-1

## Acceptance-criteria coverage

- AC-1: script e seed (Comandos 4 e 5), constantes (Value sourcing)
- AC-2: teste de banco (JWT e laço com `auth()`), Value sourcing 1
- AC-3: testes do contexto, passo manual do valor inválido
- AC-4, AC-5, AC-6: teste de banco com dois órgãos (`Chamado`, `User`, `Unit`, `FaixaCompetencia`); o plugin está nos 55 modelos de órgão desde a fatia 2
- AC-14: varredura dos modelos (fatia 2) e varredura de APIs proibidas `varredura-apis.test.ts` (fatia 5)
- AC-11: varredura `indices-unicos.test.ts` e o teste de banco `orgao-unicidade.db.test.ts` (fatia 3)
- AC-12: `contador.test.ts`, o teste de banco (órgão 1 seguindo, órgão novo do 1, corrida do primeiro número, `MNT`) e Value sourcing (fatia 3)
- AC-13: `cron.test.ts`, `disparos-tardios.test.ts`, os testes das rotas de cron e os passos manuais da fatia 4
- AC-7: `varredura-apis.test.ts`, com a lista de permitidos e o motivo de cada `comOrgao`/`semOrgao` (fatia 5)
- AC-16: seed, cargas, `global-setup.ts` e fixtures com o órgão 1; Vitest (unit e db) e E2E em `estrito` na CI (fatia 5)
- AC-8: teste de banco (observação) e passos manuais
- AC-9, AC-10: passos manuais da sessão e testes de `dal.test.ts` e do banco
- AC-15: `Chamado`, `User`, unicidade e contador no banco; um teste por tipo de disparo tardio em `disparos-tardios.test.ts` (fatia 4)
