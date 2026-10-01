# Verify: Gestão de ativos, fatia 1 · spec 0011 · updated 2026-10-01 · verificado em 2026-10-01

_Steps derived from spec 0011 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [x] Como Preposto, em `/ativos/localizacoes`, crie o prédio `Sede`, abaixo dele `3º andar` e abaixo dele `Sala 302` → a sala mostra o caminho `Sede/3º andar/Sala 302` → AC-1
- [x] Renomeie `Sede` para `Edifício Sede` → a sala passa a mostrar `Edifício Sede/3º andar/Sala 302` → AC-1
- [x] Tente criar outro prédio `SEDE` (maiúsculas) com `Sede` ativo → "Já existe um local com esse nome aqui." → AC-2
- [x] Edite `3º andar` e tente pô-lo dentro de `Sala 302` → a sala não aparece como destino, e pela action o servidor recusa → AC-2
- [x] Tente desativar `Sede` (tem filho) e depois um local com ativo vinculado → as duas recusas aparecem → AC-2
- [x] Tente criar local com `/` no nome → recusa → AC-2 (invariante do caminho)
- [x] Como Admin, em `/configuracoes/categorias-ativo`, crie, edite (ligando um subtipo) e desative uma categoria; como Preposto, a URL redireciona para `/dashboard` → AC-3
- [x] Como Preposto, em `/ativos/novo`, cadastre um patrimoniado com tombamento `00777` sem escolher criticidade → código `777`, `Em vistoria`, `Em operação`, criticidade da categoria → AC-4
- [x] Cadastre dois internos seguidos → `MNT-0001` e `MNT-0002` (ou a sequência seguinte do contador) → AC-4
- [x] Cadastre de novo o tombamento `777` → "Já existe um ativo com o código 777" → AC-5
- [x] Edite local, categoria e fabricante de um ativo → a linha do tempo da ficha mostra três registros com valor anterior, novo e o seu nome; o código não é editável → AC-6
- [x] Mude o status para `Baixado` sem observação → o botão Salvar fica desabilitado e a action recusa; com observação, grava → AC-6
- [x] Clique em "Validar cadastro" num ativo sem local → recusado; com local → `Validado`, com data e seu nome na ficha → AC-7
- [x] Em `/ativos`, busque `119` (prefixo do código) e `split` (trecho da descrição); filtre por um prédio (inclui as salas dele) e por "Sem local"; confira 50 por página e ordem numérica do código (`9003` antes de `10698`) → AC-10
- [x] Em `/ativos/ler`, digite `00011997` e Enter → abre a ficha do `11997` → AC-11
- [x] Abra `/ativos/ler` por HTTP (não localhost) → o botão de câmera some e a tela explica que precisa de HTTPS; em localhost ou HTTPS, "Abrir câmera" lê um código de barras e abre a ficha → AC-11
- [x] Digite um código inexistente → "Ativo não cadastrado"; como Preposto aparece "Cadastrar este ativo" levando a `/ativos/novo?tombamento=<código>` já preenchido; com `MNT-9999` o atalho não aparece; como Solicitante não aparece → AC-12
- [x] Na ficha como Preposto: dados técnicos, bloco Patrimônio (SICAM), linha do tempo com "Sistema" na carga, até 50 chamados com número, status, serviço, abertura e encerramento → AC-13
- [x] Na mesma ficha como Solicitante: sem bloco patrimonial (confira também a resposta do servidor, não só a tela), sem descrição nem solicitante, link só no chamado dele; como Técnico, o chamado atribuído a ele leva a `/chamados-atribuidos/[id]` → AC-13
- [x] No formulário de novo chamado, escolha um ativo cuja categoria tem subtipo → `localExato` (se o ativo tem local), tipo e subtipo preenchidos; com `localExato` já digitado, ele não muda; troque de ativo → só o que o anterior preencheu muda; limpe o ativo → nada é desfeito → AC-14
- [x] Busque um ativo Tier C ou `baixado` no seletor → não aparece → AC-14
- [x] Abra o chamado com ativo → o histórico de abertura cita "Equipamento <código>" → AC-14
- [x] Na ficha, "Abrir chamado deste ativo" → `/meus-chamados` abre o formulário com o ativo e a URL perde `?ativo=`; ativo `baixado` não mostra o botão → AC-15
- [x] Em um chamado encerrado com ativo, "O problema voltou" → o formulário já vem com o mesmo equipamento → AC-15
- [x] Na `/gestao`, abra o sheet de um chamado aberto → vincule, troque e remova o equipamento; o histórico mostra `Equipamento: nenhum → X`, `X → Y`, `Y → nenhum`; vincular o mesmo de novo não grava → AC-16
- [x] Sheet de chamado encerrado, cancelado ou recusado → sem botão de vincular; em `/meus-chamados` o sheet só mostra o equipamento → AC-16
- [x] Como Solicitante e como Técnico, acesse `/ativos/novo`, `/ativos/localizacoes` e `/ativos/<id>/editar` → redireciona para `/dashboard` → AC-17

## Commands

- [x] `npx tsx scripts/gerar-carga-ativos.ts` → "108 ativos do Tier A" com a contagem das 9 categorias → AC-8
- [x] Rodar o gerador com um CSV em que uma linha Tier A tem `categoriaSugerida=elevador` → "Carga recusada", sem arquivo escrito → AC-8
- [x] `docker exec -i <mongo> mongosh <base vazia> < scripts/carga-ativos.generated.js` → "Categorias criadas: 9 de 9", contador criado, "Ativos criados: 108 de 108", "Históricos de cadastro criados: 108" → AC-8
- [x] Editar um ativo no banco e rodar o script de novo → 0 criados e o ativo editado intacto (inclusive `camposPatrimoniais`) → AC-8, AC-9
- [x] Apagar alguns históricos `cadastro` e rodar de novo → recria só esses → AC-8
- [x] `MONGO_TEST_URI=mongodb://localhost:27018/severino_test npx vitest run lib/ativos` → passa → AC-1, AC-2, AC-4 a AC-7, AC-13, AC-14, AC-16
- [x] `npx vitest run "app/(dashboard)/ativos" "app/(dashboard)/gestao/__tests__/vincular-ativo.test.ts"` → passa → AC-17
- [x] `npx playwright test e2e/ativos-fio.spec.ts` → 3 passam → AC-11, AC-12, AC-13, AC-14, AC-15, AC-17

## Value sourcing

- [x] `caminho`: renomeie e mova um nó com netos; confira no banco que todos os descendentes têm `caminho = pai + / + nome`
- [x] `codigo` patrimoniado: tombamento ` 00123` vira `123`
- [x] `codigo` interno: dois cadastros simultâneos não repetem (teste de banco real da corrida)
- [x] `criticidade` sem entrada: igual à `criticidadePadrao` atual da categoria; mude a padrão e cadastre outro, o novo segue a nova
- [x] `statusCadastro` manual: sempre `em_vistoria`
- [x] `validadoPor` e `validadoEm`: id da sessão e a hora da validação
- [x] `AtivoHistory.autorId`: id da sessão; na carga, `null` com `actorType: 'sistema'`
- [x] Código da leitura: `mnt-0001` acha `MNT-0001`; `00011997` acha `11997`
- [x] Motor `.wasm`: no DevTools, a câmera baixa `/zxing/zxing_reader.wasm` do próprio app, nunca do jsDelivr
- [x] Câmera disponível: some em HTTP fora de localhost (`isSecureContext` falso)
- [x] Filtro por prédio: com prédios `Sede` e `Sede B`, filtrar `Sede` não traz ativos de `Sede B`
- [x] Ordem da lista: código crescente em ordem numérica
- [x] Link do chamado na ficha: gestão sempre; Solicitante só no próprio; Técnico só no atribuído
- [x] Destino do link: técnico atribuído (não gestão) vai para `/chamados-atribuidos/[id]`; os demais para `/meus-chamados/[id]`
- [x] Serviço do chamado na ficha: nome do `ServiceCatalog`; sem catálogo, o `tipoServico`
- [x] Datas do chamado: `createdAt` e `closedAt`, no fuso de Belém
- [x] Autor no histórico do ativo: nome do usuário; "Sistema" na carga
- [x] `localExato` sugerido: `caminho` do local do ativo
- [x] `tipoServico` sugerido: categoria → subtipo → tipo → opção fixa; categoria sem subtipo não sugere
- [x] `subtypeId` sugerido: só quando o subtipo é do tipo que o formulário usa para aquela opção (crie um segundo tipo que mapeia para a mesma opção e confira que o subtipo deixa de ser sugerido)
- [x] Serviço do catálogo e unidade: o ativo não sugere
- [x] `?ativo=<id>`: ativo `baixado` ou Tier C mostra o aviso e não abre o formulário
- [x] Reincidência: herda o ativo só se ele ainda passa nas regras do seletor
- [x] Observação da abertura: cita o `codigo`
- [x] Texto do vínculo: códigos anterior e novo, ou "nenhum"
- [x] Carga, `codigo` e `tombamento`: o gerador falha se `codigo` e `tombamento` normalizados divergem
- [x] Carga, `categoriaId`: a categoria que já existia mantém a criticidade ajustada pelo Admin, e o ativo novo herda essa
- [x] Carga, `camposPatrimoniais`: valor `8700,9` vira `8700.9` (number); datas viram Date; vazios ficam ausentes; `situacaoSicam` e `estadoConservacao` não entram
- [x] Carga, timestamps: `createdAt`, `updatedAt` e `importadoEm` explícitos

## Acceptance-criteria coverage

- AC-1, AC-2: árvore (manual) + `ativos.db.test.ts` (cascata, ciclo, nome irmão, desativação)
- AC-3: categorias (manual) + `permissoes.test.ts`
- AC-4, AC-5: cadastro (manual) + `ativos.db.test.ts` (corrida MNT, código repetido)
- AC-6, AC-7: edição, status e validação (manual) + `ativos.db.test.ts`
- AC-8, AC-9: commands da carga + `carga.test.ts`
- AC-10: lista (manual)
- AC-11, AC-12: leitura (manual) + `codigo.test.ts` + E2E
- AC-13: ficha por perfil (manual) + `ativos.db.test.ts` + E2E
- AC-14, AC-15: formulário e `?ativo=` (manual) + `createTicketAction.test.ts` + E2E
- AC-16: vínculo na gestão (manual) + `ativos.db.test.ts` + `vincular-ativo.test.ts`
- AC-17: permissões (manual) + `permissoes.test.ts` + `vincular-ativo.test.ts` + E2E
