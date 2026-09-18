# 0003. Tela de conversas de chamados

**Date**: 2026-09-18
**Status**: Accepted

## Summary

O Sigma ganha uma rota nova, `/conversas`, onde o servidor pede o problema em uma conversa: os chamados e os rascunhos do usuário ficam na lateral, a conversa aberta no centro e a caixa de mensagem embaixo. Quem envia um relato recebe a resposta do assistente aos poucos (streaming, o texto que vai aparecendo enquanto o modelo escreve), e nesta fatia o assistente só confirma o que entendeu e pergunta o que faltou: escolher serviço, urgência e técnico é a funcionalidade 12. A tela não cria coleção nem campo novo (só um índice, para a lista da lateral sair rápido), ela monta a primeira cara da fundação que a spec [0002](../0002-conversa-decisoes-ia/index.md) já construiu. Com o modelo fora do ar, lento ou desligado, o relato continua salvo e uma mensagem do sistema oferece o formulário de sempre.

## Requirements

**User stories**:

- Como solicitante, quero relatar o problema conversando, para não precisar entender o catálogo de serviços antes de pedir ajuda.
- Como solicitante, quero ver meus chamados como conversas na lateral, para retomar de onde parei sem procurar em outra tela.
- Como solicitante, quero perceber que o assistente está respondendo, para saber que vale esperar.
- Como solicitante que usa leitor de tela ou só teclado, quero acompanhar a conversa inteira, para abrir chamado sozinho.
- Como solicitante no celular, quero a mesma tela funcionando no aparelho, para relatar o problema no corredor, na frente do defeito.
- Como solicitante, quero o formulário tradicional a um clique, para não ficar preso se o assistente não responder.
- Como responsável pelo sistema, quero que a tela nunca quebre por causa da IA, para o chamado continuar possível em qualquer cenário.

**Acceptance criteria**:

- **AC-1**: `/conversas` exige sessão e aparece na sidebar para os quatro perfis, no grupo Principal. A página é um componente de servidor: a primeira pintura já traz a lateral preenchida, sem estado de carregamento. Um usuário só lê conversas cujo `solicitanteId` é o dele e chamados cujo solicitante é ele; pedido para conversa de outra pessoa responde `sem_permissao` sem revelar se a conversa existe.
- **AC-2**: a lateral mostra dois blocos numa lista só: em cima, todos os rascunhos ativos do usuário (no máximo 5, de `listarRascunhos`, ordenados por `ultimaMensagemEm`); embaixo, os chamados dele ordenados por `updatedAt`, 20 por vez, com botão `Carregar mais` que traz os 20 seguintes usando cursor composto de `updatedAt` mais `_id` (data igual nunca repete nem esconde chamado). Rascunhos não paginam, porque o teto deles é 5. Cada linha de rascunho mostra a marca `Rascunho`, a prévia e a data; cada linha de chamado mostra a situação, o título, o número e a data. Rascunho com confirmação em andamento mostra a marca `Confirmando`.
- **AC-3**: `Nova conversa` abre a tela de boas vindas (saudação, três exemplos clicáveis e a caixa em foco) sem gravar nada. A conversa nasce no banco só no envio da primeira mensagem: a rota `POST /api/conversas/mensagens` é a única dona da sequência, chamando `criarConversa` e depois `enviarMensagem`. Se `enviarMensagem` falhar por qualquer motivo, a mesma rota chama `descartarRascunho` no rascunho recém criado antes de responder, e nada sobra no banco. Com 5 rascunhos ativos, `criarConversa` falha como `limite_rascunhos`, nada é criado, e a tela mostra os rascunhos abertos com o botão de descartar.
- **AC-4**: ao enviar, a mensagem aparece na conversa na hora, marcada como pendente. Confirmada a gravação, a marca sai. Falhando, a mensagem fica marcada como não enviada, com botão `Tentar de novo`, e o texto digitado nunca se perde. A nova tentativa nunca cria um segundo rascunho: assim que o quadro `inicio` chega, a tela guarda o `conversaId` e toda tentativa seguinte vai para `POST /api/conversas/[id]/mensagens`. Só uma falha anterior a qualquer quadro, quando nenhum rascunho chegou a existir, tenta de novo pela rota sem id.
- **AC-5**: a resposta do assistente chega aos poucos por `POST /api/conversas/mensagens` (conversa nova) ou `POST /api/conversas/[id]/mensagens` (conversa existente), que grava a mensagem do solicitante, chama `streamLlmObject` na raia `interactive` e devolve quadros JSON, um por linha: `inicio` (com `conversaId` e o id da mensagem do solicitante), `parcial` (texto acumulado), `fim` (texto final mais `mensagemId`) ou `reserva` (a mensagem do sistema, quando a IA falha). Enquanto os quadros `parcial` chegam, a tela mostra o texto crescendo e o aviso de que o assistente está respondendo. O texto parcial nunca é gravado no banco: só o objeto final, validado pelo schema Zod, vira `ConversaMensagem` de autor `ia`, com `llmCallId` igual ao `meta.callId`. Abrir uma conversa cuja última mensagem é do solicitante, porque a conexão caiu no meio da resposta, nunca dispara chamada ao modelo sozinha: a pessoa continua escrevendo.
- **AC-5b**: quando a resposta é boa mas não pode ser gravada, porque o rascunho foi descartado noutra aba (`nao_encontrada`) ou porque o teto de 30 foi atingido no meio (`limite_mensagens`), o quadro `fim` vem com `mensagemId: null`. A tela mostra a resposta com um aviso discreto de que ela não ficou salva e não vai aparecer ao recarregar, e o servidor registra o motivo em log. A conversa nunca fica sem explicação, e nenhuma exceção sobe.
- **AC-6**: nesta fatia o assistente só conversa. Ele confirma em uma frase o que entendeu e faz no máximo uma pergunta sobre o que ficou vago. Ele não escolhe serviço, não define prioridade, não sugere técnico, não grava nenhum `DecisaoIa` e não cria chamado. Nenhum tipo novo entra em `CONVERSA_MENSAGEM_TIPOS`: toda mensagem desta tela é do tipo `texto`.
- **AC-7**: com `LLM_ENABLED=false`, sem as variáveis `LLM_*`, com o vLLM fora do ar, com prazo estourado, com disjuntor aberto ou com objeto final reprovado pelo schema, a rota grava uma mensagem de autor `sistema` na conversa, com texto fixo do Sigma (nunca texto do modelo), devolve o quadro `reserva` e a tela troca o texto parcial por essa mensagem. A mensagem oferece o link para o formulário tradicional. Nada lança exceção e o relato do usuário continua gravado.
- **AC-8**: a tela cumpre WCAG 2.1 AA. Uma região ao vivo educada (`role="status"`, `aria-live="polite"`, `aria-atomic="true"`) anuncia `O assistente está respondendo` quando o primeiro quadro chega e recebe o texto completo da resposta uma única vez quando ela termina. A bolha em construção fica com `aria-hidden="true"` enquanto cresce, para o leitor de tela não ler pedaço a pedaço, e volta a ser lida quando a resposta termina. Toda ação é alcançável por teclado com foco visível, todo alvo de toque tem no mínimo 44 pixels, todo botão de ícone tem nome acessível e todo texto passa em contraste 4,5 para 1.
- **AC-9**: a caixa mostra o contador de caracteres contra o teto de 2.000 e o contador de mensagens contra o teto de 30 do rascunho. Ao chegar em 30, a tela explica que a conversa atingiu o limite e oferece o formulário. Todo motivo de falha de `lib/conversas` (`nao_encontrada`, `sem_permissao`, `limite_rascunhos`, `limite_mensagens`, `confirmacao_em_andamento`, `invalida`, `erro`) tem uma frase própria em português na tela; nenhum aparece cru.
- **AC-10**: clicar num chamado abre a conversa em modo leitura: o cabeçalho traz número, título, situação e link para `/meus-chamados/[id]`; o corpo traz mensagens, comentários e histórico em ordem, lidos por `lerLinhaDoTempo`; não existe caixa de envio, e um rodapé explica que responder é pelos comentários do chamado. Chamado aberto pelo formulário, sem `Conversa` ligada, abre do mesmo jeito, com comentários e histórico e sem mensagens. O `id` de `/conversas/[id]` é o `conversaId` quando existe conversa e o `chamadoId` quando não existe; quem monta a lateral no servidor já calcula o endereço de cada linha, e a rota resolve nesta ordem: `lerConversa` primeiro, e só com `nao_encontrada` tenta como chamado. Insucesso nos dois responde 404, igual para `sem_permissao` e para inexistente.
- **AC-11**: no celular, `/conversas` mostra só a lista ocupando a tela, e `/conversas/[id]` mostra só a conversa com botão de voltar que leva de volta à lista, com o foco indo para o título da conversa. No computador as duas rotas mostram lateral e conversa lado a lado. A troca é por CSS e rota, sem gaveta.
- **AC-12**: o dono descarta um rascunho pela conversa aberta, com confirmação; a conversa e as mensagens somem na hora. Descartar durante uma confirmação em andamento falha como `confirmacao_em_andamento` com frase própria. Depois do descarte a tela volta para a lista.
- **AC-13**: a tela reusa o `RealtimeProvider` existente sem tocar nele. O gancho é o evento de navegador `notification:new`, que o provider já dispara em `ticket:assigned`, `ticket:new`, `ticket:execution_registered`, `ticket:closed`, `sla:warning` e `sla:breach`. A tela escuta esse evento, espera 800ms para agrupar rajadas e chama `router.refresh()` uma vez, recarregando lateral e conversa aberta. Recarga supérflua em aviso de SLA é aceita de propósito, por ser mais barata do que criar sala e evento novos. Nenhuma sala nova, nenhum evento novo e nenhuma mudança no socket server entram nesta fatia.

## Decision

**Chosen option**: Opção 2: leitura no servidor, uma rota de streaming para o envio

A rota `/conversas` é um componente de servidor que monta a lateral e a conversa por `lib/conversas`, e o envio de mensagem passa por uma rota de API própria que grava o texto do solicitante, chama o modelo e devolve a resposta em quadros JSON linha a linha. Nenhuma coleção nova, nenhuma migração, nenhum evento novo de socket.

## Rationale

Raciocínio, opções e a nota sobre a premissa: veja [rationale.md](rationale.md).

## Feature design

**Fonte do design**: a tela de design do Claude, [Sigma — Tela de conversas](https://claude.ai/artifact/8rWGWqNy3zTkZDKXzrDEz2), com seis pranchetas: `Main.dc.html` (primeira visita), `ConversaAtiva.dc.html` (assistente respondendo), `ChamadoLeitura.dc.html` (chamado aberto em leitura), `IaIndisponivel.dc.html` (assistente fora e envio falho), `CelularLista.dc.html` e `CelularConversa.dc.html`. As cores, os raios e a tipografia saem do `app/globals.css` e dos padrões do `AGENTS.md`; o desenho não inventa token nenhum. O `/develop` constrói contra essas pranchetas e contra os componentes shadcn já usados no projeto, nunca contra uma captura de outro produto.

**Data model sketch**: nenhuma coleção nova, nenhum campo novo e nenhuma migração de dados. A única mudança de schema é um índice novo em `models/Chamado.ts`, `{ solicitanteId: 1, updatedAt: -1 }`, que o Mongoose cria ao subir (o projeto não desliga `autoIndex`): sem ele a consulta da lateral ordena em memória, porque o índice existente é `{ solicitanteId: 1, status: 1, createdAt: -1 }` e a situação no meio impede o uso na ordenação. A tela lê e escreve só pelo `lib/conversas` (spec 0002) e lê `Chamado` para a lateral. O que ela acrescenta é o modelo de leitura montado no servidor:

| Modelo de leitura | Campos                                                                                                                        | De onde vem                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ItemLateral`     | `tipo` (`rascunho` ou `chamado`), `id`, `href`, `titulo`, `apoio`, `situacao`, `em`, `confirmando`                            | rascunho: `RascunhoListado`; chamado: `Chamado` do solicitante. O `href` é calculado no servidor, o cliente nunca adivinha |
| `ConversaNaTela`  | `id`, `situacao`, `previa`, `mensagensCount`, `mensagens[]`                                                                   | `lerConversa(viewer, conversaId)`                                                                                          |
| `LeituraChamado`  | `chamadoId`, `ticketNumber`, `titulo`, `status`, `itens[]`, `truncado`                                                        | `lerLinhaDoTempo(viewer, chamadoId)` mais os campos do `Chamado`                                                           |
| `QuadroResposta`  | `tipo` (`inicio`, `parcial`, `fim`, `reserva`), `conversaId?`, `mensagemId?` (nulo no `fim` não gravado), `texto?`, `motivo?` | montado pela rota de streaming; é contrato de rede, não vai para o banco                                                   |

A consulta da lateral traz só os campos que a linha mostra (`ticket_number`, `titulo`, `status`, `updatedAt`, `assignedToUserId`) e popula apenas o nome do técnico, para a primeira pintura não puxar o documento inteiro do chamado.

Módulo novo `lib/assistente/` (todo arquivo com `import 'server-only'`), para não mexer no módulo fechado da spec 0002:

| Arquivo        | Responsabilidade                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `prompt.ts`    | O texto de sistema e a constante `promptVersion`. Muda junto com o prompt                                                           |
| `schema.ts`    | `respostaAssistenteSchema` = `z.object({ resposta: z.string().min(1).max(600) })`                                                   |
| `mensagens.ts` | Textos fixos do Sigma para a mensagem de reserva, um por motivo de falha                                                            |
| `responder.ts` | `responderNaConversa()`: grava a mensagem do solicitante, monta o histórico, chama `streamLlmObject`, devolve o gerador dos quadros |
| `index.ts`     | Único ponto de entrada                                                                                                              |

Chamada ao modelo: `task: 'conversa.acolhimento'`, `promptVersion: '1'`, `lane: 'interactive'`, `userId` da sessão verificada (obrigatório na raia interativa), `ref: { type: 'conversa', id: conversaId }`, `signal` vindo do `request.signal`, `sampling: { maxOutputTokens: 300 }` sobre a amostragem padrão da spec 0001. O histórico enviado são as últimas 20 mensagens da conversa, com `solicitante` virando `user`, `ia` virando `assistant` e `sistema` ficando de fora.

**State transitions**

- Tela: `lista vazia` → `boas vindas` (clicou em Nova conversa) → `rascunho vivo` (primeira mensagem gravada) → `respondendo` (quadros chegando) → `rascunho vivo` (quadro `fim` ou `reserva`). De `rascunho vivo` sai por descarte (volta para `lista vazia` ou `lista`) ou, na funcionalidade 12, pela confirmação que vira chamado. `chamado em leitura` é um estado separado, alcançado ao abrir um chamado, e não tem caixa de envio.
- Envio de mensagem: `pendente` → `gravada` (quadro `inicio`) ou `falhou` (erro de rede ou motivo de `lib/conversas`). De `falhou` volta para `pendente` pelo botão `Tentar de novo`.
- Resposta do assistente: `aguardando` → `escrevendo` (primeiro `parcial`) → `pronta` (`fim`) ou `reserva` (falha). De `aguardando` também sai direto para `reserva`, quando a falha acontece antes de qualquer conteúdo.
- Conversa no banco: os estados `rascunho`, `reservada` e `vinculada` são os da spec 0002 e não mudam aqui.

**API surface** (`viewer` é sempre `{ userId, role }` da sessão verificada por `requireSession()`):

| Endpoint                        | Método | Entradas principais                   | Saídas principais                                          | Auth   | Erros principais                                                               |
| ------------------------------- | ------ | ------------------------------------- | ---------------------------------------------------------- | ------ | ------------------------------------------------------------------------------ |
| `/conversas`                    | página | nenhuma                               | lateral (rascunhos mais 20 chamados) e tela de boas vindas | sessão | redireciona para o login sem sessão                                            |
| `/conversas/[id]`               | página | `id` na rota                          | lateral mais a conversa ou o chamado em leitura            | dono   | 404 para `nao_encontrada` e para `sem_permissao`                               |
| `/api/conversas/mensagens`      | POST   | `texto: string` (obrigatório)         | fluxo NDJSON: `inicio`, `parcial*`, `fim` ou `reserva`     | sessão | 400 `invalida`, 409 `limite_rascunhos`, 401 sem sessão                         |
| `/api/conversas/[id]/mensagens` | POST   | `id` na rota, `texto: string`         | o mesmo fluxo NDJSON                                       | dono   | 400 `invalida`, 404 `nao_encontrada` e `sem_permissao`, 409 `limite_mensagens` |
| `carregarMaisConversasAction`   | ação   | `antesDe: { em: string; id: string }` | os 20 chamados seguintes como `ItemLateral[]` e `temMais`  | sessão | devolve lista vazia em qualquer falha, nunca lança                             |
| `descartarRascunhoAction`       | ação   | `conversaId: string`                  | `{ ok: true }` e `revalidatePath('/conversas')`            | dono   | `nao_encontrada`, `sem_permissao`, `confirmacao_em_andamento`                  |

As duas rotas de POST rodam no runtime Node.js (`export const runtime = 'nodejs'`, `export const dynamic = 'force-dynamic'`) porque `lib/llm` e `lib/conversas` são só de servidor, e compartilham o mesmo módulo de tratamento. A diferença é só o começo: a rota sem `id` é a dona da criação do rascunho (AC-3) e chama `criarConversa`, `enviarMensagem` e, se a segunda falhar, `descartarRascunho`, antes de entregar a conversa pronta ao mesmo caminho da outra rota. `lib/assistente/responder.ts` sempre recebe conversa que já existe e nunca cria nem descarta nada.

`sem_permissao` responde 404 de propósito, com o mesmo corpo de `nao_encontrada`, para a resposta não revelar que a conversa de outra pessoa existe (AC-1).

**Value sourcing**

| Ação                    | Valor produzido ou exibido                 | Fonte                                                                                                                                     |
| ----------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| lateral, linha rascunho | título da linha                            | `Conversa.previa` (os 120 primeiros caracteres da primeira mensagem, já gravados pela spec 0002)                                          |
| lateral, linha rascunho | data e ordem                               | `RascunhoListado.ultimaMensagemEm`                                                                                                        |
| lateral, linha rascunho | marca `Confirmando`                        | `RascunhoListado.confirmando`                                                                                                             |
| lateral, linha chamado  | título, número, situação                   | `Chamado.titulo`, `Chamado.ticket_number` (o campo do model é em minúsculas com sublinhado), `Chamado.status` com `CHAMADO_STATUS_LABELS` |
| lateral, linha chamado  | linha de apoio (`Maurício está atendendo`) | derivada de `Chamado.status` mais o nome de `Chamado.assignedToUserId` populado; sem técnico, só a situação                               |
| lateral, linha chamado  | data e ordem                               | `Chamado.updatedAt`                                                                                                                       |
| lateral, qualquer linha | endereço do link (`href`)                  | calculado no servidor: `/conversas/<conversaId>` quando existe conversa, `/conversas/<chamadoId>` quando não existe                       |
| lateral                 | cursor do `Carregar mais`                  | `updatedAt` mais `_id` do último chamado exibido; rascunhos nunca paginam, o teto deles é 5                                               |
| boas vindas             | primeiro nome na saudação                  | `session.user.name`, primeiro termo; sem nome, a saudação é `Olá`                                                                         |
| boas vindas             | textos dos três exemplos                   | constantes de `app/(dashboard)/conversas/_constants.ts`, escritas nesta fatia, não vindas do modelo                                       |
| conversa                | horário de cada mensagem                   | `ConversaMensagem.createdAt` em ISO pelo servidor, formatado no cliente no fuso do navegador                                              |
| conversa                | contador `x de 30`                         | `Conversa.mensagensCount` e `CONVERSA_MENSAGENS_MAX` de `lib/conversas/config.ts`                                                         |
| conversa                | contador de caracteres                     | comprimento do texto no cliente e `CONVERSA_TEXTO_MAX`                                                                                    |
| resposta do assistente  | texto exibido e gravado                    | `data.resposta` do objeto final validado pelo schema Zod; o parcial é só exibição                                                         |
| resposta do assistente  | `llmCallId` da mensagem                    | `LlmResult.meta.callId` (spec 0001)                                                                                                       |
| mensagem de reserva     | texto exibido e gravado                    | constante em `lib/assistente/mensagens.ts`, escolhida pelo `reason` de `lib/llm`; nunca texto do modelo                                   |
| mensagem de reserva     | destino do link do formulário              | `/meus-chamados`, onde o botão `Novo chamado` abre o diálogo de sempre                                                                    |
| resposta não gravada    | aviso de que a resposta não ficou salva    | `mensagemId: null` no quadro `fim`, decidido pela rota a partir do motivo devolvido por `enviarMensagem`                                  |
| tempo real              | gatilho da recarga                         | evento de navegador `notification:new`, disparado pelo `RealtimeProvider` existente                                                       |
| chamado em leitura      | itens da linha do tempo                    | `lerLinhaDoTempo(viewer, chamadoId)`, que já junta mensagens, comentários e histórico com a regra de visibilidade                         |
| chamado em leitura      | nome de quem agiu em cada item             | `userId` de cada item resolvido no servidor contra `User.name`, em uma consulta só por tela                                               |

**Key invariants**

- A tela nunca escreve nas coleções `conversas`, `conversamensagens` e `decisoesia` direto: tudo passa por `lib/conversas`.
- Mensagem de autor `ia` ou `sistema` só nasce em código de servidor, nunca a partir de um pedido do navegador.
- Texto parcial nunca é gravado. Só o objeto final aprovado pelo schema Zod vira mensagem.
- Um rascunho nunca fica vazio: se a primeira mensagem não gravar, o rascunho criado na mesma chamada é descartado antes de a resposta voltar. Só a rota sem `id` cria rascunho, e ela é a única que o descarta por falha.
- Uma tentativa repetida de enviar a primeira mensagem nunca cria um segundo rascunho, porque o cliente passa a usar a rota com `id` assim que conhece o `conversaId`.
- Falha da IA nunca vira exceção nem erro HTTP: vira mensagem de autor `sistema` dentro da conversa. Falha ao gravar uma resposta boa também não vira exceção: vira `mensagemId: null` mais log.
- A lateral mostra no máximo 5 rascunhos, que é o teto da fundação, e pagina só chamados.
- O dono da conversa é o da sessão verificada; nenhum id de usuário vem do corpo do pedido.

**Security model**

- Todas as páginas e rotas passam por `requireSession()`; os quatro perfis veem `/conversas` e cada um só as próprias conversas e os próprios chamados.
- A rota de streaming confere o dono da conversa antes de chamar o modelo, para um pedido de terceiro nunca consumir vaga na GPU compartilhada.
- `userId` da sessão é obrigatório na raia `interactive`, o que liga esta tela ao limite por usuário da spec 0001. Nenhum limitador novo entra aqui.
- Conversa ligada a chamado também é legível por gestão e técnico, pela regra que `lerConversa` e `lerLinhaDoTempo` já aplicam; esta tela não afrouxa nem endurece essa regra. Nesta fatia, porém, nada em `/gestao` nem em `/chamados-atribuidos` leva a `/conversas/[id]`: a permissão existe e fica sem porta de entrada de propósito. Preposto, Admin e técnico continuam lendo o relato pela página de detalhe do chamado, que já mostra a linha do tempo.
- Dado pessoal: o relato é dado pessoal e segue o TTL de 30 dias do rascunho, definido na spec 0002. `LLM_DEBUG` registra o texto do relato e continua proibido em produção.
- Nenhum dado de conversa entra em log: a rota loga só `conversaId`, motivo de falha e duração.

**Configuration required**: nenhuma variável nova. As `LLM_*` da spec 0001 continuam governando a IA, e com elas ausentes ou com `LLM_ENABLED=false` a tela funciona pelo caminho do AC-7.

**Critical test scenarios**

- Happy path: relato enviado na tela de boas vindas cria o rascunho, grava a mensagem, transmite os quadros e grava a resposta com `llmCallId`, verifica **AC-3**, **AC-5**, **AC-6**
- Failure case: vLLM fora do ar durante o envio grava a mensagem de autor `sistema`, devolve o quadro `reserva` e mantém o relato, sem exceção, verifica **AC-7**
- Failure case: primeira mensagem reprovada na validação descarta o rascunho recém criado e não deixa conversa vazia, verifica **AC-3**
- Failure case: falha de rede no envio deixa a mensagem marcada como não enviada, com o texto preservado, e a nova tentativa vai pela rota com `id` sem criar segundo rascunho, verifica **AC-4**
- Failure case: rascunho descartado noutra aba enquanto a resposta é transmitida devolve o quadro `fim` com `mensagemId: null`, com aviso na tela e log no servidor, verifica **AC-5b**
- Failure case: duas páginas abertas na mesma conversa, com a segunda passando do teto de 30, não deixam a resposta sem explicação, verifica **AC-5b**, **AC-9**
- Auth/permission: usuário pedindo `/conversas/[id]` de outra pessoa recebe 404, sem diferença entre não existir e não ser dele, verifica **AC-1**
- Acessibilidade: com leitor de tela, o início da resposta é anunciado uma vez como status e o texto completo é lido uma vez no fim, sem leitura pedaço a pedaço, verifica **AC-8**
- Celular: a lista e a conversa são duas telas, o botão voltar leva à lista e o foco vai para o título ao abrir a conversa, verifica **AC-11**

## Build plan

Ordem por **Tracer Bullet**: a tarefa 1 é o fio fino que atravessa sessão, banco, modelo e tela; as seguintes engrossam o fio sem nunca deixar a tela sem funcionar.

1. Fio fino ponta a ponta: índice `{ solicitanteId: 1, updatedAt: -1 }` em `models/Chamado.ts`, item `Conversas` na sidebar para os quatro perfis, rota `/conversas` como componente de servidor com a lateral montada de `listarRascunhos` mais os 20 chamados mais recentes, tela de boas vindas, `POST /api/conversas/mensagens` como dona da criação do rascunho e da gravação da primeira mensagem (com descarte no insucesso), `lib/assistente/` chamando `streamLlmObject` e a tela mostrando os quadros `inicio`, `parcial` e `fim`, satisfaz **AC-1**, **AC-3**, **AC-5**, **AC-6**
2. Conversa que continua: rota `/conversas/[id]` com a resolução conversa primeiro e chamado depois, leitura por `lerConversa`, `POST /api/conversas/[id]/mensagens` para as mensagens seguintes, envio otimista com estado pendente e `Tentar de novo` sempre pela rota com `id`, contadores de caracteres e de mensagens, frases próprias para cada motivo de falha, descartar rascunho com confirmação, satisfaz **AC-4**, **AC-9**, **AC-12**
3. Falha da IA como parte do desenho: textos fixos em `lib/assistente/mensagens.ts`, gravação da mensagem de autor `sistema`, quadro `reserva`, troca do texto parcial pela mensagem de reserva quando o objeto final é reprovado, quadro `fim` com `mensagemId: null` quando a resposta boa não pode ser gravada, link do formulário, satisfaz **AC-7**, **AC-5b**
4. Chamado em modo leitura: `lerLinhaDoTempo` na tela, cabeçalho com número, situação e link para o detalhe, rodapé explicando que responder é pelos comentários, chamado de formulário sem conversa abrindo igual, satisfaz **AC-10**
5. Lateral completa: rascunhos em bloco no topo e chamados abaixo por `updatedAt`, `carregarMaisConversasAction` com cursor composto, marca `Confirmando`, escuta de `notification:new` com espera de 800ms chamando `router.refresh()`, satisfaz **AC-2**, **AC-13**
6. Celular e acessibilidade: duas telas com voltar por rota e CSS, foco indo para o título ao abrir a conversa, região ao vivo com o comportamento do AC-8, alvos de 44 pixels, nomes acessíveis nos botões de ícone e conferência de contraste, satisfaz **AC-8**, **AC-11**

## Consequences

**Positive**:

- A fundação da spec 0002 ganha a primeira tela, e a spec 0001 ganha o primeiro uso real de streaming em produção.
- A entrada nova nasce ao lado da antiga: `/meus-chamados` continua intacta, então a comparação entre as duas entradas é honesta e a volta atrás custa remover um item de menu.
- A falha da IA é parte do desenho, não um caminho de exceção: o pior cenário continua sendo um chamado aberto pelo formulário.
- As funcionalidades 12 e 13 herdam o contrato de quadros, o modelo de leitura da lateral e o comportamento de acessibilidade, em vez de inventar cada um o seu.

**Negative / tradeoffs**:

- Passam a existir duas listas dos mesmos chamados, a lateral de `/conversas` e a tabela de `/meus-chamados`, com aparências diferentes. Elas podem divergir com o tempo, e alguém terá de decidir quando as duas viram uma só.
- Esta é a primeira rota de streaming do projeto, e o formato de quadros é caseiro: mais um contrato para manter, testar e documentar.
- O link para o formulário leva à lista, onde ainda é preciso clicar em `Novo chamado`. É um clique a mais, pelo compromisso de não mexer na tela atual.
- Cada mensagem enviada é uma chamada à GPU compartilhada na raia interativa, então o tráfego dessa raia cresce com a adoção, antes de a IA decidir qualquer coisa.
- Um módulo novo (`lib/assistente/`) nasce com um prompt que a funcionalidade 12 provavelmente vai substituir; parte deste trabalho é andaime.
- A recarga em tempo real pega carona num evento genérico (`notification:new`), então aviso de SLA também recarrega a tela. É desperdício conhecido e aceito, em troca de não mexer no socket nesta fatia.
- Gestão e técnico ganham permissão de ler a conversa sem nenhum link que leve até ela. A permissão fica correta e ociosa até a funcionalidade 13 ou 17.

**Neutral**:

- Nenhuma coleção nova, nenhum campo novo, nenhuma migração de dados e nenhum evento novo de socket. A única mudança de schema é um índice em `Chamado`, criado pelo Mongoose ao subir.
- `CONVERSA_MENSAGEM_TIPOS` continua só com `texto`; os tipos ricos entram com a funcionalidade 12.
- A tela é a primeira do projeto a ocupar a altura toda da área de conteúdo, o que pede um ajuste local de layout, não uma mudança no `dashboard-shell`.

## Follow-up

- [ ] Decidir se `/meus-chamados` passa a aceitar um parâmetro que já abre o diálogo do formulário, para o link da lateral levar direto. Ficou fora desta fatia pela decisão de não mexer na tela atual.
- [ ] Quando a funcionalidade 12 entrar, decidir se o prompt de acolhimento é substituído ou vira a primeira volta do mesmo laço, e o que acontece com `promptVersion`.
- [ ] Definir quando as duas entradas viram uma só, com um sinal claro (por exemplo, percentual de aberturas pelo chat) para a decisão não ficar em aberto para sempre.
- [ ] Nada mede hoje quantos rascunhos morrem sem virar chamado. Entra na conversa da funcionalidade 18, o painel de acurácia.
- [ ] O `AGENTS.md` não tem seção de skills. Depois do build, as convenções desta tela (streaming por quadros, região ao vivo, modelo de leitura da lateral) devem ficar num `AGENTS.md` da área, não no raiz.
- [ ] Decidir onde gestão e técnico entram na conversa pela tela deles. A permissão já existe na fundação e nesta fatia fica sem link. Assunto da funcionalidade 13 ou da 17.
- [ ] Se o desperdício de recarga por evento de SLA incomodar, criar um evento próprio de conversa no socket. Hoje não vale o custo.
