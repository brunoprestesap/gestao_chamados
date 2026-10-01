# Review, feat/gestao-ativos-fatia-1, 2026-10-01

**Reviewed by**: Claude Sonnet 5.5 (autor no mesmo modelo; revisão feita só lendo o diff, sem rodar o app)
**Scope**: cerca de 120 arquivos (28 alterados e o restante novo, sem contar os docs e o `.wasm`), branch contra `origin/main` (0f53b5e), tudo ainda sem commit
**Verdict**: Approve with nits

## Summary

A mudança entrega a Fatia 1 da spec 0011: modelos de ativo, localização em árvore, categorias, carga do Tier A por script mongosh, leitura de etiqueta, ficha, lista, seletor no formulário de chamado e vínculo na gestão. O código segue bem as convenções do projeto (actions sem `throw`, `verifySession()` com `canManage`, Zod `safeParse`, `camposPatrimoniais` só para gestão, CSV e script gerado no `.gitignore`) e cobre os AC-1 a AC-17 que consegui rastrear. Não achei blocker nem major. Os achados são pequenos: um spinner que trava, um possível erro 500 ao decodificar o código, câmera que pode abrir duas vezes e algumas lacunas de teste e de manutenção.

## Minor

### 🟡 Spinner de busca trava quando o texto encolhe, `app/(dashboard)/ativos/_components/SeletorAtivo.tsx:60`

**Problema**: o efeito de busca liga `carregando` dentro do timer e só desliga no `finally` quando a requisição não foi abortada. Se a pessoa digita "ab", espera o pedido sair e apaga para "a" antes da resposta, a requisição é abortada, nenhum pedido novo nasce (menos de 2 letras) e `carregando` fica `true`.
**Why it matters**: o ícone de carregamento fica girando no campo até a pessoa digitar de novo; parece travado no formulário de abertura de chamado.
**Suggested fix**: zerar `carregando` no cleanup do efeito, ou no começo do efeito quando `buscavel` for falso.

### 🟡 Câmera pode abrir duas vezes com duplo clique, `app/(dashboard)/ativos/ler/_components/LeitorEtiqueta.tsx:98`

**Problema**: o botão "Abrir câmera" só some depois de `setLendo(true)`, que vem depois do `await getUserMedia`. Enquanto o navegador pergunta a permissão, um segundo clique chama `iniciarCamera` de novo e sobrescreve `streamRef.current`; o primeiro stream nunca é parado.
**Why it matters**: a câmera fica ligada (luz acesa) até fechar a aba, e dois loops de leitura podem rodar.
**Suggested fix**: marcar um estado "iniciando" logo no começo da função e desabilitar o botão; ou parar o stream anterior antes de guardar o novo.

### 🟡 Possível erro 500 em código com `%`, `app/api/ativos/por-codigo/[codigo]/route.ts:20`

**Problema**: a rota roda `decodeURIComponent(bruto)` sobre um parâmetro que o Next normalmente já entrega decodificado. Se o código lido tiver `%` (etiqueta com texto livre, QR de outro sistema), a segunda decodificação lança `URIError` e a rota responde 500 em vez de 404. Não confirmei se o Next 16 entrega o parâmetro já decodificado nesta rota, por isso o risco é "possível".
**Why it matters**: a tela mostra "Não foi possível buscar agora" em vez de "Ativo não cadastrado" para um código estranho.
**Suggested fix**: trocar por uma decodificação protegida por `try/catch` (ou confiar no valor do parâmetro) e tratar falha como 404.

### 🟡 Auditoria do vínculo pode ficar para trás, `lib/ativos/vinculo.ts:52`

**Problema**: o `updateOne` que grava o `ativoId` roda antes do `ChamadoHistoryModel.create`. Se a criação do histórico falhar, o vínculo já mudou e a action devolve erro genérico ("tente de novo"); a nova tentativa vê o mesmo ativo e responde `mudou: false`, então o histórico `vinculo_ativo` nunca é gravado.
**Why it matters**: a spec trata a trilha de auditoria como invariante ("toda mudança de `ativoId` em chamado já aberto gera `ChamadoHistory`"). Sem transação, a janela é pequena, mas o efeito é permanente.
**Suggested fix**: tratar a falha do histórico dentro de um `try/catch` que registre o erro com `console.error` e devolva sucesso, ou desfazer o `$set` se o histórico falhar. Vale o mesmo cuidado em `lib/ativos/cadastro.ts` (`criarAtivo`, `editarAtivo`), onde o histórico também vem depois da escrita.

### 🟡 O script da carga nunca roda de verdade nos testes, `lib/ativos/__tests__/carga.test.ts:146`

**Problema**: o teste do `gerarScriptCarga` só confere o texto e que `new Function(...)` não dá erro de sintaxe. A idempotência (AC-8, AC-9: rodar duas vezes, ativo editado intacto, histórico apagado é recriado) foi checada à mão, segundo `verify.md`, mas nenhum teste executa o script contra um Mongo.
**Why it matters**: é a única parte do módulo que escreve em produção fora do Mongoose; uma mudança futura em `carga-script.ts` (ou na `COLECOES_ATIVOS`) pode quebrar a carga sem nenhum teste vermelho. A spec lista "Carga idempotente" como cenário crítico.
**Suggested fix**: um teste `*.db.test.ts` que avalie o script com um `db` falso feito sobre o driver do `MONGO_TEST_URI` (só `getCollection`, `updateOne`, `findOne`, `print`), rodando duas vezes. Se parecer caro, aceitar como dívida registrada.

### 🟡 `.wasm` copiado à mão pode ficar fora de sincronia, `public/zxing/zxing_reader.wasm`

**Problema**: o arquivo é idêntico ao de `node_modules/zxing-wasm` 3.1.3 hoje (conferi o hash), mas nada garante isso depois. O `barcode-detector` está fixo em 3.2.2 e fixa `zxing-wasm` 3.1.3; ao subir qualquer um dos dois, o glue JS novo vai carregar um `.wasm` velho.
**Why it matters**: a falha é silenciosa (câmera deixa de ler, o campo de texto continua funcionando) e só aparece com HTTPS, que ainda nem está ligado em produção, então ninguém notaria cedo.
**Suggested fix**: um teste que compare o hash de `public/zxing/zxing_reader.wasm` com o de `node_modules/zxing-wasm/dist/reader/zxing_reader.wasm` (ou com `ZXING_WASM_SHA256` exportado pelo próprio `barcode-detector`), ou um passo `postinstall` que copie o arquivo. A abordagem de servir o `.wasm` do próprio app é a certa para rede interna; o risco é só o descasamento.

### 🟡 "Abrir chamado deste ativo" aparece para ativo que não pode receber chamado, `app/(dashboard)/ativos/[id]/page.tsx:112`

**Problema**: o botão só esconde para `baixado` (como a spec pede), mas ativo Tier C ou D (cadastrável à mão) também não passa no seletor. O clique leva a `/meus-chamados?ativo=<id>`, que responde 404 e mostra o toast "Este equipamento não pode receber chamado".
**Why it matters**: o botão promete algo que não funciona; é um beco sem saída para quem leu a etiqueta de um equipamento C/D.
**Suggested fix**: esconder o botão também quando o tier não está em `TIERS_VINCULAVEIS` (sem mudar a regra do servidor). Se a intenção for manter a regra da spec literal, ao menos explicar na ficha.

## Nits

- ⚪ `components/dashboard/nav.ts:92`, em `/ativos/localizacoes` os itens "Ativos" e "Localizações" ficam os dois realçados, porque a lógica do `sidebar-content.tsx:162` usa prefixo. Confirmado, é o mesmo padrão de `/gestao/recurring`; sem urgência.
- ⚪ `lib/ativos/lista.ts:73`, o `.collation({ numericOrdering: true })` impede o uso dos índices de `status`/`categoriaId` para string e do índice único de `codigo` no sort; com centenas de ativos não pesa, mas o comentário da spec ("usa o índice único") deixa de valer na lista.
- ⚪ `lib/ativos/ficha.ts:179`, o histórico do ativo é carregado inteiro, sem limite (os chamados têm limite de 50). Hoje são poucas linhas por ativo.
- ⚪ `app/(dashboard)/ativos/ler/_components/LeitorEtiqueta.tsx:101`, a spec cita `setZXingModuleOverrides`, o código usa `prepareZXingModule({ overrides })`. As duas funções existem na 3.2.2 e a segunda é a recomendada; só vale alinhar o texto da spec.
- ⚪ `app/(dashboard)/meus-chamados/[id]/page.tsx:257`, o `fetch` do ativo da reincidência não é cancelado se o chamado mudar rápido; resposta velha poderia preencher `ativoReincidencia` do chamado errado. Improvável na prática.
- ⚪ `lib/ativos/categoria.ts:47`, a `chave` da categoria é editável; se o Admin trocar a chave de uma das 9 da carga, rodar o script de novo tentaria criar uma categoria nova com o mesmo `nome` e falharia por E11000. A carga é única, então só registrar.

## Strengths

- Segurança bem fechada: toda action de escrita usa `verifySession()` + `canManage`/`isAdmin` e devolve `ok: false` (nada de `requireManager()` dentro de `try`); `camposPatrimoniais` é recortado no servidor antes de chegar ao cliente; `proxy.ts` ganhou `/ativos`; os dois endpoints GET exigem sessão e aplicam as regras do seletor também em `/api/ativos/[id]`.
- Regras do servidor valem mesmo com cliente adulterado: `createTicketAction` e `vincularAtivoAoChamado` recusam ativo inexistente, `baixado` ou Tier C/D, e o vínculo usa filtro condicional no `updateOne` para não sobrescrever mudança concorrente.
- O recálculo do `caminho` da subárvore é idempotente e repete a regra "caminho = pai + nome" a partir do banco, com proteção contra ciclo em `ehDescendente`; a unicidade do nome irmão fica no índice parcial com collation, não só no código.
- A carga é bem desenhada: tudo por `$setOnInsert` e upsert, histórico recriado por `{ ativoId, acao }`, falha antes de escrever com categoria desconhecida ou código divergente, e CSV e script gerado no `.gitignore`.
- A lógica de preenchimento do formulário (só campos vazios, trocar de ativo sobrescreve só o que o anterior pôs) está isolada e coberta por testes de componente.
- O contador `MNT-####` usa `$inc` com upsert atômico e repete uma vez em caso de E11000, com teste de corrida em banco real.

## Test coverage

Cobertura ampla e proporcional: testes de banco real (`ativos.db.test.ts`, `lista-e-categorias.db.test.ts`) para unicidade de código, índice parcial do nome, corrida do contador, cascata de caminho, seletor, vínculo e ficha por perfil; testes unitários de schemas, `normalizarCodigo`, mapeamento da carga e `proxy.ts`; testes de componente (`SeletorAtivo`, `FormAtivo`, `LeitorEtiqueta`, `NewTicketDialog.ativo`, `ChamadoDetailSheet`, gerência de categorias e locais); testes de permissão das actions (AC-17) e das rotas; E2E do fio feliz. Lacunas: o script mongosh só é checado por sintaxe (ver Minor acima), não há teste do `.wasm` contra o pacote, e não vi teste para o caminho "histórico falha depois do update" nem para o `%` na rota por-codigo. A suíte está verde (3292) segundo o pedido; os `*.db.test.ts` só rodam com `MONGO_TEST_URI`, então vale confirmar que a CI os executa.
