# 0010. Prazo para avaliar e encerramento definitivo: decisão

## Context

Um stakeholder relatou um caso real: o serviço foi resolvido, o problema voltou uns 15 dias depois e o mesmo chamado foi reaberto. Quando veio a reclamação, a medição partiu da primeira data de atendimento, como se o chamado tivesse ficado aberto o tempo todo. No e-SOSTI, sistema que o tribunal já conhece, o chamado finalizado tem um prazo curto para avaliar e depois fecha sem volta; o problema que se repete vira chamado novo.

No Sigma de hoje, o técnico registra a execução e o chamado vai para `concluído`. O Preposto encerra à mão (`closeTicketAction`) e o chamado vai para `encerrado`. Só aí o solicitante pode avaliar ou recusar o serviço, e a recusa (`refuseServiceAction`) não tem prazo: vale enquanto não houver avaliação. O Preposto e o Admin reabrem `concluído` ou `encerrado` a qualquer tempo, mesmo avaliado (`reopenTicketAction`). Em todos esses caminhos o `createdAt` original é mantido.

Isso pesa no contrato. O IMR mede o tempo de atendimento por `sla.resolvedAt − createdAt − pausas` e o cumprimento de SLA pelo `sla.resolutionDueAt` gravado na classificação. Um chamado reaberto semanas depois leva junto o intervalo em que o serviço estava resolvido, e quase sempre estoura o prazo antigo, o que vira penalidade (base de glosa) sem que a empresa tenha atrasado nada. Ao mesmo tempo, a recorrência real do problema fica escondida dentro de um único chamado.

As forças: a regra precisa ser simples de explicar ao solicitante; não pode depender de o Preposto lembrar de encerrar; precisa resistir a corrida entre avaliação e encerramento automático; e precisa preservar o rastro de problemas recorrentes. O projeto já tem um container `cron` com rotas protegidas por `CRON_SECRET`, um padrão de snapshot imutável (o SLA) e um documento de configuração institucional (`BusinessCalendar`) editado pelo Admin.

## Options considered

### Option 1: Prazo contado do encerramento manual

Manter o fluxo de hoje (Preposto encerra) e só dar fim à janela: avaliar e recusar ficam liberados por N horas depois do `closedAt`, e depois disso o `encerrado` trava.

**Pros**:

- Mudança mínima: não mexe em quem encerra nem em quando a avaliação aparece.
- O Preposto continua conferindo antes de liberar a avaliação.

**Cons**:

- A janela só começa quando o Preposto encerra; um concluído esquecido fica aberto indefinidamente, e o problema relatado continua possível por esse caminho.
- Precisa de um estado novo, "encerrado e travado", porque `encerrado` passaria a ter duas fases.
- O Preposto continua com o trabalho manual de encerrar um por um.

### Option 2: O concluído vira a janela, com prazo gravado e encerramento pelo sistema

O prazo nasce na conclusão e fica gravado no chamado. Avaliar ou recusar acontece no `concluído`. A avaliação encerra na hora; o cron encerra o que venceu. `encerrado` é terminal, e o problema que volta vira chamado novo com vínculo.

**Pros**:

- Cada status tem um sentido só: `concluído` é "esperando o solicitante", `encerrado` é "definitivo".
- Não depende de ninguém lembrar de encerrar.
- O prazo gravado segue o mesmo raciocínio do snapshot de SLA: mudar a configuração não mexe em quem já está na janela.
- As guardas conferem o prazo, não só o status, então um cron atrasado não reabre a porta.

**Cons**:

- Tira o encerramento manual do Preposto e mexe em várias telas (Gestão, meus chamados, conversas, painel).
- Cria uma dependência operacional do container `cron`.
- Não há mais conserto para um encerramento errado.

### Option 3: Estado calculado na leitura, sem job

Gravar só o `concludedAt` e calcular "encerrado" na leitura (`concludedAt + prazo < agora`), sem mudar o status no banco.

**Pros**:

- Nenhum job novo; nunca há atraso entre o prazo e o estado.

**Cons**:

- O IMR, os painéis e as listas filtram por `status` e `closedAt`; todos teriam de reproduzir a conta, e esquecer em um lugar gera números diferentes entre telas.
- O status no banco mentiria: um chamado "encerrado" continuaria gravado como `concluído`.
- Mudar o prazo na configuração mudaria retroativamente o estado de chamados antigos.

## Rationale

A Option 2 ataca a causa do problema relatado, que é existir um caminho para o mesmo chamado voltar à vida muito tempo depois. A Option 1 só desloca esse caminho para o `concluído` que o Preposto esquece, e ainda exige um estado novo dentro do `encerrado`. A Option 3 evita o job, mas espalha a regra por todo leitor do status, justamente as consultas do IMR que mexem em glosa, e esse é o tipo de divergência que só aparece na reclamação do contrato.

Com a Option 2, o problema que volta precisa de um chamado novo, e o `chamadoAnteriorId` responde à preocupação do próprio stakeholder de não perder o histórico de recorrência: o vínculo fica explícito e consultável, em vez de enterrado no histórico de um chamado reaberto. Gravar o prazo na conclusão repete a decisão já tomada para o SLA (snapshot imutável), e conferir o prazo dentro do filtro atômico, além do status, faz o cron ser só o mecanismo que materializa o estado, não a trava em si. Se o cron parar, ninguém reabre nada; o efeito é só o atraso do `encerrado`.

Escolhas feitas pelo engenheiro na conversa e que esta spec segue: prazo contado da conclusão do técnico, 48 horas corridas, configurável pelo Admin junto do expediente, valendo só para as próximas conclusões; trava para todos, inclusive o Admin; Preposto e Admin ainda reabrem dentro da janela; avaliar encerra na hora; o botão "Encerrar" sai; cron a cada 15 minutos mais a trava pelo prazo; legado com 48 horas a partir do deploy; reincidência pelo formulário preenchido, só pelo solicitante, sem limite de tempo; aviso só na conclusão.

Decisões tomadas aqui, sem pergunta:

- `closedAt` do encerramento automático = `prazoAvaliacaoAte`, e não a hora em que o cron rodou: a data fica igual qualquer que seja o atraso do cron, e o IMR do período não depende do job. A alternativa, a hora real do cron, registraria o atraso operacional como dado de negócio.
- Preenchimento do legado pelo próprio cron, e não por um script de migração: o deploy fica idempotente e não depende de alguém rodar um comando na VPS. A alternativa, um script em `scripts/`, daria o mesmo resultado com um passo manual a mais.
- Prazo ausente conta como janela aberta: protege os concluídos entre o deploy e a primeira execução do cron. A alternativa, prazo ausente como fechado, travaria esses chamados por até 15 minutos sem motivo.
- Os encerramentos (avaliação e cron) emitem `ticket:closed` só para a sala do solicitante, sem `Notification` nem e-mail. O engenheiro pediu aviso só na conclusão, então nada vai para o sino nem para o e-mail, mas a tela aberta precisa se atualizar, senão o solicitante clicaria num botão que já não vale. A alternativa, não emitir nada, deixaria a tela velha até ele agir e receber um erro.
- O vínculo `chamadoAnteriorId` tira o anterior da dica de recorrência da triagem (`lib/recorrencia.ts`), para o Preposto não ver o mesmo chamado duas vezes.
- Faixa de 1 a 720 horas (até 30 dias) para o prazo: cobre de um dia a um mês sem permitir zero, que encerraria tudo na conclusão.
- Lotes de até 200 chamados por execução do cron: o volume diário de conclusões fica bem abaixo disso, e o limite evita uma execução longa num acúmulo depois de o cron ficar parado.
