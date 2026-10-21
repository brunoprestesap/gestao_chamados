# 0021. Repaginação das telas da cotação de material

**Date**: 2026-10-21
**Status**: In Progress

## Summary

As telas da cotação de material (spec 0019) funcionam, mas são densas: a ação certa fica no fim da página, a fila não tem busca nem paginação e o editor da contratada vira uma rolagem enorme. Esta spec troca só a apresentação das 11 telas desenhadas no canvas, sem mexer nas regras de `lib/material`. Três leituras novas entram no servidor (tempo na etapa, contagens da fila e saldo depois da aprovação), e as funções puras de `controles.ts` passam para `shared/` para a lista "Pronta para enviar?" rodar no navegador. A entrega vem em 8 fatias, um PR por fatia.

## Rationale

Contexto, opções e justificativa: ver [rationale.md](rationale.md).

## Requirements

**Fonte do desenho**: o canvas [Cotações de material, redesign](https://claude.ai/artifact/NEFvkDLpVpxTgCYhnJnxnM), 11 artboards (1 fila, 2 detalhe, 3 montagem: orçamentos, 4 cartão no chamado, 5 cadastro: empenhos, 6 ateste, 7 diálogos, 8 montagem: preço de tabela, 9 relatório, 10 designações e faixas, 11 Anexo V, SINAPI e parâmetros). Os números e nomes do canvas são exemplo. Onde o canvas e esta spec divergem, vale a spec (botão primário, fonte).

**User stories**:

- Como fiscal, gestor ou aprovador, quero ver logo no topo o que esperam de mim e o que me impede, para decidir sem rolar a página.
- Como responsável técnico da contratada, quero montar a cotação em passos e ver o que falta antes de enviar, para não ser devolvido por esquecimento.
- Como técnico, quero que o cartão do chamado diga qual é a próxima ação, também no celular.
- Como solicitante, quero entender em palavras simples por que o conserto espera material.
- Como Admin, quero achar e filtrar cotações, e configurar o módulo sem cliques que apagam por engano.

**Acceptance criteria**:

- **AC-1**: A situação aparece no mesmo selo (`SituacaoPill`, rótulo de `ROTULO_SITUACAO`) na fila, no detalhe e no cartão. As cores das 10 situações diferem também na claridade, não só no tom.
- **AC-2**: A fila mostra a contagem em cada aba e um resumo no topo por lado. Lado TRF1: esperando você, em aprovação (com o valor somado), ateste fora do prazo e saldo dos empenhos elegíveis. Contratada: esperando você, devolvidas e NF pendente, sem valor.
- **AC-3**: A fila aceita busca (número da cotação, número do chamado ou código do ativo), o filtro "Só urgentes" e páginas de 25. Nas abas de trâmite (Minhas ações, Análise, Aprovação, Ateste) a ordem é "Mais tempo na etapa"; em Todas é "Mais recentes" (`updatedAt` decrescente, no banco). Tudo vai no endereço (`?aba=&q=&urgente=1&pagina=`), o filtro sobrevive ao recarregar, a página fora do intervalo vai para a última e o limite de 200 linhas sai. As contagens das abas respeitam `q` e `urgente`; o resumo do topo é global por papel e ignora os dois.
- **AC-4**: Cada linha da fila mostra: número e quantidade de itens; chamado (número e título, com link); ativo (código e caminho do local, com link) quando houver; selo da situação com a jornada em miniatura; sinais (Urgente, NF pendente, Pesquisa pendente, prazo do ateste); valor (só TRF1); e "na etapa há", medido desde o último evento da trilha que mudou a situação, em destaque acima de 5 dias. Aba vazia mostra uma frase, nunca uma tabela vazia. No celular, cada linha vira um cartão com número, selo, título do chamado, sinais e "na etapa há"; ativo, local, quantidade de itens e jornada em miniatura saem.
- **AC-5**: O detalhe abre com o cabeçalho (número, selo, Urgente, chamado, ativo, nome do responsável técnico que montou, total) e a jornada de 7 etapas com a data de cada etapa vencida. Devolvida, reprovada e cancelada aparecem como desvio na etapa em que ocorreram.
- **AC-6**: No detalhe e no ateste, o painel "Sua vez" fica à direita (embaixo, no celular) e mostra o papel, a ação principal e as secundárias tiradas de `acoesDisponiveis`, os impedimentos e as advertências, cada um com título. Sem ação para quem lê, o painel mostra quem age agora.
- **AC-7**: O conteúdo do detalhe fica em abas: Itens e preços (origem e referência por item), Orçamentos (grade de itens por fornecedor, menor preço destacado, validade vencida e complemento da urgência no cabeçalho de cada coluna, links dos arquivos) e Trilha (linha do tempo). A Trilha mostra o que `serializarCotacao` já entrega a cada visão: TRF1 vê ato, autor e papel, data, motivo, limite no ato, valores e projeção; contratada e técnico veem ato, papel, data e motivo, sem autor nos atos de `ACOES_SEM_AUTOR_FORA_DO_TRF1` e sem `conciliar`. "Conciliação do saldo" passa a sair de `ROTULO_ACAO`.
- **AC-8**: Para o lado TRF1, o bloco Empenho mostra uma barra com o líquido, o comprometido, o valor desta cotação e o saldo depois dela, mais a projeção de esgotamento e quem pode aprovar o valor. Em `em_aprovacao`, a barra aparece por empenho elegível com saldo depois = saldo menos o valor da cotação. De `autorizada` em diante, aparece só o empenho da cotação com o saldo atual (a reserva já está no comprometido, então nada é descontado de novo). Antes de `em_aprovacao`, o bloco mostra só os elegíveis com o saldo atual. O que não estiver disponível não aparece, no lugar de mostrar zero.
- **AC-9**: O ateste mostra três etapas em ordem (recebimento provisório, recebimento definitivo, nota fiscal), cada uma com estado, prazo e atraso, e uma tabela por item com autorizado (quantidade, e valor = quantidade × preço aplicado) e aplicado (quantidade executada, e valor = `valorExecutadoCentavos`), vista pelo TRF1 e pela contratada como hoje. As evidências aparecem como lista de arquivos com ícone pelo tipo (foto ou PDF), baixados pela rota que já existe; miniatura de imagem não entra. Os botões de registro seguem `acoesDisponiveis`.
- **AC-10**: O diálogo Encaminhar numera os pontos a resolver (base dos itens nas duas tabelas com a diferença em %, orçamento vencido, urgência) e só habilita o botão com todos resolvidos. O diálogo Aprovar mostra uma barra por empenho elegível com o saldo depois, destaca o empenho que ficaria com pouco saldo (`consomeParcelaRelevante`) e mostra o nome e o limite da faixa de quem aprova; o texto é reescrito ("Ao aprovar, R$ X ficam reservados no empenho escolhido e a compra fica autorizada.").
- **AC-11**: Devolver, reprovar, cancelar e recusar a urgência usam um único `DialogMotivo`, com contador "N de M", o mínimo escrito embaixo do campo e o erro no próprio campo (não só no toast). Reprovar e cancelar usam o botão destrutivo. O botão de fechar se chama "Cancelar" em todos os diálogos do módulo.
- **AC-12**: O editor da contratada tem 4 passos (Itens, Preço de tabela, Orçamentos, Revisar e enviar), com navegação livre e "Salvar rascunho" em todos. O envio continua no passo 4 e continua conferido no servidor.
- **AC-13**: No passo Preço de tabela, a busca no Anexo V e no SINAPI abre dentro do item, com os resultados das duas tabelas lado a lado, "Usar" em cada um e "Usar três orçamentos" como saída.
- **AC-14**: No passo Orçamentos, os preços ficam numa grade de itens (só os que vão para orçamento) por fornecedor, com um campo por célula, o menor preço destacado, a contagem "N de 3" por item e o que falta no fornecedor (validade, arquivo) no cabeçalho da coluna.
- **AC-15**: A lista "Pronta para enviar?" mostra, ao vivo e sem ida ao servidor, o mesmo resultado de `impedimentosDeEnvio` para o rascunho em edição (passando pelo mesmo adaptador do formulário que o envio usa), e o total pelo menor preço de cada item.
- **AC-16**: O cartão no chamado escolhe a versão por `cotacao.visao` (`trf1`, `contratada`, `tecnico`, `solicitante`), nunca pelo perfil do usuário. TRF1: situação, quantidade de itens, valor e quem age agora (papel e, quando houver, nome do fiscal que assumiu). Contratada: situação, quantidade de itens, valor, a próxima ação dela e quem age agora só pelo papel, sem nome do TRF1. Técnico: situação, jornada só com a situação (sem datas), a próxima ação e a lista resumida de itens. Solicitante: uma frase fixa por fase e uma barra de três fases, sem valor e sem nomes: Pedido (rascunho, enviada, em análise, devolvida), Aprovação (em aprovação, autorizada), Instalação (executada, atestada); reprovada e cancelada viram a fase `encerrada`, que mostra só a frase, sem barra.
- **AC-17**: No sheet da gestão, o `CotacaoApprovalCard` antigo fica num bloco recolhido "Histórico: sistema anterior", que abre sozinho só quando há cotação antiga `enviada` esperando aprovação.
- **AC-18**: O cadastro de material troca as abas por seções no endereço (`?secao=empenhos|designacoes|faixas|anexo-v|sinapi|parametros`, padrão `empenhos`), com uma navegação lateral. A nota de cada seção: empenhos, quantos elegíveis; designações, quantas vigentes; faixas, quantas ativas; Anexo V, "revisão aberta" quando houver importação pendente, senão quantos itens na versão vigente; SINAPI, o mês mais recente; parâmetros, nenhuma. Recarregar mantém a seção.
- **AC-19**: No topo do cadastro, a lista "Para aprovar a primeira cotação" mostra o estado de empenho elegível, faixas ativas, designações (fiscal, gestor, aprovador) e itens do Anexo V sem código SINAPI, cada um com link para a sua seção. Ela substitui o painel amarelo "O que falta" e sai de `lerPendenciasMaterial`, com textos novos sem "caminho 1" nem "caminho 2".
- **AC-20**: Os empenhos viram cartões com barra de saldo, situação e projeção. Designações ficam agrupadas por papel, com o ato e a vigência visíveis. Faixas viram uma escada de limites (`FaixaLinha` ativas por limite crescente), avisando a faixa ativa sem nenhuma `DesignacaoLinha` vigente de aprovador nela e o valor acima do qual ninguém aprova (o maior limite de faixa com aprovador vigente).
- **AC-21**: Revogar designação, desativar faixa e inativar ou reativar empenho abrem um diálogo de confirmação que diz o efeito antes de agir. O servidor não muda; continua sem motivo.
- **AC-22**: A revisão de importação (Anexo V e SINAPI) mostra os resumos Novos, Alterados e Removidos (ou Fora deste mês) como filtros e, nos alterados, o valor antigo riscado ao lado do novo, a partir de `mudancas: { campo, antes, depois }` que `lib/material/importacao/revisao.ts` já monta. Os parâmetros mostram a unidade (%, dias) junto do campo, e a taxa de administração aparece como 0%, travada. "caminho 1" e "caminho 2" saem dos textos.
- **AC-23**: O relatório oferece os atalhos Mês atual, Trimestre atual e Ano atual (do primeiro dia do período corrente até hoje, em `YYYY-MM-DD` no fuso de Belém, gerando `inicio` e `fim` do schema de hoje), mais "Outro período" (De e Até, até 366 dias, como hoje). Mostra quatro números no topo (do envio à autorização em média, com a mediana; devolvidas em %; impedimento na primeira tentativa; divergência entre autorizado e executado, todos já em `RelatorioMaterial`), custo por equipamento em barras (os 20 maiores), empenhos com saldo e projeção e "Pontos de atenção" (urgências, fracionamento, itens acima do estimado) com links. "RN-36" sai do texto.
- **AC-24**: A visibilidade de hoje não muda. Só o TRF1 recebe: empenho (número, saldo, líquido, comprometido, reservado), limite no ato, projeção, advertências de preço, confrontos de base (Anexo V e SINAPI), quem pode aprovar e o nome do fiscal que assumiu. A contratada e o técnico continuam recebendo o valor total, os preços e o executado, como hoje. O solicitante recebe só a fase e a frase. Todo campo novo (`etapas`, `empenho`, `fase`, `quemAgeAgora`, `montadoPorNome`) entra por `serializarCotacao` e pelo serializador do cartão, filtrado pela visão; nenhum componente esconde dado só na tela.
- **AC-25**: Todas as telas funcionam a 390 px sem rolagem horizontal da página. A fila vira cartões, as tabelas e a grade rolam dentro da própria caixa e o painel "Sua vez" desce para depois do conteúdo.
- **AC-26**: Os controles são de verdade (`button`, `a`, `input` com `label`), as abas usam `Tabs` do shadcn com o foco visível, os botões só de ícone têm `aria-label`, e todo texto tem contraste de 4,5:1, conferido pelo `@axe-core/playwright` nas telas do módulo dentro do E2E. Os `select`, radios e checkboxes nativos do módulo passam para os componentes do shadcn.
- **AC-27**: Todo texto novo ou reescrito fica em `shared/material/mensagens.ts`, inclusive a frase do solicitante por fase, o mapa de fase por situação e o título curto de cada código de `CONTROLES` usado no painel "Sua vez". Os rótulos ficam padronizados: "Acrescentar item", "Tirar orçamento", "Cancelar" para fechar diálogo, e o toast dos diálogos de motivo diz o que aconteceu (ex.: "Cotação devolvida."), nunca "Feito.".
- **AC-28**: O botão primário do módulo usa o gradiente do Sigma (`from-indigo-600 to-blue-600` com sombra indigo), não o sólido do canvas. A fonte continua a do Sigma.
- **AC-29**: Nenhuma regra muda: as transições, as actions, os schemas e as rotas de `lib/material`, `app/api/cotacoes` e das actions continuam com o mesmo contrato, e os testes de actions e de `lib/material` passam sem alteração de expectativa.

## Decision

**Chosen option**: Option 1: Repaginar no lugar, por fatias, com peças compartilhadas.

Os componentes do módulo são reescritos dentro das rotas atuais, uma tela por PR, sobre seis peças compartilhadas e três leituras novas no servidor, sem mudar modelo nem regra.

**Implementation skills**: `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Feature design

**Data model sketch**: nenhuma mudança de schema e nenhuma migração. As leituras novas usam o que existe:

- `CotacaoMaterialEvento.para`, `.de`, `.em`, índice `{cotacaoId:1, em:1}`: tempo na etapa. O evento `conciliar` grava `para` igual a `de`, então o filtro `para != de` já o exclui.
- `Chamado.ticket_number` e `Chamado.titulo`; `Ativo.codigo`; `CotacaoMaterial.localizacaoId` → `Localizacao.caminho`: linha e busca da fila.
- `lib/material/projecao.ts` (`calcularProjecao`, `projecoesDosEmpenhos`, `consomeParcelaRelevante`): saldo depois e projeção.
- Tipos ampliados (não modelos): `EmpenhoElegivel` em `lib/material/saldo.ts` ganha `liquidoCentavos` e `comprometidoCentavos`; `Designado` ganha `faixaNome`.

**State transitions**: as da spec 0019, sem mudança. A jornada visual mapeia: `rascunho` → `enviada` → `em_analise` → `em_aprovacao` → `autorizada` → `executada` → `atestada`. `devolvida` é desvio: a jornada marca a etapa em que voltou e, no reenvio, segue de `enviada` com a data nova. `reprovada` e `cancelada` são fins marcados na etapa em que ocorreram (a etapa vem do `de` do último evento). Toda cotação passa por `em_aprovacao` antes de `autorizada`; não há salto a tratar.

**Peças compartilhadas** (em `app/(dashboard)/cotacoes/_components/compartilhado/`, importadas também pelo chamado, pela gestão e pelo cadastro):

| Peça                | O que faz                                                                            | Usada em                                       |
| ------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `SituacaoPill`      | selo com ponto colorido, rótulo de `ROTULO_SITUACAO`                                 | fila, detalhe, cartão, trilha                  |
| `JornadaCotacao`    | 7 etapas; variante `grande` (com datas) e `mini` (barrinhas)                         | detalhe, ateste, fila, cartão                  |
| `SinaisCotacao`     | etiquetas Urgente, NF pendente, Pesquisa pendente, prazo                             | fila                                           |
| `PainelSuaVez`      | papel, ação principal e secundárias a partir de `Acoes`, impedimentos e advertências | detalhe, ateste                                |
| `BarraSaldoEmpenho` | comprometido, esta cotação, saldo depois, projeção                                   | detalhe, diálogo aprovar, cadastro, relatório  |
| `DialogMotivo`      | motivo com contador, mínimo e erro no campo; variante destrutiva                     | devolver, reprovar, cancelar, recusar urgência |

**API surface** (só leitura nova ou ampliada; nenhuma action nova):

| Função                                                                                | Tipo                                        | Entradas                                   | Saídas                                                                                                                                                                                                                                      | Acesso                              | Erros                                                                  |
| ------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| `listarFila` (`lib/material/leitura.ts`)                                              | leitura no servidor                         | `sessao`, `{ aba, q?, urgente?, pagina? }` | `{ linhas, total, pagina, porPagina: 25, contagens: Record<aba, number> }`                                                                                                                                                                  | mesma regra de visibilidade de hoje | aba inválida cai no padrão; página fora do intervalo vai para a última |
| `resumoDaFila` (novo, `leitura.ts`)                                                   | leitura no servidor                         | `sessao`                                   | TRF1 (inclui o Admin leitor sem designação, visão `trf1` como hoje): `{ esperandoVoce, emAprovacao: { qtd, valorCentavos }, atesteAtrasado, saldoElegivelCentavos }`; contratada: `{ esperandoVoce, devolvidas, nfPendente }`               | por visão                           | sem papel nenhum: zeros                                                |
| `lerDetalhe` (ampliada)                                                               | leitura no servidor                         | como hoje                                  | acrescenta, por `serializarCotacao`, `etapas: { situacao, em }[]` (TRF1 e contratada; da contratada sai da trilha já filtrada) e `montadoPorNome` (TRF1 e contratada); no TRF1, `empenho` (AC-8), que substitui o campo `projecoes` de hoje | como hoje                           | como hoje                                                              |
| `cartaoDoChamado` (ampliada)                                                          | leitura no servidor                         | como hoje                                  | a escolha da versão passa a ser por `cotacao.visao`; acrescenta `fase` (solicitante) e `quemAgeAgora` (TRF1 com nome; contratada só papel)                                                                                                  | como hoje                           | como hoje                                                              |
| `lerPendenciasMaterial` e `lerPainelMaterial` (`lib/material/cadastro.ts`, ampliadas) | leitura no servidor                         | sessão Admin                               | os 4 itens da lista do AC-19, com chave da seção, e as notas da navegação lateral do AC-18                                                                                                                                                  | só Admin                            | —                                                                      |
| `quemAgeAgora(situacao, cot)` (nova, `shared/material/quem-age.ts`)                   | função pura                                 | situação, se há fiscal que assumiu         | papel que age agora (mapa fixo por situação)                                                                                                                                                                                                | cliente e servidor                  | —                                                                      |
| `impedimentosDeEnvio` e as funções puras de `controles.ts`                            | movidas para `shared/material/controles.ts` | as mesmas                                  | as mesmas                                                                                                                                                                                                                                   | cliente e servidor                  | —                                                                      |

O que vai para `shared/material/controles.ts`: `impedimentosDeEnvio`, `impedimentosDoEncaminhar`, `pesquisaCompleta`, `itensComVariacaoAcima`, `orcamentosVencidos`, `advertenciasDePreco` e os auxiliares que elas usam (`defeitoDoCnpj`, `doCaminho3`, `daFaseEnvio`, `comPrecosEmTexto`, tipos `ItemDoCaminho3` e `OrcamentoParaControle`). `lib/material/controles.ts` fica como reexportação, para não mexer em quem importa hoje. A `raizContratada` que `impedimentosDeEnvio` pede chega ao editor no dado da visão `contratada` (é a raiz do CNPJ da própria contratada, de `MaterialConfig`).

**Value sourcing**:

| Ação                            | Valor                               | Fonte                                                                                                                                                                                                                                                                           |
| ------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fila, linha                     | na etapa há                         | `em` do último `CotacaoMaterialEvento` com `para` diferente de `de` (ou o evento de criação), numa única agregação `$match { cotacaoId: { $in: ids }, $expr: { $ne: ['$de', '$para'] } }` + `$group { _id: '$cotacaoId', desde: { $max: '$em' } }`; dias corridos até agora     |
| fila, linha                     | título do chamado                   | `Chamado.titulo` por `chamadoId`, numa consulta em lote                                                                                                                                                                                                                         |
| fila, linha                     | local                               | `Localizacao.caminho` por `CotacaoMaterial.localizacaoId` (vazio quando nulo), em lote                                                                                                                                                                                          |
| fila, linha                     | quantidade de itens                 | `CotacaoMaterial.itens.length`                                                                                                                                                                                                                                                  |
| fila, abas                      | contagem por aba                    | o mesmo filtro de cada aba em `listarFila`, com `q` e `urgente`, por `countDocuments`; "Todas" conta o total visível                                                                                                                                                            |
| fila, busca                     | casamento                           | `q` com caracteres de regex escapados; casa com `CotacaoMaterial.numero` por prefixo sem caixa, ou com `chamadoId $in` (Chamados com `ticket_number` igual a `q`) ou `ativoId $in` (Ativos com `codigo` igual a `q`); as duas consultas prévias rodam antes do filtro principal |
| fila, ordem nas abas de trâmite | chave                               | o "na etapa há"; o conjunto filtrado dessas abas é só de cotações em trâmite (pequeno), então busca os ids filtrados, agrega o "desde" e pagina depois de ordenar                                                                                                               |
| fila, ordem em Todas            | chave                               | `updatedAt` decrescente, `skip` e `limit` no banco; o "desde" só é agregado para as 25 da página                                                                                                                                                                                |
| resumo TRF1                     | saldo elegível                      | soma de `saldoCentavos` dos empenhos elegíveis (`saldo.ts`)                                                                                                                                                                                                                     |
| resumo TRF1                     | ateste fora do prazo                | o mesmo `prazoDoAteste` atrasado que hoje gera o selo, calculado em memória sobre as `executada`                                                                                                                                                                                |
| detalhe, cabeçalho              | quem montou                         | nome do usuário de `montadoPorUserId` (campo já gravado), entregue como `montadoPorNome` às visões TRF1 e contratada                                                                                                                                                            |
| detalhe, jornada                | data de cada etapa                  | `em` do primeiro evento com `para` igual à etapa, depois do último reenvio quando houve devolução                                                                                                                                                                               |
| detalhe, empenho                | líquido, comprometido, saldo depois | `EmpenhoElegivel` ampliado; saldo depois por situação, como no AC-8; projeção por `calcularProjecaoDoEmpenho`                                                                                                                                                                   |
| detalhe, Sua vez                | quem age                            | `quemAgeAgora` e, no TRF1, o nome do fiscal que assumiu                                                                                                                                                                                                                         |
| diálogo aprovar                 | barra por empenho                   | `projecoesDosEmpenhos` dos elegíveis; destaque por `consomeParcelaRelevante` com `MaterialConfig.parcelaRelevantePercentual`                                                                                                                                                    |
| diálogo aprovar                 | faixa de quem aprova                | `Designado.faixaNome` e `limiteCentavos`                                                                                                                                                                                                                                        |
| ateste                          | autorizado e aplicado               | por item: `quantidade × precoAplicadoCentavos` e `quantidadeExecutada`, `valorExecutadoCentavos`                                                                                                                                                                                |
| cartão solicitante              | fase e frase                        | mapa fixo situação → fase e frase por fase em `shared/material/mensagens.ts`                                                                                                                                                                                                    |
| cartão TRF1 e contratada        | quem age agora                      | `quemAgeAgora`; nome do fiscal só na visão TRF1                                                                                                                                                                                                                                 |
| checklist do editor             | impedimentos                        | `impedimentosDeEnvio` (movida para `shared/`) sobre o estado do formulário passado pelo mesmo adaptador do envio, com a `raizContratada` vinda do dado da contratada                                                                                                            |
| checklist do editor             | total                               | soma de quantidade vezes o menor preço por item, em centavos (`shared/material/valores.ts`)                                                                                                                                                                                     |
| cadastro, lista inicial         | itens                               | `lerPendenciasMaterial` ampliada: empenhos elegíveis, `FaixaCompetencia` ativas, designações vigentes por papel, itens do Anexo V vigente sem código SINAPI                                                                                                                     |
| cadastro, escada de faixas      | sem aprovador, teto                 | `FaixaLinha` ativas cruzadas com `DesignacaoLinha` vigentes de aprovador por `faixa`                                                                                                                                                                                            |
| importação, alterados           | antes e depois                      | `mudancas: { campo, antes, depois }` de `lib/material/importacao/revisao.ts`                                                                                                                                                                                                    |
| relatório, atalhos              | `inicio` e `fim`                    | primeiro dia do mês, do trimestre ou do ano corrente até hoje, em `YYYY-MM-DD` por `hojeEmBelem`                                                                                                                                                                                |
| relatório, números do topo      | os quatro                           | `tempoAutorizacao`, `devolvidas`, `impedimentoPrimeiraTentativa`, `divergencia` de `RelatorioMaterial`                                                                                                                                                                          |

**Key invariants**:

- Nenhum componente decide permissão: o que aparece vem de `acoesDisponiveis` e das leituras já filtradas.
- Os campos só TRF1 do AC-24 nunca entram no payload de outra visão; todo campo novo passa por `serializarCotacao` ou pelo serializador do cartão, nunca montado fora deles.
- A versão do cartão sai de `cotacao.visao`, nunca de `role`.
- As funções movidas para `shared/material/controles.ts` não importam `server-only`, mongoose nem `lib/`.
- Toda tela sem dado mostra um estado vazio com frase; carregamento usa esqueleto, não tela em branco.

**Security model**: o mesmo da spec 0019. Lado TRF1 (fiscal, gestor, aprovador; Admin só leitura sem designação), contratada (responsável técnico), técnico atribuído e solicitante. As leituras novas reaproveitam `filtroVisivelParaContratada` e a checagem de papel de `listarFila` e `lerDetalhe`. O cadastro e o relatório continuam só Admin.

**Configuration required**: nenhuma variável nova.

**Critical test scenarios**:

- Fila, TRF1, aba Análise com busca por número do chamado e "Só urgentes": volta só a linha certa, com contagem e página certas, e o endereço guarda os filtros; verifica **AC-3**, **AC-2**.
- Fila: cotação com evento antigo de mudança de situação e escritas recentes sem mudança mostra o tempo desde o evento, não desde `updatedAt`; verifica **AC-4**.
- Teste por visão de `serializarCotacao` e do cartão: TRF1 recebe os campos do AC-24; contratada, técnico e solicitante não recebem nenhum deles, e o Preposto (responsável técnico) recebe o cartão da contratada, sem nome do fiscal; verifica **AC-24**, **AC-16**.
- Detalhe autorizado: o saldo depois é igual ao saldo atual do empenho da cotação (sem desconto em dobro); em aprovação, é saldo menos valor por elegível; verifica **AC-8**.
- Busca com `q` contendo `.*(`: não quebra nem casa tudo; busca pelo `ticket_number` acha a cotação do chamado; verifica **AC-3**.
- Última página esvaziada por uma transição: `?pagina=` além do total cai na última página; verifica **AC-3**.
- Detalhe em análise com orçamento vencido: o painel lista a advertência com título e o Encaminhar só habilita com a confirmação marcada; verifica **AC-6**, **AC-10**.
- `DialogMotivo` com texto abaixo do mínimo: erro no campo, botão não envia; verifica **AC-11**.
- Editor: a lista "Pronta para enviar?" dá o mesmo resultado que o envio no servidor para o mesmo formulário, incluindo vírgula decimal, CNPJ com máscara e campos vazios (teste de paridade que passa pelo adaptador do formulário); verifica **AC-15**.
- Cartão do solicitante em cada situação: fase certa, sem valor e sem nome; verifica **AC-16**.
- Sheet da gestão com cotação antiga `enviada`: bloco aberto; sem ela, recolhido; verifica **AC-17**.
- Cadastro: `?secao=faixas` abre a seção; desativar pede confirmação; verifica **AC-18**, **AC-21**.
- Fluxo E2E `cotacao-flow.spec.ts` inteiro com as telas novas, no celular (390 px) e no desktop, com `@axe-core/playwright` em cada tela do módulo sem violação de contraste; verifica **AC-25**, **AC-26**, **AC-29**.

## Build plan

Abordagem do projeto: Tracer Bullet. A fatia 1 leva as peças compartilhadas de ponta a ponta na tela mais usada (a fila, do servidor à tela); cada fatia seguinte engrossa o fio numa tela e vai para produção sozinha, num PR próprio.

1. **Fatia 1, peças e fila.** Criar `SituacaoPill`, `JornadaCotacao`, `SinaisCotacao` e `quemAgeAgora`, com testes; ampliar `listarFila` (busca escapada com consultas prévias de Chamado e Ativo, filtro, ordem por aba, página, contagens, "desde" agregado, título, local, em lote) e criar `resumoDaFila`; refazer `cotacoes/page.tsx` com abas `Tabs`, resumo, barra de busca e filtros em `searchParams`, tabela no desktop e cartões no celular; mover os textos para `mensagens.ts`; adicionar a variante de gradiente usada pelo módulo; instalar `@axe-core/playwright` e checar a fila. As peças desta fatia não dependem de nada das fatias seguintes, satisfaz **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-24**, **AC-25**, **AC-26**, **AC-27**, **AC-28**
2. **Fatia 2, detalhe.** Criar `PainelSuaVez` e `BarraSaldoEmpenho`; ampliar `EmpenhoElegivel` (líquido, comprometido) e `serializarCotacao` (`etapas`, `montadoPorNome`, `empenho` por situação no lugar de `projecoes`), com teste por visão; refazer `DetalheCotacaoView.tsx` com cabeçalho, jornada, duas colunas, abas Itens (com `OrigemDoItem` e `ReferenciasPreco` só no visual), Orçamentos (grade) e Trilha por visão; trocar o visual de `BotaoPdfCotacao` e `CompletarPesquisa`; pôr "Conciliação do saldo" em `ROTULO_ACAO`; criar o primeiro teste de componente do detalhe, satisfaz **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-24**, **AC-25**
3. **Fatia 3, ateste.** Refazer `AtesteCotacao.tsx` em três etapas, com o painel do gestor, a tabela de autorizado e aplicado e a lista de evidências; ajustar o teste existente, satisfaz **AC-9**, **AC-6**
4. **Fatia 4, diálogos.** Criar `DialogMotivo` e trocar os quatro diálogos de motivo; refazer `DialogEncaminhar.tsx` (pontos numerados) e o diálogo Aprovar (barra por empenho, texto novo, faixa por `Designado.faixaNome`), satisfaz **AC-10**, **AC-11**, **AC-27**
5. **Fatia 5, editor da contratada.** Mover as funções puras e os auxiliares de `lib/material/controles.ts` para `shared/material/controles.ts` com reexportação; levar `raizContratada` ao dado da contratada; teste de paridade pelo adaptador do formulário; dividir `EditorContratada.tsx` em 4 passos com navegação livre; trazer a busca do `DialogClassificar` para dentro do item; montar a grade de preços; criar a lista "Pronta para enviar?"; padronizar rótulos; ajustar o teste existente, satisfaz **AC-12**, **AC-13**, **AC-14**, **AC-15**, **AC-27**
6. **Fatia 6, cartão no chamado.** Trocar a escolha da versão em `cartaoDoChamado` de `role` para `cotacao.visao`, com `fase` e `quemAgeAgora` por visão e teste por visão; refazer `CartaoCotacaoMaterial.tsx` nas quatro versões, além de `DialogMaterial.tsx` e `DialogExecucao.tsx`; recolher o `CotacaoApprovalCard` no `ChamadoDetailSheet`; ajustar o teste existente, satisfaz **AC-16**, **AC-17**, **AC-24**
7. **Fatia 7, cadastro de material.** Trocar `Tabs defaultValue` de `GerirMaterial.tsx` por `?secao=` com navegação lateral; ampliar `lerPendenciasMaterial` e `lerPainelMaterial` (lista inicial com chave da seção, notas laterais, textos sem "caminho 1/2") e `Designado` com `faixaNome`; refazer empenhos, designações, faixas (escada), `TabelasPreco.tsx` (revisão com antes e depois) e `ParametrosMaterial.tsx`; criar os diálogos de confirmação; ajustar o teste existente, satisfaz **AC-18**, **AC-19**, **AC-20**, **AC-21**, **AC-22**
8. **Fatia 8, relatório.** Refazer `RelatorioMaterialTela.tsx` com atalhos de período por `hojeEmBelem`, os quatro números do topo, barras, empenhos e pontos de atenção; tirar "RN-36"; ajustar o teste existente, satisfaz **AC-23**
9. **Em cada fatia**: atualizar `e2e/cotacao-flow.spec.ts` e `e2e/fixtures/material.ts` onde rótulos e seletores mudarem, rodar o axe nas telas trocadas, rodar a suíte de `lib/material` sem mudar expectativa e conferir a tela a 390 px, satisfaz **AC-25**, **AC-26**, **AC-29**

## Migration plan

**Strategy**: no migration needed. Cada fatia substitui uma tela inteira no mesmo endereço; não há dado a transformar.
**Rollback**: reverter o PR da fatia. As peças compartilhadas da fatia 1 continuam valendo para as telas já trocadas.
**Risks**: E2E e testes de componente que procuram texto antigo quebram na fatia que muda o texto; corrigir no mesmo PR.

## Consequences

**Positive**:

- A ação esperada de cada papel fica no topo; menos devoluções por esquecimento graças à lista ao vivo.
- A fila passa a escalar (paginação, busca) e a medir o tempo certo.
- Um único lugar para selo, jornada, saldo e motivo, em vez de cópias divergentes.

**Negative / tradeoffs**:

- Oito PRs e um período em que parte do módulo tem visual novo e parte o antigo.
- "Mais tempo na etapa" ordena na leitura, depois de buscar os ids filtrados das abas de trâmite; por isso a aba Todas ordena por "Mais recentes". Se as cotações em trâmite chegarem a milhares, vira o motivo para um campo `situacaoDesde`.
- A busca faz até duas consultas prévias (Chamado e Ativo) por pedido da fila.
- Uma dependência de desenvolvimento nova: `@axe-core/playwright`.
- Mover `controles.ts` para `shared/` expõe as regras de impedimento ao navegador (não são segredo, mas passam a pesar no pacote do editor).
- Revogar, desativar e inativar continuam sem motivo nem histórico; a confirmação evita o clique errado, não registra o porquê.
- O canvas usa botão sólido e Inter; a implementação diverge dele de propósito (AC-28).

**Neutral**:

- `components/ui/button.tsx` pode ganhar uma variante de gradiente; os 79 usos caso a caso fora do módulo não mudam agora.

## Follow-up

- [ ] Motivo e histórico em revogar designação, desativar faixa e inativar empenho: spec própria, porque muda schemas e actions.
- [ ] Se a contagem de cotações em trâmite passar de algumas centenas, avaliar o campo `situacaoDesde` gravado na transição.
- [ ] Variante de gradiente no `Button` para o Sigma inteiro, substituindo os usos caso a caso.
- [ ] A visão do Admin sem designação (só leitura) e das situações reprovada e cancelada não foi desenhada no canvas; seguir o padrão do detalhe com o painel "Sua vez" informando quem age.
- [ ] Miniatura de imagem nas evidências: pede servir o arquivo inline e decidir o controle de quem vê; fica para depois.
- [ ] Depois de `@axe-core/playwright` instalado, registrar o uso na seção de testes do `AGENTS.md` (o `/sync` faz).
