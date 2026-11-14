# Verify: Órgão e isolamento dos dados · spec 0025 · updated 2026-11-14 (fatia 3)

_Passos derivados dos critérios de aceite da spec 0025. O `/check verify` roda estes passos; o `/test` trava os duráveis. Esta versão cobre as fatias 1 (`Chamado` e `User`) 2 (o plugin nos 55 modelos de órgão) e 3 (índices únicos e `Contador` por órgão); as fatias seguintes acrescentam os seus._

## Comandos

- [ ] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/orgaos` → 50 testes passam (contexto, modo, falha fechada, e o teste de banco com dois órgãos) → AC-2, AC-3, AC-4, AC-5, AC-6, AC-8, AC-10, AC-15
- [ ] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npm test` → a suíte inteira passa em `observacao` (padrão do `vitest.config.ts` até a fatia 5) → AC-8
- [ ] `npm run typecheck && npm run lint && MONGODB_URI=mongodb://placeholder:27017/build npm run build` → sem erro
- [ ] Rodar `mongosh <banco> < scripts/criar-orgao-1.js` duas vezes → a primeira imprime "criado", a segunda "já existia"; `db.orgaos.find()` mostra um só documento `SJAP` com `_id` `000000000000000000000001` → AC-1
- [ ] Num banco novo, `mongosh <banco> < scripts/seed.js` → `db.orgaos.countDocuments({ sigla: 'SJAP' })` é 1 → AC-1

## Fatia 2: o plugin em todos os modelos

- [ ] `npx vitest run lib/orgaos/__tests__/varredura-modelos.test.ts` → 4 testes passam: todo modelo de `models/` usa `pluginOrgao` ou é de plataforma, só `Orgao` é de plataforma, e todo modelo de órgão tem `orgaoId` com índice → AC-14
- [ ] Tirar a linha `UnitSchema.plugin(pluginOrgao);` de `models/unit.ts` e rodar a varredura de novo → quebra apontando `Unit`; devolver a linha → AC-14
- [ ] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/orgaos` → 50 testes passam, inclusive "o plugin nos outros modelos": `populate` de uma `Unit` de outro órgão vem `null`, `estimatedDocumentCount` é recusado, e no modelo só de inclusão (`FaixaCompetencia`) a escrita própria não alcança outro órgão e o `deleteOne` segue recusado → AC-4, AC-5, AC-6, AC-15
- [ ] `grep -rnE '\$lookup' app lib` → os dois `$lookup` de código (`app/(dashboard)/dashboard/actions.ts` e `lib/material/relatorio.ts`) são simples e juntam por `foreignField: '_id'`; com `ORGAO_ISOLAMENTO=estrito`, abrir `/dashboard` como técnico e `/relatorios/material` como Admin → as telas carregam sem `OrgaoRecusaError` no log → AC-6
- [ ] Com `ORGAO_ISOLAMENTO=observacao` no banco de hoje, navegar por `/ativos`, `/cotacoes`, `/relatorios/imr`, `/configuracoes/material` e o sino de notificações → tudo como antes, e no log só avisos `[Orgao:observacao]` (um por modelo e operação) → AC-8
- [ ] Criar uma unidade, um ativo e uma notificação em `observacao` → no mongosh, os três saem com `orgaoId: ObjectId('000000000000000000000001')` → AC-8

## Fatia 3: unicidade e numeração por órgão

- [ ] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/orgaos` → 69 testes passam, inclusive `orgao-unicidade.db.test.ts` (9 casos) → AC-11, AC-12, AC-15
- [ ] `npx vitest run lib/orgaos/__tests__/indices-unicos.test.ts` → 4 testes passam: os 22 índices alvo existem com `orgaoId` na frente, nenhum único de modelo de órgão fica sem órgão fora da lista da spec, nenhum campo tem `unique: true` no path, e o índice da importação de material se chama `uma_aberta_por_tipo_por_orgao` → AC-11
- [ ] Tirar `'Ativo:origemOpId'` da lista `UNICOS_QUE_JA_ISOLAM` e rodar a varredura de novo → quebra apontando `Ativo:origemOpId`; devolver a linha → AC-11
- [ ] Com dois órgãos no banco, cadastrar a mesma matrícula em cada um → aceita; repetir a matrícula no mesmo órgão → recusada (E11000) → AC-11
- [ ] Gravar o mesmo `ticket_number` em dois órgãos → aceito; repetir no mesmo órgão → recusado → AC-11
- [ ] Subir o Next sobre o banco de hoje (com os índices antigos, inclusive `uma_aberta_por_tipo`) → nenhum erro de conflito de índice no log; `db.importacoes_material.getIndexes()` mostra o antigo e o novo `uma_aberta_por_tipo_por_orgao` lado a lado → AC-11
- [ ] Abrir um chamado pelo chat com número já usado (forçar a colisão) → a abertura tenta o próximo número em vez de falhar (o leitor do E11000 em `lib/conversas/abertura.ts` ignora `orgaoId`) → AC-11

## UI / manual

- [ ] Com `ORGAO_ISOLAMENTO=observacao` e o banco de desenvolvimento de hoje (sem `orgaoId`), entrar como `admin` → login funciona, `/gestao` lista os mesmos chamados de antes → AC-8, AC-9
- [ ] Abrir um chamado novo pelo formulário em `observacao` → no mongosh, `db.chamados.findOne({}, { sort: { _id: -1 } }).orgaoId` é `ObjectId('000000000000000000000001')` → AC-8
- [ ] No log do Next em `observacao`, cada par modelo e operação sem órgão aparece uma vez só como `[Orgao:observacao] operação sem órgão: …`, sem filtro nem dado pessoal → AC-8
- [ ] Depois do login novo, decodificar a sessão (`/api/auth/session`) → `user.orgaoId` é `000000000000000000000001` → AC-9
- [ ] Com uma sessão aberta antes do deploy (cookie antigo, sem `orgaoId`), recarregar `/dashboard` → continua logado, sem pedir senha → AC-10
- [ ] Com `ORGAO_ISOLAMENTO=estrito` e um `User` sem `orgaoId`, recarregar com a sessão antiga → cai em `/login` → AC-10
- [ ] Com `ORGAO_ISOLAMENTO=estritox` (inválido) → o Next registra um `console.error` `[Orgao] ORGAO_ISOLAMENTO com valor inválido` uma vez e se comporta como `estrito` → AC-3

## Value sourcing (a fonte de cada valor)

- [ ] Órgão da leitura na requisição vem do JWT: com dois órgãos no banco (o B criado à mão, um `User` e um `Chamado` em cada), em `estrito`, o usuário do órgão B vê só o chamado do B em `/gestao` e recebe "não encontrado" ao abrir o id do chamado do órgão 1 → AC-2, AC-4
- [ ] Login: o `authorize` busca o usuário no órgão 1 (`comOrgao(ORGAO_1_ID)`): em `estrito`, um usuário só do órgão B não consegue entrar → AC-9
- [ ] JWT antigo: o órgão sai do `User.orgaoId` (vale o órgão do `User`, não o 1, quando o `User` é do B) → AC-10
- [ ] Gravação sem contexto em `observacao` sai com o órgão 1 (passo de UI acima) → AC-8
- [ ] Modo do plugin vem de `ORGAO_ISOLAMENTO`, lido uma vez por processo: mudar a variável exige reiniciar o Next → AC-3
- [ ] Órgão 1: `_id`, sigla e nome batem com `shared/orgaos/orgao.constants.ts` no banco → AC-1
- [ ] Número do chamado: no órgão 1 o `Contador` segue com `_id` `chamado_<ano>` e continua de onde parou; no órgão B o primeiro chamado sai `CHM-<ano>-00001` e o contador tem `_id` `<orgaoIdB>:chamado_<ano>` e `orgaoId` do B → AC-12
- [ ] Código `MNT`: cadastrar um ativo no órgão B → `MNT-0001`, enquanto o órgão 1 segue do `ativo_mnt` de hoje → AC-12
- [ ] Número da cotação: a primeira cotação de material do órgão B sai `COT-<ano>-0001` → AC-12
- [ ] Contador novo de chamado parte do maior número já gravado no próprio órgão, nunca no outro → AC-12
- [ ] Em `observacao` sem contexto, o contador antigo sem `orgaoId` segue de onde parou (produção de hoje); no banco de desenvolvimento em `estrito`, gerar número falha até a spec 39 preencher o campo → AC-8, AC-12
- [ ] Rodada do cron, resumo por sigla e gravação tardia: fora desta fatia (fatia 4)

## Acceptance-criteria coverage

- AC-1: script e seed (Comandos 4 e 5), constantes (Value sourcing)
- AC-2: teste de banco (JWT e laço com `auth()`), Value sourcing 1
- AC-3: testes do contexto, passo manual do valor inválido
- AC-4, AC-5, AC-6: teste de banco com dois órgãos (`Chamado`, `User`, `Unit`, `FaixaCompetencia`); o plugin está nos 55 modelos de órgão desde a fatia 2
- AC-14: varredura dos modelos (fatia 2); a varredura de APIs proibidas é da fatia 5
- AC-11: varredura `indices-unicos.test.ts` e o teste de banco `orgao-unicidade.db.test.ts` (fatia 3)
- AC-12: `contador.test.ts`, o teste de banco (órgão 1 seguindo, órgão novo do 1, corrida do primeiro número, `MNT`) e Value sourcing (fatia 3)
- AC-7, AC-13, AC-16: fatias 4 e 5
- AC-8: teste de banco (observação) e passos manuais
- AC-9, AC-10: passos manuais da sessão e testes de `dal.test.ts` e do banco
- AC-15: parcial, `Chamado`, `User`, unicidade e contador (os disparos tardios são da fatia 4)
