# 0008. Atribuição automática ao técnico: rationale

## Context

> ⚠️ Premise note: o SLA de resposta (`sla.responseStartedAt`) hoje mede quanto tempo o Preposto levou para atribuir o chamado. Com a atribuição automática ele passa a ser marcado no segundo da abertura, então o indicador de resposta do IMR (relatório de medição de resultados) sobe por construção, sem que ninguém tenha respondido mais rápido. O que conta como resposta é uma definição do contrato. Esta spec segue a regra que já vale (atribuir é responder) e deixa a confirmação com o fiscal do contrato como condição para ligar o interruptor.

Desde a spec 0007, um chamado aberto pelo chat pode nascer `validado` sozinho, com prioridade e prazo de SLA definidos. Mas ele nasce sem técnico: continua parado até um Preposto abrir a Gestão, escolher um técnico elegível e atribuir. O relógio de resolução já corre desde a abertura, então cada minuto de espera pela atribuição manual consome prazo contratual sem que ninguém esteja atendendo. O fluxo do chat, que promete acompanhar o chamado até o fim, tem um buraco entre "validado" e "em atendimento".

O sistema já sabe quase tudo o que a escolha exige. A atribuição manual filtra técnicos ativos pela especialidade (o subtipo do serviço) e pela carga, com limite por técnico (`maxAssignedTickets`, padrão 5). O modelo de decisões da spec 0002 já prevê um campo `tecnico`, uma decisão por `regra` e a correção pela reatribuição do Preposto. O aviso `ticket:assigned` já chega ao técnico e, desde a 0005, ao solicitante na própria conversa. O que falta é um caminho de sistema que use essas peças sem passar por `requireManager()`.

Há restrições reais que moldam a decisão. O MongoDB de produção é standalone, sem transação, e o Next roda em uma instância. A contagem de carga e a gravação da atribuição não são atômicas entre si (dívida documentada em `gestao/AGENTS.md`). A linha do tempo de `/conversas` mostra as observações do histórico a todos os perfis, inclusive o solicitante, então nada interno pode ir para lá. A janela de correção de prioridade da 0007 só vale para chamado `validado` sem técnico. E `IaAutonomiaConfig` já é o lugar onde o Admin liga e desliga a autonomia, com a decisão de como o técnico entra nele deixada explicitamente para esta fatia (spec 0006).

## Options considered

### Opção 1: passo síncrono dentro de `confirmarAbertura`, em módulo próprio

Logo depois de `abrirChamadoDaConversa` criar o chamado `validado`, `confirmarAbertura` chama um módulo novo que escolhe o técnico por regra, atribui com a mesma condição atômica da atribuição manual, confere a carga depois de gravar e registra o resultado. A notificação da atribuição é extraída de `assignTicketAction` e compartilhada.

**Pros**:

- Sem espera: o técnico é avisado no mesmo instante da confirmação e o solicitante lê o resultado na frase final do chat.
- Não mexe na costura de cinco passos de `abrirChamadoDaConversa`, que é a parte mais delicada do fluxo.
- Falha do passo nunca desfaz o chamado: ele já existe `validado`, e o caso comum de falha é o comportamento de hoje. O pior caso, raro e registrado em log, é um chamado atribuído sem aviso ou sem histórico (estado órfão, ver `index.md`).
- Sem infraestrutura nova (nada de fila ou job).

**Cons**:

- Acrescenta de 5 a 8 idas ao banco ao caminho da confirmação.
- Um módulo novo de seleção convive com o `findBestTechnician` da atribuição manual até a unificação (ver `## Follow-up` no `index.md`).

### Opção 2: nascer já `em atendimento`, dentro de `abrirChamadoDaConversa`

O técnico é escolhido antes de criar o chamado, que já nasce `em atendimento` com o técnico, numa gravação só.

**Pros**:

- Uma escrita a menos e nenhum estado intermediário `validado` sem técnico.

**Cons**:

- Entra na costura sem transação (reserva, decisões, chamado, histórico, vínculo), que tem reparo próprio para confirmação interrompida. A conferência de carga e o desfazer ficariam dentro da reserva.
- O histórico perde a sequência `classificacao` seguida de `atribuicao_tecnico`, que é a mesma que o Preposto produz à mão.
- A decisão `tecnico` teria de ser gravada antes de o chamado existir, sem saber se a atribuição vai valer.

### Opção 3: job periódico que atribui os validados sem técnico

O cron que já roda a cada 30 minutos varre os chamados `validado` sem técnico e atribui.

**Pros**:

- Também resolve, de graça, a nova tentativa quando um técnico libera vaga.
- Fora do caminho da confirmação.

**Cons**:

- Atraso de até 30 minutos com técnico livre, consumindo prazo contratual: o oposto do objetivo.
- O chamado aparece `validado` sem técnico para o solicitante e para os gestores, e depois muda sozinho, gerando avisos duplicados.
- Um segundo gatilho de atribuição para manter, com a mesma corrida de carga.

### Opção 4: reaproveitar `assignTicketAction` com um ator de sistema

A Server Action da atribuição aceita um "viewer de sistema" e o passo automático a chama.

**Pros**:

- Nenhuma cópia de regra: seleção, condição atômica e avisos ficam num lugar só.

**Cons**:

- A action é uma Server Action exposta, com `requireManager()` no começo. Abrir nela um caminho de sistema alarga a superfície de ataque de uma ação sensível.
- Mistura duas regras de escolha diferentes: "técnico preferido com fallback" (manual) e "melhor entre os elegíveis, com conferência de carga" (automática).
- O texto de erro da action é escrito para o Preposto, não para um passo sem tela.

## Rationale

A Opção 1 é a única que resolve o problema sem tocar em nada frágil. O buraco está entre "validado" e "em atendimento", e o relógio de resolução corre desde a abertura, o que descarta a Opção 3 (atraso de até 30 minutos) por atrapalhar exatamente o que a fatia quer melhorar. A Opção 2 promete uma escrita a menos, mas entra na costura de reserva e reparo de `abrirChamadoDaConversa`, onde um erro de ordem cria chamado órfão ou decisão órfã, e ainda apaga a sequência de histórico que o Preposto já produz. A Opção 4 economiza código, mas transforma uma ação exposta de gestão em porta de entrada de sistema.

Na Opção 1, a falha quase sempre é segura: o chamado já existe `validado`, e o resultado comum é a fila do Preposto de hoje. Sem transação, resta um estado órfão raro (exceção depois de gravar em que nem o desfazer funciona), que o passo registra em log e a consulta do `## Follow-up` encontra. O custo é uma cópia parcial da lógica de seleção, aceita de propósito, com item de acompanhamento para unificar. Extrair só a notificação (o trecho que precisa ser idêntico nos dois caminhos, mesmo payload, mesma `Notification`, mesmo email) mantém a atribuição manual intacta e é o mesmo padrão que a spec 0004 usou com `notificarNovoChamado`.

A conferência de carga depois de gravar responde à restrição de o Mongo ser standalone. Sem transação, a alternativa honesta a aceitar o estouro raro seria manter um contador denormalizado no `User`, que precisaria acompanhar toda transição de status e derivaria. Gravar, contar de novo e desfazer não exige campo novo e falha para o lado seguro: se dois pedidos desfazem juntos, o chamado vai ao Preposto.

### Decisões menores tomadas na conversa

| Dimensão                               | Escolha                                                                       | Alternativa descartada                                        | Por que                                                                                                                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quais chamados entram                  | Só os validados pela IA                                                       | Todo chamado que virar `validado`                             | Segue o escopo. A classificação manual do Preposto traz a escolha do técnico como decisão dele, e tirar essa escolha da mão dele é outra mudança de fluxo                                                                                    |
| Sem técnico elegível                   | Fica `validado`, vai ao Preposto com o motivo, sem nova tentativa             | Nova tentativa ao liberar vaga, ou por cron                   | É o critério do escopo e o mais previsível. A nova tentativa entra no `## Follow-up` do `index.md` se o volume mostrar necessidade                                                                                                           |
| Critério de escolha                    | Menor carga; empate para quem está há mais tempo sem receber                  | Empate por nome; menor proporção de carga                     | O `findBestTechnician` atual desempata pela ordem do banco e favorece sempre os mesmos. Proporção de carga adiciona uma regra que o contrato não pede                                                                                        |
| Interruptor                            | Campo próprio no `IaAutonomiaConfig`, desligado por padrão                    | Reaproveitar `autonomiaAtiva`; modelo de configuração à parte | Separa prioridade de atribuição sem coleção nova. Um modelo à parte só compensa se a atribuição ganhar regras próprias, que hoje não tem                                                                                                     |
| SLA de resposta                        | Marca no instante da atribuição, como na manual                               | Marcar só na primeira ação do técnico                         | Uma única definição de resposta no IMR. A alternativa exigiria um gatilho novo na primeira ação e duas definições. Fica registrada a condição do fiscal (Premise note)                                                                       |
| Correção de prioridade                 | Fica para a fatia 17, e a fatia nasce desligada                               | Ampliar a correção agora; fazer a 17 antes                    | A regra de SLA já iniciado é decisão da 17 no escopo. Ampliar aqui dobraria o tamanho da fatia                                                                                                                                               |
| Concorrência na carga                  | Conferir depois de gravar e desfazer                                          | Aceitar o estouro de 1; contador no `User`; trava em memória  | Aceitar seria tolerável com um humano olhando, mas aqui ninguém olha. O contador derivaria. A trava em memória prenderia a correção a uma instância só do Next e não cobriria a corrida com a atribuição manual, que passa por outro caminho |
| Aviso aos gestores                     | A mesma `ticket:new`, com o texto do resultado                                | Avisar só quando ficar sem técnico                            | Mantém a visão do que a IA fez, que a fatia 17 quer dar ao Preposto                                                                                                                                                                          |
| Onde fica o motivo de "sem técnico"    | Campo `atribuicaoAutomatica` no chamado, lido só pela gestão                  | Entrada de histórico; só na notificação                       | O histórico é visível ao solicitante e o motivo é informação interna do contrato. Só na notificação não deixa nada para auditar nem para a fatia 18 contar                                                                                   |
| Frase final do chat                    | Uma frase que já diz o técnico                                                | Manter a frase de hoje                                        | O nome já chega ao solicitante pelo aviso de atribuição, e o chat calado no momento mais útil seria estranho                                                                                                                                 |
| Nível de rigor                         | GA                                                                            | Beta                                                          | Mexe no SLA de resposta e atribui trabalho a pessoas sozinha. A 15, de risco parecido, foi GA                                                                                                                                                |
| Decisão do técnico no histórico        | Sem entrada `decisao_ia` para o técnico                                       | Gravar a entrada como nas outras decisões                     | O rótulo "Decisão da IA" seria falso para uma regra, e a entrada `atribuicao_tecnico` já duplicaria o fato                                                                                                                                   |
| Quem consta como autor                 | `sistema`, com `assignedBy: { id: 'sistema', name: 'Atribuição automática' }` | `ia`                                                          | A escolha é por regra, sem o modelo. O precedente `classifiedBy: { id: 'ia' }` da 0007 vale para a IA de verdade                                                                                                                             |
| Quantos candidatos tentar              | Até 3                                                                         | Todos os elegíveis                                            | Limita as idas ao banco no pior caso e é mais que suficiente para uma disputa rara                                                                                                                                                           |
| Nome do técnico depois de reatribuição | Guardar `tecnicoId` em `atribuicaoAutomatica` e resolver o nome por ele       | Mostrar o técnico atual do chamado                            | O detalhe deve dizer quem a regra escolheu, não quem ficou depois da correção do Preposto. Veio da revisão cruzada                                                                                                                           |
| Falha antes de conhecer a chave        | `nao_tentada`, sem gravar nada                                                | `sem_tecnico` com `erro`                                      | Sem ler a configuração não se sabe se a chave estava ligada, e gravar `erro` num chamado que nunca deveria ser tentado seria mentir para a gestão                                                                                            |
| Efeitos depois da conferência          | Aguardar histórico, decisão, `Notification` e socket; email sem aguardar      | Aguardar tudo, ou tudo em segundo plano                       | É o que a atribuição manual já faz, e o solicitante não espera o servidor de email                                                                                                                                                           |
