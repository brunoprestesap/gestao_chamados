# 0008. Atribuição automática ao técnico

**Date**: 2026-09-25
**Status**: In Progress

## Summary

Quando a IA valida sozinha um chamado aberto pelo chat (spec 0007), o Sigma passa a escolher também o técnico: o que tem a especialidade do serviço, o menor número de chamados ativos e espaço abaixo do seu limite. O técnico é avisado como sempre e o solicitante lê o nome dele no próprio chat. Se ninguém puder pegar o chamado, ele fica `validado`, os gestores recebem o motivo e o Preposto atribui à mão, como hoje. A fatia nasce desligada: o Admin liga por um interruptor próprio, sem deploy.

## Requirements

**User stories**:

- Como solicitante, quero que meu chamado validado pela IA já tenha um técnico designado, para não esperar o Preposto encaminhar.
- Como técnico, quero receber o chamado com a notificação de sempre, sem nunca passar do meu limite de carga.
- Como Preposto, quero saber quando um chamado ficou sem técnico automático e por quê, para atribuir à mão só o que precisa de mim.
- Como Preposto ou Admin, quero que a escolha do técnico fique registrada como decisão auditável, para corrigir a escolha trocando o técnico e para a fatia 18 medir quantas vezes isso acontece.
- Como Admin, quero ligar e desligar a atribuição automática sem deploy, separada da prioridade automática.

**Acceptance criteria** (o contrato, cada critério é identificado e verificável de forma independente):

- **AC-1**: Com `autonomiaAtiva` e `atribuicaoAutomaticaAtiva` ligadas, quando `confirmarAbertura` cria um chamado `validado` (caminho confiante da 0007) e existe ao menos um técnico ativo com a especialidade (subtipo) do serviço e carga abaixo do limite, o chamado termina a mesma confirmação em `em atendimento`, com `assignedToUserId`, `assignedAt` e `sla.responseStartedAt` preenchidos e `assignedByUserId` vazio.
- **AC-2**: O técnico escolhido é o de menor carga (chamados atribuídos a ele em `validado` e `em atendimento`) entre os elegíveis (ativo, com a especialidade, carga menor que `maxAssignedTickets`, padrão 5). No empate vence quem está há mais tempo sem receber chamado (a menor data mais recente entre `assignedAt` e `reassignedAt` dos chamados dele; quem nunca recebeu vem primeiro), e o `_id` desempata por último. O próprio solicitante nunca é candidato, e um técnico com `maxAssignedTickets: 0` nunca recebe.
- **AC-3**: Sem candidato (ninguém ativo com a especialidade, ou todos no limite), o chamado continua `validado` sem técnico, `atribuicaoAutomatica` grava `resultado: 'sem_tecnico'` com `motivo` (`sem_especialidade` ou `sem_vaga`) e a data, o solicitante não vê erro e os gestores recebem o aviso com o motivo (AC-13). Não há nova tentativa automática.
- **AC-4**: Nenhuma falha do passo automático (banco, configuração, exceção) impede a abertura nem chega ao solicitante: o passo nunca lança e o chamado abre `validado`. Se a falha vier antes de a configuração ser lida (não se sabe se a chave estava ligada), o resultado é `nao_tentada` e nada é gravado. Se vier depois de a chave ser conhecida e antes de gravar a atribuição, o chamado fica com `atribuicaoAutomatica` em `sem_tecnico` com `motivo: 'erro'`. Se vier depois de a atribuição gravada e antes de a conferência passar, o passo faz uma única tentativa condicional de desfazer que já grava `sem_tecnico` com `erro`; se ela também falhar, registra um log de erro `[atribuicao]` com `estado: 'orfao'` (caso conhecido, ver `## Follow-up`).
- **AC-5**: `IaAutonomiaConfig.atribuicaoAutomaticaAtiva` (padrão `false`) liga e desliga o passo sem deploy, na tela `/configuracoes/ia-confianca` (Admin), e não depende de `PROMPT_VERSION`. O passo só roda com ela e `autonomiaAtiva` ligadas, lidas no instante da confirmação. Desligada, o chamado fica `validado` como hoje e sem `atribuicaoAutomatica`.
- **AC-6**: Só chamados que nascem `validado` pelo chat entram no passo. Chamado do formulário, chamado classificado à mão pelo Preposto e chamado que nasce `aberto` (sem confiança, sem serviço, sem SLA) nunca passam por ele.
- **AC-7**: Repetir a confirmação (`jaExistia`) nunca atribui, notifica nem grava frase de novo (`confirmarAbertura` já volta antes disso). Se um gestor atribuir o mesmo chamado ao mesmo tempo, só um vence (a condição atômica é a da atribuição manual: `status: 'validado'` e sem técnico), o perdedor não sobrescreve nada e o passo termina com `nao_tentada`, sem gravar resultado.
- **AC-8**: Depois de gravar a atribuição, o passo conta de novo a carga do técnico, incluindo o próprio chamado. Se a carga ficou maior que `maxAssignedTickets`, desfaz com um update condicional (filtro: `_id`, `assignedToUserId` do candidato, `status: 'em atendimento'` e `atribuicaoAutomatica.resultado: 'atribuido'`; limpa técnico, `assignedAt`, `sla.responseStartedAt`, `sla.responseBreachedAt` e `atribuicaoAutomatica`, e volta a `validado`) e tenta o próximo candidato, até 3 tentativas; esgotadas, grava `sem_tecnico` com `sem_vaga`. Se o desfazer não achar o documento, um gestor já mexeu: o passo termina com `nao_tentada`. Nenhum histórico, decisão, notificação, email ou evento sai antes de a conferência passar. A seleção continua exigindo carga menor que o limite.
- **AC-9**: Quando atribui, grava uma `DecisaoIa` com `campo: 'tecnico'`, `decididoPor: 'regra'`, `efeito: 'aplicado'`, `confianca` nula, valor `{ tecnicoId }` e motivo de até 200 caracteres com o critério e a carga (visível só a Preposto e Admin, como as outras decisões). Trocar o técnico depois, pela reatribuição, a marca como corrigida e grava a entrada `correcao_ia`, pelo caminho que já existe (`aplicarVeredito`, que não filtra por autor nem por efeito). Sem `DecisaoIa` de técnico no chamado, a reatribuição segue como hoje, sem nada a corrigir. `medirCalibragem` (0006) nunca conta essa decisão.
- **AC-10**: Grava uma entrada de histórico `atribuicao_tecnico` com `actorType: 'sistema'`, sem `userId`, `statusAnterior: 'validado'`, `statusNovo: 'em atendimento'` e texto "Atribuído automaticamente a `<nome>`", sem id, sem motivo e sem carga. Não grava entrada `decisao_ia` para o técnico.
- **AC-11**: O técnico recebe a notificação de sempre (`Notification` persistida, email e `ticket:assigned` no socket) com `assignedBy: { id: 'sistema', name: 'Atribuição automática' }`; o aviso ao vivo diz "Chamado #N atribuído a você automaticamente" e o email diz que foi atribuído automaticamente, em vez de "por Preposto". O solicitante recebe o mesmo `ticket:assigned` ao vivo (spec 0005). A atribuição manual continua emitindo exatamente o payload de hoje.
- **AC-12**: A mensagem final do chat diz o resultado: atribuído, "o técnico Fulano já foi designado"; sem técnico, "um Preposto vai designar o técnico". Com o passo desligado ou com o resultado `nao_tentada`, a frase da 0007 continua igual.
- **AC-13**: A notificação `ticket:new` aos gestores (persistida, email e socket) traz o resultado no texto: "validado e atribuído a Fulano", ou "validado, sem técnico disponível" com o motivo em português (`sem_especialidade`: "nenhum técnico ativo com a especialidade"; `sem_vaga`: "todos os técnicos no limite de carga"; `erro`: "falha na atribuição automática"). Nunca diz "falta atribuir um técnico" quando o chamado foi atribuído. Com o passo desligado ou com `nao_tentada`, o texto da 0007 continua.
- **AC-14**: `sla.responseStartedAt` recebe o instante da atribuição e `sla.responseBreachedAt` sai do mesmo `evaluateResponseBreach` da atribuição manual. Os prazos do snapshot da 0007 (`responseDueAt`, `resolutionDueAt`) não mudam.
- **AC-15**: Preposto e Admin veem no detalhe do chamado o resultado: "Atribuído automaticamente a Fulano" (o técnico escolhido pela regra, `atribuicaoAutomatica.tecnicoId`, mesmo que o Preposto o tenha trocado depois) ou "Sem técnico automático: motivo". Na lista, um selo com texto "Sem técnico automático" aparece ao lado do selo de validado pela IA, só enquanto o chamado não tiver `assignedToUserId`; o detalhe continua mostrando o motivo. A informação nunca depende só de cor.
- **AC-16**: `atribuicaoAutomatica` e o motivo nunca aparecem em payload de solicitante ou técnico: nem em `/api/meus-chamados`, nem na leitura de `/conversas`, nem em `chamados-atribuidos`, nem no histórico.
- **AC-17**: Cada execução do passo que chega a ler a chave ligada gera uma linha `[atribuicao]` com `chamadoId`, `resultado`, `motivo`, `tecnicoId`, número de candidatos tentados e duração, sem texto de relato. Com a chave desligada, ou com `nao_tentada` antes da leitura, não há linha.
- **AC-18**: A atribuição manual e a reatribuição mantêm o comportamento de hoje (mesmos testes, mesmas asserções). A notificação extraída para as duas gera o mesmo payload, a mesma `Notification` persistida e o mesmo email.
- **AC-19**: Um chamado atribuído sozinho sai da janela de correção de prioridade da 0007: `updateTicketPriorityAction` o recusa com a mensagem clara de hoje (já atribuído), e o Preposto ainda pode reatribuir o técnico. É uma limitação assumida até a fatia 17.

## Decision

**Chosen option**: Opção 1: passo síncrono dentro de `confirmarAbertura`, em módulo próprio, com interruptor próprio

Depois que `abrirChamadoDaConversa` cria o chamado `validado`, `confirmarAbertura` chama `tentarAtribuicaoAutomatica` (novo, em `lib/chamados/`), que escolhe o técnico por regra (menor carga, empate por quem está há mais tempo sem receber), grava a atribuição de forma condicional e atômica, confere a carga depois de gravar e registra o resultado. Nada muda em `abrirChamadoDaConversa` nem em `assignTicketAction`, salvo a extração da notificação que as duas passam a compartilhar.

**Implementation skills**: `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Rationale

Reasoning completo, opções descartadas e as decisões menores: veja [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

Nenhuma coleção nova. Dois campos novos, opcionais, e o uso de estruturas que já existem:

- `Chamado.atribuicaoAutomatica` (subdocumento opcional, sem `_id`): `resultado` (`'atribuido'` ou `'sem_tecnico'`), `motivo` (`'sem_especialidade'`, `'sem_vaga'`, `'erro'` ou `null` quando atribuído), `tecnicoId` (o técnico escolhido, presente só quando `atribuido`, e que não muda se o Preposto reatribuir depois), `em` (data). Ausente significa "não tentado": chamado do formulário, `aberto` no nascimento, interruptor desligado, atribuição perdida para um gestor ou falha antes de a configuração ser lida.
- `Chamado` (campos que já existem): `status`, `assignedToUserId`, `assignedAt` e `sla.responseStartedAt` passam a ser preenchidos pelo sistema; `assignedByUserId` fica vazio (o schema já o aceita opcional e todos os leitores tratam nulo).
- `IaAutonomiaConfig.atribuicaoAutomaticaAtiva` (`Boolean`, padrão `false`). Não entra na comparação com `PROMPT_VERSION`, porque a escolha é por regra e não por confiança do modelo.
- `DecisaoIa` (chave única `chamadoId + campo`): uma linha `campo: 'tecnico'`, `decididoPor: 'regra'`, `efeito: 'aplicado'`, `confianca: null`. `gravarDecisao` já grava `confianca`, `modelo`, `promptVersion`, `task` e `llmCallId` como nulos quando não é a IA.
- `ChamadoHistory`: `action: 'atribuicao_tecnico'` com `actorType: 'sistema'`, que o schema já aceita sem `userId`.

**State transitions**:

- `validado` (nasce pela IA) → `em atendimento` (atribuído por `sistema`). Sem candidato, ou com o passo desligado, o chamado fica `validado` como hoje.
- Dentro do passo existe uma volta interna, `em atendimento` → `validado`, quando a conferência de carga reprova (AC-8). Ela acontece antes de qualquer histórico, decisão ou aviso, então nenhum aviso sai por ela. Por alguns milissegundos a lista da gestão e `chamados-atribuidos` podem mostrar o chamado `em atendimento` antes do desfazer (ver Consequences).
- Ordem do passo: (1) ler a configuração: falha ao ler, ou chave desligada, encerra sem gravar nada (`nao_tentada`); (2) listar candidatos, carga e última atribuição numa agregação, e sem candidato gravar `sem_tecnico`; (3) para cada candidato em ordem, até 3: atribuir com condição atômica (condição perdida encerra com `nao_tentada`), contar a carga de novo incluindo o próprio chamado e, se passou do limite, desfazer com update condicional e seguir ao próximo; uma exceção nesse ponto dispara uma única tentativa condicional de desfazer que grava `sem_tecnico` com `erro`; (4) confirmado, gravar histórico e decisão e avisar técnico e solicitante; (5) devolver o resultado a `confirmarAbertura`, que grava a frase do chat e avisa os gestores.

**API surface**:

| Ação / Rota                                                                  | Método                             | Entradas principais                                                 | Saídas principais                                                                                                                                                                                                    | Auth                                                                                           | Erros principais                         |
| ---------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `tentarAtribuicaoAutomatica` (`lib/chamados/atribuicao-automatica.ts`, nova) | função de servidor (`server-only`) | `chamadoId`, `solicitanteId`, `subtypeId`, `titulo`, `ticketNumber` | `{ resultado: 'atribuido', tecnicoId, tecnicoNome }`, `{ resultado: 'sem_tecnico', motivo }` ou `{ resultado: 'nao_tentada' }` (chave desligada, corrida perdida para um gestor, ou falha antes de conhecer a chave) | nenhuma exposta ao cliente; só `confirmarAbertura` chama, já autenticada como dona da conversa | nunca lança                              |
| `notificarAtribuicao` (`lib/chamados/notificar-atribuicao.ts`, extraída)     | função de servidor                 | chamado, técnico, `assignedBy`                                      | nada; grava `Notification`, email e eventos                                                                                                                                                                          | interna                                                                                        | falha nos avisos não desfaz a atribuição |
| `confirmarAbertura` (`lib/assistente`, existe)                               | função de servidor                 | as de sempre                                                        | as de sempre; a frase final e o aviso aos gestores variam pelo resultado                                                                                                                                             | dono da conversa (`Viewer`)                                                                    | nenhum erro novo                         |
| `notificarNovoChamado` (existe)                                              | função de servidor                 | + `atribuicao?: { resultado, tecnicoNome?, motivo? }`               | texto de `ticket:new` por resultado                                                                                                                                                                                  | interna                                                                                        | igual ao de hoje                         |
| `salvarIaAutonomiaConfigAction` (existe)                                     | Server Action                      | + `atribuicaoAutomaticaAtiva: boolean`                              | `{ ok: true }` ou `{ ok: false, error }`                                                                                                                                                                             | `requireAdmin()`                                                                               | `dados_invalidos` (Zod)                  |
| `GET /api/gestao/chamados` (existe)                                          | GET                                | os de sempre                                                        | + `atribuicaoAutomatica` em cada chamado, com o nome do técnico escolhido resolvido pelo `tecnicoId`                                                                                                                 | `requireManager()`                                                                             | os de sempre                             |

**Value sourcing** (todo valor que o passo produz, calcula ou mostra, com a origem):

| Ação              | Valor produzido / mostrado                          | Origem                                                                                                                                                                                                  |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| passo automático  | `subtypeId` que filtra os técnicos                  | `servico.subtypeId`, já lido por `lerServicoAtivo` em `confirmarAbertura` (o mesmo gravado em `Chamado.subtypeId`)                                                                                      |
| passo automático  | candidatos                                          | `UserModel`: `role: 'Técnico'`, `isActive: true`, `specialties` contendo o `subtypeId`, `_id` diferente do solicitante                                                                                  |
| passo automático  | nome do técnico escolhido                           | o próprio documento do candidato, já lido na listagem; nome vazio vira "um técnico" em histórico, chat e `ticket:new`. O email não é entrada: `sendNotificationEmail` o resolve pelo id, como na manual |
| passo automático  | carga de cada técnico                               | agregação em `ChamadoModel` por `assignedToUserId`, com `status` em `CHAMADO_STATUS_CARGA_TECNICO` (constante nova, `['validado', 'em atendimento']`)                                                   |
| passo automático  | limite de cada técnico                              | `User.maxAssignedTickets ?? 5`                                                                                                                                                                          |
| passo automático  | "há mais tempo sem receber"                         | mesma agregação: maior valor entre `assignedAt` e `reassignedAt` dos chamados atualmente atribuídos ao técnico, em qualquer status; nulo vem primeiro                                                   |
| passo automático  | instante da atribuição                              | um único `now`, criado no início do passo                                                                                                                                                               |
| passo automático  | `sla.responseBreachedAt`                            | `evaluateResponseBreach(now, sla.responseDueAt, null)`, com `responseDueAt` lido do chamado recém criado (snapshot da 0007)                                                                             |
| passo automático  | interruptor                                         | `lerConfig()` (`lib/ia-confianca/config.ts`), campos `autonomiaAtiva` e `atribuicaoAutomaticaAtiva`, lida pelo próprio passo (segunda leitura, barata, sem mudar o portão da 0007)                      |
| passo automático  | `assignedBy` do aviso ao técnico e ao solicitante   | constante `ATRIBUIDO_POR_SISTEMA = { id: 'sistema', name: 'Atribuição automática' }` em `shared/socket.ts`                                                                                              |
| decisão `tecnico` | valor e rótulo                                      | `{ tecnicoId }` do escolhido; o rótulo (nome) sai de `resolverValorNoBanco`, que já existe                                                                                                              |
| decisão `tecnico` | motivo em uma frase                                 | `montarMotivoTecnico` (puro): número de candidatos, carga e limite do escolhido e se houve empate; sempre com até 200 caracteres                                                                        |
| histórico         | texto "Atribuído automaticamente a Fulano"          | nome do técnico escolhido; nenhum id, motivo ou carga                                                                                                                                                   |
| chat              | frase final do chamado                              | resultado do passo (`tecnicoNome` quando atribuído) passado a `fraseDeChamadoAberto`; `nao_tentada` usa a frase da 0007                                                                                 |
| gestores          | texto de `ticket:new` e do email                    | resultado do passo; o motivo em português vem de `ATRIBUICAO_MOTIVO_LABELS[motivo]` (`shared/chamados/atribuicao-automatica.constants.ts`, valores em AC-13)                                            |
| técnico           | texto do aviso ao vivo e do email                   | `assignedBy.id === ATRIBUIDO_POR_SISTEMA.id` escolhe a variante "atribuído a você automaticamente" (AC-11)                                                                                              |
| gestão (detalhe)  | resultado, motivo, data e nome do técnico escolhido | `Chamado.atribuicaoAutomatica`, projetado por `GET /api/gestao/chamados`; o nome é resolvido por `atribuicaoAutomatica.tecnicoId`, nunca por `assignedToUserId`                                         |
| gestão (lista)    | selo "Sem técnico automático"                       | `atribuicaoAutomatica.resultado === 'sem_tecnico'` e ausência de `assignedToUserId`                                                                                                                     |

**Key invariants**:

- O passo roda uma única vez, na confirmação, e nunca é reavaliado. Mudar o interruptor depois não afeta chamados já criados, e não há nova tentativa.
- Só o caminho `validado` pelo chat chama o passo (`statusChamado === 'validado'` e `!jaExistia`). Nenhuma rota, Server Action nem tela chama `tentarAtribuicaoAutomatica`.
- O passo nunca lança e nunca impede a abertura. As falhas seguem a regra por momento do AC-4: `nao_tentada` antes de a chave ser conhecida, `sem_tecnico` com `erro` depois.
- A atribuição usa a mesma condição atômica da manual: `findOneAndUpdate` com `status: 'validado'` e sem técnico. Sem documento devolvido, o chamado já foi tomado por um gestor: `nao_tentada`, sem sobrescrever.
- Nada externo sai antes da conferência de carga passar: nem histórico, nem decisão, nem `Notification`, nem email, nem evento. Depois de passar, o passo aguarda histórico, `DecisaoIa`, `Notification` e `emitToRoom`, e dispara o email sem aguardar (como a atribuição manual faz). Cada efeito tem seu próprio `try` e log, e a falha de um não desfaz a atribuição nem impede os outros. Um chamado que ficou atribuído sem histórico é achado pela consulta do `## Follow-up`.
- `atribuicaoAutomatica` com `atribuido` é gravado no mesmo `$set` da atribuição e apagado no mesmo `$unset` do desfazer. Não existe estado em que ele contradiga `assignedToUserId`, exceto depois de uma reatribuição do Preposto, e aí o `tecnicoId` guardado é de propósito o da escolha original.
- `assignedByUserId` nunca é preenchido pelo passo automático.
- A carga é sempre contada com `CHAMADO_STATUS_CARGA_TECNICO`, o mesmo conjunto das telas manuais. O limite é `maxAssignedTickets ?? 5`. Na seleção vale carga menor que o limite; na conferência depois de gravar, a contagem inclui o próprio chamado e reprova se ficar maior que o limite.
- Máximo de 3 candidatos tentados por chamado (`ATRIBUICAO_TENTATIVAS_MAX`). Esgotados, é `sem_vaga`.
- A `DecisaoIa` do técnico é gravada uma vez, só depois de a atribuição valer, e `efeito` nunca muda. A reatribuição do Preposto a corrige pelo `aplicarVeredito` que já existe.
- O texto de histórico da atribuição automática nunca leva id, motivo ou carga: a linha do tempo de `/conversas` mostra as observações do histórico a todos os perfis, inclusive o solicitante.
- `atribuicaoAutomatica` e seu motivo só saem em endpoints de gestão (`requireManager`). Os `select` explícitos de `/api/meus-chamados`, das leituras de `/conversas` e de `chamados-atribuidos` não incluem o campo, e um teste garante isso.
- `medirCalibragem` (0006) não muda: seus filtros (`campo` diferente de `tecnico`, `decididoPor: 'ia'`, `efeito: 'sugestao'`) já deixam a nova decisão de fora, e um teste garante.
- `atribuicaoAutomaticaAtiva` não depende de `PROMPT_VERSION`; só `autonomiaAtiva` depende dela.
- Para o teste de concorrência ser determinístico, o passo aceita um gancho opcional chamado entre gravar e recontar (`aposGravar`), usado só em teste e nunca passado em produção.

**Security model**:

- O passo roda dentro de `confirmarAbertura`, já autenticada como a dona da conversa, mas grava como sistema. Por isso o módulo é `server-only` e nunca é exposto como Server Action ou rota: nenhuma entrada dele vem do navegador.
- Só o Admin liga ou desliga o passo (`requireAdmin()`, na action que já existe).
- Preposto e Admin leem o resultado, o motivo e a decisão do técnico. Solicitante e técnico nunca recebem `atribuicaoAutomatica` nem o motivo (AC-16). O nome do técnico já chega ao solicitante hoje pelo aviso de atribuição.
- Nenhum dado pessoal novo. Os logs `[atribuicao]` levam só ids, resultado e duração.

**Configuration required**:

Nenhuma variável de ambiente nova. O Admin liga `atribuicaoAutomaticaAtiva` na tela de calibração depois do deploy. Como nasce `false`, o deploy é inerte até esse passo manual.

**Critical test scenarios** (cada um mapeia para um critério de aceitação em `## Requirements`):

- Caminho feliz: cartão em modo IA, as duas chaves ligadas, três técnicos com cargas 2, 1 e 3, limite 5 → o de carga 1 recebe; chamado `em atendimento`, histórico, `DecisaoIa` e notificações do técnico, do solicitante e dos gestores. Verifica **AC-1**, **AC-9**, **AC-10**, **AC-11**, **AC-13**, **AC-14**.
- Critério: empate de carga entre dois técnicos → vence quem está há mais tempo sem receber; técnico que nunca recebeu vence; o solicitante técnico nunca é escolhido; `maxAssignedTickets: 0` nunca recebe. Verifica **AC-2**.
- Sem candidato: sem técnico com a especialidade, e todos no limite → `sem_tecnico` com o motivo certo, chamado `validado`, texto dos gestores e do chat corretos. Verifica **AC-3**, **AC-12**, **AC-13**.
- Falha: `lerConfig` lançando → `nao_tentada` sem gravar nada; agregação lançando → `sem_tecnico` com `erro`; exceção depois de gravar a atribuição → desfazer condicional único, e se ele falhar, log com `estado: 'orfao'`. O chamado sempre abre `validado`, sem erro ao solicitante. Verifica **AC-4**, **AC-17**.
- Interruptor: desligado, ou `autonomiaAtiva` desligada → nada muda em relação à 0007, `atribuicaoAutomatica` fica ausente e não há linha de log; chamado do formulário, classificação manual e chamado `aberto` nunca entram; `nao_tentada` usa a frase e o texto de gestores da 0007. Verifica **AC-5**, **AC-6**, **AC-12**, **AC-13**, **AC-17**.
- Idempotência e corrida: confirmação repetida não atribui, não avisa nem grava frase de novo; atribuição manual simultânea de um gestor nunca deixa dois técnicos nem sobrescreve, e o passo termina com `nao_tentada`. Verifica **AC-7**.
- Concorrência de carga: com o gancho `aposGravar`, dois chamados gravados para o único técnico com carga limite menos 1 → o segundo, ao recontar, vê carga maior que o limite, desfaz (limpando também `assignedAt` e `sla.responseBreachedAt`), tenta o próximo ou termina em `sem_vaga`, e nenhum aviso sai de uma atribuição desfeita; um desfazer que não acha o documento termina em `nao_tentada`. Verifica **AC-8**.
- Visibilidade: a decisão `tecnico` aparece para Preposto e Admin e não para solicitante e técnico; `atribuicaoAutomatica` não aparece em `/api/meus-chamados`, na leitura de `/conversas`, em `chamados-atribuidos` nem no histórico. Verifica **AC-9**, **AC-10**, **AC-16**.
- Correção pela reatribuição: trocar o técnico marca a `DecisaoIa` `regra` como corrigida e grava `correcao_ia`; sem `DecisaoIa`, a reatribuição segue como hoje. Verifica **AC-9**.
- Tela da gestão: o detalhe mostra o técnico escolhido pela regra mesmo depois de uma reatribuição; a lista mostra o selo com texto nos `sem_tecnico` e o some quando o Preposto atribui à mão. Verifica **AC-15**.
- Log: uma linha `[atribuicao]` por execução com a chave ligada, sem texto de relato. Verifica **AC-17**.
- Regressão: `assignTicketAction`, `reassignTicketAction` e a calibração passam sem mudar asserções; a notificação extraída gera o payload de antes. Verifica **AC-9**, **AC-18**.
- Correção de prioridade: chamado atribuído sozinho recusa `updateTicketPriorityAction` com a mensagem de hoje, e a reatribuição continua funcionando. Verifica **AC-19**.

## Build plan

Ordem por **Tracer Bullet** (padrão do projeto): o marco 1 leva o caminho feliz de ponta a ponta, do interruptor ao técnico notificado; o marco 2 engrossa com falhas, concorrência e idempotência; o marco 3 mostra o resultado a gestores, técnico e solicitante; o marco 4 fecha regressão e limitações.

**Marco 1: fio fino do caminho feliz, ponta a ponta**

1. [x] Constantes compartilhadas: `CHAMADO_STATUS_CARGA_TECNICO` (`shared/chamados/chamado.constants.ts`), `ATRIBUICAO_RESULTADOS`, `ATRIBUICAO_MOTIVOS` e `ATRIBUICAO_MOTIVO_LABELS` (`shared/chamados/atribuicao-automatica.constants.ts`, com os três rótulos do AC-13) e `ATRIBUIDO_POR_SISTEMA` (`shared/socket.ts`). Satisfaz **AC-2**, **AC-11**, **AC-13**.
2. [x] Interruptor: campo `atribuicaoAutomaticaAtiva` em `models/IaAutonomiaConfig.ts` (padrão `false`), lido e gravado por `lerConfig`/`salvarConfig`, aceito por `salvarIaAutonomiaConfigSchema`, com o controle no `IaConfiancaForm` e uma nota de que só vale com a autonomia ligada. Satisfaz **AC-5**.
3. [x] `Chamado.atribuicaoAutomatica` no model (subdocumento opcional sem `_id`: `resultado`, `motivo`, `tecnicoId`, `em`, com enums de `resultado` e `motivo`). Satisfaz **AC-3**, **AC-15**.
4. [x] Extrair `notificarAtribuicao` de `assignTicketAction` (`Notification`, email sem aguardar e os dois `emitToRoom`) para `lib/chamados/notificar-atribuicao.ts`, com a mesma saída, e fazer a atribuição manual usar essa função. Satisfaz **AC-11**, **AC-18**.
5. [x] `lib/chamados/atribuicao-criterio.ts`, puro: ordena candidatos (menor carga, depois menor "última atribuição", nulo primeiro, depois `_id`) e monta o motivo da decisão em até 200 caracteres. Satisfaz **AC-2**, **AC-9**.
6. [x] `lib/chamados/atribuicao-automatica.ts`, `tentarAtribuicaoAutomatica` no caminho feliz: lê a configuração, monta candidatos (com nome), carga e última atribuição numa agregação, atribui com a condição atômica (gravando `assignedAt`, `sla.responseStartedAt`, `responseBreachedAt` e `atribuicaoAutomatica` com `tecnicoId`), grava o histórico `atribuicao_tecnico` (`sistema`) e a `DecisaoIa` (`registrarDecisao`, sem entrada `decisao_ia`), e chama `notificarAtribuicao`. Satisfaz **AC-1**, **AC-2**, **AC-5**, **AC-9**, **AC-10**, **AC-11**, **AC-14**.
7. [x] `confirmarAbertura` chama o passo só quando o chamado nasceu `validado` e `!jaExistia`, e `fraseDeChamadoAberto` ganha as variantes "atribuído" e "sem técnico" (`nao_tentada` e desligado usam a frase da 0007). Satisfaz **AC-1**, **AC-6**, **AC-7**, **AC-12**.
8. [x] Teste contra Mongo em container: caminho feliz completo, interruptor desligado, chamado do formulário e chamado `aberto` fora do passo, e o critério com empate. Satisfaz **AC-1**, **AC-2**, **AC-5**, **AC-6**, **AC-9**, **AC-10**, **AC-14**.

**Marco 2: falhas, concorrência e idempotência**

9. [x] Sem candidato e erro: grava `atribuicaoAutomatica` em `sem_tecnico` com `sem_especialidade`, `sem_vaga` ou `erro`; falha ao ler a configuração devolve `nao_tentada` sem gravar; nunca lança e deixa o chamado `validado`. Satisfaz **AC-3**, **AC-4**.
10. [x] Conferência de carga depois de gravar: conta de novo incluindo o próprio chamado e, se ficou maior que o limite, desfaz com update condicional (filtro do AC-8; `$unset` de técnico, `assignedAt`, `sla.responseStartedAt`, `sla.responseBreachedAt` e `atribuicaoAutomatica`) e tenta o próximo, até `ATRIBUICAO_TENTATIVAS_MAX`. Exceção nesse ponto dispara um único desfazer que grava `sem_tecnico` com `erro`, ou o log `estado: 'orfao'`. Inclui o gancho `aposGravar` para teste. Nada externo sai antes. Satisfaz **AC-4**, **AC-8**.
11. [x] Idempotência e corrida com a atribuição manual: `jaExistia` nunca atribui; condição atômica perdida, ou desfazer que não acha o documento, vira `nao_tentada` sem sobrescrever. Satisfaz **AC-7**, **AC-8**.
12. [x] Linha de log `[atribuicao]` por execução com a chave ligada. Satisfaz **AC-17**.
13. [x] Testes contra Mongo em container: sem especialidade, todos no limite, falhas simuladas em cada momento (antes da configuração, na agregação, depois de gravar), duas gravações para o técnico com carga limite menos 1 usando o gancho `aposGravar`, e corrida com `assignTicketAction`. Satisfaz **AC-3**, **AC-4**, **AC-7**, **AC-8**, **AC-17**.

**Marco 3: gestores, técnico e solicitante veem o resultado**

14. [x] `notificarNovoChamado` recebe `atribuicao` e varia título, corpo e email de `ticket:new` pelo resultado, trocando o "falta atribuir um técnico"; `nao_tentada` e desligado mantêm o texto da 0007. Satisfaz **AC-13**.
15. [x] Aviso do técnico: o toast do `RealtimeProvider` ("Chamado #N atribuído a você automaticamente") e o email de `ticket:assigned` usam a variante automática quando `assignedBy.id === 'sistema'`. Satisfaz **AC-11**.
16. [x] Gestão: `GET /api/gestao/chamados` projeta `atribuicaoAutomatica` e resolve o nome pelo `tecnicoId`; o `ChamadoDetailSheet` mostra o resultado; a lista mostra o selo com texto "Sem técnico automático" ao lado de `SeloValidadoIa`, só sem `assignedToUserId`. Satisfaz **AC-15**.
17. [x] Testes: textos de notificação e de chat por resultado (inclusive `nao_tentada`), projeções de gestão (nome da escolha original depois de reatribuição, selo que some), e o teste de vazamento de `atribuicaoAutomatica` em `/api/meus-chamados`, na leitura de `/conversas`, em `chamados-atribuidos` e no histórico. Satisfaz **AC-12**, **AC-13**, **AC-15**, **AC-16**.

**Marco 4: regressão e limitações**

18. [x] Regressão: os testes de `assignTicketAction` e `reassignTicketAction` passam sem mudar asserções; `medirCalibragem` nunca conta a decisão `regra`; a reatribuição de um chamado atribuído sozinho marca a `DecisaoIa` `regra` como corrigida e grava `correcao_ia`; `updateTicketPriorityAction` recusa um chamado atribuído sozinho com a mensagem clara. Satisfaz **AC-9**, **AC-18**, **AC-19**.

## Consequences

**Positive**:

- O chamado validado pela IA chega ao técnico sem esperar o Preposto, e o fluxo do chat fecha de ponta a ponta: relato, chamado, prioridade, prazo e técnico.
- Reaproveita a `DecisaoIa` de `tecnico`, a reatribuição, o `ticket:assigned` e a notificação da 0005, sem coleção nova. A fatia 18 ganha os dados de "caiu na triagem manual" e de "escolha corrigida".
- Interruptor próprio, desligado por padrão: o deploy é inerte e o Admin desliga só a atribuição se os técnicos reclamarem, mantendo a prioridade automática.
- O desempate por "há mais tempo sem receber" divide o trabalho entre os técnicos de mesma carga, o que o `findBestTechnician` atual não faz (ele desempata pela ordem do banco).

**Negative / tradeoffs**:

- O SLA de resposta fica quase instantâneo nesses chamados, porque a atribuição conta como resposta (AC-14). O indicador de resposta do IMR sobe por construção, não por desempenho. Precisa do aval do fiscal do contrato antes de ligar o interruptor.
- A janela de correção de prioridade da 0007 (chamado `validado` sem técnico) deixa de existir para esses chamados. O Preposto só troca o técnico, não a prioridade, até a fatia 17 (AC-19).
- Sem nova tentativa, um chamado sem técnico espera o Preposto mesmo que um técnico libere vaga logo depois.
- A carga só conta `validado` e `em atendimento`, como nas telas manuais. Um técnico com muitos chamados pausados por terceiros ou pelo solicitante recebe mais.
- O critério "há mais tempo sem receber" só olha os chamados que ainda estão com o técnico: quem perdeu um chamado recente por reatribuição parece ocioso e ganha a vez. É aceito.
- O caminho da confirmação ganha de 5 a 8 idas ao banco, sem chamar o modelo. A conferência depois de gravar deixa uma janela de milissegundos em que a lista da gestão e `chamados-atribuidos` podem mostrar o chamado `em atendimento` antes do desfazer. Se dois pedidos desfazem juntos, o chamado vai ao Preposto (falha segura, sem transação num Mongo standalone).
- Sem transação, existe um estado órfão conhecido: uma exceção depois de gravar a atribuição, em que nem o desfazer funciona, deixa o chamado atribuído sem aviso ou sem histórico. É raro, registrado em log e achado pela consulta do `## Follow-up`.
- O chat pode mostrar o nome do técnico duas vezes (a entrada `atribuicao_tecnico` na linha do tempo e a frase final), além do aviso ao vivo, como a 0007 já faz com a prioridade. Conferir no `/check verify` que nada contradiz nada.
- A atribuição manual continua com a corrida documentada (estouro raro de 1) e o desempate arbitrário do `findBestTechnician`. Isto não é corrigido aqui.
- A agregação da "última atribuição" varre os chamados de cada candidato em qualquer status. Com o volume atual é barata (o índice `assignedToUserId + status` cobre o filtro), mas cresce com o histórico.

**Neutral**:

- Sem migração de dados: os dois campos novos são opcionais, e ausente vale "desligado" ou "não tentado". Um documento de configuração antigo é lido com `atribuicaoAutomaticaAtiva: false`.
- Uma constante nova, `CHAMADO_STATUS_CARGA_TECNICO`, vale só para o código novo. As cópias à mão de `ACTIVE_STATUSES` seguem como estão (ver `## Follow-up`).
- A entrada `decisao_ia` do técnico não é gravada no histórico, diferente das decisões de serviço e prioridade: a decisão é uma regra, e a entrada `atribuicao_tecnico` já conta o fato.

## Follow-up

- [ ] Antes de ligar o interruptor: confirmar com o fiscal do contrato que a atribuição automática conta como início da resposta no IMR (AC-14). Se não contar, reabrir esta spec para a opção de marcar a resposta só na primeira ação do técnico.
- [ ] Depois do deploy, o Admin liga `atribuicaoAutomaticaAtiva` à mão em `/configuracoes/ia-confianca`, com `autonomiaAtiva` já ligada. Sem isso a fatia fica pronta e inativa.
- [ ] Só ligar o interruptor quando a ausência de correção de prioridade depois da atribuição (AC-19) for aceitável para o Preposto, ou depois de a fatia 17 existir.
- [ ] Documentar, na construção, a consulta que acha chamados órfãos: `atribuicaoAutomatica.resultado: 'atribuido'` sem entrada de histórico `atribuicao_tecnico` com `actorType: 'sistema'`.
- [ ] No `/check verify`, conferir na conversa do solicitante que o nome do técnico aparece sem contradição entre a linha do tempo, a frase final e o aviso ao vivo.
- [ ] A fatia 17 (revisão pelo Preposto) deve assumir a correção de prioridade depois da atribuição e considerar um filtro "atribuído pela regra".
- [ ] A fatia 18 (painel de acurácia) pode contar `atribuicaoAutomatica.resultado` (quantos caíram em `sem_tecnico`, por motivo) e a taxa de correção da `DecisaoIa` de `tecnico`. Considerar que a escolha por regra não tem confiança, então não entra na curva de calibração.
- [ ] Unificar `findBestTechnician` e as duas rotas `eligible-technicians` com o critério novo (inclusive o desempate justo), e trocar as cópias à mão de `ACTIVE_STATUSES` por `CHAMADO_STATUS_CARGA_TECNICO`.
- [ ] Se sobrarem chamados `sem_tecnico` com vaga liberada pouco depois, reavaliar uma nova tentativa (ao concluir ou encerrar um chamado, ou pelo cron que já roda a cada 30 minutos).
- [ ] Se o histórico crescer, mover "última atribuição" para um campo denormalizado no `User`.
- [ ] Quando a fatia for construída, sincronizar `app/(dashboard)/gestao/AGENTS.md`, `lib/assistente/AGENTS.md` e `lib/ia-confianca/AGENTS.md` com o passo automático e o novo interruptor (via `/sync`).
- [ ] Nas primeiras semanas depois de ligar o interruptor, acompanhar o volume de `sem_tecnico` por motivo (sobretudo `sem_vaga`) com a linha de log `[atribuicao]`, e avaliar um teto por solicitante. A triagem humana que ficava entre o solicitante e a fila do técnico deixa de existir para esses chamados, e o limite por usuário da IA freia turnos de conversa, não chamados confirmados: um solicitante pode encher o limite de todos os técnicos de uma especialidade (achado da revisão de 2026-09-25).
