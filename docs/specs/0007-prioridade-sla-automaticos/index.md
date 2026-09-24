# 0007. Prioridade e SLA automáticos

**Date**: 2026-09-23
**Status**: Accepted

## Summary

Quando a IA tem certeza suficiente da prioridade de um chamado aberto pelo chat, o chamado nasce direto como `validado`, com a prioridade final e o prazo de SLA (limite contratual de atendimento) já definidos, do mesmo jeito que a classificação manual do Preposto define hoje. Quando a IA não tem certeza, o chamado continua indo para a triagem manual, mas agora com a sugestão da IA já preenchida no formulário do Preposto. A decisão usa o limite de confiança e o interruptor que a fatia anterior (calibração da trava de confiança) já deixou prontos, e ganha uma correção mínima para o Preposto ajustar a prioridade caso a IA erre.

## Requirements

**User stories**:

- Como solicitante, quero que meu chamado já saia com prioridade e prazo definidos quando a IA tem certeza, para não esperar a triagem manual.
- Como Preposto, quero ver a sugestão de prioridade da IA na hora de classificar um chamado que ficou em triagem, para decidir mais rápido.
- Como Preposto ou Admin, quero corrigir a prioridade de um chamado recém validado, antes de atribuir um técnico, caso a IA (ou eu mesmo, numa classificação manual) tenha errado.
- Como Admin, quero que ligar ou desligar a autonomia (`autonomiaAtiva`, já existente desde a fatia anterior) continue sendo o único interruptor que muda esse comportamento, sem precisar de novo deploy.
- Como Preposto ou Admin, quero identificar rápido, numa lista de chamados, quais foram validados sozinhos pela IA.

**Acceptance criteria** (o contrato, cada critério é identificado e verificável de forma independente):

- **AC-1**: Quando o cartão do chat está no modo IA (serviço do catálogo reconhecido), `IaAutonomiaConfig.autonomiaAtiva` é `true`, `IaAutonomiaConfig.prioridade.limiteConfianca` não é nulo, e a confiança da prioridade extraída é maior ou igual a esse limite, o chamado nasce direto com status `validado`: `finalPriority` recebe a prioridade da IA, e o snapshot de SLA (`sla.*`) é calculado com a mesma lógica que a classificação manual usa (config de SLA ativa para aquela prioridade, expediente, feriados).
- **AC-2**: Sem serviço reconhecido (cartão manual), sem `autonomiaAtiva`, sem `limiteConfianca` definido, ou com confiança abaixo do limite, o chamado nasce `aberto`, exatamente como hoje.
- **AC-3**: A decisão de prioridade aplicada automaticamente é gravada na `DecisaoIa` com `efeito: 'aplicado'` (não `'sugestao'`), incluindo confiança e motivo. O histórico do chamado ganha uma entrada `classificacao` com `actorType: 'ia'` (sem `userId`) e a entrada `decisao_ia` de sempre, no mesmo formato que a classificação manual grava as dela.
- **AC-4**: Sem configuração de SLA ativa para a prioridade escolhida pela IA, ou com falha ao calcular calendário de expediente e feriados, o chamado nunca deixa de abrir: cai automaticamente no caminho `aberto` de hoje, sem propagar erro para o solicitante.
- **AC-5**: Um chamado que nasce `validado` sozinho dispara o mesmo evento em tempo real `ticket:classified` que a classificação manual dispara, e a tela `/conversas` recebe a atualização ao vivo do mesmo jeito que já recebe hoje.
- **AC-6**: A decisão de prioridade com `efeito: 'aplicado'` aparece na linha do tempo de `/conversas` e na tela de gestão para Preposto e Admin, confiança e motivo inclusive. Uma decisão ainda em `efeito: 'sugestao'` continua escondida da linha do tempo de `/conversas` para os quatro perfis; ela só aparece, pré-preenchida e rotulada, no formulário de classificação do Preposto (ver AC-8), que já lia decisões sem esse filtro antes desta fatia.
- **AC-7**: O relatório de calibração de confiança (`lib/ia-confianca`) nunca conta uma decisão `efeito: 'aplicado'` na amostra de acurácia; o filtro que já exige `efeito: 'sugestao'` continua intocado.
- **AC-8**: Um chamado que fica `aberto` com sugestão de prioridade mostra essa sugestão já preenchida, com um rótulo visível de que é uma sugestão da IA, no formulário de classificação do Preposto (`ClassificarChamadoDialog`), do mesmo jeito que o serviço sugerido já aparece pré-preenchido hoje.
- **AC-9**: O relatório de calibração passa a mostrar o mesmo aviso fixo de viés de concordância também na seção `prioridade`, porque ela deixa de ser medida às cegas depois desta fatia (o aviso hoje só existe na seção `servico`).
- **AC-10**: O prompt da abertura instrui explicitamente o modelo a não elevar a prioridade só porque a pessoa pediu urgência no texto, sem descrever um risco ou impacto real. A mudança de texto sobe `PROMPT_VERSION`.
- **AC-11**: Preposto ou Admin pode trocar a `finalPriority` de um chamado `validado` (decidido pela IA ou classificado manualmente), recalculando o snapshot de SLA a partir do `classifiedAt` original (não do instante da correção) com a mesma lógica da classificação, para o prazo contratual não se mover pelo simples fato de a correção acontecer depois. Trocar para a mesma prioridade já vigente é recusado. Quando existir uma `DecisaoIa` de prioridade para o chamado, a troca é registrada nela como correção (mesmo caminho que já existe para vereditos da gestão); o histórico do chamado ganha uma nova entrada `classificacao` que acrescenta a observação em vez de substituir a anterior, e o evento `ticket:classified` dispara de novo.
- **AC-12**: A correção da prioridade só é permitida enquanto o chamado está `validado` e sem técnico atribuído (`assignedToUserId` vazio); a checagem e a gravação acontecem numa única operação atômica no banco (sem ler o status e gravar em dois passos separados), para uma atribuição concorrente nunca deixar a correção aplicar fora da janela. Fora dessa janela, a ação é recusada com uma mensagem clara.
- **AC-13**: A notificação de novo chamado para os gestores (`ticket:new`) usa um texto diferente quando o chamado já nasce `validado` sozinho, deixando claro que ele não precisa de triagem.
- **AC-14**: A mensagem de confirmação para o solicitante no chat não diz mais "um Preposto vai analisar" quando o chamado já nasce `validado`; ela confirma a prioridade decidida em vez disso.
- **AC-15**: A lista de gestão e o detalhe do chamado mostram um selo "Validado automaticamente pela IA" nos chamados que passaram pelo caminho confiante, visível para Preposto e Admin. O selo continua aparecendo mesmo depois de uma correção (AC-11), porque marca a origem da validação, não o estado atual dela.
- **AC-16**: Toda decisão de prioridade, aplicada ou ainda em sugestão, grava confiança e motivo na `DecisaoIa`, auditável por Preposto e Admin mesmo quando a tela ainda esconde a sugestão.
- **AC-17**: Como esta fatia sobe `PROMPT_VERSION` (AC-10), o deploy que a introduz também desliga `IaAutonomiaConfig.autonomiaAtiva`, porque o limite de confiança em vigor foi calibrado contra o prompt antigo e não vale para o novo. O Admin só liga de novo depois de conferir, na tela de calibração, que o limite continua bom com uma amostra nova medida sob o prompt atual.

## Decision

**Chosen option**: Opção 1: decidir na abertura, reaproveitando o cálculo de SLA da classificação manual

A lógica de cálculo do snapshot de SLA sai de `classificarChamadoAction` para uma função só (`montarSnapshotSla`), chamada tanto pela classificação manual quanto pelo caminho automático dentro de `confirmarAbertura`. O portão de confiança lê `IaAutonomiaConfig` (fatia anterior) no instante da confirmação; sem confiança suficiente, nada muda em relação ao comportamento de hoje.

**Implementation skills**: `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Rationale

Reasoning completo e as opções descartadas: veja [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

Nenhuma coleção nova e nenhum campo novo. A fatia reaproveita inteiramente o que já existe:

- `Chamado`: `status` pode nascer `validado` (já é um valor válido do enum); `finalPriority`, `classificationNotes`, `classifiedAt` e o subdocumento `sla.*` recebem valor na criação em vez de só na classificação manual; `classifiedByUserId` fica `null` (já é opcional) quando não há Preposto envolvido; `iaSituacao` já vira `'decidida'` sozinho (via `derivarIaSituacao`) quando existe uma decisão com `efeito: 'aplicado'`; é esse campo que alimenta o selo do AC-15, sem precisar de nada novo.
- `DecisaoIa`: `efeito: 'aplicado'` já existe no enum (`DECISAO_EFEITOS`) desde a fatia 2; esta fatia é a primeira a gravá-lo de verdade para o campo `prioridade`.
- `ChamadoHistory`: `action: 'classificacao'` já existe; só passa a ser gravado também com `actorType: 'ia'` (o schema já aceita, `userId` já é opcional fora de `actorType: 'usuario'`).
- `IaAutonomiaConfig`: leitura no portão de confiança (`autonomiaAtiva`, `prioridade.limiteConfianca`); campo novo `promptVersion` (a `PROMPT_VERSION` vigente quando o Admin salvou, gravada por `salvarConfig()`); `lerConfig()` devolve `autonomiaAtiva: false` quando ela difere da atual (AC-17), sem migração nem passo de deploy.

**State transitions**:

- Chamado do chat: `(inexistente)` → `validado` direto (caminho confiante, novo) OU `(inexistente)` → `aberto` → `validado` (caminho de triagem manual, como hoje). Depois de `validado`, o ciclo de vida continua igual ao de sempre (`em atendimento` → `concluído` → `encerrado`).
- `DecisaoIa.efeito`: decidido uma única vez, na gravação (`'aplicado'` ou `'sugestao'`); nunca muda depois. `situacao` continua podendo virar `'corrigida'` via `resolverDecisao`, inclusive numa decisão `'aplicado'` (é o que a correção do AC-11 usa).

**API surface**:

| Ação / Rota                                              | Método             | Entradas principais                                              | Saídas principais                        | Auth                                               | Erros principais                                                                                                       |
| -------------------------------------------------------- | ------------------ | ---------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `confirmarAbertura` (`lib/assistente`, já existe)        | função de servidor | `conversaId`, `cartaoId`, `unitId`, `localExato`, `tipoServico?` | `chamadoId`, `ticketNumber`, `jaExistia` | dono da conversa (`Viewer`)                        | `dados_invalidos`, `cartao_desatualizado`, `erro` (já existentes; nenhum erro novo, ver AC-4)                          |
| `updateTicketPriorityAction` (`gestao/actions.ts`, nova) | Server Action      | `chamadoId`, `finalPriority`, `classificationNotes?`             | `{ ok: true }` ou `{ ok: false, error }` | `requireManager()` (dentro do `try`, mesmo padrão) | `dados_invalidos` (Zod); `janela_invalida` (status, atribuição fora da regra do AC-12, ou mesma prioridade já vigente) |

**Value sourcing** (todo valor que uma ação produz, calcula ou mostra, com a origem):

| Ação                                    | Valor produzido / mostrado                             | Origem                                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| abertura (confiante)                    | `finalPriority`                                        | `proposta.prioridade.prioridade` (já extraída pela tarefa `conversa.abertura`, gravada em `Conversa.propostaIa`)                                                                                                                         |
| abertura (confiante)                    | confiança comparada no portão                          | `proposta.prioridade.confianca`                                                                                                                                                                                                          |
| abertura (confiante)                    | `IaAutonomiaConfig.autonomiaAtiva` / `limiteConfianca` | `lerConfig()` (`lib/ia-confianca/config.ts`, já existe, upsert com padrões de fábrica)                                                                                                                                                   |
| abertura (confiante)                    | precondição de serviço resolvido                       | `cartao.payload.modo === 'ia'` mais `lerServicoAtivo()` (já roda em `confirmarAbertura` hoje)                                                                                                                                            |
| abertura (confiante)                    | `sla.*` (prazos, config version, `computedAt`)         | `montarSnapshotSla(finalPriority, now)`, função nova que reaproveita `SlaConfigModel`, `getBusinessCalendarConfig`, `getActiveHolidaysForRange`, `computeSlaDueDatesFromConfig`                                                          |
| abertura (confiante)                    | `status` do chamado                                    | derivado: `'validado'` se o portão passa, senão `'aberto'`                                                                                                                                                                               |
| abertura (confiante)                    | `efeito` da `DecisaoIa` de prioridade                  | derivado do mesmo portão: `'aplicado'` ou `'sugestao'`                                                                                                                                                                                   |
| classificação (triagem)                 | valor pré-preenchido no formulário                     | `lerDecisoes(viewer, chamadoId)` filtrado por `campo: 'prioridade'` (já existe, restrito a Preposto/Admin)                                                                                                                               |
| classificação (triagem)                 | rótulo "sugestão da IA"                                | presença de uma `DecisaoIa` com `campo: 'prioridade'`, `efeito: 'sugestao'`, `situacao !== 'corrigida'`                                                                                                                                  |
| correção (`updateTicketPriorityAction`) | novo `finalPriority`                                   | input do Preposto/Admin no formulário                                                                                                                                                                                                    |
| correção                                | `sla.*` recalculado                                    | `montarSnapshotSla(novoFinalPriority, doc.classifiedAt)`, mesma função do caminho de abertura, ancorada no instante original da classificação, não no instante da correção                                                               |
| correção                                | correção gravada na `DecisaoIa`                        | `resolverDecisao({ viewer, chamadoId, campo: 'prioridade', valor, origem: 'gestao', motivo })` (já existe, reaproveitado sem mudança)                                                                                                    |
| notificação (`ticket:new`)              | texto variando por status                              | `status` do chamado recém criado (`'validado'` vs `'aberto'`), passado para `notificarNovoChamado`                                                                                                                                       |
| mensagem ao solicitante                 | texto variando por status                              | mesmo `status`, decidido em `confirmarAbertura` antes de `enviarMensagem`                                                                                                                                                                |
| selo "validado pela IA"                 | exibição condicional                                   | existência de `DecisaoIa` com `chamadoId`, `campo: 'prioridade'`, `efeito: 'aplicado'` (uma consulta em lote por `$in` na listagem, mesmo padrão de `decisoesOcultas()`; não usa `iaSituacao`, que muda para `'revisada'` numa correção) |
| troca de prompt (AC-17)                 | autonomia em vigor volta a `false`                     | `lerConfig()` compara `IaAutonomiaConfig.promptVersion` com `PROMPT_VERSION`; `salvarConfig()` grava a versão atual                                                                                                                      |

**Key invariants**:

- O portão de confiança roda uma única vez, no instante da abertura; nunca é reavaliado depois (mudar `IaAutonomiaConfig` não afeta chamados já criados).
- `IaAutonomiaConfig.prioridade.limiteConfianca: null` sempre significa autonomia impossível para prioridade, mesmo com `autonomiaAtiva: true` (mesma regra que a fatia anterior já define).
- Chamado nasce `validado` sozinho só quando o serviço também foi reconhecido (cartão em modo IA); nunca com serviço "a definir na triagem". No modo manual, `servico` nunca é resolvido, então o portão sempre reprova ali, sem checagem extra.
- O portão passar não garante `status: 'validado'`: se `montarSnapshotSla` devolver `{ ok: false }` (sem `SlaConfig` ativo, ou falha de calendário/feriados), o chamado cai no caminho `aberto` e a decisão de prioridade grava com `efeito: 'sugestao'`, nunca `'aplicado'` sem snapshot de verdade por trás.
- `montarSnapshotSla` nunca lança; devolve `{ ok: true, snapshot }` ou `{ ok: false, motivo }`. A classificação manual continua mostrando o erro de hoje ao Preposto quando `ok: false`; só o caminho automático (abertura e correção) trata `ok: false` caindo em silêncio para o comportamento de antes desta fatia.
- `DecisaoIa.efeito` nunca muda depois de gravado (`'aplicado'` continua `'aplicado'`, `'sugestao'` continua `'sugestao'`); só `valorFinal`, `situacao` e `correcoes` mudam com uma correção. Uma segunda correção sobre a mesma decisão é permitida e só acrescenta mais uma entrada em `correcoes`.
- O snapshot de SLA de um chamado validado sozinho é igual ao que a classificação manual geraria para a mesma prioridade no mesmo instante (mesma função, mesmos parâmetros); os testes injetam o mesmo `now` nos dois caminhos para comparar, em vez de depender do relógio real.
- Uma correção de prioridade (AC-11) recalcula o SLA a partir do `classifiedAt` já gravado no chamado, nunca do instante da correção, para o prazo contratual não se mover por causa da correção em si. Na mesma gravação atômica, a correção zera `sla.responseBreachedAt` e `sla.resolutionBreachedAt` e em seguida apaga as `SlaEscalation` do chamado: marcavam os prazos antigos, e o monitor de SLA reavalia contra os novos no próximo ciclo (sem isso, um chamado dentro do prazo corrigido contaria como fora do SLA no IMR e na glosa).
- `decisoesOcultas()` só esconde, da linha do tempo de `/conversas`, decisões de `campo` em `CAMPOS_OCULTOS` com `efeito: 'sugestao'`; uma decisão `'aplicado'` nunca é escondida. `lerDecisoes()` (que alimenta o pré-preenchimento do AC-8) nunca aplicou esse filtro, antes ou depois desta fatia: é por isso que o Preposto já pode ver a sugestão no formulário mesmo com ela escondida da linha do tempo.
- A confiança e a prioridade usadas no portão vêm sempre da leitura mais recente de `Conversa.propostaIa` no instante da confirmação, nunca de um valor congelado no cartão (o cartão nunca guardou prioridade, motivo ou confiança, desde a spec 0004); esse comportamento já existia antes desta fatia, só passou a alimentar uma decisão automática.
- A correção de prioridade (AC-11/AC-12) só é possível com o chamado `validado` e sem técnico atribuído, checado e gravado numa única operação atômica no banco (`findOneAndUpdate` condicional, mesmo padrão de `reopenTicketAction`); fora dessa janela, a fatia não oferece caminho (fica para a fatia 17).
- O selo "validado pela IA" (AC-15) nunca usa `Chamado.iaSituacao`, porque esse campo vira `'revisada'` assim que qualquer decisão do chamado recebe um veredito, inclusive a correção do AC-11; o selo usa a existência de uma `DecisaoIa` com `efeito: 'aplicado'`, que a correção nunca desfaz.
- A amostra de calibração de confiança nunca inclui uma decisão `efeito: 'aplicado'` (o filtro da fatia anterior já exige `efeito: 'sugestao'`, intocado por esta fatia).
- As decisões de `DecisaoIa` já são gravadas antes do documento `Chamado`, dentro da costura sem transação de `abrirChamadoDaConversa` (reserva → decisões → chamado → histórico → vínculo); uma falha depois da criação do chamado só pode atingir o histórico, e a nova entrada `classificacao` desta fatia segue o mesmo padrão de `garantirHistoricoDecisao`: confere se já existe antes de gravar, para o reparo de uma confirmação repetida nunca duplicar.

**Security model**:

- A decisão automática roda dentro de `confirmarAbertura`, já autenticado como o solicitante dono da conversa; nenhuma mudança de autorização nesse caminho.
- `updateTicketPriorityAction` exige `requireManager()` (Preposto ou Admin), mesmo padrão de `classificarChamadoAction` (guard dentro do `try`, resposta `{ ok: false, error: 'NEXT_REDIRECT' }` para quem não é gestor).
- Confiança e motivo da decisão de prioridade (aplicada ou sugerida) continuam visíveis só para Preposto e Admin (`lerDecisoes` já restringe); solicitante e técnico nunca veem esses dois campos.
- Nenhum dado pessoal novo exposto; nenhum texto de relato em log (mesma regra das fatias 2 e 4).
- Mexe em prazo contratual de SLA e na base da glosa do IMR. Por isso a fatia é `GA`: o rigor completo (`/check verify`, `/test`, `/check review`, `/document`) se aplica, e o snapshot de SLA nunca pode divergir entre os dois caminhos (ver invariante acima).

**Configuration required**:

Nenhuma variável de ambiente nova. Reaproveita `IaAutonomiaConfig` (fatia anterior) e as variáveis `LLM_*` já existentes.

**Critical test scenarios** (cada um mapeia para um critério de aceitação em `## Requirements`):

- Caminho feliz confiante: cartão em modo IA, `autonomiaAtiva: true`, confiança acima do limite → chamado nasce `validado`, `finalPriority` e `sla.*` idênticos ao que a classificação manual geraria na mesma hora, `DecisaoIa` com `efeito: 'aplicado'`, histórico com `classificacao` (`actorType: 'ia'`) e `decisao_ia`. Verifica **AC-1**, **AC-3**.
- Caminho de triagem: confiança abaixo do limite, ou `autonomiaAtiva: false`, ou `limiteConfianca: null`, ou cartão manual sem serviço → chamado nasce `aberto`, sem nenhum campo de SLA preenchido. Verifica **AC-2**.
- Falha de infraestrutura: sem `SlaConfig` ativo para a prioridade da IA, ou falha ao buscar feriados/calendário → chamado nasce `aberto` mesmo assim, sem erro para o solicitante. Verifica **AC-4**.
- Tempo real: chamado validado sozinho dispara `ticket:classified`; `/conversas` de outro viewer na mesma conversa atualiza ao vivo. Verifica **AC-5**.
- Visibilidade: uma decisão `efeito: 'aplicado'` aparece na linha do tempo e na gestão para Preposto/Admin; uma `efeito: 'sugestao'` continua escondida da linha do tempo para os quatro perfis, mas aparece pré-preenchida no formulário de classificação do Preposto. Verifica **AC-6**, **AC-16**.
- Calibração intocada: a amostra de `lib/ia-confianca/calibragem.ts` nunca inclui uma decisão `efeito: 'aplicado'`, mesmo com muitas gravadas. Verifica **AC-7**.
- Pré-preenchimento: chamado em triagem com sugestão de prioridade mostra o campo já preenchido e rotulado no `ClassificarChamadoDialog`; sem sugestão (chamado do formulário), o campo continua com o comportamento de hoje. Verifica **AC-8**.
- Aviso de viés: a seção `prioridade` do relatório de calibração mostra o mesmo aviso fixo que a seção `servico` já mostra. Verifica **AC-9**.
- Prompt: `PROMPT_VERSION` muda de valor; o texto novo existe e uma chamada real ao vLLM (fatia 1) continua respondendo no formato esperado. Verifica **AC-10**.
- Correção dentro da janela: chamado `validado` sem técnico atribuído (decidido pela IA ou classificado manualmente) tem a prioridade trocada, o SLA recalculado a partir do `classifiedAt` original (não do instante da correção, mesmo simulando um atraso entre os dois) e, quando existir `DecisaoIa`, a correção registrada nela; a observação nova soma à anterior em vez de apagá-la. Verifica **AC-11**.
- Correção recusada: chamado atribuído, ou em qualquer outro status, recusa a troca com mensagem clara; trocar para a mesma prioridade já vigente também é recusado; duas correções concorrentes (uma delas junto com uma atribuição de técnico) nunca deixam as duas aplicarem. Verifica **AC-11**, **AC-12**.
- Notificação e mensagem: `ticket:new` e a frase para o solicitante mudam de texto quando o chamado nasce `validado`, mantendo o texto de hoje quando nasce `aberto`. Verifica **AC-13**, **AC-14**.
- Selo: aparece na lista da gestão e no detalhe quando existe `DecisaoIa` de prioridade com `efeito: 'aplicado'`, e continua aparecendo depois de uma correção (quando `iaSituacao` já virou `'revisada'`). Verifica **AC-15**.
- Troca de prompt: configuração com `autonomiaAtiva: true` salva sob outra `PROMPT_VERSION` (ou sem `promptVersion`, documento anterior a esta fatia) é lida com `autonomiaAtiva: false`; salvar de novo grava a versão atual e religa. Verifica **AC-17**.

## Build plan

Ordem por **Tracer Bullet** (padrão do projeto): o marco 1 sobe o caminho confiante de ponta a ponta (o valor central da fatia); o marco 2 engrossa a visibilidade e a cópia; o marco 3 fecha a lacuna de correção.

**Marco 1: fio fino do caminho confiante, ponta a ponta**

1. [x] Extrair `montarSnapshotSla(priority, from)` de dentro de `classificarChamadoAction` para uma função reaproveitável (lê `SlaConfigModel`, `getBusinessCalendarConfig`, `getActiveHolidaysForRange`, chama `computeSlaDueDatesFromConfig`; devolve `{ ok: true, snapshot }` ou `{ ok: false, motivo }`, nunca lança). Atualizar `classificarChamadoAction` para usá-la, mantendo a mensagem de erro de hoje quando `ok: false`. Vive em `lib/sla-snapshot.ts` (não em `lib/sla-utils.ts`, que fica só com cálculo puro sem tocar banco, pros testes existentes sem mock de `@/lib/db` continuarem passando). Satisfaz **AC-4**.
2. [x] Reforçar `ABERTURA_INSTRUCOES` (`lib/assistente/prompt.ts`) com a regra anti jogo de urgência sem motivo real; subir `PROMPT_VERSION` para `'2'`. Satisfaz **AC-10**.
3. [x] Amarrar a configuração à versão do prompt: `IaAutonomiaConfig.promptVersion`, gravado por `salvarConfig()`, e `lerConfig()` devolvendo `autonomiaAtiva: false` quando difere de `PROMPT_VERSION`, porque o limite calibrado vale para o prompt antigo. Substitui o script de migração manual da primeira versão (o CD não roda migração e a imagem de produção não tem `scripts/` nem `tsx`). Satisfaz **AC-17**.
4. [x] Criar o portão de confiança (`lib/assistente/portao.ts`, `confiancaSuficienteParaPrioridade`, lê `lerConfig()` da fatia anterior): confiante quando `autonomiaAtiva && limiteConfianca != null && confianca >= limiteConfianca` **e** o serviço já foi resolvido (cartão em modo IA). Satisfaz **AC-1**, **AC-2**.
5. [x] `confirmarAbertura`/`decisoesDaProposta` (`lib/assistente/confirmar.ts`): decidir `status`, `finalPriority`, `sla.*` e o `efeito` da decisão de prioridade antes de chamar `abrirChamadoDaConversa`. Chama `montarSnapshotSla` só quando o portão do passo 4 aprova; se ele devolver `ok: false`, ou se o portão reprovar, o caminho cai inteiro para `status: 'aberto'` e `efeito: 'sugestao'`. Satisfaz **AC-1**, **AC-2**, **AC-3**, **AC-4**.
6. [x] `abrirChamadoDaConversa`/`criarChamado` (`lib/conversas/abertura.ts`): aceitar os campos de classificação em `dadosChamado`; gravar a entrada de histórico `classificacao` (`actorType: 'ia'`, `statusAnterior: 'aberto'`, mesmo formato da manual) junto da `abertura`/`decisao_ia`, conferindo antes se já existe (`garantirHistoricoClassificacaoIa`, mesmo padrão de `garantirHistoricoDecisao`, para o reparo de uma confirmação repetida não duplicar); emitir `ticket:classified` quando o chamado nasce `validado` (só na primeira vez, não numa repetição idempotente). Satisfaz **AC-3**, **AC-5**.
7. [x] `decisoesOcultas()` (`lib/conversas/decisoes.ts`): restringir o filtro a `campo` em `CAMPOS_OCULTOS` **e** `efeito: 'sugestao'`, deixando `'aplicado'` visível na linha do tempo (`lerDecisoes()`, que alimenta o AC-8, já não tinha esse filtro e continua sem ele). Satisfaz **AC-6**, **AC-16**.
8. [x] Teste contra Mongo em container: caminho confiante gera SLA idêntico à classificação manual, injetando o mesmo `now`; caminho sem confiança nasce `aberto`; `SlaConfig` ausente cai no caminho manual sem lançar e sem gravar `efeito: 'aplicado'`; decisão `aplicado` visível na linha do tempo (`decisoesOcultas` testado isoladamente em `lib/conversas/__tests__/decisoes.db.test.ts`), `sugestao` escondida; a amostra de `lib/ia-confianca/calibragem.ts` continua sem nenhuma decisão `aplicado`, mesmo forçando `revisadaEm`; migração de deploy verificada manualmente contra o Mongo de teste (liga → desliga, idempotente). Testes em `lib/assistente/__tests__/abertura-chat.db.test.ts` (describe `portão de confiança`) e `lib/assistente/__tests__/confirmar.test.ts` (mocks). Satisfaz **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-6**, **AC-7**, **AC-16**, **AC-17**.

**Marco 2: visibilidade e cópia**

9. [x] Aviso fixo de viés também na seção `prioridade` (mesmo texto, agora com o nome do campo trocado; nenhuma mudança no filtro da amostra em `lib/ia-confianca/calibragem.ts`, que já filtrava certo). Vive em `RelatorioCampoCard.tsx` (é lá que o aviso já morava, não em `calibragem.ts`). Satisfaz **AC-9**.
10. [x] `ClassificarChamadoDialog` / nova rota `GET /api/gestao/chamados/[id]/decisao-prioridade` (chama `lerDecisoes` para `campo: 'prioridade'`, `efeito: 'sugestao'`, `situacao !== 'corrigida'`): pré-preenche `finalPriority` e mostra um badge "Sugestão da IA" ao lado do rótulo do campo. Satisfaz **AC-8**.
11. [x] Selo "Validado automaticamente pela IA" (`components/chamado/SeloValidadoIa.tsx`, ao lado de `MarcaAberturaChat`/`SeloAberturaChat`): `prioridadeValidadaPelaIa()` nova em `lib/conversas/proposta-store.ts`, uma consulta em lote (`$in` nos ids da lista) por `DecisaoIa` de `campo: 'prioridade'`, `efeito: 'aplicado'`, na lista da gestão e no detalhe do chamado; nunca lê `iaSituacao`. Satisfaz **AC-15**.
12. [x] `notificarNovoChamado` (novo parâmetro `jaValidado`) e `fraseDeChamadoAberto` (novo parâmetro `opcoes`): variante de texto para o caminho `validado` (título da notificação, frase ao solicitante). Satisfaz **AC-13**, **AC-14**.
13. [x] Testes: pré-preenchimento (rota `decisao-prioridade`, unitário); aviso de viés nas duas seções (`RelatorioCampoCard.test.tsx`); selo por existência de `DecisaoIa` (`prioridadeValidadaPelaIa`, db test); textos de notificação (`novo-chamado.test.ts`) e de chat (`mensagens.test.ts`) variando por status. Satisfaz **AC-8**, **AC-9**, **AC-13**, **AC-14**, **AC-15**.

**Marco 3: correção mínima**

14. [x] `UpdateTicketPrioritySchema` (`shared/chamados/chamado.schemas.ts`) e `updateTicketPriorityAction` (`gestao/actions.ts`): `requireManager()`; um único `findOneAndUpdate({ _id, status: 'validado', assignedToUserId: null, finalPriority: { $ne: novaPrioridade } }, ...)` que já embute a precondição do AC-12 e a recusa de trocar para a mesma prioridade; sem documento retornado, uma segunda leitura (fora do caminho quente) monta uma mensagem específica (atribuído / status errado / mesma prioridade). Recalcula `sla.*` via `montarSnapshotSla(novaPrioridade, doc.classifiedAt)` (lido antes, com segurança, porque `classifiedAt` nunca muda); acrescenta `classificationNotes` em vez de substituir; chama `resolverDecisao` quando existir `DecisaoIa` de prioridade (`nao_encontrada` é normal); grava histórico `classificacao`; emite `ticket:classified`. Satisfaz **AC-11**, **AC-12**.
15. [x] `CorrigirPrioridadeDialog.tsx`, diálogo mínimo na gestão para chamar `updateTicketPriorityAction`, reaproveitando o padrão dos outros diálogos da tela; botão "Corrigir Prioridade" no `ChamadoDetailSheet`, visível só quando `status === 'validado' && !assignedToUserId` (mesma janela estreita da ação). Satisfaz **AC-11**.
16. [x] Testes: unitário (`gestao/__tests__/actions.test.ts`, mocks) cobrindo sucesso, acréscimo de observação, as três recusas fora da janela e a config de SLA ausente; DB test (`gestao/__tests__/update-ticket-priority.db.test.ts`) contra Mongo em container provando a atomicidade de verdade: duas correções concorrentes nunca se perdem, e uma correção concorrente com uma atribuição de técnico nunca deixa as duas aplicarem. Satisfaz **AC-11**, **AC-12**.

## Consequences

**Positive**:

- Chamados de alta confiança pulam a fila de triagem manual: o relógio do SLA contratual começa a contar no instante real da abertura, não na classificação manual.
- Reaproveita inteiramente o que a fatia anterior deixou pronto (`IaAutonomiaConfig`, `DecisaoIa.efeito`, `iaSituacao`), sem nenhuma migração de schema.
- O interruptor `autonomiaAtiva` (já existente) continua sendo o kill switch: desligar volta tudo para o caminho manual sem deploy.
- A correção mínima (marco 3) dá ao Preposto uma saída imediata se a IA errar, sem esperar a fatia 17.
- Extrair `montarSnapshotSla` remove uma duplicação futura entre classificação manual e automática, e os dois caminhos ficam garantidamente idênticos.

**Negative / tradeoffs**:

- A amostra de calibração da fatia anterior passa a medir só os casos difíceis (abaixo do limite de confiança), porque os confiantes nunca mais entram como `sugestao`. O número de acurácia pode parecer estagnado, ou até piorar, mesmo que o sistema esteja acertando mais no geral: um viés de seleção que a fatia 18 (painel de acurácia) vai precisar considerar.
- Pré-preencher a prioridade sugerida no diálogo de classificação (AC-8) introduz no campo `prioridade` o mesmo viés de concordância que já existe para `servico`; a medição às cegas de verdade acaba a partir desta fatia.
- Reforçar o prompt (AC-10) reseta a amostra de calibração da fatia anterior, que já era pequena.
- Sem a fatia 17, a única correção possível é a janela estreita do marco 3 (chamado `validado`, sem técnico atribuído); um erro percebido depois da atribuição não tem caminho nesta fatia.
- Um chamado validado sozinho ainda pode ficar sem técnico disponível por um bom tempo; a atribuição automática é a fatia 16, fora do escopo aqui.
- O deploy desliga `autonomiaAtiva` (AC-17): a fatia só passa a validar chamados sozinha de fato depois que o Admin conferir a calibração de novo e ligar o interruptor à mão, o que exige alguém lembrar de fazer isso.

**Neutral**:

- Nenhuma coleção nova; o único campo novo é `IaAutonomiaConfig.promptVersion` (AC-17), sem migração: documento antigo sem o campo já é lido com a autonomia desligada.
- `PROMPT_VERSION` sobe de valor, então decisões antigas (`promptVersion` anterior) ficam fora de qualquer medição futura que exija a versão atual, comportamento já existente e aceito desde a fatia anterior.

## Follow-up

- [ ] A fatia 16 (atribuição automática ao técnico) deve tratar um chamado `validado` com `iaSituacao: 'decidida'` do mesmo jeito que um classificado manualmente; conferir quando ela for desenhada.
- [ ] A fatia 17 (revisão das decisões da IA pelo Preposto) deve assumir a janela de correção completa, inclusive pós atribuição; a correção desta fatia (marco 3) é deliberadamente estreita.
- [ ] A fatia 18 (painel de acurácia) precisa considerar o viés de seleção descrito em Consequences: a amostra `sugestao` da calibração passa a cobrir só os casos que a IA achou difíceis.
- [ ] Se o viés de concordância em `prioridade` (agora igual ao de `servico`, por causa do AC-8) se mostrar forte demais para confiar na calibração, considerar não pré-preencher o campo, revisitando esta decisão.
- [ ] Depois do deploy, alguém (Admin) precisa voltar em `/configuracoes/ia-confianca`, conferir a calibração com a amostra nova sob o prompt atual, e ligar `autonomiaAtiva` de novo (AC-17); sem isso, esta fatia fica com o comportamento novo pronto mas inativo.
