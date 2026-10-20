# 0019. Cotação e fornecimento de material

**Date**: 2026-10-15
**Status**: In Progress

## Summary

O pedido de material deixa de correr por e-mail e planilha e passa a ter fluxo próprio no Sigma: o técnico registra o material, o responsável técnico da contratada monta a cotação, o fiscal analisa, um aprovador com competência para o valor aprova e compromete o saldo do empenho, o técnico registra a aplicação e o gestor atesta. Cada item tem origem de preço (Anexo V, SINAPI ou três orçamentos), e o sistema confere o preço, trava o que o contrato proíbe e guarda uma trilha que não se apaga. A cotação nova nasce num modelo separado (`CotacaoMaterial`); a cotação antiga termina o que já está em andamento e para de receber envios. A construção vem em cinco fatias, e a primeira já põe o saldo do empenho no centro, porque é ele que limita a operação.

**Regras de negócio**: este é o documento de construção. As regras (RN) e os critérios funcionais (CA) estão em [funcional.md](funcional.md), que continua sendo a fonte do domínio. Onde esta spec diverge do texto funcional, vale esta spec, e a divergência está marcada como **decisão**.

**Fora desta spec**: os indicadores 3 e 4 do IMR do contrato (seção 16 do funcional, RN-47 a RN-50, CA-24 e CA-25) viram spec própria; esta spec só grava o pedido de material com data e situação, que é o dado de que o indicador 4 vai precisar. A RN-43 (material fora do limite de 25%) não pede nada do sistema: o material não entra em nenhuma conta de acréscimo contratual.

## Requirements

**User stories**:

- Como técnico, quero registrar no chamado o material de que preciso para que a necessidade fique documentada desde o diagnóstico.
- Como responsável técnico da contratada, quero montar a cotação com a origem de preço de cada item e os orçamentos, e enviá-la, para obter autorização antes de comprar.
- Como fiscal, quero analisar pertinência, quantidade e preço com as bases lado a lado, devolver com motivo ou encaminhar, para que só chegue à aprovação o que está conferido.
- Como aprovador, quero aprovar apenas o que cabe na minha competência e no saldo do empenho, com advertências visíveis, para não autorizar o que não posso nem o que não tem lastro.
- Como gestor do contrato, quero registrar o recebimento provisório e o definitivo e acompanhar o saldo e a projeção do empenho, para atestar e saber antes quando o orçamento vai acabar.
- Como Admin, quero manter empenhos, designações, faixas, parâmetros, Anexo V e SINAPI, para que as regras usem dados atuais e registrados.

**Acceptance criteria**:

Fatia 1, o fio de ponta a ponta:

- **AC-1**: O técnico atribuído a um chamado `em atendimento` cria uma cotação em `rascunho` com itens (descrição, unidade, quantidade, motivo), marcados `doDiagnostico`; a data do diagnóstico fica gravada; os responsáveis técnicos vigentes recebem aviso. O técnico edita esses itens só enquanto nenhum responsável técnico salvou o rascunho; depois disso o responsável técnico acrescenta itens e classifica, mas não remove nem altera descrição, unidade e quantidade dos itens do diagnóstico. Gravação com `versao` desatualizada é recusada. O rascunho não aparece para fiscal, aprovador nem gestor. A entrada não repete id de item, de orçamento nem de item dentro de um orçamento (recusado no schema e de novo na regra), porque a trava do diagnóstico compara por id. Salvar sem o campo de orçamentos mantém os gravados; uma lista vazia, mandada de propósito, apaga.
- **AC-2**: Só quem tem designação vigente de `responsavel_tecnico` completa e envia. O envio exige o chamado `em atendimento` ou `aguardando_terceiros`. Em `em atendimento`, o chamado vai para `aguardando_terceiros` com `PauseLog` de motivo `falta_peca_aprovacao_cliente` (gravado em `pauseLogId`), e volta para `em atendimento` (SLA recalculado como hoje) quando a cotação chega a `autorizada`, `reprovada` ou `cancelada`. Já pausado por outro motivo, não abre pausa nova e não retoma no fim. A retomada manual (`resumeTicketAction` e o atalho da gestão) é recusada quando a pausa aberta é o `pauseLogId` de uma cotação em trâmite. O vínculo da pausa (`pauseLogId`) é gravado logo depois do envio, desde que a cotação ainda esteja em trâmite, mesmo que o fiscal já a tenha assumido nesse meio tempo; a `devolvida` mantém a pausa e a trava da retomada manual, e a `autorizada` retoma. Se a cotação terminar com o chamado já fora da pausa (cancelado, recusado), o `PauseLog` da cotação é fechado (idempotente, com a hora do ato que encerrou a cotação) sem mexer no chamado.
- **AC-3**: Um chamado tem no máximo uma cotação em trâmite (de `rascunho` até `autorizada`); a segunda é recusada, também numa corrida (índice único parcial). `executada`, `reprovada` e `cancelada` liberam o chamado para uma cotação nova.
- **AC-4**: No caminho 3, a cotação só é enviada quando cada item do caminho 3 tem preço em ao menos 3 orçamentos (CA-03, CA-04). Um orçamento pode cobrir só parte dos itens. O preço do item é o menor entre os orçamentos que o cotaram. Cada orçamento tem o próprio arquivo: `arquivoId` repetido é recusado no salvar (schema e regra) e de novo no envio, e o envio confere que o arquivo de cada orçamento continua ativo (existe, é desta cotação, tem tipo `orcamento` e não foi removido).
- **AC-5**: O fiscal assume a cotação (`enviada` para `em_analise`), devolve ou reprova (motivo obrigatório, CA-15) ou encaminha para `em_aprovacao`. A devolvida volta para a contratada corrigir e reenviar.
- **AC-6**: O encaminhamento para aprovação é recusado quando nenhum empenho elegível tem saldo para o valor total, e o fiscal vê o impedimento. Elegível: `ativo`, exercício igual ao ano corrente e `vigenciaFim` vazia ou não vencida (Belém).
- **AC-7**: Na fila, o aprovador vigente cuja faixa cobre o valor vê `Aprovar`. Quem não tem faixa suficiente não vê o botão e vê os nomes dos aprovadores que podem (CA-10). A ação é recusada no servidor para designação vencida ou revogada (CA-11) e para quem montou a cotação (CA-12).
- **AC-8**: Aprovar é um ato único: o aprovador escolhe um empenho elegível (já vem selecionado quando só um tem saldo), o saldo é comprometido de forma atômica com uma reserva identificada pela cotação, e a cotação vai para `autorizada`. Sem saldo no empenho escolhido, a aprovação é recusada (CA-17). Duas aprovações simultâneas nunca deixam o saldo negativo, e uma reserva sem cotação autorizada correspondente é liberada pela conciliação diária. Cada aprovação reserva, e se perder a gravação libera, só no empenho que escolheu: a cotação autorizada fica com uma única reserva, no empenho gravado nela.
- **AC-9**: Cada transição grava na trilha a situação anterior e a nova, o autor, o papel, o limite e a faixa do autor naquele ato, a base de preço de cada item, os parâmetros vigentes, a data e hora e o motivo quando exigido (RN-38). A trilha recusa qualquer alteração ou exclusão no próprio schema (RN-39). Faixa não muda depois de criada, então nada já gravado muda (CA-21).
- **AC-10**: A execução só é aceita em cotação `autorizada` (CA-13), em ato único do técnico atribuído naquele momento, com a data do servidor conferida como posterior a `autorizadoEm` (RN-14). Exige ao menos uma evidência anexada. O técnico informa só a quantidade aplicada por item (de 0 até a autorizada); o servidor calcula o valor pelo preço aplicado. Executar a menos gera a advertência "divergência na execução" e devolve a diferença ao saldo. **Decisão**: a execução exige evidência, não nota fiscal, porque a NF só vem depois do ateste (RN-20). A execução é recusada com o chamado cancelado ou recusado.
- **AC-11**: O responsável técnico pode pedir alteração de uma cotação `autorizada` ainda não executada: o saldo reservado é liberado, a cotação volta para `devolvida` com o motivo "alteração após autorização", e depois de corrigida passa de novo pelo envio e pela análise técnica. **Decisão**: volta para a análise técnica, não direto para aprovação como diz a RN-17. O chamado volta a pausar no reenvio.
- **AC-12**: Cancelar (motivo obrigatório) é permitido até a execução, ao responsável técnico ou a um gestor, e libera o saldo. Cancelar ou recusar o chamado cancela sozinho a cotação em trâmite e libera o saldo; o evento grava como autor quem cancelou o chamado, papel `sistema` e o motivo de código fixo (`chamado_cancelado` ou `chamado_recusado`). Se esse cancelamento falhar (ele roda uma vez, depois de o chamado já ter mudado), a rodada diária do cron cancela a cotação em trâmite de todo chamado cancelado ou recusado, com papel `sistema` e sem autor, e libera o saldo.
- **AC-13**: O chamado não passa para `concluído` enquanto tiver cotação em trâmite. Toda ação que leva o chamado a `concluído`, `cancelado` ou `recusado` chama `lib/material/chamado.ts`, e um teste varre `app/` e `lib/` atrás de ação que grava esses status sem passar por ali. A conclusão recusada devolve a mensagem que diz o motivo.
- **AC-14**: Reprovada não volta a tramitar. Uma cotação nova pode citar a anterior (`cotacaoAnteriorId`, RN-16).
- **AC-15**: Visibilidade, aplicada por um único serializador no servidor. O solicitante vê só a situação, sem itens nem valores. O técnico vê, só nas cotações dos chamados atribuídos a ele, itens, valores, situação e motivos de devolução e reprovação. O responsável técnico vê todas as cotações em trâmite, as encerradas nos últimos 90 dias e, sem limite de idade, a `atestada` ainda sem `notaFiscal` (no detalhe, na fila e em `Minhas ações`), porque a NF pendente não pode sumir justo quando está mais atrasada. Os 90 dias contam de `updatedAt` (registrar a NF reinicia a conta). A regra da NF pendente é um predicado único em `lib/material/` (`pendenciaDaContratada`: `situacao = atestada` e `notaFiscal` nulo), com uma forma em memória para `visaoDe` e outra em filtro Mongo para `listarFila`, as duas no mesmo arquivo e cobertas por um teste de paridade sobre as mesmas cotações. A contratada não vê empenho, saldo, projeção, limites, advertências de preço nem confrontos de base, e o impedimento "acima do autorizado" aparece sem valor. O técnico e o solicitante nunca baixam orçamento nem NF.
- **AC-16**: Cada mudança de situação avisa quem age na etapa seguinte, por `Notification`, e-mail e Socket.IO (tabela em _Feature design_), e o registro da NF avisa os gestores vigentes sem mudar a situação (fatia 2). Nenhum dos três canais leva valor.
- **AC-17**: O valor executado entra no custo do chamado e do ativo (spec 0018) a partir de `executada`, somado ao das cotações antigas aprovadas e ao material fora de cotação, e a ficha, o IMR e o relatório por contrato mostram o mesmo número.
- **AC-18**: O envio pelo fluxo antigo (`submitCotacaoAction`) é recusado para todos, e o motivo de pausa por cotação some do `PauseTicketDialog`. A cotação antiga `enviada` ainda é aprovada ou recusada pelo cartão atual, e a antiga `aprovada` continua contando no custo.
- **AC-19**: O Admin cadastra empenhos e os movimentos deles (reforço, anulação), designações e faixas. Designação e movimento só são incluídos: revogar grava a data, nunca apaga. Há no máximo uma designação vigente por pessoa e papel; uma sobreposta é recusada. Faixa não se edita: mudar um limite é criar faixa nova e designar de novo. Fiscal, gestor e aprovador só podem ser designados a usuário Admin ativo; responsável técnico, só a Preposto ou Técnico ativo. Anulação que deixaria o valor líquido abaixo do comprometido é recusada.
- **AC-20**: A taxa de administração sobre material aparece como zero e não tem campo de edição em lugar nenhum (CA-18).

Fatia 2, ateste e peça para o SEI:

- **AC-21**: O gestor registra o recebimento provisório de uma cotação `executada` e depois o definitivo, que leva a `atestada`. O prazo de 5 dias corridos de cada etapa aparece como selo de atraso na aba `Ateste` da fila e no detalhe, sem bloquear. **Decisão (revisão de 19/10)**: o selo e o `prazoAteste` (no detalhe e na fila) são só do lado TRF1. A contratada vê as datas do recebimento provisório e do definitivo e `executadoEm`, sem o nome de quem recebeu: o serializador tira o autor desses campos, e a trilha que chega à contratada omite o autor dos eventos de recebimento provisório e definitivo. Na fila, a contratada tem `Minhas ações`, `Ateste` e `Todas`, todas com a mesma visibilidade do AC-15; em `Ateste` ela vê as datas do recebimento e a NF pendente, sem selo e sem coluna de prazo.
- **AC-22**: A nota fiscal (número, data e arquivo) só é aceita em cotação `atestada` (CA-16), enviada pelo responsável técnico, uma vez só e sem troca. Regras da data, todas comparando dias `YYYY-MM-DD` no fuso de Belém, com o relógio do servidor, e com os dois limites aceitando o próprio dia:
  - precisa ser uma data de calendário real: `2026-02-31` é recusada com "Data inválida." no schema (`shared/material/cotacao.schemas.ts`), antes de chegar ao banco;
  - não pode ser posterior a hoje em Belém (às 22:00 de Belém, já o dia seguinte em UTC, a data de hoje passa);
  - não pode ser anterior ao dia de `autorizadoEm` em Belém, porque a contratada compra depois da autorização e a nota do fornecedor costuma ser anterior à aplicação.

  As duas últimas são regras em `lib/material/transicoes.ts`, com códigos e textos próprios em `mensagens.ts`, devolvidas como `{ ok: false, error }`; o campo de data do diálogo leva os mesmos `min` e `max`. O diálogo mostra número e data e pede confirmação antes de gravar; a defesa contra duplo clique é do servidor (`versao` e "já registrado"). Uma tentativa recusada não prende o upload: o responsável técnico pode remover um arquivo `nota_fiscal` de uma `atestada` enquanto ele não estiver ligado a `notaFiscal.arquivoId` (exceção estreita à regra de só remover em `rascunho` ou `devolvida`). Registrar a NF avisa os gestores vigentes (ver _Avisos_).

- **AC-23**: O lado TRF1 gera o PDF da cotação (itens, bases, orçamentos, conferências e a trilha inteira, com autor e limite em cada ato), legível por quem não acompanhou o processo (CA-23). Cada emissão grava o SHA-256 dos bytes. **Decisão (revisão de 19/10)**: o Admin sem designação também gera o PDF, como exceção à regra de que ele só lê, porque é quem costuma montar o processo no SEI; a emissão grava o autor e o papel com que emitiu (o da designação, ou `admin`). A rota confere primeiro se quem chama é do lado TRF1 (403) e só depois procura a cotação, para quem está de fora não distinguir um rascunho de um id inexistente; para o lado TRF1, o `rascunho` (que ele não enxerga, AC-1) responde 404.

Fatia 3, Anexo V e SINAPI:

- **AC-24**: O Admin importa o Anexo V por CSV, ligado a um contrato, com revisão de novos, alterados e removidos antes de aplicar. Uma nova importação gera versão; a cotação guarda o preço que usou. O código SINAPI equivalente vem de uma coluna opcional do CSV, e o Admin pode corrigi-lo item a item, com motivo. **Decisão (19/10, antes da fatia 3)**: o layout é próprio e fixo, descrito em _Importação e classificação_; a reimportação leva para a versão nova a marca manual de anomalia e o histórico do código SINAPI, e um `CODIGO_SINAPI` vazio no CSV mantém o código da versão anterior.
- **AC-25**: O Admin importa o SINAPI por CSV, um mês de referência por vez (UF AP, não desonerado). Layout diferente do esperado (o de _Importação e classificação_) é recusado com a coluna que faltou, e preço com mais de 2 casas é recusado com a linha. Cada mês fica guardado e é imutável: mês já importado é recusado (decisão da revisão cruzada de 19/10). O mês vem do formulário, não do arquivo; UF e regime são constantes gravadas em cada insumo.
- **AC-26**: Item escolhido do Anexo V (caminho 1) ou do SINAPI (caminho 2) recebe preço e unidade da tabela, sem campo editável e sem exigir orçamento (CA-01, CA-02). **Decisão**: o CA-09 ("preço divergente é recusado") vira "o servidor nunca lê preço dos caminhos 1 e 2 da entrada", então a divergência não tem como existir. O preço congela no envio: importação nova não muda cotação já enviada. **Decisão (19/10, antes da fatia 3)**: a origem também nunca vem da entrada. O servidor marca `ambas` sozinho quando o item do Anexo V tem código SINAPI com preço no mês mais recente, ou quando o insumo SINAPI escolhido é o equivalente de um item vigente do Anexo V (RN-51: a escolha nunca é implícita). O Anexo V oferecido é o do contrato vigente que cobre o tipo de serviço do chamado. Regras em _Importação e classificação_.
- **AC-27**: Item presente no Anexo V e no SINAPI mostra as duas bases ao fiscal e ao aprovador. O fiscal não encaminha sem escolher a base de cada um, com justificativa (CA-26).
- **AC-28**: Preço do Anexo V acima do SINAPI além do percentual admitido gera advertência visível a quem aprova (CA-27). Item do Anexo V sem código SINAPI gera a advertência "sem referência SINAPI", e o painel do Admin lista esses itens.
- **AC-29**: Item do Anexo V na lista de conferência obrigatória (marcado na importação, quando passa do percentual sobre o SINAPI, ou à mão pelo Admin com motivo) não é encaminhado sem conferência registrada pelo fiscal naquela cotação (CA-28). **Decisão (19/10, antes da fatia 3)**: a marca automática compara com o mês SINAPI mais recente importado e é recalculada a cada aplicação de Anexo V, de um mês SINAPI que passa a ser o mais recente e de correção do código SINAPI do item. Sem SINAPI importado, nenhum item é marcado sozinho. A marca manual nunca é tocada pelo recálculo.
- **AC-30**: Sem Anexo V carregado para o contrato vigente do tipo de serviço do chamado (ou sem esse contrato), a busca não oferece o caminho 1 (RN-03). Sem SINAPI importado, não oferece o caminho 2. Sem empenho elegível, montar e analisar seguem, e só o encaminhamento e a aprovação ficam impedidos. Um painel em `/configuracoes/material` mostra ao Admin o que falta.

Fatia 4, controles do caminho 3 e urgência:

- **AC-31**: Orçamento com CNPJ de dígito verificador inválido (CA-07) ou com raiz igual à da contratada (CA-06) é recusado. Cada item do caminho 3 precisa de 3 orçamentos de raízes distintas com preço para ele (CA-05).
- **AC-32**: Item do caminho 3 sem ao menos uma referência com valor numérico impede o envio (CA-08).
- **AC-33**: Quando o menor orçamento de um item passa da menor referência dele além do percentual admitido, o fiscal não consegue encaminhar (RN-27).
- **AC-34**: Orçamento com validade anterior ao dia da análise gera advertência, e o fiscal só encaminha depois de confirmar de forma expressa (a confirmação vai para a trilha).
- **AC-35**: Urgência. O responsável técnico pede no envio, com justificativa, e o fiscal aceita ou recusa, com registro. Aceita, a cotação vai à aprovação sem os 3 orçamentos, com saldo e competência exigidos normalmente (RN-35). O recebimento definitivo fica bloqueado até os orçamentos estarem completos. A marca de urgência nunca sai (CA-22).

Fatia 5, advertências e relatório:

- **AC-36**: Fracionamento. Para cada item da cotação em análise ou aprovação, somam-se o valor desse item e o do mesmo item nas cotações com `autorizadoEm` dentro da janela, no mesmo ativo (ou no mesmo local, sem ativo). Se, para alguma faixa ativa, cada parcela fica abaixo dela e a soma a alcança, surge advertência que não trava (RN-31 a RN-33).
- **AC-37**: Reincidência. Quando o mesmo ativo tem, dentro da janela, duas cotações `autorizada`, `executada` ou `atestada` além da atual, surge advertência que não trava. **Decisão**: o CA-19 do funcional mistura esta regra com o fracionamento; aqui viram dois critérios.
- **AC-38**: Na aprovação que consome a parcela relevante do saldo ou mais, o aprovador vê a projeção de esgotamento (saldo, consumo médio, data estimada) antes de confirmar (CA-29).
- **AC-39**: Consumo acumulado de um item do Anexo V acima da quantidade estimada gera advertência (CA-20).
- **AC-40**: Item do caminho 3 com descrição parecida com a de um item do Anexo V ou do SINAPI gera advertência.
- **AC-41**: `/relatorios/material` (Admin) mostra, por período, a diferença entre o autorizado a preços do Anexo V e o equivalente SINAPI (CA-30), o saldo e a projeção de cada empenho e os indicadores da seção 16.3 do funcional, inclusive a contagem de urgências (RN-36).
- **AC-42**: O Admin edita os parâmetros (percentual sobre o SINAPI, janela, parcela relevante, raiz da contratada). Cada mudança fica registrada com autor e data, e cada ato copia os valores vigentes para a trilha.

## Decision

**Chosen option**: Option 2: modelo novo ao lado do antigo (estrangulamento).

A cotação de material nasce numa coleção própria, com itens, orçamentos, 10 situações, trilha só de inclusão e competência por designação. A `Cotacao` atual para de receber envios e só termina o que já está em andamento.

**Implementation skills**: `react-pdf` (`.claude/skills/react-pdf/`, o PDF da trilha na fatia 2, como o relatório por contrato) · `vitest` (`.agents/skills/vitest/`)

## Feature design

### Onde mora o código

| Lugar                                                                                                                                                                                                                                                                                                    | O que fica                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `models/CotacaoMaterial.ts`, `CotacaoMaterialEvento.ts`, `ArquivoCotacao.ts`, `AnexoVItem.ts`, `AnexoVVigencia.ts`, `SinapiInsumo.ts`, `SinapiReferencia.ts`, `ImportacaoMaterial.ts`, `Empenho.ts`, `DesignacaoMaterial.ts`, `FaixaCompetencia.ts`, `MaterialConfig.ts`, `CotacaoMaterialPdfEmissao.ts` | Schemas, com nome de coleção explícito (padrão de `Contrato`)                                                                                                                                                                                                                                             |
| `shared/material/`                                                                                                                                                                                                                                                                                       | Situações, transições, papéis, schemas Zod, `mensagens.ts` (mapa único de código para texto: rótulos das situações, impedimentos, advertências, motivos fixos e avisos, usado por tela, PDF e aviso)                                                                                                      |
| `lib/material/`                                                                                                                                                                                                                                                                                          | Regras (todas com `server-only`): `transicoes.ts` (máquina de estados), `papeis.ts` (designações vigentes), `saldo.ts` (reservar, liberar, ajustar, conciliar), `controles.ts`, `precos.ts`, `chamado.ts` (ganchos no ciclo do chamado), `serializar.ts`, `importacao/`, `avisos.ts`, `pdf/`, `AGENTS.md` |
| `app/(dashboard)/cotacoes/`                                                                                                                                                                                                                                                                              | Fila (`page.tsx`), detalhe (`[id]/page.tsx`), `actions.ts`                                                                                                                                                                                                                                                |
| `app/(dashboard)/configuracoes/material/`                                                                                                                                                                                                                                                                | Abas: empenhos, designações, faixas, parâmetros, Anexo V, SINAPI, painel do que falta                                                                                                                                                                                                                     |
| `app/(dashboard)/relatorios/material/`                                                                                                                                                                                                                                                                   | Relatório da fatia 5                                                                                                                                                                                                                                                                                      |
| `app/api/cotacoes/`                                                                                                                                                                                                                                                                                      | Upload e download de arquivos, PDF                                                                                                                                                                                                                                                                        |
| `app/api/material/importacoes/`                                                                                                                                                                                                                                                                          | Envio do CSV do Anexo V e do SINAPI                                                                                                                                                                                                                                                                       |

### Data model sketch

Dinheiro sempre em centavos inteiros. Preço unitário importado é arredondado meio acima para centavos; CSV com mais de 2 casas é recusado. Formato decimal brasileiro (vírgula decimal, ponto de milhar, `R$` opcional). Quantidade aceita até 3 casas decimais. O valor de uma linha segue a regra de `shared/chamados/custo.ts`: conta em milésimos e um único arredondamento. Datas em `Date` UTC; dias e janelas contados no fuso America/Belem (`lib/sla-timezone.ts`).

Trilha (`CotacaoMaterialEvento`), `DesignacaoMaterial`, `CotacaoMaterialPdfEmissao` e `FaixaCompetencia` registram hooks `pre` que lançam erro em `updateOne`, `updateMany`, `findOneAndUpdate`, `findOneAndReplace`, `replaceOne`, `deleteOne`, `deleteMany`, `findOneAndDelete` e `bulkWrite`, e recusam `save` de documento já gravado. As únicas exceções são funções próprias: `revogarDesignacao` (`$set` só em `revogada*`, com condição `revogadaEm: null`) e `desativarFaixa` (`$set` só em `ativa: false`), que passam uma opção de schema conferida pelo hook. Um teste de varredura é a segunda barreira.

**CotacaoMaterial** (coleção `cotacoesmaterial`)

| Campo                                                                         | Tipo                                                                                           | Regra                                                                                                     |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `numero`                                                                      | string, único                                                                                  | `COT-<ano>-####` pelo `Contador` (chave `cotacao_material_<ano>`), mesmo padrão de `generateTicketNumber` |
| `chamadoId`                                                                   | ObjectId → Chamado, obrigatório                                                                |                                                                                                           |
| `ativoId`, `localizacaoId`                                                    | ObjectId, opcionais                                                                            | Copiados do chamado na criação e no envio (RN-44, RN-46)                                                  |
| `situacao`                                                                    | enum de 10                                                                                     | Ver máquina de estados                                                                                    |
| `emTramite`                                                                   | boolean                                                                                        | `true` de `rascunho` até `autorizada`; `false` em `executada`, `atestada`, `reprovada`, `cancelada`       |
| `versao`                                                                      | inteiro                                                                                        | Sobe em toda gravação; controle otimista do rascunho                                                      |
| `cotacaoAnteriorId`                                                           | ObjectId, opcional                                                                             | RN-16                                                                                                     |
| `itens`                                                                       | subdocumentos, 1 a 50                                                                          | Ver abaixo                                                                                                |
| `orcamentos`                                                                  | subdocumentos, até 10                                                                          | Ver abaixo                                                                                                |
| `diagnosticadoPorUserId`, `diagnosticadoEm`                                   | obrigatórios                                                                                   | AC-1                                                                                                      |
| `montadoPorUserId`                                                            | opcional                                                                                       | Primeiro responsável técnico que salvou; base da trava do técnico e da RN-18                              |
| `fiscalUserId`                                                                | opcional                                                                                       | Quem assumiu a análise; limpo na devolução                                                                |
| `valorTotalCentavos`                                                          | inteiro                                                                                        | Recalculado em toda gravação dos itens                                                                    |
| `empenhoId`, `valorAutorizadoCentavos`, `autorizadoEm`, `autorizadoPorUserId` | opcionais                                                                                      | Preenchidos na aprovação, limpos ao liberar o saldo                                                       |
| `executadoEm`, `executadoPorUserId`, `valorExecutadoCentavos`                 | opcionais                                                                                      | AC-10                                                                                                     |
| `urgencia`                                                                    | `{ pedida, justificativa, pedidaEm, decisao: aceita/recusada, decididaPorUserId, decididaEm }` | Fatia 4. `pedida` nunca volta a `false`                                                                   |
| `recebimentoProvisorio`, `recebimentoDefinitivo`                              | `{ porUserId, em }`                                                                            | Fatia 2                                                                                                   |
| `notaFiscal`                                                                  | `{ numero, data, arquivoId, porUserId, em }`                                                   | Fatia 2, só em `atestada`                                                                                 |
| `pauseLogId`                                                                  | ObjectId, opcional                                                                             | Só quando esta cotação abriu a pausa; limpo ao retomar                                                    |
| `advertencias`                                                                | `[{ codigo, itemId?, confirmadaPorUserId?, em }]`                                              | Recalculadas a cada transição; a cópia de cada ato fica no evento                                         |

Índices: `{ chamadoId: 1 }` único parcial com `emTramite: true`; `{ situacao: 1, updatedAt: -1 }` (fila); `{ ativoId: 1, autorizadoEm: -1 }` e `{ localizacaoId: 1, autorizadoEm: -1 }` (fracionamento e reincidência); `{ numero: 1 }` único.

**Item** (subdocumento)

| Campo                                                                 | Tipo                                                             | Regra                                                                                                              |
| --------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `descricao`, `unidade`, `quantidade`, `motivo`                        | obrigatórios                                                     | Do diagnóstico ou acrescentados pelo responsável técnico                                                           |
| `doDiagnostico`                                                       | boolean                                                          | Item do diagnóstico não é removido nem tem descrição, unidade e quantidade alteradas pela contratada               |
| `origem`                                                              | `anexo_v` · `sinapi` · `ambas` · `orcamento` · `null` (rascunho) | Obrigatória no envio; `anexo_v`, `sinapi` e `ambas` são derivadas pelo servidor (ver _Importação e classificação_) |
| `anexoVItemId`, `anexoVPrecoCentavos`, `anexoVVersao`                 | opcionais                                                        | Cópia na classificação; congela no envio                                                                           |
| `sinapiCodigo`, `sinapiReferencia` (`AAAA-MM`), `sinapiPrecoCentavos` | opcionais                                                        | Mês mais recente importado; recopiado no envio e congelado a partir daí                                            |
| `baseAplicada`                                                        | `anexo_v` · `sinapi` · `orcamento`                               | Automática fora de `ambas`; escolhida pelo fiscal em `ambas`; limpa na devolução                                   |
| `justificativaBase`                                                   | string                                                           | Obrigatória quando `origem = ambas`                                                                                |
| `precoAplicadoCentavos`                                               | inteiro                                                          | Derivado da base; no caminho 3, o menor preço entre os orçamentos que cotaram o item                               |
| `referencias`                                                         | `[{ fonte, valorUnitarioCentavos, data }]`                       | Caminho 3 (RN-26)                                                                                                  |
| `conferencia`                                                         | `{ texto, porUserId, em }`                                       | Lista de anomalia (AC-29); limpa na devolução                                                                      |
| `quantidadeExecutada`, `valorExecutadoCentavos`                       | opcionais                                                        | AC-10; o valor é calculado pelo servidor                                                                           |

**Orçamento** (subdocumento): `fornecedor`, `cnpj` (14 dígitos), `data`, `validade`, `arquivoId` (obrigatório, um arquivo por orçamento, sem repetir), `precos: [{ itemId, valorUnitarioCentavos }]` (só os itens que ele cotou).

**CotacaoMaterialEvento** (`cotacaomaterialeventos`, só inclusão): `cotacaoId`, `de`, `para`, `acao`, `autorUserId`, `papel` (inclui `sistema`), `faixaId`, `limiteCentavosNoAto`, `parametrosNoAto` (cópia de `MaterialConfig`), `itensNoAto` (origem, base e preço de cada item), `advertenciasNoAto`, `motivo` (texto ou código fixo), `empenhoId`, `valorCentavos` (valor reservado ou liberado no ato, com sinal), `em`. Autor tem duas formas com `papel: sistema`: no cancelamento pelo gancho do chamado, `autorUserId` é quem cancelou ou recusou o chamado; na rodada diária do cron e nos eventos da conciliação, `autorUserId`, `faixaId` e `limiteCentavosNoAto` são nulos. `de`, `para` e `motivo` seguem o `transicionar` normal. Quem lê a trilha não pode supor que todo evento tem autor.

**ArquivoCotacao** (`arquivoscotacao`): `cotacaoId`, `tipo` (`orcamento` · `evidencia` · `nota_fiscal`), `nomeOriginal`, `mimeType`, `tamanho`, `caminho` (`data/uploads/cotacoes/<cotacaoId>/<arquivoId>.<ext>`, nunca o nome original), `enviadoPorUserId`, `em`, `removidoEm`, `removidoPorUserId`. Até 10 arquivos ativos por tipo por cotação. Remover só marca `removidoEm`, só em `rascunho` ou `devolvida` (e, na `atestada`, o `nota_fiscal` ainda não ligado a `notaFiscal.arquivoId`, AC-22), e nunca apaga o disco.

**AnexoVItem** (`anexovitens`): `contratoId`, `numero` (1 a 200), `versao`, `descricao` (até 300 caracteres), `unidade`, `quantidadeEstimada`, `precoPactuadoCentavos`, `sinapiCodigo`, `sinapiCodigoHistorico: [{ de, para, motivo, porUserId, em }]`, `anomalia: { automatica, referenciaSinapi, manual, motivo, porUserId, em }`, `anomaliaHistorico: [{ manual, motivo, porUserId, em }]`. Único `(contratoId, numero, versao)`. **Vigente** não é campo do item: são os itens do contrato cuja `versao` é a do ponteiro em `AnexoVVigencia` (revisão cruzada de 19/10, para a aplicação nunca deixar dois vigentes nem nenhum). A importação nova grava `versao + 1`; item removido no CSV só não ganha linha na versão nova, e as cotações que o usaram continuam com a cópia. A versão nova de um mesmo `numero` herda `sinapiCodigoHistorico`, `anomalia.manual` (com motivo, autor e data) e `anomaliaHistorico` da anterior. `anomalia.automatica` e `anomalia.referenciaSinapi` (o mês usado na conta) só mudam pelo recálculo. Toda escrita em `anomalia` é `$set` por caminho de campo (`anomalia.automatica`, `anomalia.manual`...), nunca o objeto inteiro, para o recálculo e a marcação manual não apagarem um ao outro.

**AnexoVVigencia** (`anexovvigencias`): `contratoId` (único), `versao`, `importacaoId`, `em`. É o ponteiro da versão vigente de cada contrato. Só muda por update condicional `{ contratoId, versao: versaoDaRevisao }`, o último passo da aplicação.

**SinapiInsumo** (`sinapiinsumos`): `referencia` (`AAAA-MM`), `codigo` (só dígitos, sem zeros à esquerda, a mesma forma de `AnexoVItem.sinapiCodigo`), `descricao` (até 300 caracteres), `unidade`, `precoCentavos`, `uf` (constante `AP`), `regime` (constante `nao_desonerado`). Único `(referencia, codigo)`. Índice de texto em `descricao` com `default_language: 'none'` (sem reduzir as palavras ao radical) para a busca.

**SinapiReferencia** (`sinapireferencias`): `referencia` (único), `quantidade`, `importacaoId`, `em`. Um mês só existe para a busca, a cópia e a anomalia quando este documento existe; ele é criado depois de todas as linhas do mês. Os meses são imutáveis: não há remoção nem reimportação de mês já guardado (409). **Mês mais recente** = o maior `referencia` aqui.

**ImportacaoMaterial** (`importacoesmaterial`): `tipo` (`anexo_v` · `sinapi`), `contratoId` (Anexo V), `referencia` (SINAPI), `versaoBase` (Anexo V: a versão do ponteiro usada na revisão; nula na primeira), `linhas` (já interpretadas), `resumo: { novos, alterados, removidos }`, `estado` (`pendente` · `aplicando` · `aplicada` · `descartada`), `emAberto` (verdadeiro em `pendente` e `aplicando`), `enviadaPorUserId`, `aplicadaPorUserId`, `expiraEm`. Índice único parcial `{ tipo: 1 }` com `emAberto: true` (uma importação aberta por tipo, padrão de `ImportacaoPatrimonial`). TTL de 7 dias só para `pendente` (índice TTL parcial): a pendente que ninguém aplicou nem descartou some sem rastro, e isso é aceito. Aplicar ou descartar apaga `linhas` na mesma escrita que fecha o estado (o enxugamento do SICAM). Até 20.000 linhas.

**Empenho** (`empenhosmaterial`): `numero` (único), `exercicio`, `contratoId` (opcional, só informativo nesta spec), `valorInicialCentavos`, `movimentos: [{ tipo: reforco/anulacao, valorCentavos, ato, porUserId, em }]`, `valorLiquidoCentavos`, `reservas: [{ cotacaoId, valorCentavos, em }]`, `comprometidoCentavos` (sempre a soma de `reservas`), `vigenciaFim` (opcional, `YYYY-MM-DD`), `ativo`.

**DesignacaoMaterial** (`designacoesmaterial`, só inclusão): `userId`, `papel` (`responsavel_tecnico` · `fiscal` · `gestor` · `aprovador`), `faixaId` (obrigatório para aprovador), `vigenciaInicio`, `vigenciaFim` (strings `YYYY-MM-DD`, como no `Contrato`), `ato`, `criadoPorUserId`, `revogadaEm`, `revogadaPorUserId`. Vigente: `revogadaEm` vazio e hoje (Belém) entre início e fim. A inclusão confere, no servidor, que não há outra vigente ou futura sobreposta para o mesmo `(userId, papel)`.

**FaixaCompetencia** (`faixascompetencia`, imutável): `nome`, `limiteCentavos`, `ativa`, `criadoPorUserId`, `em`. Só `desativarFaixa` muda algo. Designação de aprovador só aponta faixa ativa.

**MaterialConfig** (documento único, chave `global`, padrão de `IaAutonomiaConfig`): `percentualSinapi` (10), `janelaDias` (90), `parcelaRelevantePercentual` (20), `raizCnpjContratada` (`03543374`), `historico: [{ campo, de, para, porUserId, em }]`. Não há campo de taxa de administração: o zero é constante em `shared/material/` (AC-20). Cada fatia cria só os campos que usa.

**CotacaoMaterialPdfEmissao** (`cotacaomaterialpdfemissoes`, só inclusão): `cotacaoId`, `sha256`, `porUserId`, `papel` (`fiscal` · `gestor` · `aprovador` · `admin`, incluído na revisão de 19/10; emissões anteriores ficam sem ele), `em`. Padrão de `RelatorioContratoEmissao`.

**Mudanças em modelos existentes**: `CHAMADO_HISTORY_ACTIONS` ganha `cotacao_material_enviada`, `cotacao_material_autorizada`, `cotacao_material_reprovada`, `cotacao_material_cancelada` (sem valores em `details`, porque o solicitante vê a linha do tempo). Nenhum campo novo em `Chamado` nem em `Cotacao`.

### Importação e classificação (fatia 3)

Decidido em 19/10, antes da construção da fatia 3. O código mora em `lib/material/importacao/` (leitura, revisão, aplicação, recálculo da anomalia) e `lib/material/precos.ts` (contrato da cotação, busca, derivação da origem).

**Leitura do CSV** (os dois tipos):

- Separador `;`, como o Excel em português grava. Campo entre aspas duplas aceito, com `;` e aspas dobradas dentro (o Excel põe aspas quando a descrição tem `;`). Parse próprio, sem dependência nova.
- Codificação: tenta UTF-8 estrito (com ou sem BOM); se falhar, lê como Windows-1252 (`decodificarCp1252`, de `lib/ativos/importacao/parse.ts`).
- Cabeçalho: a primeira linha, entre as 20 primeiras, que tem todas as colunas obrigatórias. Os nomes são comparados sem diferença de maiúscula, acento e espaço nas pontas. Colunas a mais são ignoradas, então sobras da conversão da planilha não atrapalham. Sem essa linha, a resposta é 422 com as colunas que faltaram, contadas contra a linha (entre as 20) que tem mais nomes reconhecidos.
- Linhas vazias depois do cabeçalho são puladas. Qualquer linha inválida recusa o arquivo inteiro com 422, número da linha e motivo (até 20 linhas listadas). Nada é gravado em parte.
- Dinheiro no formato da seção _Data model sketch_ (vírgula decimal, ponto de milhar, `R$` opcional, até 2 casas). Quantidade até 3 casas, maior que zero.
- Código SINAPI: só dígitos depois de tirar espaços e pontos; zeros à esquerda saem. Outro caractere recusa a linha.

**Layout do Anexo V** (um arquivo por contrato, escolhido no formulário):

| Coluna          | Obrigatória | Vai para                                                   |
| --------------- | ----------- | ---------------------------------------------------------- |
| `ITEM`          | sim         | `numero`, inteiro de 1 a 200, sem repetir no arquivo       |
| `DESCRICAO`     | sim         | `descricao`, não vazia                                     |
| `UNIDADE`       | sim         | `unidade`, não vazia                                       |
| `QUANTIDADE`    | sim         | `quantidadeEstimada`                                       |
| `PRECO`         | sim         | `precoPactuadoCentavos`                                    |
| `CODIGO_SINAPI` | não         | `sinapiCodigo`; a coluna pode faltar ou vir vazia na linha |

Revisão contra os itens vigentes do mesmo contrato, por `numero`: novo (número que não existe), alterado (descrição, unidade, quantidade, preço ou código diferente), removido (vigente que não veio). Código vazio no CSV com código na versão anterior mantém o anterior e não conta como alteração; código diferente preenchido conta, e o histórico do código ganha uma linha com motivo `importacao`.

**Aplicação sem transação** (revisão cruzada de 19/10), nesta ordem, para a mesma importação poder ser aplicada de novo sem estrago:

1. `pendente` → `aplicando` por update condicional (`{ _id, estado: 'pendente' }`). Uma importação já em `aplicando` (queda no meio) pode ser retomada pelo Admin; quem perde a corrida recebe "a importação já está sendo aplicada".
2. Anexo V: confere que o ponteiro ainda está em `versaoBase`; senão a importação vira `descartada` com "o Anexo V mudou depois da revisão, envie de novo". Grava as linhas da versão nova por upsert em `(contratoId, numero, versao)`, inclusive os itens sem mudança, com a herança descrita em `AnexoVItem`. SINAPI: grava as linhas do mês por upsert em `(referencia, codigo)`.
3. Vira a chave: Anexo V, update condicional do ponteiro de `versaoBase` para a versão nova (ou criação, na primeira); SINAPI, criação do `SinapiReferencia`.
4. Recalcula a anomalia (ver abaixo). Uma falha aqui fica no log e não desfaz a aplicação; o próximo recálculo corrige.
5. `aplicando` → `aplicada`, apagando `linhas`.

Linhas gravadas de uma versão ou de um mês sem a chave virada ficam invisíveis, e a nova tentativa as regrava pelos mesmos upserts.

**Layout do SINAPI** (um mês por arquivo; mês `AAAA-MM` escolhido no formulário):

| Coluna      | Obrigatória | Vai para                         |
| ----------- | ----------- | -------------------------------- |
| `CODIGO`    | sim         | `codigo`, sem repetir no arquivo |
| `DESCRICAO` | sim         | `descricao`                      |
| `UNIDADE`   | sim         | `unidade`                        |
| `PRECO`     | sim         | `precoCentavos`, maior que zero  |

O Admin converte a planilha da Caixa (UF AP, não desonerado) e deixa a coluna de preço do AP com o nome `PRECO`. A tela de envio mostra os dois layouts. Mês já guardado é recusado no envio (409, "este mês já foi importado"); a revisão do SINAPI mostra a quantidade de insumos e o que mudou contra o mês mais recente (novo, alterado e removido por `codigo`), só para leitura. Cotação já enviada não muda (AC-26).

**Contrato da cotação** (de onde sai o Anexo V da busca e da classificação): o `Contrato` com `isActive`, vigência que cobre hoje (Belém) e `tiposServico` com o `tipoServico` do chamado. O cadastro de contratos já recusa sobreposição (spec 0016), então sai no máximo um. É resolvido a cada busca e classificação, sem campo novo na cotação. Sem contrato, ou sem itens vigentes no Anexo V dele, não há caminho 1.

**Mês SINAPI mais recente**: o maior `referencia` em `SinapiReferencia`. Vale para a busca do caminho 2, para a cópia do SINAPI nos itens e para a anomalia.

**Busca** (`buscarItensPrecoAction`, responsável técnico e fiscal): texto com ao menos 3 letras, até 20 resultados no total. Anexo V: os itens vigentes do contrato da cotação (no máximo 200) cuja descrição normalizada (minúsculas, sem acento, espaços colapsados) contém todas as palavras do texto, ou cujo número é o texto. SINAPI: `$text` no mês mais recente, ordenado por `textScore`. O item do Anexo V com código no mês mais recente aparece numa linha só, marcada "tem equivalente SINAPI", e o insumo equivalente também aparece na lista do SINAPI. Preço e unidade aparecem como só leitura.

**Classificação** (`classificarItemAction`): a entrada é a `escolha`, nunca a origem: `{ anexoVItemId }`, `{ sinapiCodigo }` ou `{ orcamento: true }` (volta o item para o caminho 3 e limpa as cópias das tabelas).

**Derivação da origem** (uma função pura, `derivarOrigem`, usada pela classificação e de novo pelo envio):

- Escolheu item do Anexo V: copia número, versão e preço do item (precisa ser da versão vigente do contrato da cotação). Se o item tem `sinapiCodigo` e o código existe no mês mais recente, a origem é `ambas` e copia também o SINAPI; senão é `anexo_v`.
- Escolheu insumo do SINAPI: procura itens vigentes do Anexo V do contrato da cotação com o mesmo código. Nenhum: `sinapi`. Exatamente um: `ambas`, com as cópias dos dois. Mais de um: a classificação é recusada com a mensagem "este insumo equivale aos itens N e M do Anexo V; escolha um deles".
- No envio, a mesma função roda de novo com as tabelas daquele momento. O Anexo V é copiado de novo do item vigente de mesmo `numero` no contrato da cotação (preço, unidade, versão e `anexoVItemId`), e o SINAPI do mês mais recente (AC-26); a partir daí as cópias congelam. Um item `anexo_v` cujo código entrou no mês vira `ambas`, e um `ambas` cujo código saiu do mês vira `anexo_v`. Os casos que a classificação recusaria (item do Anexo V que saiu da versão vigente, insumo `sinapi` fora do mês mais recente, insumo equivalente a mais de um item, chamado sem contrato vigente para um item do Anexo V) viram o impedimento `classificacao_desatualizada` ("classifique o item de novo").
- No envio, `baseAplicada` e `precoAplicadoCentavos` são gravados para toda origem fora de `ambas`: `anexo_v` usa `anexoVPrecoCentavos`, `sinapi` usa `sinapiPrecoCentavos` e `orcamento` o menor preço dos orçamentos (como o caminho 3 já faz em `transicoes.ts`). Em `ambas`, os dois ficam nulos até o fiscal escolher.
- A advertência `sem_referencia_sinapi` vale para item `anexo_v` sem código ou com código fora do mês mais recente. O painel lista outra coisa: só itens vigentes com código vazio.

**Escolha da base em `ambas`** (AC-27): o `encaminharAction` recebe `bases: [{ itemId, base: 'anexo_v' | 'sinapi', justificativa }]`, justificativa de 10 a 500 caracteres; `orcamento` não é base de `ambas`. Grava `baseAplicada`, `justificativaBase` e `precoAplicadoCentavos` (o preço copiado daquela base) no mesmo update condicional da transição, e o evento copia em `itensNoAto`. Item `ambas` sem escolha gera `base_nao_escolhida`. Até a escolha, o valor do item e o `valorTotalCentavos` usam o maior dos dois preços, e a tela mostra "valor provisório"; o saldo do encaminhar e da aprovação já usa o total com as bases escolhidas. A devolução limpa `baseAplicada`, `justificativaBase` e o `precoAplicadoCentavos` dos itens `ambas`.

**Anomalia automática** (`recalcularAnomalia(contratoId?)`): para cada item vigente do Anexo V, `automatica` é verdadeira quando o item tem código, o código existe no mês mais recente e `(precoPactuado − precoSinapi) × 100 > percentualSinapi × precoSinapi`, em inteiros (a mesma conta da variação em _Controles_). Sem código, ou com código fora do mês mais recente, é falsa (o código continua no item). Grava também `referenciaSinapi`. Roda ao aplicar um Anexo V (só aquele contrato), ao aplicar um mês SINAPI mais novo que o mais recente (todos os contratos), ao corrigir o código SINAPI de um item (só aquele item) e, na fatia 5, ao mudar `percentualSinapi`. Nunca mexe em `anomalia.manual`. A lista de conferência obrigatória é `automatica` ou `manual`.

**Conferência no encaminhar** (AC-29): o `encaminharAction` recebe `conferencias: [{ itemId, texto }]`, texto de 10 a 500 caracteres, registradas só pelo fiscal que assumiu (`fiscalUserId`), o mesmo que encaminha. A pertinência à lista é lida no ato, no item vigente de mesmo `numero` do contrato do `AnexoVItem` apontado (assim a marca manual herdada vale); se o número saiu da versão vigente, vale o item apontado por `anexoVItemId`. Item só do caminho 2 (sem `anexoVItemId`) nunca entra na lista. A marca usada e a conferência vão para o evento em `itensNoAto`.

**Ações do Admin no Anexo V** (em `app/(dashboard)/configuracoes/material/actions.ts`, só Admin):

- `marcarAnomaliaAction({ anexoVItemId, marcada, motivo })`: marca ou desmarca `anomalia.manual`, motivo de 10 a 500 caracteres, e acrescenta uma linha em `anomaliaHistorico`. Vale para o item da versão vigente.
- `corrigirCodigoSinapiAction({ anexoVItemId, codigo, motivo })`: `codigo` normalizado ou `null` para limpar, motivo de 10 a 500 caracteres, linha nova em `sinapiCodigoHistorico`, e recalcula a anomalia daquele item.

**Painel do que falta** (`lerPendenciasMaterial`, uma leitura): sem empenho elegível; papel sem designação vigente (cada um dos quatro); contrato ativo e vigente hoje sem Anexo V (sem ponteiro ou sem itens na versão vigente); SINAPI ausente ou atrasado, quando o mês mais recente é anterior ao mês corrente (Belém) menos 2, porque a Caixa publica com atraso; itens vigentes do Anexo V com código vazio.

### State transitions

```
rascunho ──enviar──▶ enviada ──assumir──▶ em_analise ──encaminhar──▶ em_aprovacao ──aprovar──▶ autorizada ──executar──▶ executada ──provisório, definitivo──▶ atestada
                        ▲                    │                            │                      │
                        └──reenviar── devolvida ◀──devolver───────────────┴◀──────alterar────────┘
                                             em_analise, em_aprovacao ──reprovar──▶ reprovada
rascunho até autorizada ──cancelar──▶ cancelada
```

| Ação             | De                           | Para           | Quem                                                                                          | Efeitos                                                                                             |
| ---------------- | ---------------------------- | -------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| criar            | (nada)                       | `rascunho`     | técnico atribuído                                                                             | Aviso aos responsáveis técnicos                                                                     |
| salvar           | `rascunho`, `devolvida`      | (mesma)        | técnico atribuído (só itens do diagnóstico, só sem `montadoPorUserId`) ou responsável técnico | `versao` confere                                                                                    |
| enviar, reenviar | `rascunho`, `devolvida`      | `enviada`      | responsável técnico                                                                           | Impedimentos de envio; pausa o chamado se ele está `em atendimento`                                 |
| assumir          | `enviada`                    | `em_analise`   | fiscal                                                                                        | Grava `fiscalUserId`                                                                                |
| devolver         | `em_analise`, `em_aprovacao` | `devolvida`    | fiscal ou aprovador                                                                           | Motivo obrigatório; limpa base escolhida, conferências e `fiscalUserId`; o chamado continua pausado |
| reprovar         | `em_analise`, `em_aprovacao` | `reprovada`    | fiscal ou aprovador                                                                           | Motivo; retoma o chamado se `pauseLogId`                                                            |
| decidir urgência | `em_analise`                 | (mesma)        | fiscal                                                                                        | Fatia 4                                                                                             |
| encaminhar       | `em_analise`                 | `em_aprovacao` | fiscal                                                                                        | Impedimentos de análise; confere saldo elegível                                                     |
| aprovar          | `em_aprovacao`               | `autorizada`   | aprovador                                                                                     | Competência, reserva atômica, retoma o chamado se `pauseLogId`                                      |
| alterar          | `autorizada`                 | `devolvida`    | responsável técnico                                                                           | Libera a reserva; motivo fixo `alteracao_pos_autorizacao`                                           |
| executar         | `autorizada`                 | `executada`    | técnico atribuído no momento                                                                  | Ajusta a reserva ao executado                                                                       |
| provisório       | `executada`                  | (mesma)        | gestor                                                                                        | Fatia 2                                                                                             |
| definitivo       | `executada` com provisório   | `atestada`     | gestor                                                                                        | Fatia 2; bloqueado por urgência sem orçamentos                                                      |
| nota fiscal      | `atestada`                   | (mesma)        | responsável técnico                                                                           | Fatia 2                                                                                             |
| cancelar         | `rascunho` até `autorizada`  | `cancelada`    | responsável técnico, gestor ou `sistema`                                                      | Libera a reserva; retoma o chamado se `pauseLogId`                                                  |

Toda ação passa por `transicionar(cotacaoId, acao, ator, dados)` em `lib/material/transicoes.ts`, nesta ordem:

1. Confere papel, situação e impedimentos da ação (leitura).
2. Só no `aprovar`: reserva no empenho (passo de restrição, ver _Saldo do empenho_).
3. Gravação condicional da cotação: `findOneAndUpdate({ _id, situacao: de, versao })`. Quem perde esta corrida recebe "a cotação mudou, recarregue" e, no `aprovar`, desfaz a própria reserva.
4. Grava o evento; se falhar, desfaz a cotação (padrão `gravarHistoricoOuDesfazer`) e a reserva.
5. Só o vencedor aplica os efeitos no chamado (pausa ou retomada, `ChamadoHistory`), com a mesma compensação do `submitCotacaoAction`.
6. Avisos, fire and forget.

### Saldo do empenho

O MongoDB roda sem replica set, então não há transação. Reservar é um update condicional no empenho, idempotente pela cotação:

```
Empenho.findOneAndUpdate(
  { _id, ativo: true, exercicio: anoAtual, 'reservas.cotacaoId': { $ne: cotacaoId },
    $or: [{ vigenciaFim: null }, { vigenciaFim: { $gte: hoje } }],
    $expr: { $gte: [ { $subtract: ['$valorLiquidoCentavos', '$comprometidoCentavos'] }, valor ] } },
  { $push: { reservas: { cotacaoId, valorCentavos: valor, em } }, $inc: { comprometidoCentavos: valor } })
```

Sem documento devolvido, a aprovação é recusada. Liberar é `$pull` da reserva da cotação com `$inc` negativo do valor dela, no mesmo update e condicionado à existência da reserva (liberar duas vezes não faz nada), sempre no empenho informado: `liberar` e `ajustar` recebem o `empenhoId`. Quem perde a gravação condicional do `aprovar` libera no empenho que escolheu, e só quando a própria reserva foi criada (se `reservar` falha, a ação volta antes de gravar e não há o que desfazer); alterar, cancelar (inclusive o da rodada diária) e executar usam o empenho gravado na cotação, e só liberam quando ele existe; o que sobrar fica para a conciliação. Assim, duas aprovações da mesma cotação em empenhos diferentes nunca desfazem a reserva uma da outra. Ajustar na execução é trocar o valor da reserva pelo executado no mesmo padrão. Reserva que deveria existir e não é achada (ou update que desiste) vai para o log, para o saldo não ficar errado em silêncio. A anulação é update condicional: `valorLiquido − valor ≥ comprometido`, com `$push` do movimento e `$inc` do líquido no mesmo update.

**Conciliação**: roda uma vez por dia pelo container `cron` (06:00 UTC), no endpoint `/api/cron/material-conciliacao` protegido por `CRON_SECRET` e `x-cron-secret` como os demais, em duas rodadas independentes (uma falha na primeira não impede a segunda):

1. `cancelarCotacoesDeChamadosEncerrados()` em `lib/material/chamado.ts`: busca as cotações com `emTramite: true` e, entre elas, as de chamado com status `cancelado` ou `recusado` (sem lote: o volume é pequeno, ver Follow-up), e cancela cada uma pelo mesmo `transicionar`, com papel `sistema`, sem autor e o motivo fixo pelo status do chamado. É a nova tentativa do cancelamento automático do AC-12, que roda uma vez só, depois de o chamado já ter mudado.
2. `conciliarReservas()` em `lib/material/saldo.ts`: libera a reserva com mais de 10 minutos cuja cotação não está em `autorizada`, `executada` ou `atestada`, ou que está num empenho diferente do gravado na cotação (o id do empenho que guarda a reserva não é o `empenhoId` da cotação, inclusive quando ele é nulo), e grava evento `papel: sistema`. Os 10 minutos contam de `reserva.em`.

Testes no banco real (`*.db.test.ts`) disparam duas aprovações ao mesmo tempo contra um saldo que só cobre uma, duas aprovações em empenhos diferentes, e simulam a queda entre a reserva e a cotação, a reserva no empenho errado e o chamado cancelado sem a cotação cancelada.

### Controles

Cada controle é uma função pura em `lib/material/controles.ts`, com código, tipo (`impedimento` ou `advertencia`), a etapa em que roda e quem pode ver. O texto vem de `shared/material/mensagens.ts`. A tela recebe a lista já filtrada por quem vê.

| Código                                                                                             | Tipo                        | Etapa               | Fatia | Vê                        |
| -------------------------------------------------------------------------------------------------- | --------------------------- | ------------------- | ----- | ------------------------- |
| `orcamentos_insuficientes`                                                                         | impedimento                 | enviar              | 1     | todos do fluxo            |
| `saldo_insuficiente`                                                                               | impedimento                 | encaminhar, aprovar | 1     | TRF1                      |
| `competencia_insuficiente`, `designacao_vencida`, `autor_nao_aprova`                               | impedimento                 | aprovar             | 1     | TRF1                      |
| `execucao_acima_autorizado`                                                                        | impedimento                 | executar            | 1     | todos do fluxo, sem valor |
| `evidencia_ausente`                                                                                | impedimento                 | executar            | 1     | todos do fluxo            |
| `divergencia_execucao`                                                                             | advertência                 | executar            | 1     | TRF1                      |
| `classificacao_desatualizada`                                                                      | impedimento                 | enviar              | 3     | todos do fluxo            |
| `base_nao_escolhida`                                                                               | impedimento                 | encaminhar          | 3     | TRF1                      |
| `conferencia_pendente`                                                                             | impedimento                 | encaminhar          | 3     | TRF1                      |
| `anexo_v_acima_sinapi`, `sem_referencia_sinapi`                                                    | advertência                 | análise, aprovação  | 3     | TRF1                      |
| `cnpj_invalido`, `cnpj_mesma_raiz`, `cnpj_contratada`                                              | impedimento                 | enviar              | 4     | todos do fluxo            |
| `sem_referencia`                                                                                   | impedimento                 | enviar              | 4     | todos do fluxo            |
| `variacao_acima`                                                                                   | impedimento                 | encaminhar          | 4     | TRF1                      |
| `orcamento_vencido`                                                                                | advertência com confirmação | encaminhar          | 4     | TRF1                      |
| `fracionamento`, `reincidencia`, `consumo_acima_estimado`, `item_parecido`, `projecao_esgotamento` | advertência                 | análise, aprovação  | 5     | TRF1                      |

Regras de cálculo:

- **Raiz de CNPJ**: os 8 primeiros dígitos. DV por `cnpjValido` (`shared/contratos/cnpj.ts`). Distinção contada por item: o item precisa de 3 raízes diferentes entre os orçamentos que o cotaram.
- **Variação (RN-27, RN-52)**: `(preço − referência) × 100 > percentualSinapi × referência`, em inteiros. Caminho 1: referência é o SINAPI do mês copiado no item; caminho 3: a menor referência do item.
- **Mesmo item** (fracionamento, consumo): mesmo número do Anexo V (qualquer versão), mesmo `sinapiCodigo` ou, no caminho 3, a mesma descrição normalizada (minúsculas, sem acento, espaços colapsados).
- **Fracionamento**: ver AC-36. Valor de cada parcela = valor do item naquela cotação. Janela por `autorizadoEm`, contando para trás a partir de hoje.
- **Reincidência**: ver AC-37. Agrupa por `ativoId`; sem ativo, não se aplica.
- **Item parecido**: semelhança de Jaccard entre conjuntos de palavras normalizadas (sem palavras de até 2 letras), igual ou acima de 0,6, contra o Anexo V vigente e até 20 insumos SINAPI do mês mais recente, achados pelo índice de texto. Sem modelo de IA.
- **Projeção**: consumo líquido = soma de `valorCentavos` dos eventos do empenho (reservas positivas, liberações negativas) no período, que é o menor entre os últimos 90 dias e o tempo desde o primeiro evento. Com menos de 30 dias de período, mostra sempre "histórico insuficiente". Senão, média diária = consumo ÷ dias, e data = hoje + saldo ÷ média (média zero ou negativa: "sem consumo no período"). Aparece quando o valor da cotação ≥ `parcelaRelevantePercentual`% do saldo.
- **Prazo do ateste**: `executadoEm + 5 dias` e `recebimentoProvisorio.em + 5 dias`, corridos, no fuso de Belém.

### API surface

Server Actions em `app/(dashboard)/cotacoes/actions.ts` e `app/(dashboard)/configuracoes/material/actions.ts`, no padrão do projeto (`verifySession`, `dbConnect`, `safeParse`, `{ ok } | { ok: false, error }`, nunca `throw`). Cada action de cotação chama `transicionar`.

| Superfície                                                                                                                                         | Tipo   | Entradas principais                                                                                                   | Saída                                                                                                                                                                                                                                                                                                                                 | Quem                                                               | Erros principais                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `criarCotacaoAction`                                                                                                                               | action | `chamadoId`, `itens[]`                                                                                                | `{ id }`                                                                                                                                                                                                                                                                                                                              | técnico atribuído                                                  | chamado fora de `em atendimento`, já há cotação em trâmite                                                |
| `salvarRascunhoAction`                                                                                                                             | action | `id`, `versao`, `itens[]`, `orcamentos[]`, `urgencia?`                                                                | `{ ok, versao }`                                                                                                                                                                                                                                                                                                                      | técnico (regra do AC-1) ou responsável técnico                     | versão desatualizada, situação errada, item do diagnóstico alterado                                       |
| `classificarItemAction`                                                                                                                            | action | `id`, `versao`, `itemId`, `escolha` (`{ anexoVItemId }`, `{ sinapiCodigo }` ou `{ orcamento: true }`; nunca a origem) | item com preço                                                                                                                                                                                                                                                                                                                        | responsável técnico                                                | item sem tabela carregada                                                                                 |
| `buscarItensPrecoAction`                                                                                                                           | action | `cotacaoId`, `texto` (o contrato sai do chamado da cotação)                                                           | até 20 de Anexo V e SINAPI                                                                                                                                                                                                                                                                                                            | responsável técnico, fiscal                                        |                                                                                                           |
| `enviarCotacaoAction`, `assumirAction`, `devolverAction`, `reprovarAction`, `encaminharAction`, `aprovarAction`, `alterarAction`, `cancelarAction` | action | `id`, `versao`, `motivo?`, `empenhoId?` (aprovar), `bases[]` e `conferencias[]` (encaminhar), `confirmacoes[]`        | `{ ok }` ou `{ ok: false, error, impedimentos[] }`                                                                                                                                                                                                                                                                                    | conforme a máquina de estados                                      | impedimentos listados, versão desatualizada                                                               |
| `executarAction`                                                                                                                                   | action | `id`, `versao`, `quantidades: [{ itemId, quantidadeExecutada }]`                                                      | `{ ok }`                                                                                                                                                                                                                                                                                                                              | técnico atribuído                                                  | sem evidência, acima do autorizado                                                                        |
| `decidirUrgenciaAction`, `registrarRecebimentoAction`, `registrarNotaFiscalAction`                                                                 | action | `id`, `versao`, dados                                                                                                 | `{ ok }`                                                                                                                                                                                                                                                                                                                              | fiscal, gestor, responsável técnico                                | fatias 2 e 4                                                                                              |
| `removerArquivoAction`                                                                                                                             | action | `arquivoId`                                                                                                           | `{ ok }`                                                                                                                                                                                                                                                                                                                              | quem enviou                                                        | fora de `rascunho` ou `devolvida` (exceto a NF não ligada na `atestada`)                                  |
| `POST /api/cotacoes/[id]/arquivos`                                                                                                                 | route  | `multipart`: `arquivo`, `tipo`                                                                                        | `{ arquivoId }`                                                                                                                                                                                                                                                                                                                       | responsável técnico (orçamento, NF), técnico atribuído (evidência) | 413 acima de 20 MB, 415 se a assinatura dos bytes não for PDF, JPEG ou PNG, 409 acima de 10 por tipo, 403 |
| `GET /api/cotacoes/arquivos/[arquivoId]`                                                                                                           | route  |                                                                                                                       | o arquivo, com `Content-Disposition: attachment` e `X-Content-Type-Options: nosniff`                                                                                                                                                                                                                                                  | lado TRF1, responsável técnico, técnico atribuído (só evidência)   | 403, 404                                                                                                  |
| `GET /api/chamados/[id]/cotacoes` (existente, spec 0018)                                                                                           | route  |                                                                                                                       | ganha `materialExecutado: [{ id, numero, valorExecutadoCentavos, podeAbrir }]`, só para a gestão e só com cotações `executada` e `atestada`; `podeAbrir` é `visaoDe` não nulo (o Preposto sem designação recebe `false`), e a seção Custo só mostra o link para `/cotacoes/[id]` a quem pode abrir                                    | Admin, Preposto                                                    | 401, 403                                                                                                  |
| `POST /api/cotacoes/[id]/pdf`                                                                                                                      | route  |                                                                                                                       | PDF                                                                                                                                                                                                                                                                                                                                   | lado TRF1, inclusive o Admin sem designação                        | 403 fora do lado TRF1, 404 em `rascunho`; uma geração por vez no processo, como o relatório por contrato  |
| `POST /api/material/importacoes`                                                                                                                   | route  | `multipart`: `tipo`, `arquivo`, `contratoId?`, `referencia?`                                                          | resumo da revisão e `importacaoId`                                                                                                                                                                                                                                                                                                    | Admin                                                              | 413 acima de 10 MB, 422 layout ou linha inválida, 409 já há pendente                                      |
| `aplicarImportacaoAction`, `descartarImportacaoAction`                                                                                             | action | `importacaoId`                                                                                                        | `{ ok }`                                                                                                                                                                                                                                                                                                                              | Admin                                                              | expirada, já em aplicação, Anexo V mudou depois da revisão                                                |
| `GET`/`POST /api/cron/material-conciliacao`                                                                                                        | route  | header `x-cron-secret`                                                                                                | `{ ok, verificadas, liberadas, cotacoesCanceladas }`: `verificadas` e `liberadas` são reservas da conciliação; `cotacoesCanceladas` conta só os cancelamentos que gravaram (quem perde a corrida por `versao` não conta) e é `null` quando a rodada de cancelamento falha, caso em que a rota responde 200 e a conciliação roda igual | cron                                                               | 401; 500 só quando a conciliação falha                                                                    |
| Empenhos, movimentos, designações, revogação, faixas, desativação, parâmetros, anomalia manual, código SINAPI do item                              | action | dados do cadastro                                                                                                     | `{ ok }`                                                                                                                                                                                                                                                                                                                              | Admin                                                              | sobreposição, perfil errado, anulação acima do disponível                                                 |

O upload reaproveita `lib/uploads/arquivo.ts` (`detectMimeType`, `resolverCaminhoSeguro`) e o desenho de `api/ativos/documentos`. O `matcher` do `proxy.ts` deixa de fora `api/cotacoes/.*/arquivos` (mesmo motivo de `api/ativos/documentos`), e o nginx ganha um bloco `location` com `client_max_body_size 21M`, também em `default.tls.conf`. O crontab do container `cron` ganha a chamada diária da conciliação.

**Telas**

- `/cotacoes`: abas `Minhas ações` (o que espera o meu papel), `Análise`, `Aprovação`, `Ateste` (com selo de atraso de prazo), `Todas`, com número, chamado, ativo ou local, valor (só TRF1), situação, idade e marca de urgência. Abre para quem tem designação vigente; o Admin sem designação lê tudo sem ações, exceto gerar o PDF (AC-23). O técnico não usa a fila: opera pelo cartão do chamado.
- `/cotacoes/[id]`: itens com bases lado a lado (TRF1), orçamentos, advertências e impedimentos, saldo e projeção (TRF1), ações do meu papel, trilha.
- Cartão resumido no `ChamadoDetailSheet` e em `chamados-atribuidos/[id]`: situação, número e link; para o técnico, `Registrar material` (cria ou edita o rascunho) e `Registrar execução` (quantidades e evidência). O solicitante vê uma linha de situação na conversa e no detalhe.
- `/configuracoes/material` (Admin): abas e painel do que falta (sem empenho elegível, sem designação de cada papel, sem Anexo V, sem SINAPI do mês, itens do Anexo V sem código SINAPI).
- Menu: grupo `Material` na seção Gestão, com `Cotações` (designação vigente ou Admin) e `Relatório de material` (Admin, fatia 5).

### Avisos

`Notification` de tipo `material:cotacao`, e-mail pelo transporter atual e evento Socket.IO novo `material:cotacao_situacao` (payload `{ cotacaoId, numero, chamadoId, situacao, at }`) para `user:<id>` de cada destinatário. Nenhum canal leva valor; os textos vêm de `shared/material/mensagens.ts`. O evento entra em `shared/socket.ts`, em `ALLOWED_EVENTS` do `socket-server` e no `RealtimeProvider`; `getNotificationUrl` e `getNotificationMeta` levam o lado TRF1 e o responsável técnico a `/cotacoes/[id]`, e o técnico ao chamado.

| Situação nova                                       | Avisa                                         |
| --------------------------------------------------- | --------------------------------------------- |
| `rascunho`                                          | responsáveis técnicos vigentes                |
| `enviada`                                           | fiscais vigentes                              |
| `em_aprovacao`                                      | aprovadores vigentes cuja faixa cobre o valor |
| `devolvida`, `reprovada`, `autorizada`, `cancelada` | quem montou e o técnico atribuído             |
| `executada`                                         | gestores vigentes                             |
| `atestada`                                          | quem montou                                   |
| nota fiscal registrada (a situação não muda)        | gestores vigentes                             |

O aviso da nota fiscal é a única exceção à regra de só avisar quando a situação muda (`de !== para`): a action de registrar a NF pede o aviso de forma explícita, e só para a gravação que venceu (o segundo clique recebe "já registrado" e não avisa). Sem valor e sem número da NF em canal nenhum. A `Notification` e o e-mail usam o texto próprio da NF em `mensagens.ts`, não o de `atestada`, e `getNotificationUrl` leva o gestor a `/cotacoes/[id]`. O evento Socket.IO é o mesmo `material:cotacao_situacao` com `situacao: 'atestada'` inalterada e serve só para a tela recarregar: o `RealtimeProvider` não mostra toast de "atestada" por ele. O autor não recebe o próprio aviso, e quem tem dois papéis recebe um só. O chamado não ganha linha nova em `ChamadoHistory`.

### Value sourcing

| Ação                                 | Valor                                           | Fonte                                                                                                                                                         |
| ------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| criar                                | número `COT-<ano>-####`                         | `Contador`, chave `cotacao_material_<ano>`                                                                                                                    |
| criar, enviar                        | `ativoId`, `localizacaoId`                      | `Chamado.ativoId` e o local do chamado                                                                                                                        |
| buscar, classificar                  | Anexo V oferecido                               | itens vigentes do `Contrato` ativo, vigente hoje (Belém), cujo `tiposServico` contém `Chamado.tipoServico`                                                    |
| classificar, enviar                  | `origem` do item                                | `derivarOrigem`: escolha do responsável técnico (item do Anexo V ou insumo) + código SINAPI no mês mais recente + equivalentes vigentes do Anexo V            |
| importar                             | mês do SINAPI, UF, regime                       | campo `referencia` do formulário; `AP` e `nao_desonerado` constantes                                                                                          |
| aplicar importação, corrigir código  | `anomalia.automatica`, `referenciaSinapi`       | `recalcularAnomalia`: `precoPactuadoCentavos` contra `SinapiInsumo` do mês mais recente e `MaterialConfig.percentualSinapi`                                   |
| encaminhar                           | item na lista de conferência                    | `anomalia.automatica` ou `anomalia.manual` do `AnexoVItem` apontado por `anexoVItemId`, lido no ato                                                           |
| classificar                          | preço caminho 1                                 | `AnexoVItem.precoPactuadoCentavos` da versão vigente, copiado                                                                                                 |
| classificar, enviar                  | preço caminho 2                                 | `SinapiInsumo` do mês de referência mais recente importado, congelado no envio                                                                                |
| enviar                               | preço caminho 3                                 | menor `valorUnitarioCentavos` do item entre os orçamentos que o cotaram                                                                                       |
| todas                                | valor do item e total                           | `quantidade × precoAplicado`, conta de `shared/chamados/custo.ts`                                                                                             |
| salvar                               | trava do técnico                                | `montadoPorUserId` vazio                                                                                                                                      |
| encaminhar                           | base em `ambas`                                 | escolha do fiscal (entrada) com justificativa                                                                                                                 |
| encaminhar, aprovar                  | empenhos elegíveis e saldo                      | `Empenho` com `ativo`, exercício corrente e vigência; saldo = `valorLiquidoCentavos − comprometidoCentavos`                                                   |
| aprovar                              | limite do aprovador                             | `FaixaCompetencia.limiteCentavos` da designação vigente, copiado no evento                                                                                    |
| aprovar                              | lista "encaminhe a"                             | designações `aprovador` vigentes com faixa ≥ valor, nomes de `User`                                                                                           |
| aprovar                              | empenho                                         | entrada `empenhoId`, pré-selecionado quando só um elegível tem saldo                                                                                          |
| executar                             | técnico autorizado                              | `Chamado.assignedTo` no momento do ato                                                                                                                        |
| executar                             | valor executado por item                        | `quantidadeExecutada` (entrada) × `precoAplicadoCentavos`                                                                                                     |
| executar                             | data                                            | relógio do servidor, conferido contra `autorizadoEm`                                                                                                          |
| cancelar pelo chamado                | autor e motivo                                  | usuário da ação do chamado; código fixo `chamado_cancelado` ou `chamado_recusado`                                                                             |
| cancelar pela rodada diária          | autor e motivo                                  | sem usuário, papel `sistema`; código fixo pelo status do chamado (`chamado_cancelado` ou `chamado_recusado`)                                                  |
| aprovar, alterar, cancelar, executar | empenho da reserva a mexer                      | `empenhoId` da entrada na compensação de quem perdeu a gravação; `CotacaoMaterial.empenhoId` nos demais                                                       |
| controles                            | percentual, janela, parcela, raiz da contratada | `MaterialConfig`, copiado no evento                                                                                                                           |
| controles                            | "hoje" e dias de janela e prazo                 | relógio do servidor no fuso America/Belem                                                                                                                     |
| custo do ativo                       | valor do material                               | `CotacaoMaterial.valorExecutadoCentavos` em `executada` ou `atestada`, somado em `lerCustosDosChamados` junto da `Cotacao` antiga e de `materiaisForaCotacao` |
| prazos do ateste                     | vencimento                                      | `executadoEm + 5 dias` e `recebimentoProvisorio.em + 5 dias`                                                                                                  |
| relatório                            | equivalente SINAPI de item do Anexo V           | `sinapiCodigo` e `sinapiPrecoCentavos` copiados no item da cotação                                                                                            |
| relatório                            | consumo por item                                | soma de `quantidadeExecutada` por número do Anexo V                                                                                                           |
| painel                               | itens sem código SINAPI                         | `AnexoVItem` vigente com `sinapiCodigo` vazio                                                                                                                 |

### Key invariants

- Uma cotação em trâmite por chamado (índice único parcial).
- Em todo empenho, `comprometidoCentavos` é a soma de `reservas` e é ≤ `valorLiquidoCentavos`; cada reserva aponta uma cotação `autorizada`, `executada` ou `atestada` e fica no empenho gravado nela (a conciliação garante, e um teste confere).
- O preço dos caminhos 1 e 2 nunca vem da entrada do usuário, e nenhum preço muda depois do envio. A origem também nunca vem da entrada.
- Cada contrato tem no máximo uma versão vigente do Anexo V (o ponteiro em `AnexoVVigencia`), e um mês SINAPI só é visível com todas as suas linhas (`SinapiReferencia`).
- Quem montou nunca aprova; quem aprova tem designação vigente e faixa suficiente no momento do ato.
- Trilha, designações, faixas e emissões de PDF recusam alteração e exclusão no schema, exceto pelas funções próprias de revogar e desativar.
- Executado ≤ autorizado, por item.
- Taxa de administração é a constante zero.

### Security model

- Os 4 perfis não mudam. A competência vem da `DesignacaoMaterial` vigente (`lib/material/papeis.ts`, memorizado por request como o `verifySession`). Toda action confere papel e situação no servidor; esconder botão é só conforto.
- Lado TRF1 = designação `fiscal`, `gestor` ou `aprovador` vigente (só Admin), mais o Admin sem designação, só para leitura (a única ação que ele faz é gerar o PDF, AC-23). Contratada = `responsavel_tecnico` (Preposto ou Técnico). Técnico atribuído = `Chamado.assignedTo` no momento.
- A leitura passa por um único `serializarCotacao(cotacao, papeis)` em `lib/material/serializar.ts`, que aplica o AC-15. A API de arquivos aplica a mesma regra.
- Upload: tipo pela assinatura dos bytes, nome em disco gerado, caminho resolvido por `resolverCaminhoSeguro`, download só como anexo e com `nosniff`.
- `/configuracoes/material` já é barrado pelo `proxy.ts` para quem não é Admin. `/cotacoes` e `/relatorios/material` têm guarda no `page.tsx`.
- Sem dado pessoal novo além do nome de quem age e do CNPJ de fornecedor (dado de empresa). Trilha e designações têm valor de prova (RN-49 do funcional): nunca apagadas.

### Configuration required

Nenhuma variável de ambiente nova: a conciliação usa o `CRON_SECRET` existente. Arquivos vão para o `UPLOADS_ROOT` existente. A raiz da contratada e os parâmetros ficam em `MaterialConfig`.

### Critical test scenarios

- Fio completo: técnico cria, responsável técnico envia com 3 orçamentos, fiscal encaminha, aprovador aprova com empenho, técnico executa com evidência; o chamado pausa e retoma, a reserva aparece e é ajustada, e o custo do ativo sobe. Verifica **AC-1**, **AC-2**, **AC-5**, **AC-8**, **AC-10**, **AC-17**.
- Corrida de saldo: duas aprovações simultâneas, saldo para uma; uma passa, a outra recebe `saldo_insuficiente`, o saldo nunca fica negativo (banco real). Queda simulada entre reserva e cotação: a conciliação libera. Verifica **AC-8**.
- Duplo clique: duas chamadas de `enviar` com a mesma versão; só uma pausa o chamado. Verifica **AC-2**, **AC-9**.
- Rascunho: o técnico não edita depois que o responsável técnico salvou; o responsável técnico não remove item do diagnóstico; versão velha é recusada. Verifica **AC-1**.
- Pausa: retomada manual recusada com cotação em trâmite; envio com chamado pausado por outro motivo não abre pausa nem retoma. Verifica **AC-2**.
- Competência: aprovador de faixa menor não vê o botão e a action recusa; designação vencida recusa; quem montou recusa; designação sobreposta é recusada. Verifica **AC-7**, **AC-19**.
- Trilha: update e delete no modelo do evento lançam erro; o teste de varredura não acha escrita fora das funções próprias. Verifica **AC-9**, **AC-14**.
- Execução: antes de autorizar é recusada; sem evidência é recusada; acima do autorizado é recusada; a menos gera advertência e devolve saldo. Verifica **AC-10**.
- Alteração: libera a reserva e volta para `devolvida`; o reenvio passa pela análise. Verifica **AC-11**.
- Ciclo do chamado: concluir com cotação em trâmite é recusado; cancelar o chamado cancela a cotação, libera o saldo e grava o autor; o teste de varredura acha toda ação que conclui ou cancela. `executada` libera o índice. Verifica **AC-3**, **AC-12**, **AC-13**.
- Revisão de 15/10: duas aprovações em empenhos diferentes deixam uma única reserva, no empenho da vencedora; item do diagnóstico repetido na entrada não burla a trava; salvar sem orçamentos mantém os gravados; arquivo de orçamento repetido ou removido barra o envio; a rodada diária cancela a cotação de chamado encerrado e fecha a pausa dela; execução de chamado cancelado é recusada; a conciliação libera reserva no empenho errado; uma falha na rodada de cancelamento não impede a conciliação. Verifica **AC-1**, **AC-2**, **AC-4**, **AC-8**, **AC-10**, **AC-12**.
- Ainda devidos (sem teste hoje): a rodada diária perdendo a corrida para uma ação manual devolve `canceladas: 0` sem lançar; a rodada com chamado `recusado` grava `chamado_recusado`; cancelar em `em_aprovacao` não mexe em reserva. Verifica **AC-12**.
- Revisão de 19/10: data da NF impossível, futura ou anterior ao dia da autorização é recusada com mensagem própria, sem exceção, com a virada de dia em 02:59 e 03:00 UTC; uma NF recusada deixa remover o arquivo, e o 11º envio depois de 10 recusas passa; a `atestada` sem NF com mais de 90 dias aparece na fila, no detalhe e em `Minhas ações` da contratada, e a com NF some 90 dias depois do registro (teste de paridade entre `visaoDe` e o filtro da fila); NF com arquivo de outra cotação ou já removido é recusada; dois cliques no provisório gravam um só, e dois na NF avisam uma vez; a contratada recebe as datas do recebimento sem nome, sem `prazoAteste` e sem o autor na trilha (entra no cenário "Vazamento"); registrar a NF avisa os gestores sem valor e sem toast de "atestada"; o Admin sem designação gera o PDF com `papel: admin`, quem não é TRF1 recebe 403 mesmo com id inexistente e o rascunho dá 404 ao TRF1. Teste de componente para `AtesteCotacao` e `SeloPrazoAteste`. Verifica **AC-15**, **AC-16**, **AC-21**, **AC-22**, **AC-23**.
- Vazamento: o solicitante e o técnico chamam a leitura, os avisos e a rota de arquivo e não recebem saldo, limite, advertência, valor no aviso nem orçamento. Verifica **AC-15**, **AC-16**.
- Custo: um chamado com cotação antiga aprovada, cotação nova executada e material fora de cotação mostra a mesma soma na ficha, no IMR e no relatório por contrato. Verifica **AC-17**.
- Preço: enviar um preço diferente no caminho 1 é ignorado; importar um mês novo do SINAPI não muda cotação enviada. Verifica **AC-26**.
- Importação (decisão de 19/10, antes da fatia 3): CSV com cabeçalho na linha 5, colunas a mais, campo com `;` entre aspas e arquivo em Windows-1252 são lidos; coluna obrigatória faltando devolve o nome dela; `ITEM` ou `CODIGO` repetido e preço com 3 casas recusam o arquivo com a linha; reimportar o Anexo V com `CODIGO_SINAPI` vazio mantém o código e a marca manual. Verifica **AC-24**, **AC-25**.
- Aplicação sem transação: queda entre as linhas e a virada da chave deixa a versão anterior vigente, e reaplicar termina sem duplicar; dois cliques em aplicar gravam uma versão só; Anexo V reimportado por outro Admin depois da revisão descarta a importação; mês SINAPI repetido é recusado; recálculo e marcação manual ao mesmo tempo mantêm os dois campos. Verifica **AC-24**, **AC-25**, **AC-29**.
- Rascunho e base: rascunho classificado antes de reimportar o Anexo V envia com o preço novo, e com `classificacao_desatualizada` se o item saiu; `ambas` sem base escolhida barra o encaminhar, e a escolha grava preço e justificativa; a devolução limpa a base; a conferência é exigida pela marca do item vigente. Verifica **AC-26**, **AC-27**, **AC-29**.
- Origem e anomalia: item do Anexo V com código no mês mais recente vira `ambas` sem pedir; insumo SINAPI equivalente a um item vira `ambas`, a dois é recusado; `origem` mandada na entrada é ignorada; um mês novo que tira o código faz o envio voltar o item para `anexo_v`; importar o SINAPI mais novo liga e desliga a marca automática e nunca toca a manual; chamado de tipo de serviço sem contrato vigente não vê o caminho 1. Verifica **AC-26**, **AC-28**, **AC-29**, **AC-30**.
- CNPJ: DV inválido e raiz da contratada são recusados; item com só 2 raízes distintas não é enviado. Verifica **AC-31**.
- Fracionamento: duas cotações abaixo da faixa cuja soma alcança geram advertência e não travam. Verifica **AC-36**.

## Build plan

Tracer Bullet: a fatia 1 atravessa todas as camadas com o mínimo de regras (só o caminho 3, sem os controles de CNPJ) e já tem o saldo do empenho; as fatias seguintes engrossam o fio. Cada fatia vai para produção sozinha.

**Fatia 1: o fio**

1. Modelos `CotacaoMaterial`, `CotacaoMaterialEvento`, `ArquivoCotacao`, `Empenho`, `DesignacaoMaterial`, `FaixaCompetencia`, `MaterialConfig` (só os campos desta fatia), os hooks de só inclusão e as ações novas em `CHAMADO_HISTORY_ACTIONS`, satisfies **AC-3**, **AC-9**, **AC-19**
2. `shared/material/` (situações, transições, `mensagens.ts`), `lib/material/papeis.ts` e as telas de empenhos, movimentos, designações e faixas em `/configuracoes/material`, satisfies **AC-19**, **AC-20**
3. `lib/material/transicoes.ts` com a ordem de passos, a gravação condicional por versão e o evento, satisfies **AC-5**, **AC-9**, **AC-14**
4. `lib/material/saldo.ts` (reservar, liberar, ajustar, conciliar), o endpoint de cron e os testes de corrida e de queda no banco real, satisfies **AC-6**, **AC-8**
5. Actions de criar, salvar, enviar (pausa), assumir, devolver, reprovar, encaminhar, aprovar (retoma), alterar, executar e cancelar, satisfies **AC-1**, **AC-2**, **AC-4**, **AC-5**, **AC-7**, **AC-8**, **AC-10**, **AC-11**, **AC-12**
6. Upload, remoção e download de arquivos (`/api/cotacoes/...`), exceção no `proxy.ts`, bloco no nginx e linha no crontab, satisfies **AC-4**, **AC-10**, **AC-15**
7. `lib/material/chamado.ts` ligado a toda ação que conclui, cancela ou recusa o chamado e à retomada manual, com o teste de varredura, satisfies **AC-2**, **AC-12**, **AC-13**
8. `serializarCotacao` e as telas `/cotacoes`, `/cotacoes/[id]`, o cartão no Sheet e na tela do técnico, a linha de situação para o solicitante e o menu, satisfies **AC-7**, **AC-15**
9. Avisos: `Notification`, e-mail e o evento `material:cotacao_situacao` (socket-server, `shared/socket.ts`, `RealtimeProvider`, `getNotificationUrl`), satisfies **AC-16**
10. Custo: `lerCustosDosChamados` soma o valor executado de `CotacaoMaterial`, com o teste dos três tipos juntos, satisfies **AC-17**
11. Fechar o envio antigo (`submitCotacaoAction` recusa; `SubmitCotacaoDialog` e o motivo de cotação do `PauseTicketDialog` saem da tela), satisfies **AC-18**

**Fatia 2: ateste e PDF**

12. Recebimento provisório e definitivo, selo de prazo e nota fiscal, satisfies **AC-21**, **AC-22**
13. PDF da cotação com `@react-pdf/renderer` e `CotacaoMaterialPdfEmissao`, satisfies **AC-23**

13a. Escolhas da revisão de 19/10: data da NF validada no schema e limitada entre a autorização e hoje, remoção do arquivo de NF não ligado, confirmação no diálogo e aviso aos gestores; `pendenciaDaContratada` usada por `visaoDe`, pela fila e por `Minhas ações`; selo e `prazoAteste` só no lado TRF1, datas do recebimento sem nome e trilha sem o autor do recebimento para a contratada; `papel` na emissão do PDF, 403 antes da busca e 404 no rascunho; o selo lê os rótulos de `mensagens.ts`; os testes do cenário "Revisão de 19/10", satisfies **AC-15**, **AC-16**, **AC-21**, **AC-22**, **AC-23**

**Fatia 3: Anexo V e SINAPI**

14. Modelos `AnexoVItem`, `AnexoVVigencia`, `SinapiInsumo`, `SinapiReferencia`, `ImportacaoMaterial` e a importação em `lib/material/importacao/` com os layouts e a aplicação em cinco passos de _Importação e classificação_ (reaproveita `decodificarCp1252` do importador SICAM e o padrão pendente, revisão e aplicação), satisfies **AC-24**, **AC-25**
15. Contrato da cotação, busca e classificação nos caminhos 1, 2 e ambas por `derivarOrigem`, com o preço lido sempre da tabela, a origem derivada de novo e congelada no envio e o impedimento `classificacao_desatualizada`, satisfies **AC-26**, **AC-30**
16. `recalcularAnomalia` ligado às três aplicações, escolha de base pelo fiscal, advertência sobre o SINAPI, lista de anomalia, conferência, edição do código SINAPI do item e o painel do que falta, satisfies **AC-27**, **AC-28**, **AC-29**, **AC-30**

**Fatia 4: controles do caminho 3 e urgência**

17. Controles de CNPJ, referência, variação e orçamento vencido, satisfies **AC-31**, **AC-32**, **AC-33**, **AC-34**
18. Pedido e decisão de urgência, bloqueio do definitivo, marca permanente, satisfies **AC-35**

**Fatia 5: advertências e relatório**

19. Fracionamento, reincidência, consumo acima do estimado e item parecido, satisfies **AC-36**, **AC-37**, **AC-39**, **AC-40**
20. Projeção de esgotamento na aprovação, satisfies **AC-38**
21. Tela de parâmetros com histórico, satisfies **AC-42**
22. `/relatorios/material`, satisfies **AC-41**

## Migration plan

**Strategy**: estrangulamento.

1. A fatia 1 entra com o modelo novo e, no mesmo deploy, fecha o envio pelo fluxo antigo. As cotações antigas `enviada` terminam pelo cartão atual e as `aprovada` continuam no custo. Nenhum dado é migrado.
2. Antes de usar: o Admin cadastra o empenho do exercício e as faixas e designa responsáveis técnicos, fiscais, gestores e aprovadores. Sem isso, o fluxo monta e analisa, mas não encaminha nem aprova.
3. Quando não houver mais cotação antiga `enviada`, o cartão antigo pode virar só leitura (fora desta spec).

**Rollback**: reverter o commit da fatia reabre o envio antigo. As cotações novas ficam na coleção própria; as reservas ficam no empenho até uma nova conciliação.
**Risks**: cotação nova pausada no momento do rollback fica com o chamado em `aguardando_terceiros`; com o código revertido a trava de retomada some, e a gestão retoma pela ação de pausa existente.

## Consequences

**Positive**:

- O material passa a ter autorização prévia registrada, lastro no empenho e uma trilha que serve de prova, no lugar do e-mail.
- O sobrepreço do Anexo V fica visível em cada aprovação e no relatório, o que alimenta o próximo TR.
- O custo por ativo passa a refletir o material de fato aplicado.

**Negative / tradeoffs**:

- Onze entidades novas e duas formas de cotação convivendo até as antigas acabarem.
- O fluxo tem mais etapas que o e-mail. Sem designações e empenho cadastrados, nada é aprovado, então a implantação depende de ato do gestor (pendências 3 e 4 do funcional).
- Sem transação no MongoDB, o saldo depende de reserva idempotente, compensação e conciliação diária; uma reserva órfã pode prender saldo por até um dia.
- Se o gancho de cancelamento falhar, a cotação `autorizada` de um chamado cancelado prende o saldo até a rodada diária seguinte (até cerca de 24 horas). Prazo aceito; um botão de gestão para rodar a limpeza na hora fica fora desta spec.
- A imutabilidade da trilha, das designações e das faixas vale para as operações do Mongoose (query, documento e `bulkWrite`); `insertMany` passa por ser inclusão, e `Model.collection.*` passa por fora do Mongoose. Escrita direta na coleção é exceção para teste e carga, nunca para código do app.
- A importação do SINAPI depende de o Admin converter o .xlsx da Caixa para CSV todo mês e renomear quatro colunas (a de preço é a do AP). É trabalho manual mensal, aceito em troca de o importador não quebrar quando a Caixa muda a planilha.
- A marca automática de anomalia muda quando entra um mês SINAPI novo: um item pode entrar ou sair da lista de conferência obrigatória sem ato do Admin. A marca manual é a forma de manter um item na lista de vez.
- As regras novas de conclusão, cancelamento e retomada do chamado tocam ações de três telas (gestão, técnico, conversas) e um teste de varredura passa a vigiar isso.
- A faixa imutável obriga a designar de novo todos os aprovadores quando a portaria mudar um limite.

**Neutral**:

- Novo evento no Socket.IO, novo bloco no nginx e nova linha no crontab.
- `lib/material/AGENTS.md` novo para as regras desta área.

## Follow-up

- [ ] Pendência 3 do funcional: faixas e titulares da delegação. O fluxo não aprova nada até o Admin cadastrá-los.
- [ ] Pendência 4: número, valor e saldo atual do empenho de material do exercício.
- [ ] Pendência 1: posição formal do gestor sobre qual base prevalece. Enquanto não houver, o fiscal escolhe com justificativa (AC-27).
- [ ] Pendência 2: conferir o item 74 do Anexo V antes da importação, ou já marcá-lo na lista de anomalia.
- [ ] Pendência 5: simplificação dos caminhos 1 e 2 (análise e aprovação num ato). Saiu desta spec; quando o fiscal decidir, entra como dois eventos em sequência na mesma action, desfazendo o primeiro se o segundo falhar.
- [ ] Pendência 7: confirmar se houve repactuação dos preços do Anexo V antes da primeira importação.
- [ ] Spec própria para os indicadores 3 e 4 do IMR do contrato.
- [ ] Corrigir no `funcional.md`: a nota da RN-05 cita a pendência 4, mas é a 5; a situação "executada" diz "nota fiscal anexada", em conflito com a RN-20.
- [ ] O material fora de cotação (spec 0018) não confere se o mesmo material já foi cotado; a gestão confere à mão.
- [x] Achados menores da revisão de 15/10 ainda abertos (`docs/reviews/2026-10-15-main-cotacao-material-r2.md`): aprovação repetida depois de uma queda entre a reserva e a gravação diz "sem saldo" até a conciliação; o evento da conciliação grava `para: 'cancelada'` quando a cotação nem existe; `cotacaoAnteriorId` não é validado; a sobreposição de designação não é atômica e o perfil não é conferido de novo ao usar a designação; o teste de varredura do ciclo do chamado só confere o import; faltam testes da rodada diária perdendo a corrida, de chamado recusado e de cancelamento em `em_aprovacao`.
- [ ] Decidir se o técnico atribuído pode descartar o próprio rascunho (hoje só o responsável técnico ou o gestor cancelam).
- [ ] Fechar o `PauseLog` da cotação com a hora em que o chamado foi cancelado ou recusado, e não com a hora do ato que encerrou a cotação: pela rodada diária, a hora atual infla o tempo pausado em até um dia.
- [ ] Lote e ordem na rodada diária de cancelamento, se o volume de cotações em trâmite crescer.
- [ ] Salvar o rascunho sem o campo de orçamentos e removendo um item citado por um orçamento gravado deve ser recusado ("tire o preço dos orçamentos antes"); hoje o preço fica apontando para um item que não existe mais. Decisão tomada nesta revisão; falta construir (`/develop`).
- [ ] O PDF da cotação e o do relatório por contrato dividem a mesma trava em memória e a renderização não tem prazo: uma renderização travada bloqueia os dois até reiniciar o processo. Aceito sob a regra de instância única; registrar em `lib/material/AGENTS.md` no `/sync` e pôr um prazo se acontecer.
- [ ] Contrato vence em 28/02/2027: as fatias 1 a 3 cobrem o essencial; as fatias 4 e 5 só valem se couberem antes disso ou se o próximo contrato herdar o fluxo.

## Rationale

Raciocínio e opções: ver [rationale.md](rationale.md).
