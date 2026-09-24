# 0007. Prioridade e SLA automáticos: rationale

## Context

O projeto já decidiu, na fatia anterior (spec [0006](../0006-calibracao-trava-confianca/index.md)), como medir se a IA acerta a prioridade e como o Admin liga ou desliga a autonomia (`IaAutonomiaConfig`), mas deixou tudo inerte: nada lê essa configuração ainda. A prioridade sugerida pela IA, hoje, fica escondida de todo mundo, inclusive do Preposto, porque aquela fatia mede o acerto às cegas, sem que ninguém veja a sugestão antes de classificar.

Ao mesmo tempo, todo chamado aberto pelo chat nasce `aberto`, esperando um Preposto classificar a prioridade final e disparar o snapshot de SLA (o prazo contratual de atendimento), mesmo quando a IA já tinha certeza suficiente. Essa espera custa tempo real: o relógio do SLA, que alimenta a glosa do IMR (o desconto contratual por descumprimento), só começa a contar na classificação manual, não na abertura.

A decisão central desta fatia é onde e como aplicar o portão de confiança que a fatia anterior preparou, sem duplicar a lógica de cálculo de SLA que `classificarChamadoAction` já tem, sem quebrar a medição às cegas da calibração para os casos que continuam em triagem manual, e sem deixar o Preposto sem nenhuma saída quando a IA decide errado. Hoje não existe nenhuma ação para corrigir a prioridade de um chamado já `validado`.

Por mexer em prazo contratual e na base da glosa do IMR, a fatia está marcada `GA` no plano do projeto: o rigor completo (`/check verify`, `/test`, `/check review`, `/document`) se aplica, e qualquer divergência entre o SLA automático e o SLA manual é um problema sério, não um detalhe.

## Options considered

### Opção 1: Decidir na abertura, reaproveitando o cálculo de SLA da classificação manual

O portão de confiança roda dentro do fluxo síncrono que já cria o chamado a partir da conversa (`confirmarAbertura` → `abrirChamadoDaConversa`). O cálculo do snapshot de SLA (config ativa, expediente, feriados) sai de `classificarChamadoAction` para uma função só, chamada pelos dois caminhos.

**Pros**:

- Sem atraso: o prazo de SLA começa a contar no instante real da abertura, igual a classificação manual começaria a contar no instante em que ela acontece.
- Um único caminho de criação, sem infraestrutura nova (nada de fila, nada de job).
- Consistente com o padrão do projeto: toda a costura de `abrirChamadoDaConversa` já é síncrona e sem transação.

**Cons**:

- Exige extrair a lógica de cálculo de SLA de `classificarChamadoAction` para um lugar reaproveitável, para não duplicar a conta em dois lugares.

### Opção 2: Job assíncrono que promove chamados confiantes depois da abertura

Um processo periódico varre chamados `aberto` recém abertos pelo chat e promove os confiantes para `validado` alguns instantes depois.

**Pros**:

- Não toca no fluxo de abertura existente.

**Cons**:

- Atraso entre abrir e validar: o relógio do SLA fica ambíguo (conta da abertura ou da promoção?), e o chamado pisca de `aberto` para `validado` na tela do solicitante e dos gestores, gerando notificação duplicada.
- Infraestrutura nova (job/cron) para uma decisão que já tem todo dado disponível no instante da abertura.

### Opção 3: Chamar `classificarChamadoAction` como um "usuário sistema"

Reaproveitar a Server Action existente, disparando-a internamente logo após a criação do chamado.

**Pros**:

- Zero duplicação da lógica de SLA: é a mesma função.

**Cons**:

- `classificarChamadoAction` é uma Server Action pensada para um Preposto autenticado (`requireManager()`) chamando de dentro da tela de gestão; forçar um chamador interno "de sistema" mistura dois tipos de chamada muito diferentes e arrisca enfraquecer a trava de autorização por acidente.
- Ela também espera que o chamado já exista com status `aberto`; usá-la na criação exigiria uma segunda escrita logo depois da primeira, perdendo a atomicidade que a Opção 1 mantém.

## Rationale

A Opção 1 é a única que cumpre a exigência mais dura desta fatia: o SLA automático tem que ser idêntico ao manual, no mesmo instante. A Opção 2 introduz um atraso e uma ambiguidade sobre qual instante conta para o prazo contratual, algo inaceitável numa fatia marcada `GA` justamente por mexer nesse prazo. A Opção 3 reaproveita código, mas à custa de misturar um caminho de autorização pensado para humano com uma chamada interna do sistema, o tipo de atalho que costuma render um bug de autorização mais tarde.

O custo da Opção 1 (extrair `montarSnapshotSla`) é pequeno e paga uma dívida que já existia: hoje a lógica de SLA só mora dentro de `classificarChamadoAction`, sem chance de reaproveitamento nenhum. Extraí-la também é o que garante, por construção, que os dois caminhos nunca divirjam (mesma função, mesmos parâmetros), em vez de depender de disciplina para manter duas cópias sincronizadas.

A engenheira confirmou, ao longo da conversa de desenho, cada decisão de escopo com a opção recomendada: exigir serviço resolvido antes de validar sozinho (mantém a mesma regra que a classificação manual já segue, e garante que todo chamado `validado` tem especialidade para uma atribuição futura); tornar visível a decisão `aplicado` para Preposto e Admin (a fatia anterior só escondia a `sugestão`, para medir sem viés; uma decisão que já vale deixa de ser sugestão); reforçar o prompt contra pedidos de urgência sem motivo real, aceitando resetar a amostra de calibração; e construir uma correção mínima agora, em vez de deixar a lacuna para a fatia 17, dado o risco financeiro de um chamado com prioridade errada rodando sem chance de ajuste.

## References

Sem seção de referências nesta spec (nível escolhido pela engenheira: sem referências).
