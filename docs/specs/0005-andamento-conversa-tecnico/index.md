# 0005. Andamento do chamado na conversa

**Date**: 2026-09-22
**Status**: Accepted

## Summary

Esta decisão faz a tela `/conversas` acompanhar o chamado até o fim, para os quatro perfis, não só na abertura. Hoje o chamado vinculado já aparece em modo leitura, com mensagens, comentários e histórico juntos numa linha do tempo, mas sem caixa de envio e sem atualização ao vivo. A partir daqui, seis mudanças de status (classificação, atribuição, início, pausa por aguardando solicitante, conclusão e encerramento) aparecem sem recarregar a página, qualquer um dos quatro perfis pode escrever ali por uma rota de comentário nova, e a avaliação de 1 a 5 fica acessível na própria tela quando o chamado fecha. A maior parte do encanamento de tempo real e de leitura já existe; o trabalho novo é fechar as pontas que faltam e, para escrever, criar uma rota simples que não existia.

## Requirements

**User stories**:

- Como solicitante, quero ver a classificação, a atribuição, o início do atendimento, uma pausa, a conclusão e o encerramento aparecerem na minha conversa sem recarregar a página, para acompanhar o chamado sem precisar ficar atualizando.
- Como solicitante, quero escrever na mesma conversa depois de o chamado existir e saber que o técnico vê isso como um comentário, para não precisar abrir outra tela.
- Como técnico ou gestor, quero responder pela mesma tela `/conversas/[id]`, com a opção de marcar a resposta como interna, para não alternar entre duas telas diferentes para o mesmo chamado.
- Como solicitante, quero avaliar o atendimento de 1 a 5 direto na conversa quando o chamado fecha, sem precisar ir a Meus Chamados.

**Acceptance criteria** (o contrato, cada critério é identificado e verificável de forma independente):

- **AC-1**: Quando a gestão classifica um chamado aberto, o status muda para validado e, se o solicitante estiver com a conversa aberta, a mudança aparece sem recarregar a página.
- **AC-2**: Quando o chamado é atribuído a um técnico (o que já também marca o início do atendimento), o solicitante recebe o mesmo aviso ao vivo que hoje só vai para o técnico; cada um vê um texto e um link próprios ao papel (o do solicitante aponta para `/conversas/<id do chamado>`).
- **AC-3**: Quando o chamado entra em pausa por aguardando solicitante, a mudança aparece ao vivo na conversa aberta do solicitante; uma pausa por cotação com terceiros, que usa o mesmo evento, não aparece (fica fora desta fatia).
- **AC-4**: A conclusão (execução registrada) e o encerramento continuam aparecendo ao vivo, como já acontece hoje; nenhum dos dois regride.
- **AC-5**: Uma mensagem enviada por qualquer um dos quatro perfis em `/conversas/[id]` de um chamado vinculado vira comentário do chamado e aparece ao vivo para quem mais estiver com a mesma conversa aberta, incluindo um segundo gestor vendo o comentário público de outro gestor.
- **AC-6**: O solicitante pode escrever no chamado vinculado a qualquer momento; nenhum status bloqueia o envio, do mesmo jeito que já funciona hoje em Meus Chamados.
- **AC-7**: O técnico atribuído e a gestão escrevem por `/conversas/[id]` com a mesma permissão que já vale em `/chamados-atribuidos` e `/gestao`, incluindo a escolha entre comentário público e interno.
- **AC-8**: A lateral de `/conversas` mostra, para o técnico, os chamados atribuídos a ele e ainda ativos; para a gestão, os chamados que ainda não foram encerrados nem cancelados; para o solicitante, continua mostrando só os próprios chamados, como hoje.
- **AC-9**: Um chamado aberto pelo formulário tradicional, que nunca tem Conversa vinculada, aceita mensagem pela mesma tela `/conversas/<id do chamado>` desde a primeira vez, sem nunca criar uma Conversa nova; a gravação vai direto para o chamado, pela mesma rota de comentário que os demais casos usam.
- **AC-10**: Quando o chamado está encerrado e ainda não avaliado, o solicitante vê na conversa um botão que abre o mesmo diálogo de avaliação (`AvaliarChamadoDialog`) que já existe em Meus Chamados; depois de avaliar, o botão some e a nota fica visível.
- **AC-11**: Quem não é o solicitante, o técnico atribuído nem a gestão não consegue ler nem escrever no chamado por `/conversas`; a tentativa recebe a mesma resposta de "não encontrada" que já vale hoje, sem revelar que o chamado existe.

## Decision

**Chosen option**: Option 1: Fechar as lacunas do que já existe (emissão, cliente e uma rota de comentário nova)

Estende o mecanismo de tempo real que já existe, em vez de construir um caminho paralelo, abre a mesma tela para os quatro perfis escreverem por uma rota de comentário nova e simples, e endereça um chamado do formulário pelo próprio id, sem inventar um vínculo de Conversa que ele nunca precisou ter. Raciocínio completo e as outras opções consideradas: ver [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

Nenhuma coleção nova e nenhuma função de vínculo tardio. Um chamado aberto pelo formulário nunca ganha uma Conversa: `Chamado.conversaId` continua preenchido só no fluxo de abertura pelo chat, exatamente como hoje. A gravação de comentário passa a aceitar o id do chamado diretamente, sem depender de existir uma Conversa. Dois ajustes pontuais:

- `Chamado` ganha um índice novo, `{ assignedToUserId: 1, updatedAt: -1, _id: -1 }`, para a consulta da lateral do técnico (o índice que já existe, `{ assignedToUserId: 1, status: 1 }`, não serve para paginar por data).
- `criarComentario` passa a emitir sempre para a sala `managers`, independente de quem escreveu e da visibilidade (hoje só emite quando o autor não é da gestão); a leitura (`lerLinhaDoTempo`) já decide quem enxerga comentário interno, então a mudança é segura.

**State transitions**:

As seis mudanças de status que ganham sinal ao vivo, e o que muda em cada uma:

- `aberto` → `validado` (classificação): emissão nova, hoje não existe nenhuma.
- `validado` → `em atendimento` (atribuição, que já também marca o início): emissão já existe, ganha o solicitante como segundo destinatário.
- `em atendimento` → `aguardando_solicitante` (pausa): emissão já existe, falta só o manipulador no cliente; o mesmo evento também dispara numa pausa por cotação com terceiros, que o manipulador ignora (ver Value sourcing).
- `em atendimento` → `concluído` (execução registrada): já emite e já tem manipulador; sem mudança.
- `concluído` → `encerrado` (encerramento): já emite e já tem manipulador; sem mudança.

Recusa na triagem, reabertura, cotação, observação de material e pausa por terceiros ficam fora desta fatia (ver Follow-up).

**API surface**:

| Ação                                                                                                     | Tipo                  | Entradas principais                  | Saídas principais                                              | Auth                              | Erros principais                                       |
| ------------------------------------------------------------------------------------------------------------ | ----------------------- | --------------------------------------- | -------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| `POST /api/conversas/[id]/mensagens` (existente, intocada: continua só do fluxo do assistente com a conversa em rascunho) | Rota, NDJSON             | `texto`                                 | quadros `inicio`/`fim`/`reserva`                                       | sessão                               | 404 (`sem_permissao` sai como `nao_encontrada`)              |
| `POST /api/conversas/chamado/[chamadoId]/comentarios` (rota nova, JSON simples, sem IA)                       | Rota                    | `chamadoId`, `texto`, `visibility`      | comentário gravado (chama `criarComentario` direto)                   | sessão (papel confere)               | 404 (`sem_permissao` sai como `nao_encontrada`)              |
| `classificarChamadoAction` (existente, ganha emissão)                                                         | Server Action            | sem mudança                             | emite `ticket:classified` para a sala do solicitante                  | `requireManager`                     | sem mudança                                                  |
| `assignTicketAction` (existente, ganha um destinatário a mais)                                                | Server Action            | sem mudança                             | emite `ticket:assigned` também para a sala do solicitante              | `requireManager`                     | sem mudança                                                  |
| `criarComentario` (existente, ganha uma emissão fixa para `managers`)                                         | Função interna           | `chamadoId`, `content`, `visibility`    | comentário gravado, notificação e socket já disparados                 | quem chama confere o papel           | "Você não tem permissão para comentar neste chamado."       |
| `submitTicketEvaluationAction` (existente, reaproveitada sem mudança)                                         | Server Action            | `ticketId`, `rating`, `notes`           | avaliação gravada                                                      | sessão (só o solicitante dono)       | já existentes ("Este chamado já foi avaliado.", etc.)        |

**Value sourcing** (todo valor que cada ação produz, calcula ou mostra nomeia de onde vem):

| Ação                                                       | Valor produzido / mostrado                                  | Fonte                                                                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Emissão de `ticket:classified`                                   | sala do solicitante (`user:<id>`)                                    | `doc.solicitanteId`, já carregado em `classificarChamadoAction` (o `findById` traz o documento inteiro)                                            |
| Emissão de `ticket:classified`                                   | `ticketId`, `ticketNumber`, `title`, `classifiedBy`, `finalPriority`, `at` | `doc._id`, `doc.ticket_number`, `doc.titulo`, `session.userId`/nome, `finalPriority` (já são valores da própria action)                             |
| Emissão extra de `ticket:assigned` para o solicitante             | sala do solicitante (`user:<id>`)                                    | `chamado.solicitanteId` / `updateResult.solicitanteId`, já carregado em `assignTicketAction` (sem `.select()`, documento inteiro)                    |
| Link do solicitante no aviso de atribuição                       | URL a abrir                                                          | `/conversas/<ticketId>`; `abrirConversa` já trata um id que não é conversa como chamado (o mesmo fallback que sustenta o AC-9)                      |
| Manipulador do cliente para `ticket:assigned`                     | qual texto e qual link mostrar (técnico ou solicitante)              | `payload.assignedTo.id` comparado ao `userId` recebido como propriedade do layout do dashboard (`app/(dashboard)/layout.tsx`, que já chama `requireSession()` no servidor); sem busca de sessão no cliente |
| Manipulador do cliente para `ticket:paused`                       | mostrar ou ignorar o evento                                          | `payload.reason`; só o motivo de pausa por aguardando solicitante atualiza a conversa, o motivo de pausa por cotação é ignorado                    |
| Botão de avaliação na conversa                                   | mostrar ou não o botão, e o nome do técnico no diálogo                | `chamado.status`, `chamado.evaluation?.rating` e `chamado.assignedToUserId`, os três acrescentados ao `.select()` de `lerChamadoEmLeitura` (hoje seleciona só `ticket_number titulo status createdAt canalAbertura`, sem os dois últimos); `LeituraChamado` ganha `statusChave` (o status cru, no mesmo padrão que `ItemLateral.statusChave` já usa) |
| Fechar o botão de avaliação depois de enviar                     | recarregar a tela                                                    | `submitTicketEvaluationAction` hoje só revalida `/meus-chamados*`; o diálogo, quando aberto pela conversa, chama `router.refresh()` no próprio sucesso |
| Alternador público/interno na caixa de envio                     | quem vê o alternador                                                 | `lerLinhaDoTempo` já calcula `veInterno` (gestão ou técnico atribuído); passa a devolver esse valor como `podeComentarInterno` em `LeituraChamado`, e a tela lê dali em vez de recalcular |
| Lateral do técnico                                                | filtro da consulta                                                   | `{ assignedToUserId: viewer.userId, status: { $in: ['validado', 'em atendimento', 'aguardando_solicitante', 'concluído'] } }`                       |
| Lateral da gestão                                                 | filtro da consulta                                                   | `{ status: { $nin: ['encerrado', 'cancelado'] } }`; a constante de status ativos vive em `shared/chamados/chamado.constants.ts`, para as duas laterais lerem a mesma fonte |

**Key invariants**:

- Uma mensagem de conversa (fluxo do assistente) nunca é gravada como comentário antes de o chamado existir; isso continua sem mudança, exatamente como a spec 0002 já garante.
- Um chamado do formulário nunca ganha `conversaId` fora do fluxo de abertura pelo chat; a rota de comentário nova grava direto no chamado, então não depende de nenhuma Conversa existir.
- Nenhum comentário interno nem sugestão da IA some do filtro que já existe; a tela nova lê pela mesma `lerLinhaDoTempo` que já aplica essas regras.
- Toda emissão nova (classificação, segundo destinatário da atribuição) usa a mesma sala e o mesmo formato de payload que as emissões existentes, para o cliente não precisar de dois jeitos de tratar o mesmo tipo de evento.

**Security model**:

Leitura e escrita seguem exatamente as regras que já existem, agora exercidas por mais gente na mesma tela:

- **Leitura** (`lerLinhaDoTempo`, sem mudança): gestão (Admin/Preposto) lê qualquer chamado; solicitante só o próprio (`solicitanteId`); técnico só quando `assignedToUserId` é ele. Sem nenhuma dessas condições, a resposta é `sem_permissao`, que a rota trata como `nao_encontrada` (não revela que o chamado existe).
- **Escrita** (a rota nova, chamando `criarComentario`): mesmas três condições da leitura. Solicitante puro sempre grava público (`isPureRequester`); técnico atribuído e gestão podem escolher público ou interno.
- **Lateral por perfil**: cada consulta filtra pelo próprio vínculo da pessoa (solicitante: `solicitanteId`; técnico: `assignedToUserId`; gestão: status ainda não encerrado nem cancelado), então ninguém vê, na própria lateral, um chamado de outra pessoa fora do papel que exerce nele.
- Nenhum dado novo de LGPD ou compliance: a mesma regra de visibilidade que já protege comentário interno e sugestão da IA continua valendo.

**Critical test scenarios** (cada um mapeia para um critério de aceitação em ## Requirements):

- Caminho feliz: gestão classifica um chamado aberto pelo chat; o solicitante, com a conversa aberta, vê o status mudar sem recarregar, verifica **AC-1**.
- Caminho feliz: gestão atribui o chamado a um técnico; solicitante e técnico recebem avisos com textos e links próprios, verifica **AC-2**.
- Caminho feliz: técnico escreve em `/conversas/[id]` marcando como público; o comentário aparece ao vivo na conversa aberta do solicitante, verifica **AC-5**, **AC-7**.
- Caminho feliz: um gestor escreve um comentário público; outro gestor com a mesma conversa aberta vê o comentário sem recarregar, verifica **AC-5**.
- Caminho feliz: chamado do formulário recebe a primeira mensagem do solicitante pela conversa; o comentário é gravado direto no chamado, sem nenhuma Conversa sendo criada, verifica **AC-9**.
- Autorização: um técnico não atribuído tenta abrir `/conversas/[id]` de um chamado alheio pela URL; recebe a mesma resposta de "não encontrada" que hoje, verifica **AC-11**.
- Caminho feliz: chamado encerrado e não avaliado mostra o botão de avaliação na conversa; depois de avaliar, o botão some, verifica **AC-10**.
- Caminho feliz: técnico registra a pausa por aguardando solicitante; a conversa aberta do solicitante mostra a pausa sem recarregar; uma pausa por cotação não aparece, verifica **AC-3**.
- Caminho feliz: técnico e gestão abrem `/conversas` e veem, cada um na própria lateral, os chamados atribuídos ou ativos, verifica **AC-8**.

## Build plan

1. [x] Emissão nova de `ticket:classified` (payload em `shared/socket.ts`, evento liberado em `lib/realtime-emit.ts` e na lista de eventos permitidos do socket-server) em `classificarChamadoAction`, e um destinatário a mais (o solicitante) na emissão já existente de `ticket:assigned` em `assignTicketAction`, satisfies **AC-1**, **AC-2**
2. [x] `app/(dashboard)/layout.tsx` passa o `userId` da sessão como propriedade para `RealtimeProvider`; manipuladores novos para `ticket:classified` e `ticket:comment_added` (só atualizam a tela, sem som nem aviso) e `ticket:paused` (só quando o motivo é aguardando solicitante); o manipulador de `ticket:assigned` passa a diferenciar técnico e solicitante pelo `userId` recebido; conferir que os manipuladores existentes de execução registrada e encerramento continuam intactos, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**
3. [x] `criarComentario` passa a emitir sempre para a sala `managers`; `lerLinhaDoTempo` passa a devolver `podeComentarInterno`, satisfies **AC-5**, **AC-7**
4. [x] Rota nova `POST /api/conversas/chamado/[chamadoId]/comentarios`, chamando `criarComentario` com a sessão atual; caixa de envio do solicitante na tela `/conversas/[id]` vinculada, sempre pública, disponível em qualquer status, sem envio otimista (limpa o campo e chama `router.refresh()`), satisfies **AC-5**, **AC-6**, **AC-9**
5. [x] A mesma caixa de envio para técnico atribuído e gestão, com o alternador público/interno lendo `podeComentarInterno`, satisfies **AC-7**
6. [x] Lateral de `/conversas` por perfil: consulta nova para técnico (`assignedToUserId` + status ativo, com o índice novo do chamado) e para gestão (status fora de encerrado/cancelado), lateral do solicitante sem mudança, satisfies **AC-8**
7. [x] Botão de avaliação na conversa: `lerChamadoEmLeitura` passa a selecionar `assignedToUserId` e `evaluation.rating`, `LeituraChamado` ganha `statusChave`; o diálogo (`AvaliarChamadoDialog`) chama `router.refresh()` ao terminar, satisfies **AC-10**
8. [x] Conferência ponta a ponta de leitura e escrita para os quatro perfis, incluindo a tentativa sem permissão, satisfies **AC-11**

## Consequences

**Positive**:

- A conversa passa a ser o lugar único para acompanhar um chamado do início ao fim, para os quatro perfis, não só na abertura.
- Quase todo o encanamento de tempo real e de leitura já existe; o trabalho novo é pequeno e de baixo risco, porque estende um mecanismo já em produção.
- Chamado aberto pelo formulário ganha a mesma experiência sem exigir que a pessoa reabra pelo chat, e sem criar nenhum documento novo: nada de corrida de clique duplo nem de expiração por esquecimento.

**Negative / tradeoffs**:

- Cotação, observação de material, pausa por terceiros, recusa na triagem e reabertura ficam fora da conversa ao vivo nesta fatia; quem depende dessas informações continua nas telas antigas.
- O evento `ticket:assigned` passa a ter dois públicos com textos e links diferentes; o cliente precisa saber quem é "eu" para decidir qual mostrar, o que nenhum outro evento hoje precisa.
- `criarComentario` passa a emitir sempre para `managers`; isso muda o comportamento também em Meus Chamados, Chamados Atribuídos e Gestão, não só na conversa nova. É seguro, porque a leitura já filtra comentário interno por papel, mas é uma mudança de contrato de uma função compartilhada, não local a esta fatia.
- Abrir `/conversas/[id]` para técnico e gestão, além do solicitante, aumenta o tamanho desta fatia além do que a linha do escopo descrevia (ver o Premise note em [rationale.md](rationale.md)).

**Neutral**:

- Nenhuma coleção nova nem migração de dado existente.
- A avaliação continua sendo o mesmo diálogo (`AvaliarChamadoDialog`), só ganha um segundo lugar de onde é aberta.

## Follow-up

- [ ] Cotação, observação de material e pausa por terceiros ficam fora desta fatia; considerar numa fatia futura se a gestão sentir falta.
- [ ] Reatribuição de técnico (`reatribuicao_tecnico`) não emite nenhum evento hoje e não entrou nos seis eventos combinados aqui; se o solicitante precisar saber quando o técnico muda, cobrir numa fatia futura.
- [ ] Recusa na triagem e reabertura já emitem para a sala do solicitante, mas ficaram fora do conjunto combinado nesta fatia (só as seis mudanças de status); considerar incluir junto de uma futura funcionalidade 17 (revisão das decisões da IA), que já mexe em recusa e correção.
- [ ] O desenho pixel a pixel do alternador público/interno dentro da caixa de envio da conversa (visualmente diferente da caixa do solicitante, ou só um controle a mais) fica para `/develop` decidir.
- [ ] Se o volume de comentário público crescer muito, considerar aumentar o agrupamento de 800 milissegundos (`AGRUPAR_MS` em `ConversasShell.tsx`) para os eventos silenciosos (`ticket:classified`, `ticket:comment_added`), hoje pensado para um conjunto menor de eventos.

## Rationale

Raciocínio completo e opções consideradas: ver [rationale.md](rationale.md).
