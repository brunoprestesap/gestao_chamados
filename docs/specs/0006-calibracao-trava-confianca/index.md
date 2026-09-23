# 0006. Calibração da trava de confiança

**Date**: 2026-09-23
**Status**: Accepted

## Summary

Esta decisão cria a base de dados e a tela que medem, pela primeira vez, se a sugestão da IA (serviço e prioridade, escondida desde a spec 0004) bate com o que o Preposto realmente decidiu na classificação. A partir dessa medição, o Admin define, por campo, a partir de qual confiança declarada a IA passa a ser considerada confiável, e liga ou desliga qualquer autonomia futura quando quiser, sem precisar de um novo deploy. Nada muda no comportamento do sistema nesta fatia: nenhuma decisão passa a ser automática. O trabalho aqui é preparar o número e o interruptor que as próximas fatias (prioridade e SLA automáticos, atribuição automática ao técnico) vão consumir.

## Requirements

**User stories**:

- Como Admin, quero ver se a sugestão da IA bate com o que o Preposto decidiu de verdade, por serviço e por prioridade, para saber se a IA está perto de poder decidir sozinha algum dia.
- Como Admin, quero um número sugerido de limite de confiança baseado nesse acerto medido, mas poder digitar outro de próprio punho, para manter o controle final da decisão.
- Como Admin, quero um interruptor único que desliga qualquer autonomia futura da IA sem depender de um novo deploy, para conseguir reagir rápido se algo der errado.
- Como Admin, quero saber quando o número de serviço é menos confiável que o de prioridade, porque o Preposto vê a sugestão de serviço antes de classificar, para não usar os dois números do mesmo jeito.
- Como Preposto, Técnico ou Solicitante, não devo ver nem mexer nessa tela, porque a revisão das decisões da IA por esses perfis é assunto de uma fatia futura (17).

**Acceptance criteria** (o contrato, cada critério é identificado e verificável de forma independente):

- **AC-1**: A rota `/configuracoes/ia-confianca`, restrita ao Admin, mostra, para os campos `servico` e `prioridade`, quantas decisões da IA (`DecisaoIa` com aquele `campo`, `decididoPor: 'ia'`, `efeito: 'sugestao'`, `task` igual à `ABERTURA_TASK` de `lib/assistente/prompt.ts`, `promptVersion` igual à `PROMPT_VERSION` que está valendo agora, `confianca` não nula) já têm `revisadaEm` preenchido, ou seja, já passaram pela classificação (o veredito automático de `aplicarVeredito`, que o projeto já roda desde a spec 0002, já comparou a sugestão com a escolha real do Preposto).
- **AC-2**: Para cada campo com pelo menos a amostra mínima configurada de decisões elegíveis, a tela mostra uma tabela por corte de confiança declarada (acumulada, por exemplo `>= 1.00`, `>= 0.95`, `>= 0.90`, até `>= 0.50`), cada linha com a quantidade de decisões acima daquele corte e a porcentagem delas com `situacao: 'confirmada'` (a IA acertou, segundo o veredito da classificação); uma linha sem nenhuma decisão mostra um traço no lugar da porcentagem.
- **AC-3**: Abaixo da amostra mínima daquele campo, a tela mostra o total encontrado e um aviso de que a amostra é pequena demais para calibrar, sem tabela de cortes nem sugestão automática para aquele campo.
- **AC-4**: Com amostra suficiente, o sistema sugere automaticamente, por campo, o menor corte de confiança que atende as duas condições: acurácia acumulada maior ou igual à meta fixa de 90%, e pelo menos a amostra mínima do campo entre as decisões daquele corte específico. Sem nenhum corte que atenda as duas condições, a tela não sugere nenhum valor. O Admin pode aceitar a sugestão (quando existir) ou digitar outro valor entre 0 e 1.
- **AC-5**: Um formulário único salva, numa única gravação, o limite de confiança e a amostra mínima de cada campo (`servico`, `prioridade`) mais o interruptor global `autonomiaAtiva`; a gravação registra quem mudou por último e quando.
- **AC-6**: Antes de qualquer configuração explícita do Admin, a configuração nasce com limite de confiança `null` ("sem limite definido") em cada campo, amostra mínima `30` em cada campo, e o interruptor `autonomiaAtiva` em `false`. Um limite nulo significa autonomia impossível para aquele campo; qualquer fatia futura que ler este limite trata `null` exatamente como trataria um limite inatingível.
- **AC-7**: O limite de confiança e o interruptor ficam gravados e disponíveis para leitura, mas nenhum comportamento atual do sistema muda nesta fatia: nenhuma decisão da IA se torna automática, porque nada além desta fatia lê essa configuração ainda.
- **AC-8**: Só o Admin acessa a rota e só o Admin chama a gravação; qualquer outro perfil recebe o mesmo bloqueio que as demais rotas e Server Actions restritas a Admin do projeto já dão hoje.
- **AC-9**: A medição nunca mistura decisões do campo `tecnico` (fora do alcance desta fatia), decisões com `decididoPor` diferente de `'ia'`, `efeito` diferente de `'sugestao'`, `task` diferente da tarefa de abertura do chat, decisões gravadas com uma `PROMPT_VERSION` que não é a de agora, nem decisões cujo chamado ainda não foi classificado (`revisadaEm` ainda nulo).
- **AC-10**: Limite de confiança, quando informado, fora da faixa de 0 a 1, ou amostra mínima menor que 1, são recusados pela validação antes de gravar qualquer coisa; o campo pode ficar em branco (equivalente a `null`).
- **AC-11**: A tela mostra, só na seção do campo `servico`, um aviso fixo de que o Preposto vê a sugestão de serviço já preenchida antes de classificar, então aquele número mede concordância, não um acerto independente; a seção de `prioridade` não leva esse aviso, porque a proposta de prioridade nunca aparece pro Preposto antes da classificação.

## Decision

**Chosen option**: Opção 1: amostra viva do chat, relatório sob demanda, configuração num documento único

A calibração mede só os chamados abertos pelo chat que já têm decisão da IA e já foram classificados, lendo o veredito que a classificação já grava sozinha em `DecisaoIa.situacao` (sem precisar cruzar com o `Chamado`), calcula a acurácia ao vivo a cada carregamento da tela e guarda o limite de confiança, a amostra mínima e o interruptor de autonomia num único documento de configuração, com uma sub configuração por campo.

**Implementation skills**: `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Rationale

Raciocínio completo e as opções consideradas: veja [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

`IaAutonomiaConfig` (coleção nova, sempre um único documento):

| Campo                     | Tipo                                              | Obrigatório                         | Observação                                                                                                          |
| ------------------------- | ------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `servico`                 | subdocumento `{ limiteConfianca, amostraMinima }` | sim                                 | `limiteConfianca`: número de 0 a 1 ou `null`, padrão `null`. `amostraMinima`: número inteiro, mínimo 1, padrão `30` |
| `prioridade`              | subdocumento `{ limiteConfianca, amostraMinima }` | sim                                 | mesmos campos e mesmos padrões do serviço                                                                           |
| `autonomiaAtiva`          | booleano                                          | sim, padrão `false`                 | interruptor global; pronto pras fatias 15 e 16 lerem, nada lê ainda                                                 |
| `updatedByUserId`         | ObjectId, ref `User`                              | não, `null` até a primeira gravação | quem mudou por último                                                                                               |
| `createdAt` / `updatedAt` | Date                                              | sim                                 | timestamps padrão do Mongoose                                                                                       |

Relações: `updatedByUserId` aponta pra no máximo um `User` (0 ou 1). Nenhuma referência direta a `DecisaoIa` nem a `Chamado`; a acurácia é calculada na hora, lendo `DecisaoIa` diretamente (sem precisar do `Chamado`), sem guardar o resultado (mesmo padrão do relatório IMR em `lib/imr-service.ts`).

**State transitions**:

- `limiteConfianca` de cada campo: `null` (padrão de fábrica, autonomia impossível) até o Admin escolher um valor de propósito; depois disso, muda toda vez que o Admin salva, podendo voltar a `null` se o campo for deixado em branco.
- `autonomiaAtiva`: `false` (padrão de fábrica) alternando pra `true` e de volta conforme o Admin decide; nesta fatia, nada lê esse valor pra agir diferente.

**API surface**:

| Rota / Ação                                | Método                 | Entradas principais                                                                                                            | Saídas principais                                                                                                                                                                    | Auth                                                                          | Erros principais                                                                                                                                                                           |
| ------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/configuracoes/ia-confianca` (`page.tsx`) | GET (Server Component) | nenhuma                                                                                                                        | o relatório de calibração por campo (total elegível, tabela de cortes ou aviso de amostra insuficiente, sugestão, aviso de viés no serviço) mais a configuração atual pro formulário | `requireAdmin` (fora de qualquer `try`, redirect de verdade pra `/dashboard`) | fora do Admin, redirect, igual às demais rotas só de Admin                                                                                                                                 |
| `salvarIaAutonomiaConfigAction`            | Server Action          | `servico.limiteConfianca`, `servico.amostraMinima`, `prioridade.limiteConfianca`, `prioridade.amostraMinima`, `autonomiaAtiva` | `{ ok: true }` ou `{ ok: false, error }`                                                                                                                                             | `requireAdmin` (dentro do `try`, no mesmo padrão de `gestao/actions.ts`)      | `dados_invalidos` (Zod fora de faixa); fora do Admin, `{ ok: false, error: 'NEXT_REDIRECT' }`, o mesmo comportamento que as demais Server Actions restritas a Admin do projeto já têm hoje |

**Value sourcing** (todo valor que a tela produz, calcula ou mostra, com a origem):

| Ação      | Valor produzido / mostrado                              | Origem                                                                                                                                                                                                                                                                                                           |
| --------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| relatório | total de decisões elegíveis por campo                   | `DecisaoIaModel`, filtrando `campo`, `decididoPor: 'ia'`, `efeito: 'sugestao'`, `task` igual a `ABERTURA_TASK`, `promptVersion` igual à `PROMPT_VERSION` atual de `lib/assistente/prompt.ts`, `confianca` não nula, e `revisadaEm` não nulo                                                                      |
| relatório | se uma decisão acertou                                  | `DecisaoIa.situacao`: `'confirmada'` conta como acerto, `'corrigida'` como erro; esse valor já é calculado pelo projeto em `aplicarVeredito`/`derivarSituacao` (`lib/conversas/decisoes.ts`) toda vez que `classificarChamadoAction` roda, comparando `valorIa` com o que o Preposto escolheu de verdade         |
| relatório | linhas da tabela de cortes                              | lista fixa e literal de cortes em código (`[1, 0.95, 0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60, 0.55, 0.50]`, sem gerar por soma de ponto flutuante); por corte, filtra as decisões elegíveis com `confianca` maior ou igual ao corte e calcula a porcentagem com `situacao: 'confirmada'` entre elas             |
| relatório | linha com zero decisões naquele corte                   | mostra um traço no lugar da porcentagem; essa linha nunca pode virar a sugestão automática                                                                                                                                                                                                                       |
| relatório | sugestão automática por campo                           | o menor corte da lista cuja porcentagem de acerto acumulada é maior ou igual à meta fixa (`0.9`, constante de código, não editável pelo Admin) **e** cuja contagem própria de decisões naquele corte é maior ou igual à `amostraMinima` do campo; sem corte que bata as duas condições, nenhuma sugestão aparece |
| relatório | amostra suficiente ou não                               | comparação entre o total elegível do campo e `IaAutonomiaConfig.<campo>.amostraMinima` gravado                                                                                                                                                                                                                   |
| relatório | aviso de viés no campo `servico`                        | texto fixo de código, mostrado só na seção `servico`, porque `CAMPOS_OCULTOS` (`lib/conversas/decisoes.ts`) só esconde `prioridade` do Preposto; o serviço já chega pré preenchido no `ClassificarChamadoDialog`                                                                                                 |
| tela      | valores atuais do formulário                            | `IaAutonomiaConfig`, o documento único (criado com os padrões de fábrica na primeira leitura ou gravação, se ainda não existir)                                                                                                                                                                                  |
| tela      | linha da tabela de cortes destacada como o limite salvo | comparação entre o `limiteConfianca` salvo (quando não nulo) e os cortes fixos da tabela                                                                                                                                                                                                                         |
| gravação  | `updatedByUserId`                                       | `viewer.userId` de `requireAdmin()`                                                                                                                                                                                                                                                                              |
| gravação  | validação de faixa                                      | Zod: `limiteConfianca` nulo (campo em branco) ou número entre 0 e 1; `amostraMinima` inteiro maior ou igual a 1                                                                                                                                                                                                  |

**Key invariants**:

- Existe sempre exatamente um documento `IaAutonomiaConfig`; nunca mais de um.
- `limiteConfianca` de cada campo é `null` ou está entre 0 e 1; `amostraMinima` nunca fica abaixo de 1. Fatias futuras tratam `limiteConfianca: null` como autonomia impossível para aquele campo.
- O relatório de acurácia é sempre calculado na hora, nunca lido de um retrato gravado.
- A medição só conta decisões já revisadas pela classificação (`revisadaEm` preenchido); um chamado do chat ainda não classificado nunca entra na amostra.
- A medição nunca mistura decisões de `PROMPT_VERSION` diferente da que está valendo agora; mudar o prompt reseta a amostra usada na medição.
- Nenhuma decisão de `campo: 'tecnico'`, `decididoPor: 'regra'`, `efeito` diferente de `'sugestao'` ou `task` diferente da tarefa de abertura do chat entra na medição.
- O acerto de `servico` é medido, mas com viés conhecido e avisado na tela (o Preposto vê a sugestão antes de classificar); só o de `prioridade` é às cegas de verdade, porque `prioridade` é o único campo em `CAMPOS_OCULTOS`.
- Uma falha silenciosa de `aplicarVeredito` (ele é best effort, registra e segue sem lançar) deixa `revisadaEm` nulo num chamado já classificado; essa decisão simplesmente não entra na amostra, o que sub-conta, nunca conta errado.
- Nesta fatia, nenhum outro código do projeto lê `IaAutonomiaConfig`; a configuração fica pronta, mas inerte.

**Security model**:

- Leitura e escrita restritas ao Admin (`requireAdmin()` da DAL), tanto na página quanto na Server Action. A página segue o padrão de redirect de verdade; a Server Action segue o mesmo padrão de `classificarChamadoAction` e as demais actions de `gestao/actions.ts` (o guard fica dentro do `try`, então quem chama sem ser Admin recebe `{ ok: false, error: 'NEXT_REDIRECT' }`, não um redirect real na resposta da action). É o comportamento consistente com o resto do projeto, não uma escolha nova desta fatia.
- A tela não mostra texto de relato, de resposta da IA nem nenhum dado pessoal do solicitante; só contagens, confiança declarada e o resultado do veredito (acertou ou não).
- Nenhuma mudança de escopo de LGPD: a medição não lê nem grava texto de conversa, só campos já estruturados de `DecisaoIa`.

**Critical test scenarios** (cada um mapeia pra um critério de aceitação em `## Requirements`):

- Caminho feliz: com amostra suficiente e um grupo misto de decisões `confirmada`/`corrigida`, a tabela de cortes mostra as contagens e as porcentagens certas (respeitando a amostra mínima do próprio corte pra sugerir), e a sugestão aponta o menor corte que bate as duas condições; salvar o valor sugerido grava o documento e o relatório seguinte mostra a linha correspondente destacada. Verifica **AC-1**, **AC-2**, **AC-4**, **AC-5**.
- Amostra insuficiente: com menos decisões elegíveis do que a amostra mínima de um campo, a tela mostra o total encontrado e o aviso, sem tabela nem sugestão; o Admin ainda consegue salvar um valor manual pra aquele campo. Verifica **AC-3**.
- Nenhum corte atinge a meta: com acurácia sempre abaixo de 90%, ou só o corte mais alto com poucas decisões próprias (abaixo da amostra mínima), a tela não sugere nenhum valor. Verifica **AC-4**.
- Primeira carga: sem nenhum documento `IaAutonomiaConfig` no banco, a primeira leitura ou gravação cria um com os padrões de fábrica (`null`, `30`, `false`). Verifica **AC-6**.
- Autorização: Preposto, Técnico e Solicitante tentando abrir `/configuracoes/ia-confianca` recebem o redirect de sempre; chamando `salvarIaAutonomiaConfigAction` recebem `{ ok: false, error: 'NEXT_REDIRECT' }`, o mesmo comportamento das demais Server Actions só de Admin. Verifica **AC-8**.
- Filtro da amostra: uma decisão de campo `tecnico`, uma com `decididoPor: 'regra'`, uma com `efeito: 'aplicado'`, uma de outra `task`, uma gravada com `PROMPT_VERSION` antiga, e uma sem `revisadaEm` (chamado ainda não classificado) nunca entram na contagem nem na tabela. Verifica **AC-1**, **AC-9**.
- Validação: enviar `limiteConfianca: 1.5` ou `amostraMinima: 0` é recusado sem gravar nada; deixar o campo em branco grava `null` normalmente. Verifica **AC-10**.
- Viés de serviço: a tela mostra o aviso fixo na seção `servico` e não mostra nenhum aviso na seção `prioridade`. Verifica **AC-11**.

## Build plan

Ordem por **Tracer Bullet**: o marco 1 sobe um fio fino do documento de configuração até a tela salvando de ponta a ponta; o marco 2 engrossa o relatório com a tabela de cortes, a sugestão automática e o aviso de viés.

**Marco 1: fio fino, configuração de ponta a ponta**

1. [x] Criar `models/IaAutonomiaConfig.ts` (documento único, sub configuração `servico` e `prioridade`, cada uma com `limiteConfianca` padrão `null` e `amostraMinima` padrão `30`, mais `autonomiaAtiva` padrão `false` e `updatedByUserId`) e `lib/ia-confianca/config.ts` com `lerConfig()` e `salvarConfig()` (upsert do único documento, com uma chave fixa tipo `{ chave: 'global' }` e índice único, pra duas cargas concorrentes nunca criarem dois documentos). Satisfaz **AC-6**.
2. [x] Criar `lib/ia-confianca/calibragem.ts`: a consulta que lê `DecisaoIa` direto (por `campo`, `decididoPor: 'ia'`, `efeito: 'sugestao'`, `task: ABERTURA_TASK`, `promptVersion` igual à `PROMPT_VERSION` atual, `confianca` não nula, `revisadaEm` não nulo) e devolve, por campo, o total elegível e a lista de pares confiança/`situacao`, sem precisar cruzar com `Chamado`. Satisfaz **AC-1**, **AC-9**.
3. [x] `/configuracoes/ia-confianca/page.tsx` (`requireAdmin`, fora de qualquer `try`) mais um item novo em `components/dashboard/nav.ts` (`group: 'Admin'`, `allowedRoles: ['Admin']`): fio fino mostrando o total elegível por campo e o formulário de configuração (ainda sem tabela de cortes), lendo `lerConfig()`. `salvarIaAutonomiaConfigAction` (Zod: `limiteConfianca` nulo ou de 0 a 1, `amostraMinima` inteiro maior ou igual a 1; `requireAdmin` dentro do `try`, no mesmo padrão do resto do projeto) grava com `salvarConfig()` e chama `revalidatePath('/configuracoes/ia-confianca')`. Satisfaz **AC-5**, **AC-6**, **AC-8**, **AC-10**.

**Marco 2: relatório completo**

4. [x] Engrossar o relatório em `lib/ia-confianca/calibragem.ts`: tabela de cortes de confiança acumulados (lista literal fixa em `lib/ia-confianca/config.ts`, de `1.00` a `0.50` em passos de `0.05`, sem gerar por soma de ponto flutuante) com contagem e porcentagem de acerto por corte (traço quando a contagem é zero); aviso de amostra insuficiente abaixo de `amostraMinima`; sugestão automática do menor corte que bate a meta fixa de `0.9` **e** tem contagem própria maior ou igual à `amostraMinima`; aviso fixo de viés só na seção `servico`. Satisfaz **AC-2**, **AC-3**, **AC-4**, **AC-11**.
5. [x] Conferir, por busca no repositório, que nada além desta fatia lê `IaAutonomiaConfig` ainda, e registrar no `## Follow-up` que as fatias 15 e 16 são quem vai consumir o limite e o interruptor quando existirem, tratando `limiteConfianca: null` como autonomia impossível. Satisfaz **AC-7**.
6. [x] Testes: `lib/ia-confianca/__tests__/calibragem.db.test.ts` contra Mongo em container (acerto, erro, amostra insuficiente, nenhum corte atinge a meta, filtro de campo `tecnico`, de `decididoPor: 'regra'`, de `efeito: 'aplicado'`, de `task` diferente, de `promptVersion` antiga, e de `revisadaEm` nulo); teste de validação Zod da Server Action (incluindo limite em branco); teste de autorização da rota (redirect) e da ação (`NEXT_REDIRECT`) pros quatro perfis; teste do aviso de viés só na seção `servico`. Satisfaz **AC-1** a **AC-11**.

## Consequences

**Positive**:

- Pela primeira vez existe um número medido, não uma opinião, sobre se a IA acerta serviço e prioridade; é a base que as fatias 15 a 18 precisam pra existir.
- Reaproveita o veredito que o projeto já grava sozinho desde a spec 0002 (`aplicarVeredito`/`DecisaoIa.situacao`), sem precisar cruzar com `Chamado` nem reinventar a comparação.
- O Admin ganha um interruptor de autonomia pronto pra usar antes mesmo de qualquer decisão automática existir, então nunca há uma janela em que a autonomia liga sem alguém poder desligá-la sem deploy.
- Reaproveita o padrão já usado no relatório IMR (uma agregação sob demanda, sem job novo nem coleção de retrato), sem infraestrutura nova.

**Negative / tradeoffs**:

- A amostra de hoje é pequena (dezenas de chamados do chat), então a calibração provavelmente fica presa em "amostra insuficiente" por um tempo, até mais chamados passarem pelo chat e serem classificados.
- O acerto de `servico` carrega um viés conhecido: o Preposto vê a sugestão pré preenchida antes de classificar, então o número mede concordância, não um julgamento independente. A tela avisa, mas o viés continua lá; só `prioridade` é medida às cegas de verdade.
- Medir só contra chamados do chat ignora todo o histórico de chamados abertos pelo formulário; se o volume pelo chat crescer devagar, a calibração demora a ficar confiável.
- Mudar o texto do prompt (uma `PROMPT_VERSION` nova) zera a amostra usada na medição; uma melhoria no prompt tem esse custo, perder o histórico de acerto até juntar amostra nova.
- `aplicarVeredito` é best effort; uma falha rara dele deixa um chamado classificado sem `revisadaEm`, e essa decisão nunca entra na amostra (sub-contagem segura, nunca contagem errada, mas ainda uma perda silenciosa de dado).
- O limite de confiança e o interruptor ficam gravados, mas nada os lê ainda: é trabalho sem efeito visível no sistema até a fatia 15 ou 16 chegar.

**Neutral**:

- Uma coleção nova, um documento só, nenhuma migração de dado existente.
- A tela não guarda nem mostra tendência ao longo do tempo; isso é escopo explícito da fatia 18.

## Follow-up

- [ ] Se o viés de concordância do serviço se mostrar forte demais pra confiar no número medido (por exemplo, acurácia de serviço sempre perto de 100% mesmo quando o relato é ambíguo), considerar esconder a sugestão de serviço também na classificação numa fatia futura, e recalibrar a partir daí.
- [ ] Quando a fatia 16 (atribuição automática ao técnico) for desenhada, decidir se o campo `tecnico` ganha sua própria sub configuração no mesmo `IaAutonomiaConfig` ou um modelo à parte.
- [ ] As fatias 15 e 16 devem ler `IaAutonomiaConfig.autonomiaAtiva` e o `limiteConfianca` do campo correspondente antes de agir sozinhas, tratando `null` como autonomia impossível para aquele campo; registrar isso explicitamente nas specs delas quando forem desenhadas.
- [ ] A fatia 17 (revisão das decisões da IA pelo Preposto) é quem vai dar ao Preposto acesso de leitura às decisões da IA; nada nesta fatia antecipa isso.
- [ ] A fatia 18 (painel de acurácia) é quem deve guardar tendência histórica; considerar se ela reaproveita `lib/ia-confianca/calibragem.ts` ou herda um formato de snapshot próprio.
- [ ] Se o volume de chamados pelo chat crescer devagar, considerar ampliar a amostra reprocessando chamados antigos do formulário pela IA (a Opção 2 desta decisão, ver `rationale.md`), quando fizer sentido custear as chamadas extras ao vLLM.
