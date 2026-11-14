# 0025. Órgão e isolamento dos dados

**Date**: 2026-11-14
**Status**: In Progress

## Summary

O Sigma vai atender vários órgãos do Judiciário na mesma instalação, e nenhum órgão pode ver dado de outro (LGPD). Esta spec decide que todo documento ganha um campo `orgaoId` e que um plugin do Mongoose (um gancho que roda antes de cada consulta) põe o filtro do órgão em toda leitura e carimba o órgão em toda gravação, sem mexer nas cerca de 1000 consultas que já existem. O órgão vem da sessão de quem está logado; fora de uma requisição (cron, scripts, login), o código diz o órgão de forma explícita, e sem órgão conhecido a consulta falha em vez de devolver tudo. Até a spec da migração (39) preencher os dados de hoje, a produção roda em modo observação: carimba e registra, mas ainda não filtra.

## Requirements

**User stories**:

- Como servidor de um órgão, quero ver só os chamados, ativos e cotações do meu órgão, para que nada meu apareça para outro órgão.
- Como Admin de um órgão, quero que número de chamado, matrícula, número de contrato e código `MNT` sejam únicos só dentro do meu órgão, para cadastrar sem esbarrar nos números de outro.
- Como mantenedor do Sigma, quero que uma consulta nova sem órgão quebre um teste ou dê erro, para que um esquecimento nunca vire vazamento.
- Como quem usa o Sigma hoje (órgão 1), quero continuar trabalhando sem perceber a troca.

**Acceptance criteria**:

Órgão e contexto

- **AC-1**: Existe a coleção `orgaos` (`Orgao`: `sigla` única em maiúsculas, `nome`, `ativo`, `criadoEm`). O órgão 1 é `SJAP`, "Seção Judiciária do Amapá", com o `_id` fixo `000000000000000000000001` (`ORGAO_1_ID`), criado por script idempotente (rodar de novo não duplica nem altera) e pelo `scripts/seed.js`.
- **AC-2**: O órgão de cada operação sai, nesta ordem: o `comOrgao(orgaoId, fn)` ou `semOrgao(motivo, fn)` em volta da chamada; senão, o `orgaoId` do JWT da requisição; senão, nenhum. `comOrgao` dentro de outro `comOrgao` com órgão diferente lança erro. Resolver o órgão pela sessão só lê o JWT por `auth()`, nunca consulta o banco e nunca passa pelo `verifySession`. Toda leitura de banco dentro dos callbacks do NextAuth (`authorize`, `jwt`, `session`) roda em `comOrgao` ou `semOrgao`, então o plugin nunca chama `auth()` de dentro de um `auth()`.
- **AC-3**: `ORGAO_ISOLAMENTO` aceita `observacao` ou `estrito`. Ausente, vazia ou com valor inválido vale `estrito`, e o valor inválido gera um `console.error` na primeira leitura.

Modo estrito

- **AC-4**: Em `estrito`, `find`, `findOne`, `findById`, `exists`, `countDocuments`, `distinct`, `populate` e `aggregate` de qualquer modelo de órgão só enxergam documentos do órgão do contexto. O filtro entra sempre como `$and: [{ orgaoId }, filtroOriginal]`, então um filtro do chamador com `orgaoId` de outro órgão devolve vazio. Pedir pelo id um documento de outro órgão devolve `null` (no `populate`, a referência vem `null`), e a tela ou rota responde como hoje responde a "não encontrado", sem consulta extra e sem registro.
- **AC-5**: Em `estrito`, `create`, `save` de documento novo, `insertMany`, as inserções de `bulkWrite` e todo `upsert` gravam o `orgaoId` do contexto. Informar outro `orgaoId` lança erro. Atualização (`updateOne`, `updateMany`, `findOneAndUpdate`, `replaceOne`, `save` de documento existente) que muda ou remove `orgaoId` lança erro. Atualização e remoção só alcançam documentos do órgão do contexto.
- **AC-6**: Em `estrito`, operação em modelo de órgão sem órgão conhecido lança `OrgaoAusenteError` (com modelo e operação, sem dado pessoal) e não chega ao banco. `estimatedDocumentCount` é recusado sempre. `aggregate` é recusado quando tem `$unionWith`, `$graphLookup`, `$out`, `$merge`, `$geoNear`, `$search` ou `$vectorSearch`; quando tem `$lookup` simples (`localField`/`foreignField`) cujo `foreignField` não é `_id`; ou quando tem `$lookup` com `pipeline` cujo primeiro estágio não é um `$match` com `orgaoId`.
- **AC-7**: Dentro de `semOrgao(motivo, fn)` o plugin não filtra nem carimba. Só os arquivos da lista de permitidos da varredura (AC-14) chamam `semOrgao` ou `comOrgao`, cada um com o motivo escrito.

Modo observação

- **AC-8**: Em `observacao`, nenhuma leitura recebe filtro e o órgão 1 funciona exatamente como hoje. Gravação nova é carimbada com o órgão do contexto, ou com `ORGAO_1_ID` quando não há contexto. Cada operação sem contexto gera um `console.warn` `[Orgao:observacao]` com modelo e operação, uma vez por par por processo. As regras de recusa do AC-5 (trocar `orgaoId`) e do AC-6 (estágios proibidos) valem também aqui.

Sessão

- **AC-9**: O login grava o `orgaoId` do usuário no JWT, e até a spec 41 o `authorize` roda dentro de `comOrgao(ORGAO_1_ID)`. `verifySession` devolve `orgaoId` e a checagem do usuário no banco já sai filtrada por ele, então usuário de outro órgão vale como deslogado.
- **AC-10**: JWT sem `orgaoId` (sessão aberta antes da troca) é completado no callback `jwt` lendo o `User` uma vez dentro de `semOrgao`. Sem `orgaoId` no `User`: em `observacao` usa `ORGAO_1_ID`; em `estrito` a sessão vale como deslogada. Quem está logado no órgão 1 não precisa entrar de novo.

Unicidade

- **AC-11**: Os índices únicos de valor de negócio (lista em _Índices alvo_) passam a valer por órgão: o mesmo número de chamado, matrícula, número de contrato, código `MNT`, número de cotação e de empenho podem existir em dois órgãos, e repetir dentro do mesmo órgão continua recusado. Os índices antigos seguem no banco até a spec 39 fazer a remoção, então na produção de hoje nada muda.
- **AC-12**: A sequência dos números (`Contador`) é por órgão: o órgão 1 continua com os mesmos `_id` de hoje (`chamado_2026`, `ativo_mnt`) e segue a numeração de onde parou; os outros órgãos usam `<orgaoId>:<chave>`, sempre por `idDoContador(orgaoId, chave)`. O `findOneAndUpdate` do contador acha o documento pelo `_id` e passa pelo plugin como qualquer outro: o `upsert` grava o `orgaoId` por `$setOnInsert`, e a spec 39 preenche o campo nos contadores antigos.

Fora da requisição

- **AC-13**: Cada rota de `/api/cron/*` roda a rodada por `paraCadaOrgaoAtivo(fn)`, um órgão ativo por vez, cada um dentro de `comOrgao`. A falha de um órgão é registrada e não impede os outros, e a resposta resume o resultado por sigla, sem dado pessoal. O status HTTP é 200 quando todos os órgãos rodaram e 500 quando algum falhou ou quando não há órgão ativo. Todo disparo sem `await` que pode tocar o banco depois da resposta (o `LlmCall` do fim da chamada à IA, avisos, e-mails e o que mais a fatia 4 achar) captura `contextoAtual()` antes de disparar e grava dentro de `comOrgao`.

Travas

- **AC-14**: Um teste Vitest importa todo arquivo de `models/` e quebra se algum modelo não usa `pluginOrgao` nem está marcado como de plataforma (`marcarPlataforma`, hoje só `Orgao`). Outro teste procura no código de `app/`, `lib/`, `models/` e `auth.ts` os usos de `.collection.`, `connection.db`, `estimatedDocumentCount`, `$unionWith`, `$graphLookup`, `$out`, `$merge`, `'use cache'`, `unstable_cache`, `comOrgao(` e `semOrgao(`, e quebra com qualquer uso fora da lista de permitidos com motivo. As duas varreduras ignoram `__tests__/` e `*.test.ts`.
- **AC-15**: Um `*.db.test.ts` no MongoDB real grava dados em dois órgãos e prova, operação por operação (as do AC-4 e do AC-5, mais `populate`, `$lookup` simples, `bulkWrite`, `upsert` e os `deleteOne`/`updateOne` de documento), que nada cruza; prova também o AC-6, o AC-11, a corrida do primeiro número de um órgão novo no `Contador`, e que o plugin não entra em laço com o `auth()`. Um teste por tipo de disparo tardio (AC-13) prova que ele grava no órgão de quem disparou.
- **AC-16**: `scripts/seed.js`, as cargas em mongosh (`carga-tipos-documento.js`, o gerado por `gerar-carga-ativos.ts`), o `e2e/global-setup.ts` e as fixtures do E2E gravam `orgaoId: ORGAO_1_ID`. A suíte unitária, os 55 testes de banco e o E2E passam com `ORGAO_ISOLAMENTO=estrito`.

## Decision

**Chosen option**: Option 1: campo `orgaoId` em coleções compartilhadas, com plugin do Mongoose e órgão resolvido pela sessão.

Todo modelo de órgão recebe `orgaoId` e o `pluginOrgao`, que filtra e carimba sozinho; o órgão vem do JWT dentro da requisição e de `comOrgao` fora dela; sem órgão, falha fechada; a produção entra em `observacao` até a spec 39 e passa a `estrito` depois.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Standard definition

**Canonical pattern** (código de negócio não muda; o órgão chega sozinho):

```ts
// Server Action, rota ou Server Component: nada novo. O plugin lê o órgão do JWT.
const chamado = await ChamadoModel.findById(id).lean(); // null se for de outro órgão

// Fora de requisição (cron, script, login): o órgão é explícito.
await paraCadaOrgaoAtivo(async (orgao) => {
  await processarRecorrentes(); // roda dentro de comOrgao(orgao._id)
});

// Modelo novo em models/: sempre com o plugin.
const XSchema = new Schema({ /* campos */ });
XSchema.plugin(pluginOrgao); // acrescenta orgaoId, índice e ganchos
```

**Replaces**:

- Consulta sem órgão em modelo de órgão (passa a filtrar sozinha, ou a falhar fora de contexto).
- Índice único de valor de negócio sem `orgaoId`.
- `_id` de `Contador` montado à mão (`` `chamado_${ano}` ``): passa por `idDoContador`.
- Acesso direto à coleção (`Model.collection`, `mongoose.connection.db`) e `estimatedDocumentCount`.

**Enforcement**: as duas varreduras do AC-14 (Vitest, rodam na CI no job de testes unitários) e o teste de banco do AC-15. Em produção, a falha fechada do modo `estrito` (AC-6).

**Rollout**: em fatias (ver _Build plan_). A produção sobe com `ORGAO_ISOLAMENTO=observacao` no `.env` da VPS; desenvolvimento, testes e E2E rodam `estrito` desde a primeira fatia. A spec 39 preenche os dados, remove os índices antigos e troca a VPS para `estrito`.

**Exceptions**: modelos de plataforma marcados com `marcarPlataforma` (hoje só `Orgao`; a spec 40 acrescenta a trilha do Gestor da plataforma) e as chamadas `semOrgao`/`comOrgao` da lista de permitidos, cada uma com motivo.

## Feature design

**Data model sketch**:

| Entidade | Campos | Regras |
| --- | --- | --- |
| `Orgao` (coleção `orgaos`, plataforma) | `_id` ObjectId · `sigla` string obrigatória, maiúsculas, `trim` · `nome` string obrigatória · `ativo` boolean, padrão `true` · `criadoEm` Date | `sigla` única. Sem `orgaoId`. Cadastro e tela ficam com a spec 40 |
| Todo modelo de órgão (os outros 57 de `models/`, inclusive filhos como `ChamadoHistory`, `ChamadoComment`, `Attachment`, `PauseLog`, `CotacaoMaterialEvento`, `Notification`, `LlmCall`, `Contador`, `SinapiInsumo`, `SinapiReferencia`) | `orgaoId` ObjectId, `ref: 'Orgao'`, obrigatório, imutável | Acrescentado pelo `pluginOrgao` com índice `{ orgaoId: 1 }`. Relação N:1 com `Orgao`. Nunca muda depois de gravado |

Os campos `required` só valem para gravações: documentos antigos sem `orgaoId` seguem legíveis em `observacao` até a spec 39 preencher o campo. Os modelos só de inclusão (`models/_somente-inclusao.ts`) recebem o plugin como os outros.

**Índices alvo** (únicos de valor de negócio; ganham `orgaoId` na frente e mantêm as opções de hoje, como `partialFilterExpression` e `collation`):

| Modelo | Hoje | Alvo |
| --- | --- | --- |
| `Chamado` | `ticket_number` | `{ orgaoId, ticket_number }` |
| `User` | `username` | `{ orgaoId, username }` |
| `Contrato` | `numeroNormalizado` | `{ orgaoId, numeroNormalizado }` |
| `Ativo` | `codigo` | `{ orgaoId, codigo }` |
| `CotacaoMaterial` | `numero` | `{ orgaoId, numero }` |
| `Empenho` | `numero` | `{ orgaoId, numero }` |
| `ServiceType` | `name` | `{ orgaoId, name }` |
| `ServiceCatalog` | `code` | `{ orgaoId, code }` |
| `SlaConfig` | `priority` | `{ orgaoId, priority }` |
| `Holiday` | `{ date, scope }` | `{ orgaoId, date, scope }` |
| `Localizacao` | `{ parentId, nome }` (parcial, ativos) | `{ orgaoId, parentId, nome }` |
| `TipoDocumento` | `chave` · `nome` | `{ orgaoId, chave }` · `{ orgaoId, nome }` |
| `CategoriaAtivo` | `chave` · `nome` | `{ orgaoId, chave }` · `{ orgaoId, nome }` |
| `MaterialConfig` | `chave` | `{ orgaoId, chave }` |
| `IaAutonomiaConfig` | `chave` | `{ orgaoId, chave }` |
| `SinapiReferencia` | `referencia` | `{ orgaoId, referencia }` |
| `SinapiInsumo` | `{ referencia, codigo }` | `{ orgaoId, referencia, codigo }` |
| `CampanhaVistoria` | `status` (parcial, `aberta`) | `{ orgaoId, status }` |
| `ImportacaoPatrimonial` | `emAberto` (parcial) | `{ orgaoId, emAberto }` |
| `ImportacaoMaterial` | `tipo` (parcial, `emAberto`) | `{ orgaoId, tipo }` |

Os outros índices únicos de `models/` ficam como estão, porque a chave já é um id de documento de órgão (que só existe num órgão) ou um identificador aleatório:

| Modelo | Índice único mantido | Por que já isola |
| --- | --- | --- |
| `ServiceSubType` | `{ typeId, name }` | `typeId` é de um órgão |
| `DocumentoAtivo` | `{ tipo, ativoId }` · `{ tipo, localizacaoId }` (parciais, vigente) | `ativoId`/`localizacaoId` são de um órgão |
| `DecisaoIa` | `{ chamadoId, campo }` | `chamadoId` |
| `Conversa` | `chamadoId` (parcial) | `chamadoId` |
| `Chamado` | `conversaId` (parcial) | `conversaId` |
| `Cotacao` | `pauseLogId` · `chamadoId` (parcial, enviada) | ids de um órgão |
| `CotacaoMaterial` | `chamadoId` (parcial, em trâmite) | `chamadoId` |
| `ChamadoInteressado` | `{ chamadoId, userId }` | ids de um órgão |
| `SlaEscalation` | `{ chamadoId, type }` | `chamadoId` |
| `ConferenciaVistoria` | `{ campanhaId, ativoId }` · `clientOpId` | ids de um órgão · UUID do celular |
| `Ativo` | `origemOpId` (parcial) | UUID da operação |
| `ImrFechamento` · `ImrReabertura` · `AnexoVItem` · `AnexoVVigencia` | chaves com `contratoId` | `contratoId` |

Os índices não únicos (inclusive os TTL de `Notification` e `LlmCall`) ficam como estão nesta spec.

**Módulos novos**:

| Onde | O que |
| --- | --- |
| `shared/orgaos/orgao.constants.ts` | `ORGAO_1_ID`, `ORGAO_1_SIGLA`, `ORGAO_1_NOME` |
| `models/Orgao.ts` | o modelo, com `marcarPlataforma` |
| `lib/orgaos/contexto.ts` (`server-only`) | `comOrgao`, `semOrgao`, `contextoAtual()` (AsyncLocalStorage, depois o JWT por `auth()` memoizado com `cache` do React; erro de "fora da requisição" vale como sem contexto), `modoIsolamento()`, `OrgaoAusenteError` |
| `lib/orgaos/plugin.ts` | `pluginOrgao(schema)` e `marcarPlataforma(schema)`. Ganchos `pre` assíncronos (Mongoose 9, sem `next()`): consultas (`find`, `findOne`, `countDocuments`, `distinct`, `estimatedDocumentCount`, `updateOne`, `updateMany`, `deleteOne`, `deleteMany`, `findOneAndUpdate`, `findOneAndDelete`, `findOneAndReplace`, `replaceOne`), `aggregate` (`pipeline().unshift({ $match: { orgaoId } })` e checagem dos estágios), `save`, `insertMany`, `bulkWrite`, e os `updateOne`/`deleteOne` de documento. No Mongoose, `deleteOne` e `updateOne` têm gancho de consulta e gancho de documento registrados à parte (`{ document: true, query: false }` e o contrário); os dois são registrados. Antes do build, conferir na documentação do Mongoose 9 o `this` e as opções de cada gancho, e se `exists` passa pelo gancho de `findOne` (para não filtrar duas vezes) |
| `lib/orgaos/contador.ts` | `idDoContador(orgaoId, chave)` |
| `lib/orgaos/cron.ts` | `paraCadaOrgaoAtivo(fn)` (lê `Orgao` com `ativo: true`, por `sigla`) |
| `scripts/criar-orgao-1.js` | mongosh idempotente: `updateOne({ _id: ORGAO_1_ID }, { $setOnInsert: {...} }, { upsert: true })` |
| `tests/orgao-test-env.ts` | apoio dos testes de banco: `comOrgaoDeTeste` e a criação de dois órgãos |

**API surface**: nenhuma rota ou Server Action nova. A superfície são as funções acima e as mudanças em:

| Ponto | Mudança |
| --- | --- |
| `auth.ts` `authorize` | roda dentro de `comOrgao(ORGAO_1_ID)` até a spec 41; devolve `orgaoId` |
| `auth.ts` callbacks `jwt` e `session` | levam `orgaoId`; completam token antigo (AC-10) |
| `lib/dal.ts` `SessionLike` | ganha `orgaoId: string` |
| `app/api/cron/*/route.ts` (5 rotas) | corpo dentro de `paraCadaOrgaoAtivo`; resposta `{ ok, porOrgao: { [sigla]: resumo \| { erro } } }` |
| `lib/chamado-utils.ts` e o gerador `MNT` | `_id` por `idDoContador` |
| `lib/llm/call-log.ts` (e outros disparos tardios achados na fatia 4) | capturam `contextoAtual()` no início e gravam em `comOrgao` |

**Value sourcing**:

| Ação | Valor | Fonte |
| --- | --- | --- |
| Toda leitura e gravação na requisição | órgão do filtro e do carimbo | `orgaoId` do JWT, pelo `auth()` |
| Login (`authorize`) | órgão do usuário buscado e do provisionado pelo LDAP | `ORGAO_1_ID` até a spec 41, que decide a descoberta |
| JWT novo | `orgaoId` | `User.orgaoId` lido no `authorize` |
| JWT antigo | `orgaoId` | `User.orgaoId` lido no callback `jwt`; em `observacao` e sem campo, `ORGAO_1_ID` |
| Rodada do cron | órgão de cada volta | `Orgao` com `ativo: true`, ordenado por `sigla` |
| Gravação sem contexto em `observacao` | `orgaoId` | `ORGAO_1_ID` |
| Modo do plugin | `observacao` ou `estrito` | `ORGAO_ISOLAMENTO`, lido uma vez por processo |
| Número do chamado e código `MNT` | sequência | `Contador` com `_id` de `idDoContador(orgaoId, chave)` |
| Resumo do cron por órgão | rótulo | `Orgao.sigla` |
| Resposta do cron | status HTTP | 200 se todos rodaram; 500 se algum falhou ou a lista veio vazia |
| Aviso (`Notification`, e-mail) | destinatários | `User.find` pelo papel, já filtrado pelo órgão do contexto |
| Gravação tardia (`LlmCall`, aviso sem `await`) | `orgaoId` | `contextoAtual()` capturado antes do disparo |
| Órgão 1 | `_id`, `sigla`, `nome` | constantes de `shared/orgaos/orgao.constants.ts` |

**Key invariants**:

- Em `estrito`, nenhuma operação num modelo de órgão chega ao banco sem órgão no filtro ou no documento, salvo dentro de `semOrgao`.
- `orgaoId` nunca muda depois de gravado.
- Um documento só referencia documentos do mesmo órgão. Isso decorre do filtro (quem grava só enxerga ids do próprio órgão). O `$lookup` simples só herda essa garantia quando junta por `_id` (por isso o AC-6 recusa outro `foreignField`); o `$lookup` com `pipeline` precisa do `$match` próprio. Os 3 `$lookup` de hoje (`dashboard/actions.ts`, `lib/material/relatorio.ts` e o comentário de `atribuicao-automatica.ts`) são conferidos na fatia 2.
- Nenhuma função cacheada entre requisições (`'use cache'`, `unstable_cache`) lê modelo de órgão; a varredura recusa as duas.
- Arquivos de `data/uploads/` só saem depois de carregar o documento pai (chamado, documento do ativo, cotação), então herdam o isolamento sem mudar de pasta.
- A memoização da resolução nunca atravessa requisições (React `cache` é por requisição; onde ele não memoiza, como nas rotas, o `auth()` roda de novo, sem ir ao banco).

**Security model**:

- Escopo LGPD: chamados, usuários (nome, matrícula, e-mail), ativos com responsável patrimonial e custos. O isolamento é a barreira principal entre órgãos; os perfis de hoje (Admin, Preposto, Técnico, Solicitante) passam a valer dentro do órgão.
- O Admin de um órgão é Admin só do seu órgão. O papel acima dele (Gestor da plataforma) é da spec 40, que define a sessão sem órgão e garante que ela nunca leia modelo de órgão; com esta spec, essa sessão já cai em `OrgaoAusenteError`.
- Erros e avisos do plugin registram modelo, operação e órgão, nunca filtro, documento ou dado pessoal.
- Id de outro órgão responde como inexistente, sem confirmar que existe.
- Riscos aceitos até as specs seguintes, só porque há um único órgão até a 49: os eventos do Socket.IO seguem com salas globais (a sala `managers` cruzaria órgãos) até a spec 42; um token continua valendo por até 7 dias depois de o órgão ser desativado até a spec 40 conferir `Orgao.ativo` no `verifySession`; e enquanto a VPS estiver em `observacao` não há isolamento real, por isso a spec 40 recusa no código o cadastro de um segundo órgão nesse modo.

**Configuration required**:

- `ORGAO_ISOLAMENTO`: `observacao` ou `estrito` (padrão `estrito`). Na VPS, `observacao` no `.env` e repassada no `docker-compose.yml` para o `next-app` até a spec 39. Entra em `.env.example` e `.env.production.example`.

**Critical test scenarios**:

- Caminho feliz: dois órgãos com chamados de mesmo `ticket_number`; o usuário do órgão A lista, abre e atualiza só os seus; verifica **AC-4**, **AC-5**, **AC-11**.
- Id de fora: o usuário do órgão A pede `findById` de um chamado do B e recebe `null`; verifica **AC-4**.
- Sem contexto: em `estrito`, `find` fora de requisição e sem `comOrgao` lança `OrgaoAusenteError` sem consulta no banco; verifica **AC-6**.
- Troca de órgão: `updateOne` com `$set: { orgaoId }` e `create` com outro `orgaoId` lançam erro nos dois modos; verifica **AC-5**, **AC-8**.
- Agregação: `aggregate` com `$unionWith` é recusado; `$lookup` simples não traz documento do outro órgão; verifica **AC-6**, **AC-15**.
- Observação: sem filtro, a leitura devolve os documentos antigos sem `orgaoId`, e a gravação sem contexto sai com `ORGAO_1_ID` e um único aviso; verifica **AC-8**.
- Sessão antiga: JWT sem `orgaoId` é completado sem novo login; em `estrito` com `User` sem campo, vale deslogado; verifica **AC-10**.
- Cron: órgão A lança erro na rodada, o B roda até o fim, a resposta mostra os dois; verifica **AC-13**.
- Contador: primeiro chamado do órgão B sai `CHM-<ano>-00001` enquanto o órgão 1 segue sua sequência; verifica **AC-12**.
- Varredura: um modelo novo sem plugin e um `semOrgao` fora da lista quebram o teste; verifica **AC-14**.

## Build plan

Abordagem Tracer Bullet: a primeira fatia passa um fio fino por todas as camadas (modelo, contexto, plugin, sessão, teste de banco) com dois modelos; as seguintes engrossam até cobrir tudo. Cada fatia sobe para a VPS em `observacao` sem mudar nada para o órgão 1.

**Fatia 1: fio ponta a ponta com `Chamado` e `User`**

1. `shared/orgaos/orgao.constants.ts`, `models/Orgao.ts` com `marcarPlataforma`, `scripts/criar-orgao-1.js` e o órgão 1 no `scripts/seed.js`, satisfies **AC-1**
2. `lib/orgaos/contexto.ts` (`comOrgao`, `semOrgao`, `contextoAtual`, `modoIsolamento`, `OrgaoAusenteError`), satisfies **AC-2**, **AC-3**
3. `lib/orgaos/plugin.ts` com os ganchos de leitura e de `save`, aplicado em `Chamado` e `User`, nos dois modos, satisfies **AC-4**, **AC-5**, **AC-6**, **AC-8**
4. `auth.ts` e `lib/dal.ts`: `authorize` em `comOrgao(ORGAO_1_ID)`, `orgaoId` no JWT, na sessão e no `verifySession`, e o completar do token antigo, satisfies **AC-9**, **AC-10**
5. `tests/orgao-test-env.ts` e o primeiro `orgao-isolamento.db.test.ts` com dois órgãos para `Chamado` e `User`, satisfies **AC-15**
6. `ORGAO_ISOLAMENTO` em `.env.example`, `.env.production.example`, `docker-compose.yml`, e `observacao` no `.env` da VPS antes do deploy, satisfies **AC-3**, **AC-8**

**Fatia 2: plugin completo em todos os modelos**

7. Os ganchos restantes (atualizações, remoções, `countDocuments`, `distinct`, `estimatedDocumentCount`, `aggregate` com a checagem de estágios, `insertMany`, `bulkWrite`, `upsert`, métodos de documento), satisfies **AC-4**, **AC-5**, **AC-6**
8. `pluginOrgao` nos 57 modelos de órgão; revisar os 3 `$lookup` e os 5 `aggregate` de `app/` e `lib/` contra a regra do AC-6, satisfies **AC-4**, **AC-6**
9. Varredura dos modelos, satisfies **AC-14**
10. Teste de banco estendido a todas as operações, satisfies **AC-15**

**Fatia 3: unicidade e numeração por órgão**

11. Os índices alvo nos 20 modelos da tabela (os antigos ficam no banco para a spec 39), satisfies **AC-11**
12. `lib/orgaos/contador.ts` e a troca de `chamado-utils.ts` e do gerador `MNT` para `idDoContador`, satisfies **AC-12**
13. Casos de unicidade e de contador no teste de banco, satisfies **AC-11**, **AC-12**, **AC-15**

**Fatia 4: fora da requisição**

14. `lib/orgaos/cron.ts` e as 5 rotas de `/api/cron/*` com `paraCadaOrgaoAtivo` e resposta por sigla, satisfies **AC-13**
15. Levantar as gravações que podem acontecer depois da resposta (começando pelo `LlmCall` de `lib/llm/call-log.ts`) e fazer essas gravações capturarem o contexto, satisfies **AC-13**

**Fatia 5: travas e suíte em estrito**

16. Varredura de APIs proibidas e de `comOrgao`/`semOrgao` com a lista de permitidos, satisfies **AC-7**, **AC-14**
17. `orgaoId: ORGAO_1_ID` nas cargas em mongosh, no gerador de carga de ativos, no `e2e/global-setup.ts` e nas fixtures do E2E, satisfies **AC-16**
18. Os 55 `*.db.test.ts` passando em `estrito` (com `comOrgaoDeTeste`), o Vitest com `ORGAO_ISOLAMENTO=estrito` e o E2E da CI em `estrito`, satisfies **AC-16**
19. `DOCKER_PRODUCAO.md`: a variável, o `criar-orgao-1.js` antes do deploy da fatia 1, a conferência do modo depois de cada deploy (um erro de digitação põe a produção em `estrito` e esconde os dados antigos) e o aviso de que a troca para `estrito` é da spec 39, satisfies **AC-1**, **AC-3**

## Consequences

**Positive**:

- Nenhuma das cerca de 1000 consultas precisa mudar para ganhar o filtro, e consulta nova herda o isolamento sem ninguém lembrar.
- Esquecimento vira erro visível ou teste vermelho, nunca vazamento silencioso.
- A produção do órgão 1 não muda a cada fatia; a virada para `estrito` é um passo único, da spec 39, com volta simples (voltar a variável para `observacao`).
- Os ganchos `comOrgao` e `paraCadaOrgaoAtivo` já servem às specs 41, 42 e 47.

**Negative / tradeoffs**:

- O isolamento é de aplicação, não do banco: o MongoDB não tem segurança por linha. Quem fala com o banco fora do Mongoose (mongosh, scripts, backup) não tem proteção nenhuma, e o backup segue sendo um só para todos os órgãos.
- O filtro é implícito: quem lê `ChamadoModel.find({})` não vê o órgão no código. Depurar exige saber do plugin.
- Cada consulta numa rota resolve o JWT de novo (o `cache` do React não memoiza fora da renderização). É barato, mas não é de graça.
- `$lookup` com `pipeline`, `$unionWith` e afins ficam mais chatos de escrever.
- Até a spec 39 há duas versões de cada índice único no banco, e os modos convivem; enquanto a VPS estiver em `observacao` não há isolamento real (o que é aceitável só porque existe um único órgão até a 49).
- Os 55 testes de banco e as fixtures do E2E precisam de ajuste uma vez.

**Neutral**:

- Os índices não únicos não ganham `orgaoId` agora; com um órgão só não há ganho mensurável.
- A sequência do órgão 1 mantém os `_id` antigos no `Contador`, um caso especial dentro de `idDoContador`.

## Follow-up

- [ ] Spec 39: preencher `orgaoId` nos dados de hoje, remover os índices únicos antigos e trocar a VPS para `estrito`, com o caminho de volta testado.
- [ ] Spec 40: definir a sessão do Gestor da plataforma (sem órgão) e acrescentar a trilha dele com `marcarPlataforma`; recusar no código o cadastro de um segundo órgão enquanto `ORGAO_ISOLAMENTO` for `observacao`; conferir `Orgao.ativo` no `verifySession`.
- [ ] Spec 42: salas do Socket.IO por órgão (`orgaoId` no payload de `/api/session/verify` e nas salas `managers` e `user:<id>`), o risco aceito desta spec.
- [ ] Spec 41: substituir o `comOrgao(ORGAO_1_ID)` do `authorize` pela descoberta do órgão no login.
- [ ] Spec 42: configuração de cada órgão no cron e salas do socket por órgão, sobre o `paraCadaOrgaoAtivo` desta spec.
- [ ] Antes da spec 49: medir as listagens com dois órgãos e decidir se os índices não únicos mais usados ganham `orgaoId` na frente.
- [ ] Confirmar a sigla do órgão 1: o nome `scripts/migrate-units-jfap.js` sugere `JFAP`; a spec usa `SJAP`, como escolhido na entrevista.
- [ ] `/sync` depois do build: registrar no `AGENTS.md` raiz e em `models/AGENTS.md` que modelo novo usa `pluginOrgao` e que `comOrgao`/`semOrgao` só entram com motivo na lista de permitidos.
