# 0002. Conversa e decisões da IA no banco

**Date**: 2026-09-17
**Status**: Accepted

## Summary

O Sigma passa a guardar a conversa do solicitante antes de o chamado existir e a registrar cada decisão da IA de um jeito que dá para auditar e medir. A conversa nasce como rascunho do dono, recebe mensagens do solicitante e da IA e, na confirmação, passa a pertencer ao chamado criado, sem transação no banco e sem risco de nascerem dois chamados do mesmo relato. Cada campo decidido pela IA (serviço, prioridade e técnico) vira um registro com o valor, a confiança, o motivo em uma frase, o modelo usado e a lista de correções humanas. Depois da abertura nada é duplicado: a tela junta as mensagens da conversa, os comentários e o histórico do chamado na hora da leitura.

## Requirements

**User stories**:

- Como solicitante, quero relatar o problema em uma conversa que continua existindo se eu fechar a tela, para retomar depois sem digitar tudo de novo.
- Como solicitante, quero que a conversa vire meu chamado ao confirmar, para não repetir o relato no formulário.
- Como Preposto, quero ver o que a IA decidiu, com que confiança e por quê, para confiar ou corrigir na triagem.
- Como Admin, quero que toda correção humana fique ligada à decisão original, para medir o acerto da IA por campo e calibrar a trava de confiança.
- Como técnico, quero ler o relato original e as respostas às perguntas da IA, para chegar ao local sabendo o que encontrar.
- Como responsável pelos dados, quero que relato que nunca virou chamado suma sozinho, para não guardar dado pessoal sem finalidade.

**Acceptance criteria**:

- **AC-1**: `criarConversa` cria um rascunho cujo dono é o usuário da sessão, já com `ultimaMensagemEm` igual ao `createdAt` e `expiresAt` 30 dias à frente, antes de existir qualquer mensagem. `enviarMensagem` grava uma mensagem com autor (`solicitante`, `ia` ou `sistema`), tipo, texto de 1 a 2.000 caracteres e `payload` validado pelo schema Zod daquele tipo, e atualiza `previa`, `ultimaMensagemEm` e `mensagensCount` na conversa. O sexto rascunho ativo do mesmo usuário falha como `limite_rascunhos` sem criar nada, e a trigésima primeira mensagem de um rascunho falha como `limite_mensagens` sem gravar nada. O teto de 30 vale só enquanto a conversa é rascunho: depois do vínculo, mensagem de autor `ia` ou `sistema` nunca é barrada por ele, e `mensagensCount` continua sendo contado sem virar limite.
- **AC-2**: Enquanto a conversa é rascunho, ela e todas as suas mensagens têm `expiresAt` igual a `ultimaMensagemEm` mais 30 dias, renovado a cada mensagem nova, e as duas coleções têm índice TTL em `expiresAt`. Ao reservar a conversa para virar chamado, `expiresAt` vira `null` na conversa e nas mensagens e nunca volta. `descartarRascunho` apaga a conversa e suas mensagens na hora, e só o dono pode descartar.
- **AC-3**: `abrirChamadoDaConversa` executa, nesta ordem: (1) reserva a conversa em uma única gravação condicional (`findOneAndUpdate` filtrando `_id`, `solicitanteId`, `chamadoId` nulo e `vinculandoEm` nulo ou com mais de 2 minutos, gravando `vinculandoEm`, preservando o `chamadoIdReservado` já existente ou gerando um novo, e zerando `expiresAt` na conversa e nas mensagens); (2) grava as decisões com esse `chamadoId`; (3) cria o chamado com `_id` igual ao id reservado, `conversaId`, `canalAbertura: 'chat'`, `iaSituacao` derivada e o número gerado por `generateTicketNumber()`; (4) grava o histórico (uma entrada `abertura` e uma `decisao_ia` por decisão); (5) liga a conversa ao chamado gravando `chamadoId`, `expiresAt: null` e `vinculandoEm: null` na mesma operação. Os passos 2 e 5 só valem se o `chamadoIdReservado` no banco ainda for o mesmo da reserva. Devolve `{ ok: true, chamadoId, ticketNumber, jaExistia }`.
- **AC-4**: Duas confirmações da mesma conversa nunca criam dois chamados. A gravação condicional da reserva recusa a segunda com `confirmacao_em_andamento` enquanto a primeira corre, e mesmo que duas cheguem ao passo 3, o índice único parcial em `Chamado.conversaId` (ou o `_id` reservado) devolve erro de chave duplicada, que a função trata buscando o chamado já existente e devolvendo o mesmo `chamadoId` com `jaExistia: true`. Chave duplicada em `ticket_number` não é esse caso: gera outro número e tenta de novo, até 3 vezes. Qualquer outra exceção vira `{ ok: false, reason: 'erro' }` com log, nunca exceção para quem chamou.
- **AC-5**: Falha depois de o chamado existir não perde dado: a próxima confirmação, a próxima leitura da conversa ou `listarRascunhos` completam as entradas de histórico que faltam e o vínculo, sem duplicar nada. Se o chamado reservado não existe e a reserva tem mais de 2 minutos, a conversa volta a ser rascunho (a expiração é restaurada na conversa e nas mensagens, `vinculandoEm` volta a nulo) e as decisões órfãs daquele id reservado são apagadas. A limpeza também é condicional ao mesmo `chamadoIdReservado`, então um processo lento que ressurge não grava por cima de um reparo já feito: ele encontra a condição falsa, desiste, e o reparo seguinte refaz o caminho pelo estado do banco.
- **AC-6**: Cada decisão grava `campo` (`servico`, `prioridade` ou `tecnico`), `decididoPor` (`ia` ou `regra`), `efeito` (`sugestao` ou `aplicado`), `valorIa` com o rótulo lido do banco no momento, `valorFinal` igual ao `valorIa`, `motivo` de 1 a 200 caracteres e `situacao` `sem_revisao`. Com `decididoPor: 'ia'`, também grava `confianca` entre 0 e 1, `modelo`, `promptVersion`, `task` e `llmCallId`; com `regra`, esses cinco campos ficam `null`. O par `{ chamadoId, campo }` é único, e registrar uma segunda decisão para o mesmo campo falha como `ja_existe`.
- **AC-7**: Todo id vindo do modelo é conferido no banco antes de qualquer gravação: `catalogServiceId` existe e pertence ao `subtypeId` informado, `tecnicoId` é um usuário com perfil Técnico, e `prioridade` está no enum. Um valor reprovado falha como `invalida`, sem criar chamado, decisão ou histórico.
- **AC-8**: Quando o valor confirmado pelo solicitante difere do que a IA propôs, a decisão nasce com uma correção `origem: 'solicitante'` (valor anterior, valor novo, usuário e data), `valorFinal` igual ao confirmado e `situacao` `corrigida`.
- **AC-9**: `resolverDecisao` aplica o veredito da gestão: valor igual ao `valorFinal` preenche `revisadaEm` e `revisadaPorUserId` sem criar correção; valor diferente acrescenta uma correção `origem: 'gestao'` e troca o `valorFinal`. A `situacao` passa a ser `corrigida` quando o `valorFinal` difere do `valorIa` e `confirmada` quando é igual, inclusive quando um segundo gestor volta ao valor da IA. `classificarChamadoAction` resolve `servico` e `prioridade`, `assignTicketAction` resolve `tecnico` e `reassignTicketAction` registra correção de `tecnico`, e o `Chamado.iaSituacao` passa a `revisada`. Cada gancho confere antes se existe decisão para aquele chamado e sai em silêncio quando não existe, que é o caso da maioria dos chamados, abertos por formulário.
- **AC-10**: Uma falha ao gravar o veredito nunca quebra a ação da gestão: classificar, atribuir e reatribuir continuam devolvendo `{ ok: true }`, e o erro sai em `console.error` com o prefixo `[conversa]`, o id do chamado e o campo, nunca com texto de relato. Chamado sem decisão não é falha e não gera log.
- **AC-11**: O histórico registra `decisao_ia` (ator `ia` quando `decididoPor` é `ia`, `sistema` quando é `regra`, sem usuário) e `correcao_ia` (ator `usuario`, com o usuário que corrigiu), as duas com `decisaoIaId`. O `observacoes` de `decisao_ia` traz o campo e o rótulo do valor da IA; o de `correcao_ia` traz o campo e os dois rótulos, o anterior e o novo. Nenhum dos dois traz confiança nem motivo. Os leitores do histórico aceitam entrada sem usuário e mostram "IA" ou "Sistema", e o schema do `ChamadoHistory` exige `userId` por função quando `actorType` é `usuario`.
- **AC-12**: `lerLinhaDoTempo` devolve, em ordem de data e `_id`, as mensagens da conversa, os comentários e os eventos de histórico do chamado, já filtrados pelo perfil de quem lê: comentário interno só para gestão e para o técnico atribuído. As entradas `decisao_ia` e `correcao_ia` aparecem para todos que podem ver o chamado, com o mesmo texto sem confiança e sem motivo do AC-11; só o detalhe da decisão fica restrito. O retorno traz no máximo 300 itens por fonte, sempre os mais recentes, e marca `truncado: true` quando corta.
- **AC-13**: Mensagem de autor `solicitante` numa conversa já ligada a um chamado é gravada como comentário público pelo caminho compartilhado (comentário, histórico `comentario`, notificação e emissão para o socket), e a função devolve `{ ok: true, destino: 'comentario', id }`. Mensagens de autor `ia` ou `sistema` continuam sendo gravadas na conversa.
- **AC-14**: Rascunho só é lido, escrito ou descartado pelo dono, nem o Admin lê. Conversa ligada é lida pelo solicitante, pelo Preposto, pelo Admin e pelo técnico atribuído no momento. As decisões (confiança, motivo e correções) são lidas só por Preposto e Admin. Toda função recebe o usuário e o perfil da sessão verificada, nunca do corpo do pedido, e quem não tem direito recebe `sem_permissao` sem saber se a conversa existe.
- **AC-15**: `LlmMeta` ganha `callId`: `lib/llm` gera o `ObjectId` antes da chamada, usa esse valor como `_id` do `LlmCall` e devolve em `meta.callId`, inclusive nas falhas com `meta`. As chamadas feitas dentro de uma conversa usam `ref: { type: 'conversa', id }` e as feitas sobre um chamado usam `ref: { type: 'chamado', id }`.
- **AC-16**: Os testes que dependem do banco de verdade rodam contra um MongoDB em container, ligados por variável de ambiente, e provam: o índice único de `Chamado.conversaId` barrando o segundo chamado, o índice único `{ chamadoId, campo }`, a existência dos índices TTL nas duas coleções da conversa, o reparo do vínculo interrompido e duas correções simultâneas da mesma decisão sem perder nenhuma.

## Decision

**Chosen option**: Opção 1: conversa própria, mensagens em coleção separada, decisões por campo e leitura combinada

A conversa vira uma entidade própria (`Conversa` mais `ConversaMensagem`) que existe antes do chamado e passa a pertencer a ele na confirmação, com o id guardado e único nos dois lados. Cada campo que a IA decide vira um documento `DecisaoIa` com valor, confiança, motivo, modelo e lista de correções. Depois da abertura nada é copiado: o que o solicitante escreve vai para o comentário que já existe, e a tela lê as três fontes juntas.

## Rationale

Raciocínio e opções: veja [rationale.md](rationale.md).

## Feature design

**Módulo** (`lib/conversas/`, todo arquivo com `import 'server-only'`):

| Arquivo               | Responsabilidade                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `config.ts`           | Constantes: 30 dias de rascunho, 2.000 caracteres, 30 mensagens, 5 rascunhos, 2 minutos de reserva, 300 itens por fonte |
| `types.ts`            | Tipos de entrada e saída e a união de motivos de falha                                                                 |
| `conversa-store.ts`   | `criarConversa`, `enviarMensagem`, `lerConversa`, `listarRascunhos`, `descartarRascunho`, reserva e reparo             |
| `abertura.ts`         | `abrirChamadoDaConversa` (os seis passos do AC-3, todos repetíveis sem efeito duplo)                                    |
| `decisoes.ts`         | `registrarDecisao`, `resolverDecisao`, `lerDecisoes` e a derivação de `situacao` e de `Chamado.iaSituacao`             |
| `linha-do-tempo.ts`   | `lerLinhaDoTempo`, a leitura combinada com a regra de visibilidade                                                     |
| `index.ts`            | Único ponto de entrada das funcionalidades                                                                             |
| `shared/conversas/`   | Schemas Zod compartilhados: tipos de mensagem e `payload` por tipo, valor da decisão, motivos de falha                 |
| `lib/chamados/comentarios.ts` | Núcleo do comentário extraído de `addCommentAction` (comentário, histórico, notificação e socket), usado pelos dois caminhos |

**Data model sketch**

`Conversa` (coleção `conversas`, `timestamps: true`):

| Campo              | Tipo                 | Obrigatório        | Observação                                                          |
| ------------------ | -------------------- | ------------------ | ------------------------------------------------------------------- |
| `_id`              | ObjectId             | sim                | chave primária                                                      |
| `solicitanteId`    | ObjectId, ref `User` | sim                | dono, vem da sessão verificada                                      |
| `chamadoId`        | ObjectId, ref `Chamado` | não, `null`     | gravado uma única vez, no vínculo                                   |
| `chamadoIdReservado` | ObjectId           | não, `null`        | id gerado na reserva e reusado em toda repetição da confirmação     |
| `vinculandoEm`     | Date                 | não, `null`        | marca a reserva em andamento                                        |
| `previa`           | String até 120       | não, `''`          | começo da primeira mensagem do solicitante, para a lista lateral    |
| `mensagensCount`   | Number               | sim, 0             | incrementado na mesma gravação que aplica o teto de 30              |
| `ultimaMensagemEm` | Date                 | sim                | ordena a lista lateral                                              |
| `expiresAt`        | Date                 | não, `null`        | `ultimaMensagemEm` mais 30 dias enquanto é rascunho                 |
| `createdAt`, `updatedAt` | Date           | sim                |                                                                     |

Índices: `{ solicitanteId: 1, chamadoId: 1, ultimaMensagemEm: -1 }`; `{ expiresAt: 1 }` com `expireAfterSeconds: 0`; `{ chamadoId: 1 }` único parcial (`partialFilterExpression: { chamadoId: { $type: 'objectId' } }`).

`ConversaMensagem` (coleção `conversamensagens`, `timestamps: { createdAt: true, updatedAt: false }`):

| Campo        | Tipo                                   | Obrigatório               | Observação                                                      |
| ------------ | -------------------------------------- | ------------------------- | --------------------------------------------------------------- |
| `conversaId` | ObjectId, ref `Conversa`               | sim                       |                                                                 |
| `autor`      | enum `solicitante`, `ia`, `sistema`    | sim                       |                                                                 |
| `userId`     | ObjectId, ref `User`                   | só com autor `solicitante` | `null` nos outros autores                                       |
| `tipo`       | String, enum de `shared/conversas/`    | sim                       | a fundação traz `texto`; a funcionalidade 12 acrescenta outros  |
| `texto`      | String de 1 a 2.000                    | sim                       | também é o texto lido por leitor de tela                        |
| `payload`    | Mixed                                  | não, `null`               | validado pelo schema Zod do `tipo` antes de gravar              |
| `llmCallId`  | ObjectId, ref `LlmCall`                | não, `null`               | quando a mensagem veio de uma chamada ao modelo                 |
| `expiresAt`  | Date                                   | não, `null`               | acompanha a conversa                                            |
| `createdAt`  | Date                                   | sim                       |                                                                 |

Índices: `{ conversaId: 1, createdAt: 1, _id: 1 }`; `{ expiresAt: 1 }` com `expireAfterSeconds: 0`.

`DecisaoIa` (coleção `decisoesia`, `timestamps: true`):

| Campo                    | Tipo                                                | Obrigatório         | Observação                                                          |
| ------------------------ | --------------------------------------------------- | ------------------- | ------------------------------------------------------------------- |
| `chamadoId`              | ObjectId, ref `Chamado`                             | sim                 | único junto com `campo`                                             |
| `conversaId`             | ObjectId, ref `Conversa`                            | não, `null`         | vazio quando a decisão veio fora de uma conversa                    |
| `campo`                  | enum `servico`, `prioridade`, `tecnico`             | sim                 |                                                                     |
| `decididoPor`            | enum `ia`, `regra`                                  | sim                 |                                                                     |
| `efeito`                 | enum `sugestao`, `aplicado`                         | sim                 | `sugestao` espera a triagem; `aplicado` já valeu sem humano         |
| `valorIa`                | subdoc `ValorDecisao`                               | sim                 | nunca muda depois de gravado                                        |
| `valorFinal`             | subdoc `ValorDecisao`                               | sim                 | começa igual ao `valorIa`                                           |
| `confianca`              | Number de 0 a 1                                     | só com `ia`         | `null` com `regra`                                                  |
| `motivo`                 | String de 1 a 200                                   | sim                 | uma frase                                                           |
| `modelo`, `promptVersion`, `task` | String                                     | só com `ia`         | vêm de `LlmResult.meta`                                             |
| `llmCallId`              | ObjectId, ref `LlmCall`                             | só com `ia`         | o `LlmCall` expira em 365 dias, o elo pode ficar sem destino        |
| `correcoes[]`            | lista até 20 (`$slice: -20`)                        | não, `[]`           | `anterior`, `novo` (`ValorDecisao`), `userId`, `origem` (`solicitante` ou `gestao`), `motivo` até 500, `em` |
| `revisadaEm`             | Date                                                | não, `null`         | último veredito da gestão                                           |
| `revisadaPorUserId`      | ObjectId, ref `User`                                | não, `null`         |                                                                     |
| `situacao`               | enum `sem_revisao`, `confirmada`, `corrigida`       | sim                 | derivada na mesma gravação que muda `valorFinal` ou `revisadaEm`    |

`ValorDecisao` (subdocumento sem `_id`, campos preenchidos conforme o `campo`): `catalogServiceId`, `subtypeId`, `tipoServico`, `prioridade`, `tecnicoId` e `rotulo` (String até 160, o nome exibido no momento da gravação).

Índices: `{ chamadoId: 1, campo: 1 }` único; `{ situacao: 1, campo: 1, createdAt: -1 }`.

Mudanças em coleções existentes:

| Coleção          | Mudança                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Chamado`        | `conversaId` (ObjectId, `null`, índice único parcial), `canalAbertura` (enum `formulario`, `chat`, padrão `formulario`), `iaSituacao` (enum `sem_ia`, `sugerida`, `decidida`, `revisada`, padrão `null`) e índice `{ iaSituacao: 1, status: 1, createdAt: -1 }` parcial |
| `ChamadoHistory` | `userId` passa a opcional com obrigatoriedade condicional no próprio schema (`required` por função: exigido quando `actorType` é `usuario`), `actorType` (enum `usuario`, `ia`, `sistema`, padrão `usuario`), `decisaoIaId` (ObjectId, `null`), ações novas `decisao_ia` e `correcao_ia` em `CHAMADO_HISTORY_ACTIONS` |
| `lib/llm`        | `LlmMeta.callId`, com o mesmo valor no `_id` do `LlmCall`                                                                                                                 |

Relações: `User` 1:N `Conversa` · `Conversa` 1:N `ConversaMensagem` · `Conversa` 0..1 : 0..1 `Chamado` (id nos dois lados, único nos dois) · `Chamado` 1:N `DecisaoIa`, no máximo uma por campo · `DecisaoIa` N:0..1 `LlmCall` · `ChamadoHistory` N:0..1 `DecisaoIa`.

Migração: os três modelos novos e os campos novos nos dois existentes entram pelo próprio Mongoose, que cria os índices ao subir (o projeto não desliga `autoIndex`). Documento antigo lê `canalAbertura` como `formulario` pelo padrão do Mongoose e `iaSituacao` como `null`; consulta com `lean()` ou `aggregate` precisa tratar o campo ausente, porque aí o padrão não é aplicado.

**State transitions**

- Conversa: `rascunho` (tem `expiresAt`) → `reservada` (`vinculandoEm` e `chamadoIdReservado` preenchidos, sem expiração) → `vinculada` (`chamadoId` preenchido, definitivo). De `reservada` volta a `rascunho` quando a reserva passa de 2 minutos e o chamado reservado não existe. `rascunho` também sai por descarte do dono ou por expiração, os dois apagando conversa e mensagens.
- Decisão: `sem_revisao` → `confirmada` (gestão revisou e o `valorFinal` é o da IA) ou `corrigida` (`valorFinal` diferente do `valorIa`, por correção do solicitante ou da gestão). De `corrigida` volta a `confirmada` se uma correção seguinte devolve o valor da IA. `valorIa`, `confianca`, `motivo` e os campos de modelo nunca mudam.
- Chamado: `iaSituacao` nasce `sem_ia` (abertura pelo chat sem nenhuma decisão), `sugerida` (só decisões com `efeito: 'sugestao'`) ou `decidida` (alguma decisão com `efeito: 'aplicado'`), e passa a `revisada` no primeiro veredito da gestão.

**API surface** (funções de servidor; esta fundação não cria rota HTTP. `viewer` é sempre `{ userId, role }` da sessão verificada):

| Função                     | Entradas principais                                                                                              | Saídas                                          | Auth                              | Erros principais                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| `criarConversa`            | `viewer`                                                                                                         | `conversaId`                                    | sessão                            | `limite_rascunhos`                                                      |
| `enviarMensagem`           | `viewer`, `conversaId`, `autor`, `tipo`, `texto`; `payload`, `llmCallId` (opcionais)                             | `destino` (`conversa` ou `comentario`), `id`    | dono; `ia` e `sistema` só servidor | `nao_encontrada`, `sem_permissao`, `limite_mensagens`, `invalida`       |
| `lerConversa`              | `viewer`, `conversaId`                                                                                           | conversa, mensagens, situação                   | dono; ligada: gestão e técnico    | `nao_encontrada`, `sem_permissao`                                       |
| `listarRascunhos`          | `viewer`                                                                                                         | rascunhos do dono com `previa`, data e marca `confirmando` | dono                   | nenhum                                                                  |
| `descartarRascunho`        | `viewer`, `conversaId`                                                                                           | `{ ok: true }`                                  | dono                              | `nao_encontrada`, `sem_permissao`, `confirmacao_em_andamento`           |
| `abrirChamadoDaConversa`   | `viewer`, `conversaId`, `dadosChamado` (sem `_id`, sem número), `decisoes[]`                                     | `chamadoId`, `ticketNumber`, `jaExistia`        | dono                              | `nao_encontrada`, `sem_permissao`, `confirmacao_em_andamento`, `invalida`, `erro` |
| `registrarDecisao`         | `chamadoId`, `campo`, `decididoPor`, `efeito`, `valorIa`, `motivo`; `conversaId`, `confianca`, `meta` (opcionais) | `decisaoId`                                     | só código de servidor             | `ja_existe`, `invalida`                                                 |
| `resolverDecisao`          | `chamadoId`, `campo`, `valor`, `viewer`, `origem`; `motivo` (opcional)                                           | `situacao`, `houveCorrecao`                     | Preposto ou Admin                 | `nao_encontrada`, `sem_permissao`, `invalida`                           |
| `lerDecisoes`              | `viewer`, `chamadoId`                                                                                            | decisões com confiança, motivo e correções      | Preposto ou Admin                 | `sem_permissao`                                                         |
| `lerLinhaDoTempo`          | `viewer`, `chamadoId`                                                                                            | itens em ordem, `truncado`                      | solicitante, gestão, técnico      | `nao_encontrada`, `sem_permissao`                                       |

- Motivos de falha da união: `nao_encontrada`, `sem_permissao`, `limite_rascunhos`, `limite_mensagens`, `confirmacao_em_andamento`, `ja_existe`, `invalida` e `erro` (exceção inesperada, sempre registrada em log e nunca repassada como exceção).
- `listarRascunhos` inclui a conversa com reserva em andamento, marcada como `confirmando`, e roda o reparo do AC-5 no caminho, para uma reserva travada não sumir da vista do dono.

**Value sourcing**

| Ação                     | Valor produzido ou exibido                | Origem                                                                                                                       |
| ------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `criarConversa`          | `solicitanteId`                           | `viewer.userId`, da sessão verificada, nunca do corpo                                                                        |
| idem                     | `ultimaMensagemEm` inicial                | o próprio `createdAt` da conversa, antes de existir mensagem                                                                 |
| idem                     | `expiresAt`                               | derivado: `ultimaMensagemEm` mais `CONVERSA_RASCUNHO_DIAS` (30), constante de `lib/conversas/config.ts`                       |
| `enviarMensagem`         | `previa`                                  | derivado: primeiros 120 caracteres da primeira mensagem de autor `solicitante`                                               |
| idem                     | `mensagensCount`, teto de 30              | contador do próprio documento, incrementado na mesma condição da gravação                                                    |
| idem                     | `payload` aceito                          | schema Zod do `tipo` em `shared/conversas/`; a fundação registra `texto` com `payload` nulo                                  |
| idem                     | `llmCallId`                               | `meta.callId` do `LlmResult` que gerou a mensagem                                                                            |
| `abrirChamadoDaConversa` | `chamadoIdReservado`                      | `ObjectId` novo, gerado na reserva e guardado; toda repetição reusa o mesmo                                                   |
| idem                     | `ticket_number`                           | `generateTicketNumber()` de `lib/chamado-utils.ts`, o mesmo do formulário; ele não é atômico, então chave duplicada gera outro número, até 3 tentativas |
| idem                     | `jaExistia`                               | derivado: verdadeiro quando o chamado do id reservado já existia, seja por erro de chave duplicada no passo 3, seja por repetição depois de falha |
| idem                     | `canalAbertura`                           | fixo `chat` nesta função                                                                                                     |
| idem                     | `iaSituacao`                              | derivado das decisões: nenhuma decisão é `sem_ia`; alguma `aplicado` é `decidida`; só `sugestao` é `sugerida`                |
| idem                     | demais campos do chamado                  | `dadosChamado`, montado pela funcionalidade 12 (unidade do perfil, local do texto, catálogo escolhido)                        |
| `registrarDecisao`       | `valorIa.rotulo`                          | leitura no banco na hora: nome do serviço do catálogo, rótulo da prioridade ou nome do técnico; nunca texto vindo do modelo   |
| idem                     | `confianca`, `motivo`                     | saída do modelo validada pelo schema Zod da tarefa, na funcionalidade que chamou (12, 15 ou 16)                              |
| idem                     | `modelo`, `promptVersion`, `task`, `llmCallId` | `LlmResult.meta` de `lib/llm`                                                                                            |
| idem                     | `efeito`                                  | parâmetro de quem chama: `sugestao` na fatia 1, `aplicado` quando a IA age sozinha (funcionalidades 15 e 16)                 |
| `resolverDecisao`        | `valor` humano                            | os campos já validados da ação da gestão: `catalogServiceId` e `finalPriority` de `classificarChamadoAction`, `assignedToUserId` de atribuir e reatribuir |
| idem                     | `origem`                                  | `gestao` nos ganchos; `solicitante` só na abertura, quando o valor confirmado difere do proposto                             |
| idem                     | `motivo` da correção                      | campo de justificativa da própria ação (`classificationNotes`, `reassignmentNotes`), vazio quando a ação não pede            |
| idem                     | `situacao`                                | derivada: `valorFinal` diferente de `valorIa` é `corrigida`; igual com `revisadaEm` é `confirmada`; igual sem revisão é `sem_revisao` |
| `lerLinhaDoTempo`        | itens e ordem                             | três consultas (mensagens, comentários, histórico) unidas em memória e ordenadas por `createdAt` e depois `_id`              |
| idem                     | corte de 300 por fonte                    | cada consulta ordena do mais recente para o mais antigo, corta em 300 e é reordenada para exibição; `truncado` sai verdadeiro quando alguma fonte bateu no teto |
| idem                     | visibilidade                              | `viewer.role` e a comparação de `viewer.userId` com `solicitanteId` e `assignedToUserId` do chamado                          |
| idem                     | texto de um evento de histórico           | `action` e `observacoes` da própria entrada; a fundação entrega o dado cru, a funcionalidade 13 escreve a frase da tela      |
| histórico da IA          | `observacoes` de `decisao_ia`             | montado do `campo` e do `valorIa.rotulo`, sem confiança e sem motivo                                                          |
| idem                     | `observacoes` de `correcao_ia`            | montado do `campo` e dos dois rótulos, o `anterior` e o `novo` da correção, sem confiança e sem motivo                        |
| ganchos da gestão        | decidir se há veredito a dar              | consulta de existência por `chamadoId` antes de chamar `resolverDecisao`; sem decisão, o gancho sai em silêncio               |
| status na VPS            | criação dos índices                       | `autoIndex` do Mongoose ao subir o `next-app`, conferido no verify                                                           |

**Key invariants**

- Uma conversa pertence a um único chamado, e um chamado a uma única conversa. Os dois lados guardam o id e os dois índices são únicos.
- `chamadoId` da conversa e `valorIa` da decisão nunca mudam depois de gravados.
- Conversa ligada e mensagens de conversa ligada nunca têm `expiresAt`. Rascunho sempre tem. O vínculo grava `chamadoId` e `expiresAt: null` na mesma operação, então o estado ilegal não existe nem sob corrida.
- Reserva, gravação de decisão, vínculo e reparo são gravações condicionais: todas casam pelo `chamadoIdReservado` esperado, e uma condição falsa faz a operação desistir em vez de gravar por cima.
- O chamado é o ponto de virada da abertura: decisão gravada antes dele só passa a valer quando ele existe, e decisão órfã é apagada no reparo.
- Toda etapa de `abrirChamadoDaConversa` pode rodar de novo sem efeito duplo: chamado por `_id` reservado, decisões por `{ chamadoId, campo }`, histórico conferido por chamado, ação e `decisaoIaId`.
- Nenhuma função desta fundação lança exceção para quem chama: todas devolvem `{ ok: true, ... }` ou `{ ok: false, reason }`, no mesmo estilo de `lib/llm`.
- Nenhum id vindo do modelo vira gravação sem conferência no banco.
- Registro de decisão e veredito nunca alteram o resultado da ação de negócio que os disparou.
- O texto do relato existe em um lugar só: na conversa antes da abertura e no comentário depois dela.
- `situacao` da decisão e `iaSituacao` do chamado são calculadas por uma função única, na mesma gravação que muda o que elas resumem.

**Security model**

- **Posse**: rascunho é do dono e de mais ninguém, nem do Admin. Toda função compara `viewer.userId` com `solicitanteId` antes de ler ou gravar, e responde `sem_permissao` sem revelar se a conversa existe.
- **Depois do vínculo**: leem a conversa o solicitante, o Preposto, o Admin e o técnico atribuído naquele momento. Quem deixa de ser o técnico atribuído deixa de ler.
- **Decisões**: confiança, motivo e correções são lidos só por Preposto e Admin. O solicitante e o técnico veem no histórico o fato e o valor, sem números.
- **Origem da identidade**: `viewer` vem sempre de `verifySession()` na camada que chama, nunca do corpo do pedido; autor `ia` e `sistema` só existem em código de servidor.
- **Saída do modelo é dado não confiável**: ids conferidos no banco, texto limitado por schema e tamanho, e rótulo lido do banco, não do modelo.
- **LGPD**: o relato pode ter nome, telefone e local. Rascunho que não vira chamado some em 30 dias pelo TTL; conversa ligada segue a vida do chamado, como o comentário de hoje. Nenhum log traz texto de mensagem: só id, campo e motivo técnico da falha.
- **Trilha de auditoria**: toda decisão e toda correção deixam entrada no `ChamadoHistory`, que já é a trilha do chamado, com o id da decisão para quem pode ver o detalhe.

**Configuration required**

- Nenhuma variável nova na aplicação. Limites, prazos e tetos são constantes em `lib/conversas/config.ts` e mudam com deploy.
- Só para teste: `MONGO_TEST_URI` aponta para o MongoDB em container usado pelos testes de banco, e sem ela esses testes são pulados (mesmo padrão de `LLM_SMOKE=1` na spec 0001).

**Critical test scenarios**

- Caminho feliz completo, contra o Mongo em container: rascunho, três mensagens, confirmação com duas decisões, e ao fim existem o chamado com `conversaId`, `canalAbertura: 'chat'` e `iaSituacao: 'sugerida'`, a conversa ligada sem `expiresAt`, as duas decisões `sem_revisao` e as entradas `abertura` e `decisao_ia` no histórico. Verifica **AC-1**, **AC-3**, **AC-6**, **AC-11**, **AC-16**.
- Clique duplo: duas confirmações seguidas da mesma conversa devolvem o mesmo `chamadoId`, a segunda com `jaExistia: true`, e existe um único chamado com aquele `conversaId`. Duas confirmações ao mesmo tempo dão um `confirmacao_em_andamento` ou dois resultados iguais, nunca dois chamados. Verifica **AC-4**, **AC-16**.
- Número de chamado repetido: com `generateTicketNumber()` devolvendo um número já usado na primeira tentativa, a abertura tenta outro e termina com um chamado só; com erro inesperado na criação, a função devolve `reason: 'erro'` sem lançar exceção. Verifica **AC-4**.
- Reparo contra processo lento: um passo de vínculo que chega depois de o reparo ter desfeito a reserva não grava nada (condição falsa), e a conversa nunca fica com `chamadoId` e `expiresAt` ao mesmo tempo. Verifica **AC-5**, **AC-2**.
- Vínculo interrompido: com o chamado já criado, a gravação do vínculo falha (mock rejeita). A leitura seguinte da conversa completa histórico e vínculo, sem duplicar entrada. Verifica **AC-5**.
- Reserva abandonada: reserva com mais de 2 minutos e sem chamado volta a rascunho com `expiresAt` restaurado na conversa e nas mensagens, e as decisões daquele id reservado somem. Verifica **AC-5**, **AC-2**.
- Limites: sexto rascunho dá `limite_rascunhos`, trigésima primeira mensagem dá `limite_mensagens`, mensagem de 2.001 caracteres dá `invalida`, e nada é gravado em nenhum dos três. Verifica **AC-1**.
- Expiração: as duas coleções têm índice TTL em `expiresAt`, um rascunho novo grava a data 30 dias à frente na conversa e nas mensagens, uma mensagem nova empurra as duas, e o vínculo zera as duas. Verifica **AC-2**, **AC-16**.
- Id inventado pelo modelo: `catalogServiceId` que não existe, ou que não pertence ao subtipo, dá `invalida` e não cria chamado, decisão nem histórico. Verifica **AC-7**.
- Correção do solicitante: confirmar com serviço diferente do proposto grava a decisão já `corrigida`, com uma correção `origem: 'solicitante'`. Verifica **AC-8**.
- Veredito da gestão: classificar com a mesma prioridade deixa `confirmada` sem correção; classificar com prioridade diferente deixa `corrigida` com a correção `gestao`; um segundo veredito que volta ao valor da IA deixa `confirmada` com duas correções na lista; o chamado fica `iaSituacao: 'revisada'`. Verifica **AC-9**.
- Duas correções simultâneas da mesma decisão, contra o Mongo em container: as duas entram na lista e a `situacao` final combina com o `valorFinal`. Verifica **AC-9**, **AC-16**.
- Falha do gancho: com a gravação do veredito rejeitada, `classificarChamadoAction` devolve `{ ok: true }`, o chamado está classificado e o log capturado traz `[conversa]` com o id do chamado e nenhum texto de relato. Verifica **AC-10**.
- Chamado de formulário na triagem: classificar um chamado sem nenhuma decisão não grava nada e não escreve nenhuma linha de log. Verifica **AC-9**, **AC-10**.
- Histórico sem usuário: uma entrada `decisao_ia` com `actorType: 'ia'` e `userId` nulo é gravada, a rota do histórico a devolve e o componente mostra "IA" sem tentar buscar usuário; `observacoes` não contém a confiança nem o motivo. Verifica **AC-11**.
- Leitura combinada: um chamado com mensagens de antes da abertura, um comentário público, um comentário interno e três eventos de histórico devolve tudo em ordem para o Preposto, e sem o comentário interno para o solicitante. As entradas `decisao_ia` e `correcao_ia` aparecem para os dois, sem confiança e sem motivo no texto. Com mais de 300 itens em uma fonte, os devolvidos são os mais recentes e `truncado` é verdadeiro. Verifica **AC-12**, **AC-14**.
- Mensagem depois da abertura: `enviarMensagem` com autor `solicitante` numa conversa ligada cria comentário público, entrada `comentario` no histórico e a notificação, devolvendo `destino: 'comentario'`; com autor `ia` grava na conversa. Verifica **AC-13**.
- Autorização: outro Solicitante lendo o rascunho recebe `sem_permissao`; o Admin lendo rascunho alheio também; o técnico atribuído lê a conversa ligada mas recebe `sem_permissao` em `lerDecisoes`. Verifica **AC-14**.
- Elo com a IA: uma chamada de `generateLlmObject` devolve `meta.callId`, o `LlmCall` gravado tem esse `_id`, e a decisão gravada com esse valor encontra a amostragem por uma consulta. Verifica **AC-15**.

## Build plan

Tracer Bullet: o primeiro marco atravessa todas as camadas até o banco de verdade, do rascunho ao chamado com decisão e histórico, porque o maior risco está justamente na costura sem transação. Os marcos seguintes engrossam o mesmo fio com expiração, reparo, vereditos e leitura.

**Marco 1: fio fino, do rascunho ao chamado**

1. [x] Acrescentar `callId` ao `LlmMeta` de `lib/llm`: gerar o `ObjectId` no início da chamada, usar como `_id` do `LlmCall` e devolver no `meta`, com teste contra o servidor falso. Fixar a convenção de `ref` (`conversa` e `chamado`). Satisfaz **AC-15**.
2. [x] Criar `models/Conversa.ts`, `models/ConversaMensagem.ts` e `models/DecisaoIa.ts` com campos, enums e índices da tabela de dados, mais `shared/conversas/` com os schemas Zod de mensagem e de valor da decisão. Satisfaz **AC-1**, **AC-2**, **AC-6**.
3. [x] Acrescentar ao `Chamado` os campos `conversaId`, `canalAbertura` e `iaSituacao` com seus índices, e ao `ChamadoHistory` o `userId` opcional com `required` por função (exigido quando `actorType` é `usuario`), `actorType`, `decisaoIaId` e as ações `decisao_ia` e `correcao_ia`. Satisfaz **AC-3**, **AC-11**.
4. [x] Criar `lib/conversas/` com `config.ts`, `types.ts` (incluindo o motivo `erro`), `criarConversa`, `enviarMensagem` (autor `solicitante` em rascunho) e `abrirChamadoDaConversa` com os cinco passos, todos condicionais ao `chamadoIdReservado`, incluindo `registrarDecisao` com rótulo lido do banco, o tratamento de chave duplicada (`conversaId` vira `jaExistia`, `ticket_number` vira nova tentativa) e as entradas de histórico. Satisfaz **AC-1**, **AC-3**, **AC-4**, **AC-6**, **AC-11**.
5. [x] Montar o apoio de teste com MongoDB em container (`MONGO_TEST_URI`, criação e limpeza das coleções, pulo automático sem a variável) e escrever o teste do caminho feliz completo. Satisfaz **AC-1**, **AC-3**, **AC-6**, **AC-11**, **AC-16**.

**Marco 2: expiração, limites, clique duplo e reparo**

6. [x] Implementar a expiração do rascunho: `expiresAt` na conversa e nas mensagens, renovação a cada mensagem, zeragem na reserva e restauração no reparo, com os índices TTL. Satisfaz **AC-2**.
7. [x] Implementar os limites (2.000 caracteres, 30 mensagens pelo contador só enquanto é rascunho, 5 rascunhos) e o `descartarRascunho` com apagamento imediato. Satisfaz **AC-1**, **AC-2**.
8. [x] Implementar reserva condicional, idempotência e reparo: `vinculandoEm`, `chamadoIdReservado`, janela de 2 minutos, `jaExistia`, conclusão das etapas pendentes em `lerConversa` e em `listarRascunhos` (que também mostra a reserva em andamento) e limpeza condicional da reserva abandonada com as decisões órfãs. Satisfaz **AC-4**, **AC-5**.
9. [x] Escrever os testes de banco de índice único, TTL, clique duplo, número repetido, vínculo interrompido, reparo contra processo lento e reserva abandonada, mais os unitários de limites. Satisfaz **AC-1**, **AC-2**, **AC-4**, **AC-5**, **AC-16**.

**Marco 3: decisões, vereditos e correções**

10. [x] Implementar a conferência no banco de todo valor decidido (serviço do catálogo contra o subtipo, técnico com perfil Técnico, prioridade no enum) e a correção do solicitante na abertura. Satisfaz **AC-7**, **AC-8**.
11. [x] Implementar `resolverDecisao` com a lista de correções, o cálculo de `situacao`, `revisadaEm`, `revisadaPorUserId`, o `iaSituacao: 'revisada'` e a entrada `correcao_ia` no histórico. Satisfaz **AC-9**, **AC-11**.
12. [x] Ligar os ganchos em `classificarChamadoAction`, `assignTicketAction` e `reassignTicketAction`, sempre depois da gravação de negócio, com conferência de existência antes (chamado sem decisão sai em silêncio) e sem poder quebrar a ação, com log `[conversa]` só em falha de verdade. Satisfaz **AC-9**, **AC-10**.
13. [x] Escrever os testes de veredito, correção do solicitante, id inventado, chamado de formulário sem decisão, falha do gancho e duas correções simultâneas. Satisfaz **AC-7**, **AC-8**, **AC-9**, **AC-10**, **AC-16**.

**Marco 4: leitura, visibilidade e caminho do comentário**

14. [x] Extrair de `addCommentAction` o núcleo do comentário para `lib/chamados/comentarios.ts` (comentário, histórico, notificação e socket), deixando a Server Action só com validação e `revalidatePath`, e fazer `enviarMensagem` usar esse núcleo quando a conversa já tem chamado. Satisfaz **AC-13**.
15. [x] Implementar `lerConversa`, `listarRascunhos`, `lerDecisoes` e `lerLinhaDoTempo` com a regra de visibilidade por perfil, o teto de 300 itens mais recentes por fonte e a marca `truncado`. Satisfaz **AC-12**, **AC-14**.
16. [x] Ajustar os leitores de histórico (`app/api/chamados/[id]/history`, `app/api/gestao/chamados/[id]/assignment-history` e `HistoryTimeline`) para entrada sem usuário, mostrando "IA" ou "Sistema" sem buscar usuário. Satisfaz **AC-11**.
17. [x] Escrever os testes de leitura combinada, visibilidade por perfil, mensagem depois da abertura e autorização negada. Satisfaz **AC-12**, **AC-13**, **AC-14**.

## Consequences

**Positive**:

- O relato sobrevive a recarregar a página e a fechar o navegador, e a funcionalidade 11 tem a lista lateral pronta com `previa` e data.
- A abertura pelo chat não consegue criar dois chamados do mesmo relato, nem com clique duplo, nem com repetição depois de falha.
- Calibração (14), revisão (17) e painel (18) leem uma estrutura feita para elas: acerto por campo, campos mais corrigidos e junção com a amostragem pelo `llmCallId`.
- Desde a fatia 1, toda triagem manual vira dado de acerto, sem esperar a fatia 3.
- Nada de texto duplicado: comentário continua sendo comentário, e a página de detalhe que já existe segue funcionando sem mudança de comportamento.
- Relato que não virou chamado desaparece sozinho em 30 dias, o que reduz a superfície de dado pessoal guardado.

**Negative / tradeoffs**:

- A costura sem transação existe mesmo assim: são cinco passos com reparo, todos com gravação condicional, e reparo é código que só roda em falha, ou seja, o caminho menos exercitado. Os testes de banco existem por causa disso.
- A abertura herda a corrida que já existe no `generateTicketNumber()`, que gera número lendo o maior valor. A nova tentativa até 3 vezes reduz o efeito, mas não resolve a raiz.
- Ler a linha do tempo custa três consultas e uma ordenação em memória; com chamado muito longo o teto de 300 itens por fonte aparece para o usuário.
- Guardamos valores derivados (`situacao`, `iaSituacao`, `mensagensCount`, `previa`) para poder filtrar por índice e aplicar teto de forma atômica. Eles podem ficar desatualizados se alguém gravar fora das funções da fundação, e a regra passa a ser: ninguém escreve nessas coleções sem passar por `lib/conversas/`.
- Os ganchos deixam a triagem acoplada à IA em três ações centrais da gestão. Elas ficam um pouco mais longas, e a fundação assume a responsabilidade de nunca quebrá-las.
- `ChamadoHistory` com usuário opcional é um afrouxamento de um invariante antigo: todo leitor precisa tratar o nulo, e um código futuro pode gravar entrada humana sem usuário se não usar a conferência.
- Extrair o núcleo do comentário mexe em código pronto e testado, com risco de regressão em notificação e socket.
- Rascunho apagado pelo TTL não avisa ninguém: quem volta depois de 30 dias encontra a conversa sumida, e a funcionalidade 11 precisa dizer isso na tela.
- O `llmCallId` aponta para um registro que expira em 365 dias, então a junção com amostragem só funciona dentro dessa janela.

**Neutral**:

- Três coleções novas (`conversas`, `conversamensagens`, `decisoesia`) com nove índices ao todo, criados pelo Mongoose ao subir.
- Uma dependência nova de teste: um MongoDB em container acessível pela `MONGO_TEST_URI`, no ambiente de quem desenvolve e em quem for rodar esses testes.
- O CI hoje roda só lint e build, então os testes de banco não rodam nele até alguém decidir o contrário.
- Uma mudança pequena na fundação da spec 0001 (`meta.callId`), sem efeito no contrato de quem só consome `ok` e `data`.
- Tipos de mensagem e conteúdo do cartão resumo ficam abertos de propósito: a funcionalidade 12 registra os dela em `shared/conversas/` sem migração.

## Follow-up

- [ ] Registrar na spec 0001 que o `LlmMeta` ganhou `callId` e que a `ref` do `LlmCall` passa a usar `conversa` e `chamado`, para a fundação continuar descrita como está no código.
- [ ] Nas specs das funcionalidades 11 e 12: definir os tipos de mensagem e o conteúdo do `payload` do cartão resumo, e avisar na tela que rascunho some em 30 dias.
- [ ] Na spec da funcionalidade 12: manter a condição prévia herdada da 0001 (só liberar depois de o teste de repetição passar sem corte com espaço em branco no vLLM).
- [ ] Na spec da funcionalidade 17: usar `resolverDecisao` também na correção de prioridade com SLA já iniciado, e definir ali a regra do SLA.
- [ ] Na spec da funcionalidade 18: usar `situacao`, `correcoes` e `llmCallId` como base das métricas, e decidir se correção de origem `solicitante` conta no percentual principal.
- [ ] Decidir se o CI passa a subir um MongoDB de serviço para rodar os testes de banco, ou se eles ficam só na máquina de quem desenvolve e no verify.
- [ ] No `/check verify`: conferir na VPS que os índices únicos e os TTL das três coleções novas foram criados (`db.conversas.getIndexes()` e equivalentes), já que dependem do `autoIndex` ao subir.
- [ ] Risco anterior, fora desta spec: `generateTicketNumber()` gera número lendo o maior existente, sem lock. Vale avaliar um contador atômico, porque o chat aumenta o número de aberturas simultâneas.
- [ ] Bug anterior, fora desta spec: `updateTicketCatalogAction` grava histórico com a ação `catalogo_atualizado`, que não existe em `CHAMADO_HISTORY_ACTIONS`, então a gravação falha depois de o chamado já ter sido alterado.
- [ ] `/sync`: registrar as coleções novas e `lib/conversas/` no `AGENTS.md` raiz, criar `lib/conversas/AGENTS.md` com as regras de posse, reparo e visibilidade, e documentar a `MONGO_TEST_URI`.
