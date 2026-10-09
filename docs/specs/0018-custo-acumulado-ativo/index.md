# 0018. Custo acumulado por ativo

**Date**: 2026-10-08
**Status**: Accepted

## Summary

O Sigma passa a saber quanto cada equipamento custou em manutenção. O custo de um chamado é a soma de duas partes: as cotações aprovadas (valendo o valor final quando a gestão informar, senão o estimado) e os itens de material fora de cotação, que o Preposto ou o Admin lançam no chamado com quantidade e valor unitário. O custo do ativo é a soma dos chamados dele, separada em corretivo e preventiva, sempre calculada na hora (nada fica gravado no ativo). O número aparece na ficha, no IMR, no relatório por contrato e vira o quarto critério de candidato à substituição, sempre só para Admin e Preposto.

## Requirements

**User stories**:

- Como Preposto, quero lançar no chamado o material que foi comprado sem cotação, com quantidade e valor, para o gasto real do equipamento não ficar invisível.
- Como Admin ou Preposto, quero informar o valor final de uma cotação aprovada quando a nota chega diferente do estimado, para o custo refletir o que foi pago.
- Como Admin ou Preposto, quero ver na ficha do ativo quanto ele custou nos últimos 12 meses e desde sempre, e de quais chamados veio, para decidir entre consertar e trocar com números.
- Como Admin, quero ver no IMR e no relatório por contrato quais equipamentos mais custaram no período, para levar ao fiscal e ao planejamento.
- Como Admin, quero que um equipamento cujo conserto em 12 meses já passou de uma fração do valor dele apareça como candidato à substituição.

**Acceptance criteria**:

_Lançamento no chamado_

- **AC-1**: Lançar item de material. No `ChamadoDetailSheet` de `/gestao`, uma seção "Custo" permite ao Admin e ao Preposto lançar um item com `descricao` (texto de 3 a 200 caracteres, sem espaços nas pontas), `quantidade` (maior que zero, até 3 casas decimais, no máximo 99.999) e `valorUnitario` em reais (maior que zero, até 2 casas decimais, no máximo 9.999.999,99). O item grava `criadoPorUserId` e `criadoEm`. Valor fora da regra devolve "Descrição do material inválida.", "Quantidade inválida." ou "Valor unitário inválido.". A regra de casas decimais compara o número com ele mesmo arredondado, com tolerância: `Math.abs(x × 10^casas − Math.round(x × 10^casas)) < 1e-9` (um apoio único em `shared/chamados/custo.schemas.ts`, usado também no valor final). O campo traz o texto de ajuda "Lance só o material que não passou por cotação aprovada." e a seção lista, logo acima, as cotações aprovadas do chamado.
- **AC-2**: Editar e remover item. O Admin e o Preposto editam os três campos de um item já lançado (mesmas regras do AC-1) ou o removem. Remover tira o item do chamado; a cópia dele fica no histórico (AC-6). Item que não existe mais (outra pessoa removeu) devolve "Este item não existe mais. Recarregue o chamado.". A edição troca só `descricao`, `quantidade` e `valorUnitario` (por `$set` posicional), nunca `criadoPorUserId` nem `criadoEm`.
- **AC-2a**: Qual erro aparece. As ações de item gravam numa única operação atômica no `Chamado`, com o status, o item e o teto no filtro. Quando essa gravação não acha documento, uma releitura do chamado escolhe a mensagem, nesta ordem: chamado não existe ("Chamado não encontrado."), status travado (AC-3), item não existe (AC-2), teto cheio (AC-4).
- **AC-3**: Quando se pode lançar. Lançar, editar e remover item, e informar o valor final (AC-5), só valem com o chamado em `em atendimento`, `aguardando_solicitante`, `aguardando_terceiros` ou `concluído` (constante nova `STATUS_CUSTO_EDITAVEL`). Em `aberto`, `validado`, `encerrado`, `cancelado` ou `recusado`, a ação devolve "O custo deste chamado não pode mais ser alterado." e a seção mostra os valores só para leitura. Um chamado reaberto volta a um status da lista e destrava de novo, sem regra extra.
- **AC-4**: Teto de itens. Um chamado tem no máximo 50 itens (`MAX_MATERIAIS_CHAMADO`). O 51º devolve "Este chamado já tem 50 itens de material.". O teto vale também quando duas pessoas lançam ao mesmo tempo (conferido na própria gravação, não numa leitura anterior).
- **AC-5**: Valor final da cotação. Na mesma seção, cada cotação `aprovada` do chamado mostra o valor estimado e um campo "Valor final". O Admin e o Preposto informam um valor de 0 a 9.999.999,99 com até 2 casas, ou limpam o campo. Limpo (`null`) faz valer o estimado de novo; zero diz que a cotação aprovada não virou gasto. Grava `valorFinal`, `valorFinalPorUserId` e `valorFinalEm`. Cotação `enviada` ou `recusada` devolve "Só cotação aprovada tem valor final.". Valor inválido devolve "Valor final inválido.". As conferências seguem esta ordem, e a primeira que falha decide a mensagem: permissão, validação, cotação existe ("Cotação não encontrada."), cotação aprovada, status do chamado (AC-3). A gravação usa o filtro `{ _id, status: 'aprovada' }` na `Cotacao`. Como o status do chamado mora em outra coleção, ele é conferido numa leitura logo antes; fica aceita a janela mínima em que o chamado é encerrado entre essa leitura e a gravação (o valor gravado vale, e o histórico registra).
- **AC-6**: Histórico. Cada ação grava um `ChamadoHistory` com uma das ações novas `custo_material_lancado`, `custo_material_editado`, `custo_material_removido` e `cotacao_valor_final` (acrescentadas ao enum `CHAMADO_HISTORY_ACTIONS`), sem `statusAnterior` nem `statusNovo` (como `correcao_gestao`), com rótulos em `CHAMADO_HISTORY_ACTION_LABELS` ("Material lançado", "Material editado", "Material removido", "Valor final da cotação"). A `observacoes` traz o item no formato `<descricao>: <quantidade> × R$ <unitário> = R$ <total>` (na edição, "de ... para ..."; na remoção, o item removido) ou, para a cotação, "Valor final de R$ <antes ou 'estimado'> para R$ <depois ou 'estimado'>". As quatro entram em `ACOES_SO_DA_GESTAO`: o solicitante e o técnico nunca as veem, nem na rota de histórico nem na linha do tempo da conversa. Nenhuma das quatro muda o status do chamado nem emite evento do Socket.IO.
- **AC-7**: A seção "Custo". Mostra as cotações aprovadas (estimado, final e o valor que conta), a tabela de itens (descrição, quantidade, unitário, total do item, quem lançou), o total de cotações, o total de material e o total do chamado. Sem cotação aprovada e sem item, mostra "Nenhum custo lançado neste chamado.". As cotações vêm da rota `/api/chamados/[id]/cotacoes` (que já existe) e os itens vêm do `ChamadoDTO` da lista da gestão (`/api/gestao/chamados`). Como a lista de `/gestao` é buscada no navegador, depois de cada ação que dá certo a seção busca de novo as cotações e o chamado; o `revalidatePath` sozinho não atualiza a tela. Os valores usam o formato brasileiro (`R$ 1.234,56`), e a quantidade mostra até 3 casas sem zeros à direita (`2,5`).
- **AC-8**: Chamado sem ativo. A seção funciona igual em chamado sem `ativoId`, com a nota "Este chamado não tem ativo; o custo passa a contar para o equipamento quando ele for vinculado.". O custo segue o `ativoId` atual do chamado: vincular depois, ou trocar o ativo (`vincularAtivoChamadoAction`), muda o ativo que soma esse custo na próxima leitura, sem nenhuma gravação extra. Chamado `encerrado` não troca de ativo (regra de `STATUS_SEM_VINCULO_ATIVO`), então o custo dele fica no ativo que tinha.

_A conta_

- **AC-9**: Valor de um chamado. Cada cotação `aprovada` vale `valorFinal` quando não é `null`, senão `valorEstimado`. Cada item vale `quantidade × valorUnitario`. A conta é feita em inteiros: cada cotação vira `Math.round(valor × 100)` centavos (um `valorEstimado` antigo com mais de 2 casas é arredondado aqui); cada item vira `Math.round(quantidade × 1000) × Math.round(valorUnitario × 100)` milésimos de centavo, arredondados uma única vez para centavos (`Math.round(x / 1000)`). O arredondamento é por item; as somas são de centavos inteiros. Exemplo de teste: três itens de 0,1 × R$ 0,10 (1 centavo cada) e um de 1 × R$ 0,20 somam exatamente R$ 0,23. O custo do chamado é cotações mais material. Cotação `enviada` ou `recusada` nunca soma.
- **AC-10**: Valor de um ativo. Somam os chamados com aquele `ativoId` e `status` fora de `STATUS_FORA_DO_CORRETIVO` (`cancelado` e `recusado`, a constante que já existe), inclusive os ainda em andamento (contam com o que já foi aprovado ou lançado). Chamado com `originTemplateId` soma na parte "preventiva"; sem ele, na parte "corretivo". O chamado entra no período pela `createdAt` (o mesmo critério dos corretivos, do MTBF e do relatório por contrato).

_Onde aparece_

- **AC-11**: Ficha do ativo. Para Admin e Preposto, a ficha mostra um bloco "Custo de manutenção" com: custo corretivo, custo preventiva e total nos últimos 12 meses (a mesma `janelaDeHoje` dos `corretivos12m`); o total desde sempre (todos os chamados do ativo, sem filtro de data e sem teto, ainda fora de `cancelado` e `recusado`); e a lista dos chamados com custo maior que zero (número do chamado e link por `linkDoChamado`, como a lista de chamados da ficha, data de abertura, corretivo ou preventiva, cotações, material e total), da abertura mais nova para a mais antiga (empate pelo `_id`, maior primeiro), até 50 (`LIMITE_CHAMADOS_FICHA`). Os totais nunca dependem do teto da lista. Sem nenhum custo: "Nenhum custo registrado para este ativo.".
- **AC-12**: IMR, aba Ativos. O ranking atual (por corretivos) ganha a coluna "Custo no período" (corretivo mais preventiva do ativo no período escolhido). Uma segunda tabela "Mais caros no período" lista até 10 ativos (`RANKING_MAX`) com custo maior que zero, com as colunas código (com link), descrição, categoria, local, custo corretivo, custo preventiva e total, ordenados por total (maior primeiro), depois pelo `codigo` em ordem numérica. As duas seguem o período e o seletor de tipo de serviço que a aba já usa. Como o filtro de corretivo de `calcularIndicadoresAtivos` deixa as preventivas de fora, a conta de custo faz uma leitura própria dos chamados com ativo no mesmo período e tipo, com e sem `originTemplateId`, fora de `cancelado` e `recusado`. Sem nenhum ativo com custo, a tabela diz "Nenhum custo registrado no período.".
- **AC-13**: Relatório por contrato. Na tela e no PDF, a tabela por ativo ganha a coluna "Custo" (total do ativo no mês); a tabela por categoria ganha "Custo corretivo" e "Custo preventiva"; o resumo ganha "Custo total do mês". O escopo é o mesmo que o relatório já usa (ativos e chamados dos tipos de serviço do contrato no mês). A leitura de `montarRelatorioContrato` começa antes do mês (janela de reincidência), então o custo soma só os chamados que passam em `dentro(c, inicio, fim)`, e a seleção dos chamados passa a incluir o `_id`. Ativo sem categoria soma numa linha "Sem categoria" da tabela por categoria. O PDF traz, no rodapé do resumo, "Custos lançados até dd/mm/aaaa hh:mm (horário de Belém)", com o momento da geração. Uma emissão nova pode ter custo diferente da anterior; cada uma fica com o próprio hash em `RelatorioContratoEmissao`, sem regra nova.
- **AC-14**: Paridade. A ficha, o IMR, o relatório por contrato e o critério de substituição usam as mesmas funções de conta (`custoDoChamado` e a leitura em lote de `lib/ativos/custo.ts`). Para o mesmo ativo e a mesma janela, os quatro mostram o mesmo número.

_Substituição_

- **AC-15**: Critério de custo. `CRITERIOS_SUBSTITUICAO` ganha `custo`. Bate quando o custo corretivo dos últimos 12 meses (o mesmo número da ficha, AC-11) é igual ou maior que `limite% × camposPatrimoniais.valorHistorico`, comparado só com inteiros: `custoCorretivoCentavos × 100 ≥ limite × Math.round(valorHistorico × 100)`. A ficha passa o custo que já calculou para `situacaoSubstituicaoDaFicha`; a leitura em lote (`listarSituacoesSubstituicao`) calcula o custo dos mesmos chamados corretivos que já lê. `CAMPOS_ATIVO_AVALIACAO` passa a ler `camposPatrimoniais.valorHistorico` e `CAMPOS_CATEGORIA_AVALIACAO` passa a ler `limiteCustoPercentual12m` (com os tipos `AtivoParaAvaliar`, `CategoriaParaAvaliar` e `entradaDaAvaliacao`). Sem `valorHistorico`, ou com ele zero ou negativo, o critério não é avaliado (não bate), e a ficha diz "Custo não avaliado: o ativo não tem valor histórico.". O motivo mostra "Custo em 12 meses: R$ X (Y% do valor histórico; limite Z%)", com Y arredondado para inteiro, pelo `textoDoMotivo` que a ficha e o IMR já compartilham. A ordem das listas de candidatos não muda (quantidade de critérios, `corretivos12m`, código).
- **AC-16**: Limite por categoria. `CategoriaAtivo` ganha `limiteCustoPercentual12m`, inteiro de 1 a 999, opcional. Vazio usa o padrão de 50% (`LIMITE_CUSTO_PERCENTUAL_12M_PADRAO`). Só o Admin edita, em `/configuracoes/categorias-ativo`, ao lado dos outros dois limites, com o padrão como dica. Campo vazio grava `null`, inclusive ao limpar; na atualização, campo ausente (`undefined`) não muda nada e `null` limpa. Fora da regra devolve "Limite de custo inválido.". A lista de categorias mostra o limite (ou "padrão").
- **AC-17**: Dispensa. `custo` entra na dispensa como os outros critérios, sem migração (`motivosNaDispensa` já usa `CRITERIOS_SUBSTITUICAO`). Uma dispensa gravada antes desta spec não tem `custo`, então o ativo dispensado volta à lista se o custo bater, pela regra que já existe na 0015.

_Segurança e falhas_

- **AC-18**: Quem vê e quem mexe. Só Admin e Preposto lançam, editam, removem e informam valor final; o técnico, o solicitante e quem não tem sessão recebem "Sem permissão." sem nada gravado. `valorFinal`, `valorFinalPorUserId`, `valorFinalEm` e `materiaisForaCotacao` só saem do servidor para Admin e Preposto: a rota `/api/chamados/[id]/cotacoes` devolve o valor final só a eles (o solicitante e o técnico continuam vendo o estimado, como hoje), e as rotas de `meus-chamados` e `chamados-atribuidos` nunca projetam `materiaisForaCotacao`. O bloco de custo da ficha e as colunas de custo nunca saem para o técnico, que continua vendo corretivos, MTBF e MTTR.
- **AC-19**: Falha isolada. Se a leitura de custo falhar na ficha ou no IMR, o resto da página aparece normal e o bloco de custo mostra "Não foi possível calcular o custo agora.". No relatório por contrato, a falha da leitura de custo falha o relatório inteiro com a mensagem de erro que ele já tem, para nunca emitir PDF com custo zerado por engano.

## Decision

**Chosen option**: Option 3: cotações aprovadas com valor final opcional, mais itens de material fora de cotação lançados pela gestão, somados na leitura.

O custo de um ativo é a soma, calculada na hora, das cotações aprovadas e dos itens de material dos chamados dele; nada novo é gravado no ativo.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

| Entidade                  | Campo novo                 | Tipo                   | Obrigatório        | Regra                                                                 |
| ------------------------- | -------------------------- | ---------------------- | ------------------ | --------------------------------------------------------------------- |
| `Cotacao` (existe)        | `valorFinal`               | Number (reais)         | não, padrão `null` | de 0 a 9.999.999,99, até 2 casas; só gravado com `status: 'aprovada'` |
|                           | `valorFinalPorUserId`      | ObjectId → `User`      | não, padrão `null` | quem gravou por último                                                |
|                           | `valorFinalEm`             | Date                   | não, padrão `null` | quando                                                                |
| `Chamado` (existe)        | `materiaisForaCotacao`     | array de subdocumentos | padrão `[]`        | até 50 itens; cada item tem `_id` próprio (o padrão do Mongoose)      |
| ↳ item                    | `descricao`                | String                 | sim                | 3 a 200, `trim`                                                       |
| ↳ item                    | `quantidade`               | Number                 | sim                | maior que 0, até 3 casas, até 99.999                                  |
| ↳ item                    | `valorUnitario`            | Number (reais)         | sim                | maior que 0, até 2 casas, até 9.999.999,99                            |
| ↳ item                    | `criadoPorUserId`          | ObjectId → `User`      | sim                | quem lançou                                                           |
| ↳ item                    | `criadoEm`                 | Date                   | sim                | quando lançou (editar não muda)                                       |
| `CategoriaAtivo` (existe) | `limiteCustoPercentual12m` | Number                 | não, padrão `null` | inteiro de 1 a 999; `null` usa 50                                     |
| `Ativo`                   | nada                       |                        |                    | o custo é calculado na leitura                                        |

Relações: nenhuma nova. `Ativo 1:N Chamado` por `Chamado.ativoId`; `Chamado 1:N Cotacao` por `Cotacao.chamadoId` (o índice de `chamadoId` já existe). Sem índice novo: a leitura parte dos chamados (já indexados por `ativoId` e `createdAt`) e busca as cotações por `chamadoId: { $in }`. Migração: nenhuma; os campos novos têm padrão e os documentos antigos leem como `null` ou `[]`.

Novas constantes: `STATUS_CUSTO_EDITAVEL`, `MAX_MATERIAIS_CHAMADO = 50` (em `shared/chamados/custo.constants.ts`), `LIMITE_CUSTO_PERCENTUAL_12M_PADRAO = 50` e os limites 1 e 999 (em `shared/ativos/substituicao.constants.ts`), as quatro ações de histórico (em `shared/chamados/history.constants.ts`).

**State transitions**: nenhuma nova. A edição de custo é permitida por status (AC-3), e as ações de custo nunca mudam o status do chamado.

**API surface**:

| Ação ou rota                                                          | Tipo          | Entradas principais                                     | Saída                                                                  | Quem            | Erros principais                                                             |
| --------------------------------------------------------------------- | ------------- | ------------------------------------------------------- | ---------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------- |
| `adicionarMaterialAction` (`app/(dashboard)/gestao/custo.actions.ts`) | Server Action | `chamadoId`, `descricao`, `quantidade`, `valorUnitario` | `{ ok: true, itemId }`                                                 | Admin, Preposto | sem permissão, status travado, teto de 50, validação, chamado não encontrado |
| `editarMaterialAction`                                                | Server Action | `chamadoId`, `itemId`, os três campos                   | `{ ok: true }`                                                         | Admin, Preposto | item não existe, status travado, validação                                   |
| `removerMaterialAction`                                               | Server Action | `chamadoId`, `itemId`                                   | `{ ok: true }`                                                         | Admin, Preposto | item não existe, status travado                                              |
| `informarValorFinalCotacaoAction`                                     | Server Action | `cotacaoId`, `valorFinal: number \| null`               | `{ ok: true }`                                                         | Admin, Preposto | cotação não aprovada, status do chamado travado, validação                   |
| `GET /api/chamados/[id]/cotacoes` (existe)                            | rota          | `id`                                                    | ganha `valorFinal`, `valorFinalPorName`, `valorFinalEm` só para gestão | quem já lê      | sem mudança                                                                  |
| `GET /api/gestao/chamados` (existe)                                   | rota          |                                                         | projeta e normaliza `materiaisForaCotacao` (com o nome de quem lançou) | Admin, Preposto | sem mudança                                                                  |
| `carregarFicha` (`lib/ativos/ficha.ts`, existe)                       | leitura       | `id`, sessão                                            | `custo?: CustoDaFicha` só para gestão                                  | Admin, Preposto | falha vira `custo: { erro: true }` (AC-19)                                   |
| `calcularIndicadoresAtivos` (existe)                                  | leitura       | período, tipo                                           | ranking com `custoTotal`, lista `maisCaros`                            | Admin (IMR)     | falha isolada (AC-19)                                                        |
| `montarRelatorioContrato` (existe) e o PDF                            | leitura       | contrato, mês                                           | colunas e total de custo, `geradoEm`                                   | Admin           | falha derruba o relatório (AC-19)                                            |

Todas as actions seguem o padrão do projeto: sessão, `dbConnect`, `safeParse`, gravação, `ChamadoHistory`, `revalidatePath('/gestao')`, retorno `{ ok }`, nunca lançam.

Funções novas:

- `shared/chamados/custo.ts` (puro, usado no cliente e no servidor): `centavos(valor)`, `valorDaCotacao(c)`, `valorDoItem(i)`, `custoDoChamado({ cotacoesAprovadas, materiais })` devolvendo `{ cotacoesCentavos, materialCentavos, totalCentavos }`, e `formatarReais(centavos)`.
- `shared/chamados/custo.schemas.ts`: schemas Zod do item, da edição, da remoção e do valor final, com a regra de casas decimais.
- `lib/ativos/custo.ts` (`server-only`): `lerCustosDosChamados(chamados)` (recebe chamados já lidos com `_id`, `ativoId`, `createdAt`, `originTemplateId` e `materiaisForaCotacao`, busca as cotações aprovadas por `chamadoId: { $in }` e devolve o custo de cada chamado), `custoPorAtivo(custos, janela)` filtrando pela `createdAt` dentro da janela recebida e agrupando em `{ corretivoCentavos, preventivaCentavos, totalCentavos }` por ativo, e `custoDaFicha(ativoId, agora)`.
- `Cotacao`: os três campos novos com `required: false, default: null` (`valorFinal` com `min: 0`), e acrescentados ao tipo TypeScript escrito à mão em `models/Cotacao.ts`.

**Value sourcing**:

| Ação                                          | Valor produzido ou mostrado      | Fonte                                                                                                       |
| --------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| lançar item                                   | `criadoPorUserId`, `criadoEm`    | sessão (`session.userId`), relógio do servidor                                                              |
| lançar, editar, remover                       | se o status permite              | `Chamado.status` no filtro da própria gravação, contra `STATUS_CUSTO_EDITAVEL`                              |
| valor final                                   | se o status permite              | `Chamado.status` lido logo antes da gravação na `Cotacao` (coleção diferente; janela aceita, AC-5)          |
| teto de itens                                 | quantos itens existem            | filtro `'materiaisForaCotacao.49': { $exists: false }` na gravação                                          |
| histórico da remoção                          | o item removido                  | documento anterior devolvido pela própria gravação (`findOneAndUpdate` com `$pull`, sem `new: true`)        |
| histórico do valor final                      | valor anterior                   | `Cotacao.valorFinal` antes da gravação (mesmo padrão)                                                       |
| valor de uma cotação                          | valor que conta                  | `Cotacao.valorFinal ?? Cotacao.valorEstimado`, só `status: 'aprovada'`                                      |
| valor de um item                              | total do item                    | `Math.round(quantidade × 1000) × Math.round(valorUnitario × 100)`, arredondado uma vez para centavos (AC-9) |
| mensagem de erro das ações de item            | qual falhou                      | releitura do chamado quando a gravação atômica não acha documento (AC-2a)                                   |
| cotações na seção "Custo"                     | lista com valor final            | `GET /api/chamados/[id]/cotacoes`, buscada de novo depois de cada ação                                      |
| itens na seção "Custo"                        | lista                            | `ChamadoDTO.materiaisForaCotacao` de `/api/gestao/chamados`, buscado de novo depois de cada ação            |
| custo no relatório por contrato               | chamados do mês                  | os chamados que `montarRelatorioContrato` já lê, filtrados por `dentro(c, inicio, fim)`                     |
| custo na substituição em lote                 | chamados corretivos dos 12 meses | os que `listarSituacoesSubstituicao` já lê                                                                  |
| corretivo ou preventiva                       | parte do custo                   | `Chamado.originTemplateId` (presente = preventiva)                                                          |
| período do custo                              | data do gasto                    | `Chamado.createdAt`                                                                                         |
| janela de 12 meses da ficha e da substituição | início e fim                     | `janelaDeHoje(agora)` de `lib/ativos/indicadores.ts` (spec 0015)                                            |
| período do IMR                                | início, fim, tipo                | o filtro que a aba Ativos já recebe                                                                         |
| mês do contrato                               | início, fim, tipos               | `montarRelatorioContrato` (spec 0016)                                                                       |
| "custos lançados até" no PDF                  | momento                          | relógio do servidor na geração, formatado em `America/Belem`                                                |
| percentual da substituição                    | base                             | `Ativo.camposPatrimoniais.valorHistorico` (reais, do SICAM)                                                 |
| limite da substituição                        | percentual                       | `CategoriaAtivo.limiteCustoPercentual12m ?? LIMITE_CUSTO_PERCENTUAL_12M_PADRAO`                             |
| nome de quem lançou ou informou               | rótulo                           | `User.name` lido em lote, como a rota de cotações já faz                                                    |
| formato do dinheiro                           | texto                            | `formatarReais`, `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })` sobre centavos ÷ 100  |

**Key invariants**:

- O custo nunca é gravado fora de `Cotacao` e `Chamado.materiaisForaCotacao`; ficha, IMR, relatório e substituição sempre recalculam (AC-14).
- Toda soma é de centavos inteiros; reais só existem na entrada e na exibição.
- Cotação que não está `aprovada` nunca soma, e nunca tem `valorFinal` gravado.
- Um chamado nunca passa de 50 itens, mesmo com gravações simultâneas.
- Toda mudança de custo deixa um `ChamadoHistory` de ação só da gestão.
- `cancelado` e `recusado` nunca somam, mesmo com cotação aprovada.

**Security model**: só Admin e Preposto escrevem (checagem de papel em cada action, nunca só na tela) e leem valores de custo. O técnico e o solicitante continuam vendo exatamente o que veem hoje, inclusive o `valorEstimado` da cotação; nenhum campo novo chega a eles por rota, action, histórico ou ficha. O IMR e o relatório por contrato continuam só do Admin. Sem dado pessoal novo: `criadoPorUserId` é de servidor ou preposto, igual ao que o histórico já guarda.

**Configuration required**: nenhuma variável de ambiente nova.

**Critical test scenarios**:

- Happy path: Preposto lança 2,5 × R$ 10,00 num corretivo com ativo e uma cotação aprovada de R$ 300,00 com valor final R$ 280,00; a seção mostra R$ 305,00, a ficha mostra R$ 305,00 em corretivo nos 12 meses e no total, e o IMR do mês mostra o mesmo valor; verifies **AC-1**, **AC-5**, **AC-9**, **AC-11**, **AC-12**, **AC-14**
- Arredondamento: três itens de 0,1 × R$ 0,10 e 1 × R$ 0,20 somam exatamente R$ 0,23; verifies **AC-9**
- Concorrência: 49 itens e duas gravações simultâneas, só uma passa e a outra recebe a mensagem do teto (teste de banco real); verifies **AC-4**
- Status: chamado `encerrado` recusa as quatro ações e mostra a seção só para leitura; reaberto, aceita de novo; verifies **AC-3**
- Troca de ativo: o custo sai do ativo antigo e entra no novo na próxima leitura; verifies **AC-8**
- Permissão: o técnico chamando `adicionarMaterialAction` recebe "Sem permissão."; a rota de cotações para o solicitante não traz `valorFinal`; a ficha para o técnico não traz `custo`; o histórico para o solicitante não traz as quatro ações; verifies **AC-6**, **AC-18**
- Substituição: ativo com `valorHistorico` R$ 2.000,00, categoria sem limite e R$ 1.000,00 de corretivo em 12 meses vira candidato por custo; sem `valorHistorico`, a ficha mostra "Custo não avaliado"; verifies **AC-15**, **AC-16**

## Build plan

Tracer Bullet: o primeiro passo leva um item de material do formulário da gestão até a ficha do ativo, passando pela conta; depois o fio engrossa com edição, valor final, IMR, relatório e substituição.

1. O fio: `materiaisForaCotacao` no `Chamado`, constantes e schemas de custo, `shared/chamados/custo.ts` com os testes de centavos, `adicionarMaterialAction` com o status no filtro e o teto na gravação, a ação de histórico `custo_material_lancado` (no enum `CHAMADO_HISTORY_ACTIONS`, com rótulo e em `ACOES_SO_DA_GESTAO`, atualizando o teste `shared/chamados/__tests__/history.constants.test.ts` que hoje exige exatamente 3 itens), a projeção e a normalização em `/api/gestao/chamados` e o campo no `ChamadoDTO`, a seção "Custo" no `ChamadoDetailSheet` (cotações aprovadas só leitura, itens, totais, nota de chamado sem ativo, modo só leitura), `lib/ativos/custo.ts` e o bloco "Custo de manutenção" da ficha só para gestão com a falha isolada; satisfies **AC-1**, **AC-3**, **AC-4**, **AC-7**, **AC-8**, **AC-9**, **AC-10**, **AC-11**, **AC-18**, **AC-19**
2. Editar e remover: as duas actions com `$set` posicional e `$pull`, a releitura que escolhe a mensagem, as duas ações de histórico com a cópia do item, e os controles na seção; satisfies **AC-2**, **AC-2a**, **AC-6**
3. Valor final: os três campos em `Cotacao`, `informarValorFinalCotacaoAction`, a ação `cotacao_valor_final`, o campo na seção e a rota de cotações devolvendo o valor final só para gestão; satisfies **AC-5**, **AC-6**, **AC-18**
4. IMR: `custoTotal` no ranking e a lista `maisCaros` em `calcularIndicadoresAtivos`, a coluna e a tabela nova em `imr-ativos.tsx`, a falha isolada; satisfies **AC-12**, **AC-14**, **AC-19**
5. Relatório por contrato: custo por ativo e por categoria e o total em `lib/contratos/relatorio.ts`, as colunas na tela e em `RelatorioContratoPdf.tsx`, a frase "Custos lançados até"; satisfies **AC-13**, **AC-14**, **AC-19**
6. Substituição: `custo` em `CRITERIOS_SUBSTITUICAO`, rótulo, motivo e `textoDoMotivo`, `limiteCustoPercentual12m` na categoria (schema, `lib/ativos/categoria.ts`, formulário e lista), a regra em `avaliarSubstituicao` recebendo `custoCorretivo12mCentavos` e `valorHistorico`, e a leitura em lote de `listarSituacoesSubstituicao` passando o custo; satisfies **AC-15**, **AC-16**, **AC-17**
7. Testes de banco real (`*.db.test.ts`) para o teto com gravações simultâneas e a paridade entre ficha, IMR e substituição, e testes de permissão das actions e das rotas; satisfies **AC-4**, **AC-14**, **AC-18**

## Consequences

**Positive**:

- A pergunta "consertar ou trocar" passa a ter um número de dinheiro, e a regra de substituição pega o equipamento que quebra pouco mas caro.
- Sem estado derivado para manter: trocar o ativo, reabrir ou corrigir um valor muda tudo na próxima leitura.
- O lançamento fica com quem tem a nota (a gestão), sem pedir nada novo ao técnico.

**Negative / tradeoffs**:

- O número só é tão bom quanto o lançamento: material que ninguém lançou não existe para o Sigma, e o "custo" de um ativo é um piso, não o gasto total. A mão de obra do contrato fica fora.
- Material lançado por engano junto com a cotação aprovada da mesma peça conta duas vezes; a regra depende do texto de ajuda e da cotação mostrada ao lado, não de uma checagem.
- Depois do encerramento ninguém corrige o custo (a nota que chega tarde fica de fora), a não ser reabrindo o chamado. O encerramento automático da spec 0010 fecha o chamado sozinho no fim do prazo de avaliação (`prazoAvaliacaoAte`), então o lançamento tem prazo mesmo sem ninguém encerrar.
- Chamado cancelado ou recusado depois de comprar material sai da conta, mesmo com o gasto feito.
- O `valorHistorico` do SICAM é o valor de compra, às vezes antigo; para um equipamento de 2009, 50% dele é pouco dinheiro hoje, e o critério de custo pode bater cedo. O limite por categoria é a válvula.
- Ativos `MNT-` (sem SICAM) nunca são avaliados pelo critério de custo.
- O relatório por contrato de um mês pode mudar entre duas emissões se alguém lançar custo no meio; o PDF diz até quando os custos foram lidos, mas não trava.
- Mais leitura por página: a ficha, o IMR e o relatório passam a buscar cotações dos chamados lidos.

**Neutral**:

- Quatro ações novas de histórico, todas só da gestão.
- `formatarReais` nasce em `shared/chamados/custo.ts`; os `formatBrl` locais da cotação continuam como estão.

## Follow-up

- [ ] Medir depois de alguns meses quantos chamados concluídos têm custo lançado; se for pouco, avaliar lembrete na tela de encerramento ou uma tela de lançamento em lote.
- [x] Juntar os `formatBrl` de `cotacao.actions.ts`, `CotacaoApprovalCard.tsx` e da ficha em `formatarReais`.
- [x] Corrigir a divergência entre `app/(dashboard)/gestao/AGENTS.md` e o código sobre quem envia e quem aprova cotação (o código: envio só Preposto, aprovação e recusa só Admin).
- [ ] Se a gestão pedir, valor de reposição atual por categoria como base alternativa ao `valorHistorico` no critério de custo, e custo nas listas de `/ativos`.
