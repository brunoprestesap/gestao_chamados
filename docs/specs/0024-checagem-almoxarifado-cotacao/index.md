# 0024. Checagem do almoxarifado antes da cotação

**Date**: 2026-11-04
**Status**: Accepted

## Summary

Hoje o material que o técnico registra vai direto para a contratada cotar, mesmo que exista na prateleira do almoxarifado. Esta spec põe uma etapa antes: o Sigma lê o saldo ao vivo no Oracle do SICAM (somente leitura, por um pequeno serviço próprio) e, se achar material parecido com saldo, um servidor com o novo papel `almoxarifado` decide item a item entre usar o estoque ou cotar mesmo assim, com motivo. Sem candidato com saldo, o item segue sozinho, com o registro da busca. O material usado entra no custo do chamado pelo preço médio do SICAM quando o chamado é concluído, e tudo fica atrás de um interruptor, desligado por padrão.

## Requirements

**User stories**:

- Como servidor do almoxarifado, quero ver o que o técnico pediu ao lado do que há em estoque, para decidir o que sai da prateleira antes de a contratada cotar.
- Como fiscal, quero ver o que foi checado e por que algo com saldo foi cotado assim mesmo, para analisar a cotação com esse dado.
- Como técnico, quero saber o que posso retirar no almoxarifado, para não esperar uma compra à toa.
- Como gestor, quero que o custo do ativo inclua o material do estoque, separado do que veio do empenho.

**Acceptance criteria**:

Interruptor e entrada

- **AC-1**: Com `MaterialConfig.checagemAlmoxarifadoAtiva` falso (o padrão), `criarCotacao` funciona como hoje, e a cotação nasce com `checagem: null`. Cotação com `checagem: null` nunca passa por regra desta spec, inclusive depois de o interruptor ser ligado. Desligar o interruptor não trava quem já está em `em_checagem`: ela continua podendo ser concluída.
- **AC-2**: Com o interruptor ligado, `criarCotacao` consulta os candidatos de cada item antes de gravar. Candidato é material fora de desuso, com disponível maior que zero (AC-9), cuja descrição, sem acento e sem caixa, contém ao menos uma das palavras de `palavrasDaBusca` (substring). Um material acentuado no SICAM precisa ser achado por uma busca sem acento. A consulta de todos os itens é uma só chamada em lote, e a requisição inteira tem prazo de 6 segundos; estourou, todos os itens contam como SICAM fora.
- **AC-3**: Item sem candidato, com o SICAM respondendo, ganha uma entrada `sem_candidato` automática, com as palavras buscadas e a hora. Se todos os itens ficarem assim, a cotação nasce `rascunho`, sem pausa e sem passar por pessoa.
- **AC-4**: Se algum item tiver candidato, ou se o SICAM não responder, a cotação nasce `em_checagem` com `checagem.prazoAte` e `voltarPara: 'rascunho'`, os designados do papel são avisados, e os itens `sem_candidato` já ficam resolvidos. Sem o SICAM, nenhum item é liberado sozinho.

Decisão

- **AC-5**: Em `em_checagem`, quem pode agir vê, por item ainda não resolvido, a descrição (do técnico ou da contratada), a unidade, a quantidade, até 10 candidatos ordenados por palavras que bateram, e uma busca manual por texto ou `CO_MAT` que inclui material de saldo zero. Cada material mostra código, descrição, unidade, saldo, reservado, disponível, preço médio e a hora da consulta.
- **AC-6**: A ação `concluir_checagem` exige uma decisão para cada item em aberto, e cada uma é `usar`, `cotar_mesmo_assim` ou `sem_correspondente`. `cotar_mesmo_assim` exige material escolhido e motivo de 10 a 500 caracteres. A ação vale por inteiro: com qualquer decisão inválida, nada é gravado.
- **AC-7**: `usar` aceita atendimento parcial. O item com `quantidadeAtendida` menor que a pedida continua na cotação com o restante, e o atendido por inteiro sai de `itens`. Pedido, atendido, saída e restante ficam na entrada de `checagem.itens`. A mesma ação tira de `orcamentos[].precos` o preço dos itens removidos e recalcula `valorTotalCentavos`, para o responsável técnico não ficar preso por `MSG_ITEM_CITADO_POR_ORCAMENTO`. Toda leitura de item atendido vem de `checagem.itens`.
- **AC-8**: Com a mesma unidade dos dois lados (comparada sem caixa e sem espaços), `quantidadeSaida` é igual a `quantidadeAtendida`. Com unidades diferentes, as duas são informadas, porque o técnico pode pedir metros e o SICAM guardar rolo.
- **AC-9**: O disponível é `QT_SALDO_ATU` menos a soma de `ALMX_QT_RESERVADA` de todos os almoxarifados, nunca menor que zero. No `concluir_checagem`, o servidor relê o saldo de cada `usar` e `cotar_mesmo_assim` pelo `CO_MAT`, sem confiar na tela, numa só chamada em lote. `quantidadeSaida` acima do disponível é recusada, com o saldo novo na mensagem.
- **AC-10**: Toda decisão grava saldo visto, reservado, hora da consulta, origem, autor, papel e data em `checagem.itens` (só acrescenta), e o evento da trilha guarda a mesma lista em `checagemNoAto`, inclusive as automáticas.
- **AC-11**: Depois de concluir, a cotação vai para `voltarPara` se sobrou item, e para `atendida_almoxarifado` se não sobrou. `atendida_almoxarifado` é final, fora de `SITUACOES_EM_TRAMITE`, sem reserva de empenho, e o chamado segue em atendimento e pode abrir outra cotação. Só nela `itens` pode ficar vazio: o validador do modelo passa a aceitar isso nessa situação e continua exigindo de 1 a 50 nas outras. A fase do solicitante é `pedido` em `em_checagem` e `encerrada` em `atendida_almoxarifado`.

SICAM fora do ar

- **AC-12**: Sem resposta do SICAM (serviço fora, Oracle fora ou mais de 4 segundos), a tela avisa e oferece o registro manual: saldo digitado, motivo de 10 a 500 caracteres, e preço obrigatório quando a decisão for `usar`. A entrada grava `origem: 'manual'`, e o `CO_MAT` é opcional. A falha nunca quebra a tela nem a criação da cotação. A origem é decidida pelo servidor na releitura, nunca pela tela: se o SICAM voltou entre abrir e concluir, a decisão manual é recusada com o pedido de refazer com o material.
- **AC-13**: Com o SICAM no ar e `VL_ATU` vazio ou zero num material com saldo, `usar` exige preço digitado, e a entrada marca `precoOrigem: 'manual'`.

Papel e demora

- **AC-14**: `almoxarifado` é um novo papel de `DesignacaoMaterial`, limitado aos perfis Admin e Solicitante em `PERFIS_POR_PAPEL`, cadastrado com motivo e histórico como os outros (spec 0022).
- **AC-15**: O fiscal vigente pode concluir a checagem a qualquer momento, e o evento grava o papel `fiscal`. A fila `Minhas ações` e o aviso de entrada apontam para o almoxarifado; sem almoxarifado vigente, apontam para os fiscais, e o painel "O que falta" mostra a falta.
- **AC-16**: `prazoAte` é o fim do expediente do N-ésimo dia útil depois da entrada, com N em `MaterialConfig.prazoChecagemDiasUteis` (padrão 1, de 1 a 30), por `lib/dias-uteis/`. Com N = 1, o prazo é o fim do próximo dia útil. O prazo só serve para avisar: a rodada diária de `material-conciliacao` avisa os gestores uma vez por entrada vencida, e a `Notification` já gravada depois da entrada impede o segundo aviso, sem campo novo. Uma falha no cálculo grava `prazoAte: null`, e essa cotação não gera aviso de atraso. Nada é liberado sozinho por prazo.

Fluxo

- **AC-17**: Item que a contratada acrescenta, ou cuja quantidade ela aumenta acima da liberada, conta como não checado. O `enviar` é recusado com o impedimento `item_sem_checagem`. O impedimento só existe com `checagem` diferente de null. A ação `reenviar_checagem`, do responsável técnico, ou do técnico atribuído enquanto o rascunho for só dele (sem `montadoPorUserId`), roda a busca só nesses itens: sem candidato, marca e mantém a situação; com candidato ou sem SICAM, vai a `em_checagem` com `voltarPara` igual à situação de origem (`rascunho` ou `devolvida`). Trocar só o texto da descrição não reabre a checagem.
- **AC-18**: A checagem retoma só a pausa que ela mesma abriu, marcada em `checagem.abriuPausa`. No `criar` que nasce `em_checagem`, a pausa é sempre aberta, porque o chamado está em atendimento por construção, e é desfeita se o evento falhar. No `reenviar_checagem` a partir de `rascunho`, abre se o chamado não estiver pausado. A partir de `devolvida`, a pausa do envio já está aberta, não abre outra e continua aberta na volta, como hoje. Se o chamado já estava pausado por outro motivo, a checagem não abre nem retoma. Na saída para `atendida_almoxarifado`, toda pausa da cotação é retomada. O `enviar` volta a pausar como hoje. O histórico do chamado ganha `cotacao_material_em_checagem` e `cotacao_material_atendida_almoxarifado`, sem valores.
- **AC-19**: `em_checagem` entra em `SITUACOES_EM_TRAMITE`: a conclusão do chamado é recusada, cancelar ou recusar o chamado cancela a cotação, e a varredura `varredura-chamado.test.ts` segue verde. O técnico atribuído cancela em `em_checagem` só sem `montadoPorUserId`, e não edita itens nessa situação. Responsável técnico e gestor cancelam como hoje.
- **AC-20**: Ao decidir `usar`, o técnico atribuído recebe um aviso com `aviso: 'retirar_almoxarifado'` e a lista de itens no `data` e no corpo (descrição, quantidade e unidade), sem valor. O Sigma não escreve nada no SICAM, não reserva saldo e não confirma a entrega.

Custo

- **AC-21**: `custoDoChamado` ganha a parte `almoxarifadoCentavos`, somada ao total. Ela soma `valorCentavos` de toda entrada `usar`, mesmo que o item tenha sido rechecado depois, só dos chamados em `concluído` ou `encerrado`, em qualquer situação da cotação. "A última vale" é só para o resultado na tela e para `quantidadeLiberada`. Chamado reaberto, cancelado ou recusado não conta.
- **AC-22**: Ficha, aba Ativos do IMR, relatório por contrato e critério de substituição passam por `lerCustosDosChamados` e `custoPorAtivo` e mostram o mesmo total, com a nova parte identificada onde as partes aparecem. O valor só sai em endpoint de gestão, como na spec 0018, e `GET /api/chamados/[id]/cotacoes` devolve `almoxarifadoCentavos` com a mesma condição de status, porque `CustoChamadoSecao` soma no cliente.
- **AC-23**: O preço unitário é `VL_ATU / QT_SALDO_ATU` em centavos, arredondado uma vez e congelado na decisão, e o valor sai de `valorDaLinhaCentavos` sobre `quantidadeSaida`. Mudança posterior no SICAM não altera o custo.

Visibilidade

- **AC-24**: `serializarCotacao` decide a visão. TRF1 e o papel `almoxarifado` veem a checagem inteira. Contratada e técnico veem só o resultado por item (`atendido pelo almoxarifado`, com a quantidade, ou `segue para cotação`) e `quantidadeLiberada`, que o editor usa em `impedimentosDeEnvio`, sem saldo, preço, motivo, nome ou material do SICAM. O solicitante continua só com a fase.
- **AC-25**: A ordem em `visaoDe` é `trf1`, `almoxarifado`, `contratada`, `tecnico`, `solicitante`, e `almoxarifado` nunca entra em `PAPEIS_TRF1`. Fiscal, gestor, aprovador e Admin leitor veem `em_checagem` pela visão `trf1`, como qualquer situação que não seja rascunho. A visão `almoxarifado` vê só as cotações com `checagem` diferente de null, inclusive em rascunho, com todos os itens (descrição, unidade, quantidade), número do chamado, local e checagem, e nunca orçamentos, preços da cotação, empenho, faixas ou arquivos. Não baixa arquivo nem gera PDF. Ter o papel e o perfil Solicitante não amplia isso.
- **AC-26**: A busca de materiais responde 403 para quem não pode agir na checagem daquela cotação no momento, e 401 sem sessão.
- **AC-27**: Em `/cotacoes`, o papel `almoxarifado` tem as abas `Minhas ações` e `Todas`, e o item de menu aparece para ele mesmo com perfil Solicitante. A jornada mostra a etapa de checagem só em cotação com `checagem` diferente de null, e cotação antiga segue com as 7 etapas. As telas novas passam em `semViolacaoNoAxe`.
- **AC-28**: O PDF da cotação traz a seção da checagem, e o relatório de material mostra a quantidade de `atendida_almoxarifado` e o valor atendido, sem somar em canceladas. O valor atendido segue a regra do AC-21, para bater com o custo.

Serviço

- **AC-29**: O serviço `sicam-gateway` não publica porta fora da rede Docker, responde 401 sem `x-internal-secret` (e a tudo se o segredo estiver vazio), roda cada consulta em transação somente leitura, e lê apenas `MATERIAL` e `ALMOXARIFADO_MATERIAL`. Todo texto de busca vai por bind, nunca concatenado.

## Decision

**Chosen option**: etapa nova `em_checagem` antes do rascunho, com saldo lido ao vivo no Oracle do SICAM por um serviço próprio (`sicam-gateway`), liberação automática sem candidato, decisão humana por item com o papel `almoxarifado` e registro manual quando o SICAM cai.

**Decisões miúdas que ficaram comigo**:

- Fonte do saldo: `MATERIAL.QT_SALDO_ATU`, não a soma de `ALMOXARIFADO_MATERIAL`, porque 9 materiais com saldo na `MATERIAL` não aparecem com saldo positivo nessa tabela (132 contra 123) e a conta da `MATERIAL` fecha em todas as 9.691 linhas. Os 9 ainda não foram olhados um a um. Alternativa: somar por almoxarifado, que perderia esses 9.
- Reservado: a soma de `ALMX_QT_RESERVADA`, porque `MATERIAL.QT_RESERVADA` está zerada em todas as linhas.
- Almoxarifado único na tela: só o Principal tem saldo hoje, então não há escolha de almoxarifado, e chamado em Laranjal ou Oiapoque vê o mesmo número. Alternativa: filtrar por unidade, que pede um mapa unidade para almoxarifado sem uso real hoje.
- Regra de palavras, em `shared/material/checagem.ts`: tira acento e caixa, descarta palavras vazias, fica com palavras de 4 letras ou mais e as que têm dígito, no máximo 8. Prefere um falso candidato, que uma pessoa dispensa, a uma liberação errada.
- Motivo da pausa: o mesmo `falta_peca_aprovacao_cliente`, para não mexer nos descontos do IMR. Alternativa: motivo novo, que entraria em todas as listas de pausa.
- O preço médio é calculado em `shared/material/checagem.ts`, a partir dos números brutos do serviço, para o serviço não ter regra de negócio.
- Chamada do serviço com 4 segundos no Next e 3 segundos de `callTimeout` no Oracle, para o erro do banco chegar antes do corte do cliente.

**Implementation skills**: `vitest` (`antfu/skills`, `.agents/skills/vitest/`) · `a11y-playwright-testing` (`fugazi/test-automation-skills-agents`, `.agents/skills/a11y-playwright-testing/`) · `axe-core` (`claude-dev-suite/claude-dev-suite`, `.agents/skills/axe-core/`) · `react-pdf` (`.agents/skills/react-pdf/`)

## Rationale

Razões, opções e a varredura do SICAM: veja [rationale.md](rationale.md).

## Feature design

**Modelo de dados** (só campos novos, sem coleção nova):

| Onde                    | Campo                       | Tipo                            | Regra                                                                                                                                           |
| ----------------------- | --------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `CotacaoMaterial`       | `checagem`                  | objeto ou null                  | null nas antigas e com o interruptor desligado                                                                                                  |
| `checagem`              | `prazoAte`                  | Date ou null                    | Refeito a cada entrada em `em_checagem` (AC-16)                                                                                                 |
| `checagem`              | `voltarPara`                | `rascunho`, `devolvida` ou null | Preenchido só em `em_checagem`                                                                                                                  |
| `checagem`              | `abriuPausa`                | Boolean                         | Se a entrada atual abriu a pausa (AC-18)                                                                                                        |
| `checagem`              | `itens[]`                   | lista                           | Só acrescenta, sempre gravada por `$set` da `checagem` inteira, para a compensação de `transicionar` desfazer; várias entradas por item (AC-21) |
| `CotacaoMaterialEvento` | `checagemNoAto`             | lista ou null                   | Cópia das entradas daquele ato                                                                                                                  |
| `MaterialConfig`        | `checagemAlmoxarifadoAtiva` | Boolean                         | Padrão falso                                                                                                                                    |
| `MaterialConfig`        | `prazoChecagemDiasUteis`    | Number                          | Padrão 1, de 1 a 30                                                                                                                             |

Cada entrada de `checagem.itens`:

| Campo                                      | Tipo                                                               | Observação                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `itemId`                                   | ObjectId                                                           | Id do item; continua válido depois de o item sair de `itens`                                       |
| `descricao`, `unidade`, `quantidadePedida` | cópia                                                              | Como estavam no ato                                                                                |
| `resultado`                                | `sem_candidato`, `usar`, `cotar_mesmo_assim`, `sem_correspondente` |                                                                                                    |
| `automatico`                               | Boolean                                                            | Verdadeiro só em `sem_candidato`                                                                   |
| `palavrasBuscadas`                         | [String]                                                           |                                                                                                    |
| `origem`                                   | `sicam` ou `manual`                                                |                                                                                                    |
| `consultadoEm`                             | Date                                                               | A data do saldo que o escopo pede                                                                  |
| `coMat`                                    | String ou null                                                     | `CO_MAT` em texto; obrigatório em `usar` e `cotar_mesmo_assim` com origem `sicam`                  |
| `materialDescricao`, `materialUnidade`     | String ou null                                                     | Cópia do SICAM (`materialDescricao` até 300 caracteres)                                            |
| `saldoVisto`, `reservadoVisto`             | Number ou null                                                     |                                                                                                    |
| `quantidadeAtendida`, `quantidadeSaida`    | Number ou null                                                     | Só em `usar`                                                                                       |
| `quantidadeLiberada`                       | Number                                                             | O que pode ser cotado sem nova checagem: o restante, ou a quantidade inteira nos outros resultados |
| `precoUnitarioCentavos`, `valorCentavos`   | inteiro ou null                                                    | Só em `usar`                                                                                       |
| `precoOrigem`                              | `sicam`, `manual` ou null                                          |                                                                                                    |
| `motivo`                                   | String ou null                                                     | `cotar_mesmo_assim` ou origem manual                                                               |
| `porUserId`, `porNome`, `papel`            |                                                                    | Nulos e `sistema` nas automáticas                                                                  |
| `em`                                       | Date                                                               |                                                                                                    |

Item conta como não checado (AC-17) se não tem entrada, ou se `quantidade` passa da `quantidadeLiberada` da última entrada. `salvarRascunho` preserva `checagem`, porque reconstrói o item. Com o rascunho salvo mantendo o id do item, a marca continua valendo.

Sem migração: os campos novos têm padrão, e as listas só ganham valores.

**Máquina de estados** (só o novo):

| De                      | Ação                | Para                                    | Quem                                                                 |
| ----------------------- | ------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| (nova)                  | `criar`             | `em_checagem` ou `rascunho`             | Técnico atribuído                                                    |
| `em_checagem`           | `concluir_checagem` | `voltarPara` ou `atendida_almoxarifado` | Almoxarifado ou fiscal                                               |
| `rascunho`, `devolvida` | `reenviar_checagem` | `em_checagem`, ou mantém                | Responsável técnico; técnico no rascunho só dele                     |
| `em_checagem`           | `cancelar`          | `cancelada`                             | Responsável técnico, gestor, sistema; técnico sem `montadoPorUserId` |

`concluir_checagem` e `reenviar_checagem` passam por `transicionar`, com a ordem de `lib/material/AGENTS.md`. As duas têm destino variável: `para` passa a ser decidido dentro do `case`, e `PARA[acao]` é só o padrão das outras. A consulta ao serviço roda antes da gravação condicional, nunca dentro dela. O `criar` não passa por `transicionar`: a busca, a pausa e a compensação entram em `criarCotacao`. `podeConcluirChecagem` é uma função pura exportada, usada por `papelDoAto`, `acoesDisponiveis` e a rota de busca.

**Listas que recebem os valores novos, juntas**: `SITUACOES_COTACAO`, `SITUACOES_EM_TRAMITE`, `ACOES_COTACAO`, `PAPEIS_DESIGNACAO`, `PAPEIS_EVENTO`, `PERFIS_POR_PAPEL`, `CAMPOS_PARAMETROS`, `MATERIAL_CONFIG_PADRAO`, `DESVIOS_JORNADA` (`atendida_almoxarifado`), `quemAgeAgora`, `abasDaFila`, `tituloAvisoCotacao`, `FASE_DA_SITUACAO`, `CHAMADO_HISTORY_ACTIONS`, `registrarNoChamado`, `destinatarios` e `mensagens.ts`. `checagemAlmoxarifadoAtiva` fica fora de `CAMPOS_PARAMETROS`, que é todo numérico: tem `Switch` próprio na aba Parâmetros, com a mesma gravação condicional ao valor lido e linha no histórico. `prazoChecagemDiasUteis` entra em `CAMPOS_PARAMETROS`.

**Funções que hoje só conhecem dois lados e precisam da visão nova**: `visaoDe` (o `Pick` ganha `checagem`, também na rota `/api/chamados/[id]/cotacoes`), `listarFila`, `resumoDaFila` (terceiro `lado`), `condicoesDaAba`, `filtroDoQueEspera`, `lerDetalhe` e `nav.ts` (`allowedRoles` ganha `Solicitante`, ainda preso a `exigeDesignacaoMaterial`).

**Jornada por cotação**: `etapasDaJornada(temChecagem)` e `posicaoNaJornada(situacao, de, temChecagem)` substituem o uso direto de `ETAPAS_JORNADA` em `JornadaCotacao` e `etapasDaTrilha`, e o DTO leva `temChecagem`. `pendencia.ts` deve manter a forma em memória e a forma Mongo iguais.

**Superfície do `sicam-gateway`** (pasta própria, como o `socket-server`, Debian slim com Instant Client, rede `sigma`, sem nginx):

| Rota              | Método | Entrada                                                                                            | Saída                                                                           | Erros         |
| ----------------- | ------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------- |
| `/healthz`        | GET    |                                                                                                    | `{ ok }`, sem tocar no Oracle                                                   |               |
| `/candidatos`     | POST   | `{ itens: [{ itemId, palavras }] }`, até 50 itens, até 8 palavras cada, cada uma até 40 caracteres | Por `itemId`, até 10 `Material`, com `acertos`, só com disponível acima de zero | 400, 401, 503 |
| `/materiais`      | GET    | `q` (3 caracteres ou mais), `limite` até 25                                                        | `Material[]`, com saldo zero incluído                                           | 400, 401, 503 |
| `/materiais/lote` | POST   | `{ coMats: string[] }`, só dígitos, até 50                                                         | `Material[]` encontrados, para a releitura                                      | 400, 401, 503 |

`Material`: `{ coMat, descricao, unidade, saldo, reservado, disponivel, valorTotal }`, sempre com `FG_DESUSO IS NULL`. O `coMat` sai em texto. A comparação é `UPPER(TRANSLATE(DE_MAT, <acentuadas>, <sem acento>)) LIKE '%' || :p || '%' ESCAPE`, com uma cláusula por palavra, todas por bind; `acertos` é a soma de um `CASE` por palavra, e a ordem é `acertos` decrescente e `CO_MAT`.

**Superfície do Next**:

| Onde                                        | Tipo          | Entrada                                                  | Saída                                                                                     | Auth                                                        | Erros                                     |
| ------------------------------------------- | ------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------- |
| `lib/material/sicam.ts`                     | Funções       |                                                          | `{ ok: true, ... }` ou `{ ok: false, motivo }`, nunca lança                               | Só servidor (`server-only`)                                 |                                           |
| `GET /api/cotacoes/[id]/checagem/materiais` | Rota          | `q` opcional; sem ele, os candidatos dos itens em aberto | `Material[]` com preço médio, ou candidatos por item                                      | Quem pode agir                                              | 401, 403, 503                             |
| `concluirChecagemAction`                    | Server Action | `{ id, versao, decisoes[] }`                             | `ResultadoMaterial`                                                                       | Almoxarifado ou fiscal                                      | Recusa de versão, situação, saldo, schema |
| `reenviarChecagemAction`                    | Server Action | `{ id, versao }`                                         | `ResultadoMaterial`                                                                       | Responsável técnico vigente, ou técnico no rascunho só dele | Recusa de versão, situação                |
| `lerDetalhe`                                | Leitura       |                                                          | `checagem` e `temChecagem`, sem chamar o serviço (a tela carrega os candidatos pela rota) | `serializarCotacao`                                         |                                           |
| `avisarChecagensAtrasadas`                  | Rodada        |                                                          | `Notification` com `aviso: 'checagem_atrasada'`                                           | `CRON_SECRET`                                               |                                           |

**Value sourcing**:

| Ação                | Valor                                           | Fonte                                                                                 |
| ------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| Candidatos, busca   | Código, descrição, unidade, saldo               | `MATERIAL.CO_MAT`, `DE_MAT`, `CO_UNID_MEDIDA`, `QT_SALDO_ATU`                         |
| Candidatos, busca   | Reservado                                       | Soma de `ALMOXARIFADO_MATERIAL.ALMX_QT_RESERVADA` por `ALMX_CO_MAT`                   |
| Candidatos, busca   | Disponível                                      | Saldo menos reservado, mínimo zero                                                    |
| Candidatos, busca   | Preço médio em centavos                         | `round(VL_ATU / QT_SALDO_ATU * 100)`; vazio se saldo ou valor forem zero              |
| Candidatos          | Palavras                                        | `palavrasDaBusca(item.descricao)`                                                     |
| `concluir_checagem` | `consultadoEm`                                  | Hora do servidor Next, na releitura                                                   |
| `concluir_checagem` | Saldo manual, preço manual, motivo, quantidades | Entrada, validada no schema                                                           |
| `concluir_checagem` | `valorCentavos`                                 | `valorDaLinhaCentavos(quantidadeSaida, precoUnitarioCentavos)`                        |
| `concluir_checagem` | Novo `quantidade` do item                       | `quantidade - quantidadeAtendida` (`quantidadeAtendida` na unidade do item)           |
| Entrada na etapa    | `prazoAte`                                      | `prazoEmDiasUteis` com `prazoChecagemDiasUteis`                                       |
| Custo               | `almoxarifadoCentavos`                          | Soma de `valorCentavos` das entradas `usar`, com `Chamado.status` em `PROJECAO_CUSTO` |
| Autor               | Nome e papel                                    | `nomeDe` e `papeisDe`                                                                 |
| Visões              | Resultado por item                              | Última entrada de cada `itemId`, por `serializarCotacao`                              |

**Invariantes**:

- O Sigma nunca escreve no Oracle: a conta só tem `SELECT`, e cada consulta abre transação somente leitura.
- Nenhum item chega à cotação com saldo disponível conhecido sem uma decisão registrada; `sem_candidato` significa que a busca não achou.
- Saldo e preço nunca vêm da tela quando o SICAM responde.
- Nenhuma função daqui lança erro de regra, e aviso nunca leva valor.
- O custo é em centavos inteiros e congelado na decisão.

**Modelo de segurança**:

- Escrever: almoxarifado vigente, fiscal vigente e, no `reenviar_checagem`, o responsável técnico ou o técnico no rascunho só dele, sempre conferidos pelo servidor; perfil lido do banco, como já é.
- Ler: AC-24 e AC-25. Preço e saldo do TRF1 nunca chegam à contratada, por ser o lado interessado em cotar.
- Credencial: conta de serviço própria, com `SELECT` só em `SICAM.MATERIAL` e `SICAM.ALMOXARIFADO_MATERIAL`, guardada só no container do serviço. O Next conhece apenas a URL e o segredo interno.
- LGPD: não se lê `ALMOXARIFADO_RESP`, `ALMOXARIFADO_MOVIMENTACAO` (`ALMM_NU_MATR`) nem tabela com matrícula. O serviço não registra o texto da busca em log.

**Configuração nova**:

- `SICAM_GATEWAY_URL` e `SICAM_GATEWAY_SECRET` (Next e serviço): sem elas, o SICAM conta como fora do ar e vale o registro manual.
- `SICAM_ORACLE_USER`, `SICAM_ORACLE_PASSWORD`, `SICAM_ORACLE_CONNECT_STRING`, `SICAM_ORACLE_INSTANT_CLIENT_DIR` e `SICAM_ORACLE_CONFIG_DIR` (só serviço, com os mesmos nomes do `simap`). Sem o diretório do Instant Client, o driver roda em modo Thin, que serve se a conta nova não usar a senha no formato 10G.

**Cenários críticos de teste**:

- Caminho feliz: técnico registra, a busca acha, o almoxarifado usa 4 de 10, a contratada recebe o rascunho com 6, verifica **AC-2**, **AC-4**, **AC-7**, **AC-11**
- Sem candidato: todos os itens liberados, sem pausa e sem aviso, verifica **AC-3**
- Saldo caiu entre abrir e concluir: recusa com o saldo novo e nada gravado, verifica **AC-6**, **AC-9**
- Serviço fora, no criar e no concluir: `em_checagem` e registro manual, verifica **AC-4**, **AC-12**
- Tudo do estoque: `atendida_almoxarifado`, pausa retomada, nova cotação permitida, verifica **AC-11**, **AC-18**
- Contratada acrescenta item ou aumenta a quantidade: `enviar` recusado, verifica **AC-17**
- Corrida: dois `concluir_checagem` com a mesma versão, só um grava, verifica **AC-6**
- Fiscal conclui antes do prazo, com papel `fiscal` na trilha, verifica **AC-15**
- Busca sem acento acha material acentuado, e Oracle lento estoura os 6 segundos e cai no registro manual, verifica **AC-2**, **AC-4**
- SICAM volta entre abrir e concluir: decisão manual recusada, verifica **AC-12**
- `devolvida` com orçamento, item atendido por inteiro: salvar segue funcionando, total recalculado, pausa da cotação continua aberta, verifica **AC-7**, **AC-18**
- Custo igual nos quatro lugares, e reabertura tira a parte, verifica **AC-21**, **AC-22**
- Vazamento: contratada, técnico, solicitante e almoxarifado leem o DTO, verifica **AC-24**, **AC-25**
- Injeção de SQL e rota sem segredo no serviço, verifica **AC-29**

## Build plan

Por fatias finas de ponta a ponta (Tracer Bullet): cada uma funciona antes de a próxima engrossar o fio. O interruptor segura tudo desligado em produção até a fatia 7.

**Fatia 1: o fio inteiro, só com usar tudo ou sem correspondente**

1. Criar `sicam-gateway/` (Express, `oracledb`, Dockerfile em Debian slim com Instant Client de versão fixa, `sqlnet.ora` próprio, `npm ci`), as quatro rotas, testes das barreiras e do bind, e o serviço no `docker-compose.yml` com `healthcheck`, satisfies **AC-29**
2. `shared/material/checagem.ts` (`palavrasDaBusca`, `precoMedioCentavos`, `disponivel`) e `lib/material/sicam.ts`, com a reserva nunca negativa e sem lançar, satisfies **AC-2**, **AC-9**
3. Campos em `CotacaoMaterial`, `CotacaoMaterialEvento` e `MaterialConfig`, valores novos nas listas e o interruptor na aba Parâmetros, satisfies **AC-1**
4. Papel `almoxarifado` no cadastro, em `PERFIS_POR_PAPEL`, no menu e em `visaoDe`, satisfies **AC-14**, **AC-25**, **AC-27**
5. `criarCotacao` com a busca, `em_checagem`, a liberação automática e a trilha, satisfies **AC-2**, **AC-3**, **AC-4**, **AC-10**
6. `concluir_checagem` em `transicionar`, com a releitura do saldo, e a tela da checagem no detalhe, com candidatos e busca manual, satisfies **AC-5**, **AC-6**, **AC-9**, **AC-11**, **AC-26**

**Fatia 2: decisão completa e SLA**

7. Parcial, `cotar_mesmo_assim` e unidades diferentes, satisfies **AC-6**, **AC-7**, **AC-8**
8. `atendida_almoxarifado` em jornada, selos, fila e cartão, satisfies **AC-11**, **AC-27**
9. Abrir e retomar a pausa na checagem e confirmar os ganchos do chamado e a varredura, satisfies **AC-18**, **AC-19**

**Fatia 3: quando algo falha**

10. Registro manual e preço digitado, satisfies **AC-12**, **AC-13**
11. Fiscal concluindo, `prazoAte`, `prazoChecagemDiasUteis` e `avisarChecagensAtrasadas` na rodada diária, satisfies **AC-15**, **AC-16**
12. Avisos aos designados, ao responsável técnico e ao técnico, e o painel "O que falta", satisfies **AC-4**, **AC-20**

**Fatia 4: item novo**

13. Impedimento `item_sem_checagem`, `reenviar_checagem`, e a mesma regra na lista "Pronta para enviar?" do editor, satisfies **AC-17**

**Fatia 5: custo**

14. `almoxarifadoCentavos` em `custoDoChamado`, `PROJECAO_CUSTO` e `lerCustosDosChamados`, e a parte em `CustoAtivo`, `CustoChamadoSecao`, IMR e relatório por contrato, satisfies **AC-21**, **AC-22**, **AC-23**

**Fatia 6: visões e documentos**

15. Resultado por item em `serializarCotacao` para contratada e técnico, e o teste de vazamento, satisfies **AC-24**, **AC-25**
16. Seção no PDF e números no relatório de material, satisfies **AC-28**
17. E2E em `e2e/cotacao-flow.spec.ts`, com o serviço falso, e `semViolacaoNoAxe` nas telas novas, satisfies **AC-27**

**Fatia 7: implantação**

18. Passos em `DOCKER_PRODUCAO.md`, o `.env.production.example` e a conferência do `Lock e Alpine`, satisfies **AC-1**, **AC-29**

## Migration plan

**Strategy**: com interruptor.

**Phases**:

1. Subir o código com o interruptor desligado: nada muda para ninguém.
2. Com a conta de serviço e a rota de rede prontas, configurar as variáveis e subir o `sicam-gateway`.
3. Designar o almoxarifado e ligar o interruptor. Só as cotações novas passam pela checagem.

**Rollback**: desligar o interruptor. Cotações já em `em_checagem` continuam até alguém concluir, com registro manual se o serviço estiver fora.

**Risks**: rascunho aberto antes da virada segue sem checagem, o que é aceito. A soma do custo muda os candidatos à substituição quando o primeiro chamado concluído trouxer material do estoque.

## Consequences

**Positive**:

- O que existe na casa deixa de ser cotado sem decisão registrada, com saldo e data na trilha.
- O material do estoque aparece no custo do ativo, identificado.
- O driver Oracle e a senha ficam fora do Next, que segue em Alpine.

**Negative / tradeoffs**:

- Sexto container, mais uma imagem, e um Instant Client para atualizar, por um uso que a varredura indica ser raro.
- Duas situações novas e um papel novo passam por quase todas as listas do módulo.
- Palavra diferente deixa passar item (cotovelo por joelho), e palavra genérica traz falso candidato.
- Sem confirmar a retirada, um item decidido e não retirado conta no custo se o chamado for concluído.
- O número do custo muda em quatro telas, e os candidatos à substituição podem mudar.
- O saldo do SICAM não sabe o que o Sigma já decidiu: dois chamados podem contar com o mesmo saldo até a saída ser registrada lá.

**Neutral**:

- `ALMX_QT_RESERVADA` e `VL_ATU` são leitura de um sistema de terceiros, sem contrato; mudança no schema do SICAM exige ajuste no serviço.
- A consulta varre `MATERIAL` sem índice de texto, aceitável em 9.691 linhas.

## Follow-up

- [ ] **Antes da fatia 7**: pedir ao DBA a conta de serviço do Sigma, com `SELECT` só nas duas tabelas. Se puder ter senha em formato novo, o serviço roda em modo Thin. Hoje o `simap` e a varredura desta spec usam um login pessoal, o que vale corrigir também lá.
- [ ] **Antes da fatia 7**: confirmar a rota de rede da VPS até o host e a porta do Oracle, e se o build na VPS alcança o download do Instant Client (se não, baixar antes e copiar para o contexto da imagem).
- [ ] Validar com o almoxarifado, numa linha real, que `VL_ATU / QT_SALDO_ATU` é o preço médio, e o que significa `ALMX_QT_RESERVADA` (15 linhas hoje).
- [ ] Rever o valor depois de 3 meses ligado: quantas checagens acharam candidato e quanto foi atendido. Só 132 materiais têm saldo hoje. O contrato vence em 28/02/2027 (pendência 10).
- [ ] Depois da virada, avaliar um filtro por grupo do `CO_MAT` (3024 e 3025 parecem predial e ar) para tirar falso candidato de material de escritório.
- [ ] Problema que já existe e deve ficar mais frequente: o `PauseLog` fica aberto quando `retomarPelaCotacao` devolve falso e `pauseLogId` é limpo mesmo assim (`lib/material/transicoes.ts`), como no chamado cancelado durante `em_checagem`.
- [ ] Levar a nova etapa à seção de regras do `funcional.md` da spec 0019, e o desenho ao fiscal e ao gestor.
- [ ] `/sync`: acrescentar `sicam-gateway/AGENTS.md`, o sexto container e as variáveis, e atualizar a premissa "SICAM não tem API" da spec 0011.
- [ ] `/sync`: registrar em `## Agent skills` a recusa de skill e de servidor MCP para `oracledb` e Oracle (busca de 04/11/2026: nada específico para modo Thick com a versão do banco, e nenhum servidor publicado pela Oracle).
