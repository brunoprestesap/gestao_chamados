# 0010. Prazo para avaliar e encerramento definitivo do chamado

**Date**: 2026-10-01
**Status**: In Progress

## Summary

Quando o técnico conclui o serviço, o solicitante passa a ter um prazo (48 horas corridas por padrão, configurável pelo Admin) para avaliar ou recusar. Se avaliar, o chamado encerra na hora. Se o prazo vencer, o Sigma encerra sozinho, avaliado ou não. Encerrado é definitivo: ninguém reabre, nem o Admin. Se o problema voltar, o solicitante usa "O problema voltou", que abre um chamado novo ligado ao anterior. Assim o prazo e o tempo de atendimento do IMR (índice de medição de resultados do contrato) contam do zero, e a recorrência continua rastreável.

## Requirements

**User stories**:

- Como solicitante, quero um prazo claro para conferir o serviço, avaliar ou recusar, para saber até quando posso reclamar daquele atendimento.
- Como solicitante, quero registrar que o problema voltou num chamado novo já ligado ao anterior, sem precisar descrever tudo de novo.
- Como Preposto, quero que o chamado concluído encerre sozinho, sem eu precisar encerrar um por um.
- Como Preposto ou Admin, quero ainda reabrir um chamado concluído dentro do prazo quando o técnico concluiu errado.
- Como gestão do contrato, quero que um problema que volta semanas depois conte como chamado novo, para o tempo de atendimento e o SLA (acordo de prazo) não somarem o intervalo em que o serviço estava resolvido.
- Como Admin, quero ajustar o tamanho do prazo sem deploy.

**Acceptance criteria** (o contrato, cada critério é identificado e verificável de forma independente):

- **AC-1**: Ao registrar a execução (status vai para `concluído`), o chamado grava `prazoAvaliacaoAte = concludedAt + prazoAvaliacaoHoras`, lendo `prazoAvaliacaoHoras` da configuração vigente naquele momento (padrão 48). Mudar a configuração depois não altera o `prazoAvaliacaoAte` de chamados já concluídos.
- **AC-2**: O solicitante dono avalia (nota de 1 a 5 e comentário opcional) um chamado `concluído` com a janela aberta. Na mesma operação atômica, a avaliação é gravada e o chamado vai para `encerrado`, com `closedAt` = agora, `closedByUserId` nulo e `closureNotes` vazio. O filtro atômico mantém a guarda `'evaluation.rating': { $exists: false }`. O histórico ganha só uma entrada `encerramento_por_avaliacao` (autor o solicitante, `statusAnterior: 'concluído'`, `statusNovo: 'encerrado'`, observação `Avaliação: N/5`); a ação antiga `avaliado` continua no enum só para o legado. Avaliar ou recusar um chamado `encerrado` devolve `{ ok: false, error: 'Este chamado já foi encerrado.' }`.
- **AC-3**: O solicitante dono recusa o serviço de um chamado `concluído` com a janela aberta: o chamado volta para `em atendimento` como hoje (limpa `concludedAt`, `sla.resolvedAt`, `closedAt`, `closedByUserId`, `closureNotes`, grava o item em `serviceRefusals`) e também limpa `prazoAvaliacaoAte`. A próxima execução registrada grava um prazo novo (AC-1).
- **AC-4**: Preposto ou Admin reabre, com motivo, só um chamado `concluído` com a janela aberta. Na reabertura, `prazoAvaliacaoAte` é limpo junto dos outros campos de hoje. Um chamado `encerrado` nunca reabre: a ação devolve `{ ok: false, error: 'Chamado encerrado definitivamente. Abra um novo chamado.' }`.
- **AC-5**: "Janela aberta" significa `status === 'concluído'` e (`prazoAvaliacaoAte > agora` ou `prazoAvaliacaoAte` ausente). Com o prazo vencido e o status ainda `concluído` (cron atrasado), avaliar, recusar e reabrir devolvem `{ ok: false, error: 'O prazo para avaliar este chamado terminou.' }`, e as telas escondem os três botões. Precedência das mensagens: em avaliar e recusar, o erro de dono vem primeiro, para quem não é dono nunca descobrir o estado do chamado alheio; depois o status `encerrado` (AC-2 e AC-4), depois o prazo vencido, depois os erros de status que já existem. Reabrir não tem dono (é da gestão) e começa pelo `encerrado`. (Ordem revista em 2026-10-01, pela revisão `docs/reviews/2026-10-01-feat-prazo-avaliacao-encerramento.md`.) O cancelamento continua bloqueado no `concluído`, como hoje (`app/api/chamados/[id]/cancel/route.ts`).
- **AC-6**: `POST /api/cron/encerramento-automatico`, chamado pelo container `cron` a cada 15 minutos com o header `x-cron-secret`, encerra cada chamado `concluído` com `prazoAvaliacaoAte <= agora`: `status: 'encerrado'`, `closedAt = prazoAvaliacaoAte`, `closedByUserId` nulo, sem avaliação, e histórico `encerramento_automatico` com `actorType: 'sistema'` e `userId` nulo. Cada chamado é atualizado com filtro atômico (`status: 'concluído'` e prazo vencido), então rodar duas vezes, ou correr junto de uma avaliação, nunca encerra duas vezes nem sobrescreve a avaliação. Processa do `prazoAvaliacaoAte` mais antigo para o mais novo, no máximo 200 por execução; o que sobrar fica para a próxima. Sem o segredo, ou com `CRON_SECRET` vazio, responde 401, no mesmo formato de `app/api/cron/sla-monitor/route.ts`. A resposta traz `{ encerrados, prazosPreenchidos }`.
- **AC-7**: Na mesma execução, antes de encerrar, o cron preenche `prazoAvaliacaoAte = agora + prazoAvaliacaoHoras` nos chamados `concluído` sem prazo (os que já estavam concluídos no deploy), e conta quantos preencheu em `prazosPreenchidos`.
- **AC-8**: O encerramento manual sai da Gestão: some o botão "Encerrar", o `EncerrarChamadoDialog` e a `closeTicketAction`. Nenhum perfil leva um chamado de `concluído` para `encerrado` sem ser pela avaliação ou pelo cron.
- **AC-9**: Em `registerExecutionAction`, o aviso ao solicitante (Socket.IO, `Notification` e e-mail) passa a ter payload próprio, com `prazoAvaliacaoAte`, e o corpo da `Notification` e do e-mail diz `Avalie ou recuse o serviço até DD/MM às HH:mm`, com a data no fuso do `BusinessCalendar`. O payload e o texto dos gestores não mudam. Se `getBusinessCalendarConfig()` falhar, o prazo usa 48 horas e a execução nunca é bloqueada por isso.
- **AC-9b**: Os dois encerramentos (avaliação e cron) emitem `ticket:closed` só para a sala `user:<solicitanteId>`, com `closedBy` nulo e `motivo: 'avaliacao' | 'automatico'`, para as telas abertas se atualizarem. Não geram `Notification` nem e-mail, e o técnico e os gestores não recebem nada.
- **AC-10**: Nas telas do solicitante (lista e card de `/meus-chamados`, detalhe `/meus-chamados/[id]` e `PainelChamado` em `/conversas`), o chamado `concluído` com a janela aberta mostra "Avaliar" e "Recusar serviço" e a frase `Avalie ou recuse até DD/MM às HH:mm`. O chamado `encerrado` mostra a nota quando avaliado ou "Encerrado sem avaliação" quando não, e nunca mostra avaliar nem recusar. A conta da janela para mostrar os botões usa o `now` do servidor na renderização (ou devolvido pela rota), nunca só a hora do navegador.
- **AC-11**: O solicitante dono de um chamado `encerrado` vê "O problema voltou", sem limite de tempo. O botão abre o formulário de chamado novo já preenchido com tipo de serviço, serviço e subtipo do catálogo, unidade e local do anterior, com título e descrição vazios, e o envio grava `chamadoAnteriorId`. O servidor recusa com `{ ok: false, error: 'Chamado anterior inválido.' }` quando o anterior não existe, não é do mesmo solicitante ou não está `encerrado`. O chamado novo nasce `aberto`, com `createdAt` próprio, e passa pela triagem normal, sem herdar prioridade nem SLA. Se o anterior não tiver algum desses campos (o chat pode abrir sem serviço do catálogo), o campo fica em branco e o formulário o exige como já faz. O vínculo só nasce por esse formulário: nunca pelo chat nem pelo chamado recorrente.
- **AC-12**: O chamado com `chamadoAnteriorId` mostra "Reincidência do chamado #N" com link, no detalhe do solicitante e no detalhe da Gestão. O histórico de criação do novo diz `Reincidência do chamado #N`.
- **AC-13**: Em `/configuracoes/expediente`, só o Admin edita "Prazo para avaliar (horas)", um inteiro de 1 a 720 (padrão 48), validado com Zod no servidor. O valor vale só para as próximas conclusões (AC-1).
- **AC-14**: Os indicadores dos painéis do Preposto e do Admin que contam `status: 'concluído'` (`aguardandoEncerramento` e `concluidosAguardandoEncerramento` em `dashboard/actions.ts`) passam a se chamar "Aguardando avaliação", com a mesma contagem.
- **AC-15**: No painel do solicitante, `avaliacoesPendentes` passa a contar os chamados `concluído` com a janela aberta (não mais os `encerrado` sem nota). `encerradosTotal` e `encerradosAvaliados` não mudam.
- **AC-16**: A dica de recorrência da triagem (`lib/recorrencia.ts`) não lista o chamado que já é o `chamadoAnteriorId` do chamado em triagem, porque ele já aparece como vínculo (AC-12).

## Decision

**Chosen option**: Option 2: o `concluído` vira a janela de avaliação, com prazo gravado no chamado e encerramento pelo sistema.

O prazo nasce na conclusão e fica gravado no chamado (como o snapshot de SLA). A avaliação ou o cron levam o chamado ao `encerrado`, que é definitivo. As ações conferem o prazo gravado, e não só o status, e o problema que volta vira um chamado novo com `chamadoAnteriorId`.

**Implementation skills**: `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

| Entidade           | Campo                 | Tipo                                       | Regra                                                                                   |
| ------------------ | --------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `Chamado`          | `prazoAvaliacaoAte`   | `Date`, opcional, padrão `null`            | Gravado na conclusão; limpo na recusa e na reabertura; nunca muda depois do `encerrado` |
| `Chamado`          | `chamadoAnteriorId`   | `ObjectId` ref `Chamado`, opcional, `null` | Só na criação, pelo "O problema voltou"; imutável; N reincidências para 1 anterior      |
| `BusinessCalendar` | `prazoAvaliacaoHoras` | `Number`, padrão 48, mínimo 1, máximo 720  | Lido por `getBusinessCalendarConfig()`; documento ausente usa 48                        |
| `ChamadoHistory`   | `action` (enum)       | mais dois valores                          | `encerramento_por_avaliacao`, `encerramento_automatico`                                 |

Índices novos em `Chamado`:

- `{ status: 1, prazoAvaliacaoAte: 1 }` com `partialFilterExpression: { status: 'concluído' }` (o cron só varre concluídos).
- `{ chamadoAnteriorId: 1 }` com `partialFilterExpression: { chamadoAnteriorId: { $type: 'objectId' } }` (lista de reincidências, ver Follow-up).

Os campos são opcionais, então não há migração de esquema; os chamados concluídos no deploy recebem o prazo pelo cron (AC-7).

**State transitions**:

```
em atendimento ──execução──▶ concluído (grava prazoAvaliacaoAte)
concluído ──avaliação do solicitante (janela aberta)──▶ encerrado
concluído ──cron, prazo vencido──▶ encerrado (closedAt = prazoAvaliacaoAte)
concluído ──recusa do solicitante (janela aberta)──▶ em atendimento (limpa prazo)
concluído ──reabertura Preposto/Admin (janela aberta)──▶ em atendimento (limpa prazo)
encerrado ──▶ (terminal; "O problema voltou" cria OUTRO chamado aberto)
```

Sai: `concluído ──Encerrar (gestão)──▶ encerrado`, `encerrado ──recusa──▶ em atendimento` e `encerrado ──reabertura──▶ em atendimento`.

**API surface**:

| Superfície                                                                                               | Tipo          | Entradas                                         | Saída                                                                       | Autorização                                          | Erros principais                                             |
| -------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| `registerExecutionAction` (`chamados-atribuidos/actions.ts`, a única ação que põe `concluído`)           | Server Action | as de hoje                                       | as de hoje, e grava `prazoAvaliacaoAte`                                     | como hoje                                            | como hoje                                                    |
| `submitTicketEvaluationAction` (`meus-chamados/actions.ts`)                                              | Server Action | `ticketId`, `rating` 1..5, `comment?`            | `{ ok: true }`                                                              | solicitante dono                                     | não é dono; não está `concluído`; prazo vencido; já avaliado |
| `refuseServiceAction` (`meus-chamados/actions.ts`)                                                       | Server Action | `ticketId`, `reason`                             | `{ ok: true }`                                                              | solicitante dono                                     | não é dono; não está `concluído`; prazo vencido              |
| `reopenTicketAction` (`gestao/actions.ts`)                                                               | Server Action | `ticketId`, `reason` (10 a 2000)                 | `{ ok: true }`                                                              | `requireManager()`                                   | `encerrado` (definitivo); prazo vencido; outro status        |
| `closeTicketAction` (`gestao/actions.ts`)                                                                | removida      |                                                  |                                                                             |                                                      |                                                              |
| `createTicketAction` (`meus-chamados/actions.ts`)                                                        | Server Action | as de hoje, mais `chamadoAnteriorId?` (ObjectId) | as de hoje                                                                  | como hoje; com `chamadoAnteriorId`, dono do anterior | `Chamado anterior inválido.`                                 |
| `POST /api/cron/encerramento-automatico`                                                                 | Route Handler | header `x-cron-secret`                           | `{ encerrados: number, prazosPreenchidos: number }`                         | `CRON_SECRET`                                        | 401 sem segredo; 500 com `console.error`                     |
| `app/api/config/expediente/route.ts` (salva a tela `/configuracoes/expediente`)                          | existente     | mais `prazoAvaliacaoHoras` inteiro 1..720        | como hoje                                                                   | Admin                                                | valor fora da faixa                                          |
| `GET /api/meus-chamados/[id]`, `GET /api/meus-chamados`, a leitura da Gestão e a leitura de `/conversas` | existentes    |                                                  | mais `prazoAvaliacaoAte`, `chamadoAnteriorId` e `ticket_number` do anterior | como hoje                                            | como hoje                                                    |

**Value sourcing**:

| Ação                         | Valor produzido ou exibido             | Origem                                                                                      |
| ---------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| registrar execução           | `prazoAvaliacaoAte`                    | `concludedAt` (o `now` da ação) + `prazoAvaliacaoHoras` de `getBusinessCalendarConfig()`    |
| cron                         | prazo dos concluídos sem prazo         | hora da execução do cron + `prazoAvaliacaoHoras`                                            |
| cron                         | `closedAt` do encerramento automático  | o `prazoAvaliacaoAte` do próprio chamado (data determinística, igual em qualquer atraso)    |
| avaliação                    | `closedAt`                             | `new Date()` da ação                                                                        |
| todas as guardas             | "agora" para comparar com o prazo      | `new Date()` do servidor; nunca a hora do navegador                                         |
| telas do solicitante         | `DD/MM às HH:mm`                       | `prazoAvaliacaoAte` formatado no `timezone` do `BusinessCalendar` (padrão America/Belem)    |
| telas do solicitante         | janela aberta, para mostrar os botões  | derivada de `status` + `prazoAvaliacaoAte` + hora atual (AC-5); a guarda do servidor decide |
| aviso de execução            | texto `Avalie ou recuse até ...`       | `prazoAvaliacaoAte` gravado na mesma ação, no fuso do `BusinessCalendar`                    |
| "O problema voltou"          | tipo, serviço, subtipo, unidade, local | os campos do chamado anterior lidos pela tela de detalhe                                    |
| "Reincidência do chamado #N" | `#N`                                   | `ticket_number` do chamado em `chamadoAnteriorId`, devolvido pela rota de detalhe           |
| painel do Preposto           | "Aguardando avaliação"                 | a contagem `status: 'concluído'` que já existe em `dashboard/actions.ts`                    |

**Key invariants**:

- `encerrado` é terminal. Nenhuma ação tira um chamado de `encerrado`.
- Avaliar, recusar e reabrir conferem a janela no filtro atômico do `findOneAndUpdate` (`status: 'concluído'` e prazo `> agora` ou ausente), nunca num `if` antes da escrita.
- O cron encerra com filtro atômico por chamado (`status: 'concluído'`, `prazoAvaliacaoAte <= agora`); uma avaliação que ganhe a corrida não é sobrescrita.
- `prazoAvaliacaoAte` só é escrito na conclusão ou pelo preenchimento do cron, e só é limpo na recusa e na reabertura.
- Toda transição gera uma entrada no `ChamadoHistory`.
- O IMR não muda: continua filtrando `status: 'encerrado'` por `closedAt` e medindo o tempo por `sla.resolvedAt − createdAt − pausas`. A reincidência é um chamado próprio, com `createdAt` próprio.

**Security model**:

- Avaliar, recusar e "O problema voltou": só o solicitante dono (`solicitanteId` igual ao da sessão), conferido no filtro do servidor.
- Reabrir: Preposto e Admin (`requireManager()`), só dentro da janela.
- Encerrar: nenhum perfil; só o sistema, pela avaliação ou pelo cron.
- Rota do cron: `x-cron-secret` igual a `CRON_SECRET`, recusando tudo se a variável estiver vazia, como as outras rotas de cron. Fica fora do `proxy.ts` (que ignora `/api`).
- Prazo de avaliação: só o Admin edita, na tela de expediente que já é restrita a Admin.
- O `chamadoAnteriorId` não vaza dado de terceiro: o servidor exige que o anterior seja do mesmo solicitante.

**Configuration required**:

- Nenhuma variável nova. A rota usa o `CRON_SECRET` que já existe.
- `docker-compose.yml`, container `cron`: o crontab hoje é gravado por um único `echo ... | crontab -`. Um segundo `echo | crontab -` **apagaria** a linha do `recurring-tickets`. As linhas entram num só bloco (`printf` com uma linha por job, depois `| crontab -`): `recurring-tickets` (`*/30`), `encerramento-automatico` (`*/15`) e, na mesma edição, `sla-monitor` (que existe e hoje não é agendado). Todo `curl` ganha `--max-time 60`.

**Critical test scenarios**:

- Happy path: execução grava o prazo de 48h; o solicitante avalia dentro do prazo e o chamado fica `encerrado` com a nota e a entrada `encerramento_por_avaliacao`, verifica **AC-1**, **AC-2**.
- Snapshot: Admin muda o prazo para 24h depois da conclusão; o chamado concluído mantém o prazo de 48h, e a próxima conclusão usa 24h, verifica **AC-1**, **AC-13**.
- Prazo vencido com cron atrasado: status ainda `concluído`, prazo no passado; avaliar, recusar e reabrir devolvem o erro de prazo, verifica **AC-5**.
- Cron: encerra os vencidos com `closedAt = prazoAvaliacaoAte`, preenche os sem prazo, e uma segunda execução devolve `{ encerrados: 0, prazosPreenchidos: 0 }`, verifica **AC-6**, **AC-7**.
- Corrida: avaliação e cron no mesmo chamado; só um encerra, e se a avaliação venceu a nota está lá, verifica **AC-2**, **AC-6** (teste de banco real, `*.db.test.ts`).
- Encerrado definitivo: Admin tenta reabrir um `encerrado` e recebe o erro de encerrado definitivo, verifica **AC-4**.
- Recusa: recusar limpa o prazo; a nova execução grava outro prazo, verifica **AC-3**.
- Reincidência: outro solicitante tenta criar com `chamadoAnteriorId` alheio e recebe `Chamado anterior inválido.`; o dono cria e o novo mostra o vínculo, verifica **AC-11**, **AC-12**.
- Autorização do cron: sem segredo responde 401, verifica **AC-6**.
- Gestão: o botão "Encerrar" não aparece em nenhum status, verifica **AC-8**.

## Build plan

Ordenado em fatias de Tracer Bullet: a primeira fatia atravessa modelo, ação e tela num só caminho (concluir, avaliar, encerrar), e as seguintes engrossam o fio.

**Fatia 1, o fio: concluir grava o prazo, avaliar encerra**

1. [x] `models/Chamado.ts`: campo `prazoAvaliacaoAte` e o índice parcial `{ status, prazoAvaliacaoAte }`; `models/BusinessCalendar.ts`: `prazoAvaliacaoHoras` (padrão 48, 1 a 720); `lib/expediente-config.ts`: devolve `prazoAvaliacaoHoras` (padrão 48 sem documento); `ChamadoHistory`: os dois novos valores de `action`, satisfies **AC-1**, **AC-2**
2. [x] Função pura em `shared/chamados/` (por exemplo `janela-avaliacao.ts`): `calcularPrazoAvaliacao(concludedAt, horas)` e `janelaAberta(status, prazo, agora)`, com testes unitários, satisfies **AC-1**, **AC-5**
3. [x] `registerExecutionAction` grava `prazoAvaliacaoAte` no mesmo `$set` que põe `concluído`, satisfies **AC-1**
4. [x] `submitTicketEvaluationAction`: filtro passa a `status: 'concluído'` com a janela aberta, e a mesma escrita põe `encerrado` e `closedAt`; histórico `encerramento_por_avaliacao`, satisfies **AC-2**, **AC-5**
5. [x] Detalhe `/meus-chamados/[id]`: avaliar no `concluído` com a janela aberta, mostrando o prazo; "Encerrado sem avaliação" no encerrado; as rotas de leitura devolvem `prazoAvaliacaoAte`, satisfies **AC-10**

**Fatia 2, as travas**

6. [x] `refuseServiceAction`: filtro passa a `concluído` com a janela aberta e limpa `prazoAvaliacaoAte`, satisfies **AC-3**, **AC-5**
7. [x] `reopenTicketAction`: filtro passa a só `concluído` com a janela aberta, limpa `prazoAvaliacaoAte`, e devolve a mensagem de encerrado definitivo; `fromStatus` de `TicketReopenedPayload` e do payload de `ticket:service_refused` (`shared/socket.ts`) fica só `'concluído'`; `ReabrirChamadoDialog`, o menu de `gestao/page.tsx` e o `showReabrir` do `ChamadoDetailSheet` só oferecem reabrir nesse caso, satisfies **AC-4**, **AC-5**
8. [x] Remover `closeTicketAction`, `EncerrarChamadoDialog`, `shared/chamados/close-ticket.schemas.ts` e seus testes, o item "Encerrar" de `gestao/page.tsx`, o `showEncerrar` do `ChamadoDetailSheet` e de `meus-chamados/[id]/page.tsx`, e o `onEncerrar` do `ChamadoCard`. Reescrever os testes de `refuseServiceAction` e de `reopenTicketAction` para o fluxo novo, e os passos 5 e 6 de `e2e/fluxo-completo.spec.ts` para encerrar pela avaliação, satisfies **AC-8**

**Fatia 3, o encerramento pelo sistema**

9. [x] `lib/chamados/encerramento-automatico.ts`: preenche os prazos ausentes, depois encerra os vencidos um a um com filtro atômico, em lotes de até 200 por execução, gravando o histórico `encerramento_automatico` com `actorType: 'sistema'`; devolve as duas contagens. Testes unitários e um `*.db.test.ts` para a corrida, satisfies **AC-6**, **AC-7**
10. [x] `app/api/cron/encerramento-automatico/route.ts` no padrão de `app/api/cron/sla-monitor/route.ts`, e o crontab do container `cron` reescrito num só bloco com os três jobs (ver Configuration required); o E2E chama a rota por request com o header `x-cron-secret`, satisfies **AC-6**
        10b. [x] `ticket:closed` passa a ter `closedBy` nulo possível e o campo `motivo`; a avaliação e o cron emitem só para a sala do solicitante, satisfies **AC-9b**

**Fatia 4, configuração e aviso**

11. [x] Campo "Prazo para avaliar (horas)" em `/configuracoes/expediente`, no schema Zod e no `app/api/config/expediente/route.ts` que já existem, satisfies **AC-13**
12. [x] Em `registerExecutionAction`, separar o payload do solicitante (com `prazoAvaliacaoAte`) do dos gestores; a frase do prazo na `Notification` e no template de e-mail (`lib/email/templates.ts`), formatada por uma função única de data no fuso do `BusinessCalendar`, satisfies **AC-9**

**Fatia 5, recorrência**

13. [x] `chamadoAnteriorId` no modelo (índice parcial), no schema Zod de criação e em `createTicketAction`, com a validação do anterior e a observação no histórico de criação, satisfies **AC-11**, **AC-12**
14. [x] Botão "O problema voltou" no detalhe do solicitante, abrindo o `NewTicketDialog` preenchido; o vínculo "Reincidência do chamado #N" no detalhe do solicitante e no `ChamadoDetailSheet` da Gestão (incluir `chamadoAnteriorId` e o `ticket_number` do anterior na projeção de `GET /api/gestao/chamados` e no teste dela), satisfies **AC-11**, **AC-12**
        14b. [x] `lib/recorrencia.ts` exclui o `chamadoAnteriorId` do chamado em triagem, satisfies **AC-16**

**Fatia 6, as outras telas**

15. [x] Lista (`canShow` de `meus-chamados/page.tsx`) e `ChamadoCard` de `/meus-chamados` e `PainelChamado` de `/conversas` (com `leitura.ts`) passam a usar `janelaAberta` com o `now` do servidor para avaliar e recusar, mostram o prazo e oferecem "O problema voltou", satisfies **AC-10**, **AC-11**
16. [x] Rótulo "Aguardando avaliação" nos dois indicadores de `concluído` dos painéis do Preposto e do Admin, e `avaliacoesPendentes` do solicitante contando `concluído` com a janela aberta, satisfies **AC-14**, **AC-15**

## Consequences

**Positive**:

- O problema que volta vira chamado novo: prazo de SLA e tempo de atendimento do IMR contam do zero, e acaba a distorção relatada.
- A recorrência fica rastreável pelo `chamadoAnteriorId`, em vez de escondida dentro de um chamado reaberto.
- O Preposto deixa de encerrar chamado por chamado.
- O solicitante sabe exatamente até quando pode avaliar ou reclamar.

**Negative / tradeoffs**:

- Um erro de encerramento não tem mais conserto pelo sistema: nem o Admin reabre. A saída é sempre um chamado novo.
- O Preposto perde o encerramento manual e com ele o campo `closureNotes` (observações do encerramento), que deixa de ser preenchido.
- 48 horas corridas podem vencer num fim de semana ou feriado sem o solicitante ver; se isso gerar reclamação, a troca para horas úteis é uma mudança no cálculo do prazo.
- Haverá menos avaliações: hoje o chamado não avaliado fica esperando; agora ele fecha sem nota.
- O encerramento passa a depender do container `cron`. Se ele parar, os chamados ficam em `concluído` com a janela fechada (as guardas seguram), mas não viram `encerrado` e não entram no IMR do período até ele voltar.
- `closedAt` deixa de ser "quando o Preposto encerrou" e passa a ser o fim do prazo ou a hora da avaliação, o que muda em que período do IMR um chamado entra (até 48 horas depois da conclusão). Como o cron grava `closedAt = prazoAvaliacaoAte`, um prazo que vence no último dia do mês e é processado depois da virada (até 15 minutos de atraso) entra no mês anterior, que pode já ter sido apurado. É aceito: a data reflete o fim real da janela, e o deslocamento cabe no intervalo do cron.
- A amostra de avaliações do IMR vai diminuir, porque só avalia quem responde em 48 horas. Vale avisar o gestor do contrato.
- O encerramento automático grava o chamado e depois o histórico, sem transação (o Mongo do projeto é standalone). Se o processo cair entre as duas escritas, sobra um `encerrado` sem a entrada `encerramento_automatico`. É raro e de baixo impacto.

**Neutral**:

- Chamados já `encerrado` no deploy ficam definitivos na hora, inclusive os que ainda podiam ser recusados; os `concluído` ganham 48 horas a partir da primeira execução do cron.
- Os testes e fixtures E2E que encerram pela Gestão precisam ser reescritos.
- Achado paralelo: o container `cron` hoje só chama `recurring-tickets`; o `/api/cron/sla-monitor` não está agendado. Esta spec corrige isso na mesma edição do crontab, então o monitor de breach passa a rodar de verdade a partir deste deploy (pode gerar escalonamentos que antes não saíam).
- Depois do build, o `/sync` precisa atualizar o AGENTS.md raiz (ciclo de vida, `ticket:closed`, cron) e o `app/(dashboard)/gestao/AGENTS.md` (sem encerramento manual).

## Migration plan

**Strategy**: big bang num deploy só, sem feature flag (o fluxo velho e o novo não convivem bem: o botão "Encerrar" e o encerramento automático disputariam o mesmo chamado); o legado é preenchido pelo cron.

**Phases**:

1. Deploy do código com os campos opcionais, as guardas novas e a rota do cron. Os concluídos sem prazo ficam com a janela aberta (prazo ausente conta como aberto, AC-5).
2. A primeira execução do cron (até 15 minutos depois) preenche o prazo dos concluídos com agora + 48h (AC-7). A partir daí o fluxo novo vale para todos.
   **Rollback**: reverter o commit volta o fluxo antigo; os campos novos ficam no banco sem uso. Chamados que o cron encerrou continuam encerrados (o fluxo antigo aceita reabrir se for preciso).
   **Risks**: o container `cron` não ser recriado no deploy e a linha nova não entrar no crontab (conferir com `docker compose up -d --build` e `docker logs` do `cron`).

## Follow-up

- [ ] Indicador para o Admin com a contagem de chamados `concluído` de prazo vencido há mais de 1 hora (sinal de que o cron parou).
- [ ] Mostrar no chamado anterior a lista das suas reincidências (o índice `chamadoAnteriorId` já fica pronto).
- [ ] Indicador de reincidência no IMR ou no painel (quantos chamados nasceram de "O problema voltou" por serviço e unidade).
- [ ] Reavaliar 48 horas corridas contra horas úteis depois de um mês de uso.
- [ ] Cadastrar esta feature no `docs/scope/scope.md` (hoje nenhuma linha cobre).
