# Scope: Sigma

Sigma é o sistema de chamados de manutenção (predial, ar condicionado, elevador) usado pelos servidores, com triagem pelo Preposto, técnicos por especialidade e SLA contratual.
Esta passada planeja a abertura de chamados por conversa: o solicitante relata o problema em linguagem natural e a IA local (vLLM com Qwen, na rede interna) escolhe o serviço, define a urgência e encaminha a um técnico. A liberação será para todos de uma vez, por isso a trava de confiança é calibrada antes de a IA decidir sozinha.
A passada de 14/11/2026 planeja um Sigma só para vários órgãos do Judiciário: cada órgão com seus dados separados, seu AD, seus tipos de serviço e seus contratos com níveis de serviço (SLA e IMR) próprios, liberados todos juntos (ver [orgaos.md](orgaos.md)).

**Build approach:** Tracer Bullet (fatias verticais: cada fatia funciona de ponta a ponta antes de a próxima engrossar o fio).
**Workflow:** Beta (depois do `/develop`: `/check verify`, depois `/test`). É o nível padrão de rigor do projeto. O `/architect` é a primeira parada recomendada para funcionalidade com decisão real, mas você pode pular quando já souber como construir. Qualquer funcionalidade pode ter sua própria marca (ex.: `· GA`) para fazer mais ou menos.

_São recomendações para manter a construção organizada, não obrigações. Pule o que não servir: se você já sabe como construir uma funcionalidade, use `/develop` e pule o `/architect`. Você decide quando uma funcionalidade está `done`._

## At a glance

| #   | Feature                                            | Phase             | Status   |
| --- | -------------------------------------------------- | ----------------- | -------- |
| 1   | Autenticação LDAP e perfis                         | Contexto          | existing |
| 2   | Unidades e usuários                                | Contexto          | existing |
| 3   | Catálogo de serviços                               | Contexto          | existing |
| 4   | Abertura de chamado por formulário                 | Contexto          | existing |
| 5   | Triagem, classificação e atribuição pelo Preposto  | Contexto          | existing |
| 6   | Detalhe do chamado: comentários, histórico, anexos | Contexto          | existing |
| 7   | SLA, expediente e pausas                           | Contexto          | existing |
| 8   | Notificações em tempo real                         | Contexto          | existing |
| 9   | Integração com a IA local                          | Foundation        | done     |
| 10  | Conversa e decisões da IA no banco                 | Foundation        | done     |
| 11  | Tela de chat de chamados                           | Slice 1           | done     |
| 12  | Abertura do chamado pela IA                        | Slice 1           | done     |
| 13  | Andamento e conversa com o técnico                 | Slice 2           | done     |
| 14  | Calibração da trava de confiança                   | Slice 3           | done     |
| 15  | Prioridade e SLA automáticos                       | Slice 3           | done     |
| 16  | Atribuição automática ao técnico                   | Slice 3           | done     |
| 17  | Revisão das decisões da IA pelo Preposto           | Slice 3           | done     |
| 22  | Prazo para avaliar e encerramento definitivo       | Ciclo de vida     | done     |
| 23  | Gestão de ativos: cadastro, etiqueta e vínculo     | Ativos            | done     |
| 24  | Importador SICAM e vistoria em campo               | Ativos            | done     |
| 25  | Documentos do ativo e preventiva por categoria     | Ativos            | done     |
| 26  | Ativo pela IA no chat e indicadores no IMR         | Ativos            | done     |
| 27  | Candidatos à substituição                          | Ativos            | done     |
| 28  | Relatório mensal por contrato com ativo            | Ativos            | done     |
| 30  | Custo acumulado por ativo                          | Ativos            | done     |
| 31  | Cotação e fornecimento de material                 | Material          | done     |
| 32  | IMR do contrato: indicadores 3 e 4                 | Material          | done     |
| 33  | Repaginação das telas da cotação de material       | Material          | done     |
| 34  | Motivo e histórico no cadastro de material         | Material          | done     |
| 29  | Correções de integridade do chamado                | Ciclo de vida     | done     |
| 20  | Aviso de chamado duplicado                         | Slice 4           | done     |
| 35  | Decisões do contrato para operar a cotação         | Material          | planned  |
| 36  | Checagem do almoxarifado antes da cotação          | Material          | done     |
| 37  | Pausa aberta quando a retomada pela cotação falha  | Material          | done     |
| 18  | Painel de acurácia da IA                           | Slice 3           | planned  |
| 19  | Fotos no chat                                      | Slice 4           | planned  |
| 21  | Entrada por voz                                    | Slice 4           | planned  |
| 38  | Órgão e isolamento dos dados                       | Órgãos: fundação  | in-progress |
| 39  | Migração do órgão atual para o órgão 1             | Órgãos: fundação  | planned  |
| 40  | Gestor da plataforma e cadastro de órgãos          | Órgãos: fundação  | planned  |
| 41  | Login com o AD de cada órgão                       | Órgãos: fundação  | planned  |
| 42  | Tempo real, cron e avisos por órgão                | Órgãos: fundação  | planned  |
| 43  | Configurações próprias de cada órgão               | Órgãos: contratos | planned  |
| 44  | Tipos de serviço por órgão                         | Órgãos: contratos | planned  |
| 45  | Contrato com níveis de SLA                         | Órgãos: contratos | planned  |
| 46  | IMR configurável por contrato                      | Órgãos: contratos | planned  |
| 47  | Módulos ligados por órgão                          | Órgãos: operação  | planned  |
| 48  | IA por órgão: calibração e cota                    | Órgãos: operação  | planned  |
| 49  | Entrada do segundo órgão                           | Órgãos: liberação | planned  |

## Áreas

O plano de cada área fica no próprio arquivo, na ordem de construção.

- [Contexto](contexto.md): o que já existia antes do workflow (1 a 8) · 8 existing
- [Chat e IA](chat-ia.md): fundação da IA, chat, andamento, autonomia e extras da conversa (9 a 21) · 10 done, 3 planned (18, 19, 21)
- [Ciclo de vida do chamado](ciclo-de-vida.md): prazo para avaliar e correções de integridade (22, 29) · 2 done
- [Gestão de ativos](ativos.md): cadastro, SICAM, documentos, indicadores, substituição, relatório e custo (23 a 28, 30) · 7 done
- [Material](material.md): cotação, IMR do contrato, almoxarifado e pendências do contrato (31 a 37) · 6 done, 1 planned (35)
- [Vários órgãos](orgaos.md): um Sigma para vários órgãos do Judiciário, com contratos e níveis de serviço por órgão (38 a 49) · 1 in-progress (38), 11 planned

## Deferred

Fora desta passada, guardado para o plano continuar honesto.

- **IA tira dúvidas sobre o chamado**: responder perguntas como "quando vai ser atendido?" com os dados do chamado · needs a decision
- **`cache_salt` do vLLM**: proteger o cache de prefixo da GPU se ela passar a ser compartilhada com sistemas de fora do tribunal · from spec 0001
- **Testes de banco no CI**: decidir se o CI passa a subir um MongoDB de serviço para rodar os testes que dependem de índice e TTL · from spec 0002
- **Cancelar como duplicado**: na triagem, cancelar o chamado novo como duplicado de outro, gravando o solicitante como interessado do original e avisando, com motivo de cancelamento próprio · from spec 0017
- **Medir o aviso de duplicado**: depois de algumas semanas, comparar avisos mostrados com acompanhamentos e aberturas mesmo assim, e decidir se a regra precisa do modelo julgando o texto · from spec 0017
- **Preventiva prevista x realizada**: comparar as preventivas do mês com a `periodicidadePreventivaDias` da categoria no relatório por contrato · from spec 0016
- **Formulário a um clique pela conversa**: fazer `/meus-chamados` aceitar um parâmetro que já abre o diálogo do formulário, para o link da lateral não exigir um clique a mais · from spec 0003
- **Unificar as duas entradas**: definir o sinal (por exemplo, percentual de aberturas pelo chat) que encerra a convivência entre `/conversas` e a tabela de `/meus-chamados`, para a decisão não ficar aberta para sempre · from spec 0003
- **Evento próprio de conversa no socket**: hoje a tela de conversas recarrega pelo evento genérico de notificação, e aviso de SLA também dispara recarga; um evento próprio resolve se o desperdício incomodar · from spec 0003
- **Cache de prefixo do vLLM**: confirmar com a equipe da GPU se o vLLM roda com cache de prefixo ligado, porque o catálogo vai no prompt de toda mensagem do chat e o custo cai muito com ele · from spec 0004
- **Telefone de contato no chamado do chat**: o chat não pede dado pessoal, então o chamado nasce sem telefone; decidir como pedir se os técnicos sentirem falta · from spec 0004
- **Leitor de tela de verdade no AC-18**: o `/check verify` da 0004 conferiu a região ao vivo programaticamente (o texto que ela recebe bate com o esperado), mas sem NVDA ou outro leitor de tela instalado nesta máquina para ouvir o anúncio de verdade; rodar quando houver um leitor de tela disponível · from spec 0004
- **Cotação, observação de material e pausa por terceiros na conversa**: hoje ficam fora do sinal ao vivo de `/conversas`; considerar se a gestão sentir falta · from spec 0005
- **Simplificação dos caminhos 1 e 2 do material**: análise e aprovação num ato único para cotação só com itens do Anexo V e do SINAPI, quando o fiscal decidir a pendência 5 · from spec 0019
- **Campo `situacaoDesde` na cotação**: gravar na transição se as cotações em trâmite passarem de algumas centenas e "Mais tempo na etapa" ficar lento · from spec 0021
- **Variante `gradiente` do `Button` no Sigma inteiro**: trocar os usos caso a caso fora do módulo de material · from spec 0021
- **Visão do Admin sem designação e cotação reprovada ou cancelada**: desenhar no canvas; hoje seguem o padrão do detalhe com o "Sua vez" dizendo quem age · from spec 0021
- **Miniatura das evidências da cotação**: pede servir o arquivo inline e decidir quem vê; decidir junto com Fotos no chat (19) · from spec 0021
- **Seção Histórico única no cadastro de material**: juntar numa seção só as revogações, desativações e mudanças de situação que a 0022 guarda em cada documento, se a auditoria pedir · from spec 0022
- **Aviso de reatribuição de técnico**: `reatribuicao_tecnico` não emite nenhum evento hoje; se o solicitante precisar saber quando o técnico muda, cobrir numa fatia futura · from spec 0005
- **Viés de concordância no acerto de serviço**: o Preposto vê a sugestão de serviço pré preenchida na classificação, então o número medido mede concordância, não um julgamento independente; considerar esconder a sugestão também na classificação se o viés atrapalhar a calibração · from spec 0006
- **Unificar a escolha de técnico manual e automática**: `findBestTechnician`, as duas rotas `eligible-technicians` e as cópias à mão de `ACTIVE_STATUSES` passam a usar o critério novo (desempate justo) e `CHAMADO_STATUS_CARGA_TECNICO` · from spec 0008
- **Nova tentativa de atribuição automática**: reavaliar chamados `sem_tecnico` quando um técnico libera vaga (ao concluir ou encerrar um chamado, ou pelo cron de 30 minutos) se o volume mostrar espera demais · from spec 0008
- **Reprocessamento retroativo pra calibração**: se o volume de chamados pelo chat crescer devagar, considerar rodar a IA contra chamados antigos do formulário pra engordar a amostra de acurácia, custeando as chamadas extras ao vLLM · from spec 0006
- **Desatribuir chamado e avisar o técnico anterior**: sem "desatribuir", um chamado com serviço errado, técnico sem a especialidade e nenhum outro elegível não tem saída; e o técnico que perde um chamado numa reatribuição continua sem aviso · from spec 0009
- **Reconciliar decisão divergente**: chamado corrigido cuja `DecisaoIa` ficou `sem_revisao` (falha entre os dois passos, sem transação); hoje o painel avisa e a confirmação é recusada, falta uma ação "registrar a correção já feita" · from spec 0009
- **`classificationNotes` chega ao solicitante**: `/api/meus-chamados` devolve as observações da classificação manual do Preposto; decidir se isso é aceitável (a 0009 só fecha o vazamento do motivo das correções) · from spec 0009
- **Contadores no controle "Revisão da IA"**: mostrar quantos chamados há em cada recorte, se a fila ficar grande · from spec 0009
- **Aviso de cron parado**: indicador para o Admin com a contagem de chamados `concluído` de prazo vencido há mais de 1 hora, sinal de que o container `cron` parou · from spec 0010
- **Reincidências no chamado anterior**: mostrar no chamado anterior a lista dos chamados abertos por "O problema voltou" (o índice `chamadoAnteriorId` já existe) · from spec 0010
- **Reincidência no IMR ou no painel**: quantos chamados nasceram de "O problema voltou", por serviço e unidade · from spec 0010
- **Rever o valor da checagem do almoxarifado**: depois de 3 meses ligada, contar checagens com candidato e quanto foi atendido (só 132 materiais têm saldo hoje); decide se o fluxo segue no próximo contrato · from spec 0024
- **Filtro por grupo do `CO_MAT` na checagem**: limitar a busca aos grupos de predial e ar (3024 e 3025 parecem ser) para tirar falso candidato de material de escritório · from spec 0024
- **Aviso de mês do IMR sem fechamento**: avisar fiscal e gestor quando um mês terminou e o IMR do contrato ainda não foi fechado · from spec 0023
- **48 horas corridas ou úteis**: reavaliar o prazo para avaliar depois de um mês de uso, se vencer em fim de semana gerar reclamação · from spec 0010
- **TLS na produção**: ligar `nginx/default.tls.conf` e `AUTH_COOKIE_SECURE=true`; sem HTTPS a câmera de `/ativos/ler` não funciona (já está na auditoria de 25/05/2026) · from spec 0011
- **Reativar local ou categoria de ativo**: hoje uma localização ou categoria desativada só volta pelo banco · from spec 0011
- **Reabrir campanha de vistoria**: hoje uma campanha encerrada não volta; abrir outra é o caminho, se a gestão sentir falta de reabrir · from spec 0012
- **Reserva atômica no recorrente comum**: o ramo `template` de `processRecurringTickets` pode gerar duas vezes se duas execuções do cron se cruzarem; aplicar a mesma reserva do ramo por categoria · from spec 0013
- **Distribuição em lote da preventiva**: se o Preposto passar a distribuir sempre do mesmo jeito, avaliar rodízio entre técnicos em vez da menor carga da 0008 · from spec 0013
- **Medir o lançamento de custo**: depois de alguns meses, ver quantos chamados concluídos têm custo lançado; se for pouco, avaliar lembrete no encerramento ou tela de lançamento em lote · from spec 0018
- **Valor de reposição por categoria**: base alternativa ao `valorHistorico` no critério de custo da substituição, e custo nas listas de `/ativos`, se a gestão pedir · from spec 0018
- **Data do tombo como idade**: se a vistoria preencher `dataInstalacao` em massa, revisar se a data do tombo ainda deve servir de reserva no critério de idade · from spec 0015
- **Abrir chamado da ficha pelo chat**: o botão "Abrir chamado deste ativo" levar a `/conversas?ativo=<id>` em vez do formulário · from spec 0014
- **Ativo escolhido pelo modelo**: levar candidatos ao prompt se a decisão `ativo` mostrar muita correção ou muitos cartões sem ativo com a vistoria completa · from spec 0014
- **Candidatos na troca de unidade**: recalcular os candidatos para a unidade nova escolhida no cartão, se a gestão sentir falta · from spec 0014
- **Fotos do ativo**: foto do equipamento na ficha e na vistoria; decidir junto com Fotos no chat (19) onde as fotos ficam guardadas · from proposta da spec 0011, fatia 2
- **Rever a regra do local vago na autonomia**: hoje o portão e a atribuição automática não olham o local; reabrir a decisão quando técnicos ou Prepostos relatarem idas ao lugar errado ou perguntas frequentes de local em chamados atribuídos sozinhos · from spec 0020
- **Texto do assistente com o cartão na tela**: o modelo às vezes segue perguntando com o cartão já mostrado, ou diz que o chamado foi aberto; corrigir no prompt, com `PROMPT_VERSION` novo (desliga a autonomia até o Admin salvar a calibração de novo) · from spec 0020 · feito em 19/10/2026 (PR #65, `PROMPT_VERSION` 3)
- **Pessoa em mais de um órgão**: uma conta com seletor de órgão (por exemplo, técnico da contratada que atende vários órgãos); por ora, cada conta pertence a um órgão só · from /scope de 14/11/2026
- **Prioridades próprias por contrato**: o contrato definir nomes e quantidade de prioridades, em vez das quatro fixas; por ora, o contrato define só prazos e IMR · from /scope de 14/11/2026
- **Instalação própria para um órgão**: o órgão que exigir subir o próprio Sigma com o mesmo código; por ora, todos na mesma instalação · from /scope de 14/11/2026
- **Índices não únicos por órgão**: antes da entrada do segundo órgão (49), medir as listagens com dois órgãos e decidir se os índices mais usados ganham `orgaoId` na frente · from spec 0025
- **Autocadastro de órgão**: o órgão se cadastrar sozinho por uma página; por ora, só o Gestor da plataforma cria · from /scope de 14/11/2026

## Legend

**A caixa de decisão.** Toda funcionalidade tem exatamente uma, a subtarefa cujo rótulo termina com `(spec)`. O texto pode variar, então as skills a encontram pelo final `(spec)`, nunca pelo rótulo exato. Toda outra caixa é de execução, e o `/architect` nunca marca nenhuma delas.

**Ciclo de vida da funcionalidade**: o plano muda conforme a funcionalidade avança; cada linha mostra o que aparece e quem define:

| Estado                       | Definido por                                                                          | A funcionalidade mostra                                                                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `planned` · needs a decision | `/scope`                                                                              | uma caixa: `Design it (spec): /architect <funcionalidade>`                                                                                                                                                                                                 |
| `in-progress` (desenhada)    | **`/architect` ao capturar a spec**                                                   | `Design it` marcada; spec ligada; `Build it: /develop <funcionalidade>` com **2 a 5 marcos**; as caixas finais do nível (`Verify it` de Alpha em diante, `Test it` de Beta em diante, `Review it` e `Document it` em GA); pendências surgidas já inscritas |
| `in-progress` (construindo)  | `/develop`                                                                            | os marcos são marcados um a um; o ponteiro de código é preenchido                                                                                                                                                                                          |
| `in-progress` (verificada)   | `/check verify`                                                                       | `Build it` e marcos marcados; `Verify it` marcada                                                                                                                                                                                                          |
| `done`                       | **você, quando decidir** (qualquer skill marca quando você pedir); `/sync` reconcilia | caixas executadas marcadas, as puladas indicadas; a última etapa do nível (`Prototype` depois do `/develop`; `Alpha` depois do `/check verify`; `Beta`/`GA` depois do `/test`) é o ponto sugerido para encerrar; `/sync` registra as convenções            |

- **Próximo passo** = a primeira caixa não marcada (sempre um comando ou um marco acompanhado).
- **needs a decision** = rode `/architect` primeiro; sem essa marca, vá direto ao `/develop`. A marca sai quando a spec é capturada.
- **Tarefas atômicas ficam na `## Build plan` da spec, não aqui**: o plano guarda só o resumo por marcos.
- **Status** `planned` → `in-progress` → `done`, mais `existing` (anterior ao workflow; `/develop` e `/sync` não mexem) e `dropped` (retirado do escopo, mantido para histórico).
- **Marca de abordagem** ao lado do título (ex.: `· Facade`) troca a abordagem só daquela funcionalidade; sem marca, herda o padrão.
- **Marca de nível** ao lado do título (ex.: `· GA`) define o rigor daquela funcionalidade acima ou abaixo do padrão; sem marca, herda. Ela decide as caixas de verificação e a próxima sugestão de cada skill.
- **Workflow** (linha do cabeçalho) é o padrão do projeto, o que roda depois do `/develop`: **Prototype** = nada além do autoteste do próprio `/develop`; **Alpha** = `/check verify`; **Beta** = `/check verify` e depois `/test`; **GA** = acrescenta `/check review` com modelo novo e depois `/document`. Funcionalidade construída sobre decisão ainda não ratificada (spec `Assumed`) fica sinalizada, mas isso nunca impede `done`.
- **Linha de ponteiro** (`spec <n> · code in <path>`): o link da spec vem do `/architect`, o caminho do código vem do `/develop`.
