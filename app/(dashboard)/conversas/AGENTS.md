# AGENTS.md — Tela de conversas

Contexto da rota `/conversas` e das rotas de envio em `app/api/conversas/`. Specs: [0003](../../../docs/specs/0003-tela-chat-chamados/index.md) (a tela e o chat), [0004](../../../docs/specs/0004-abertura-chamado-ia/index.md) (o cartão resumo e a abertura do chamado) e [0005](../../../docs/specs/0005-andamento-conversa-tecnico/index.md) (acompanhamento ao vivo e comentário para os quatro perfis). O assistente que responde tem contexto próprio em [lib/assistente/AGENTS.md](../../../lib/assistente/AGENTS.md).

Desde a spec 0005, a tela é dos quatro perfis (solicitante, técnico, Preposto, Admin), não só do solicitante: cada um lê e escreve pelo mesmo `/conversas/[id]`, com a lateral e a permissão de escrita variando por papel (ver abaixo).

## Como a tela se divide

| Arquivo                | O que faz                                                                                                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout.tsx`           | Monta a lateral no servidor, carrega as unidades ativas para o cartão (spec 0004) e envolve as duas rotas no `ConversasShell`                                                                                         |
| `page.tsx`             | Boas vindas da conversa nova. Não grava nada: a conversa nasce no envio                                                                                                                                               |
| `[id]/page.tsx`        | Resolve o `id` como conversa primeiro e como chamado depois                                                                                                                                                           |
| `_lib/lateral.ts`      | A lateral: rascunhos por `listarRascunhos`, chamados por cursor composto, com o filtro variando por papel desde a spec 0005 (`filtroPorPapel`)                                                                        |
| `_lib/leitura.ts`      | O chamado em modo leitura/acompanhamento, pela `lerLinhaDoTempo` de `lib/conversas`; também monta `statusChave`, `podeComentarInterno`, `souSolicitante` e `avaliacaoRating` (spec 0005)                              |
| `_lib/unidades.ts`     | Lê as unidades ativas (nome e andar) para a lista de troca do cartão (spec 0004)                                                                                                                                       |
| `_components/`         | `ConversasShell` (quadro e tempo real), `ListaLateral`, `PainelConversa`, `PainelChamado`, `CartaoResumo` (o cartão resumo do chat, modo `ia`/`manual`, spec 0004), `ComentarioComposer` (caixa de comentário, spec 0005), `Mensagens`, `Composer`, `DescartarRascunho`, `useEnvio`, `unidades-contexto.tsx` (contexto das unidades ativas para `CartaoResumo`) |
| `_constants.ts`        | Todo o texto fixo da tela, inclusive uma frase por motivo de falha de `lib/conversas`, uma por motivo da rota de comentário (`COMENTARIO_FRASES`) e uma por motivo da confirmação de abertura (`CONFIRMACAO_FRASES`, spec 0004) |
| `_types.ts`            | O modelo de leitura que atravessa para o cliente: só valor simples, datas em ISO                                                                                                                                      |
| `actions.ts`           | Quatro Server Actions: `Carregar mais`, descartar rascunho, `revisarAberturaAction` e `confirmarAberturaAction` (as duas últimas da spec 0004, montam/confirmam o cartão sem chamar o modelo)                        |
| `../../api/conversas/` | `mensagens/route.ts` (conversa nova), `[id]/mensagens/route.ts` (continua), `_lib/fluxo.ts` (o que as duas compartilham), `chamado/[chamadoId]/comentarios/route.ts` (comentário no chamado, JSON simples, spec 0005) |

## Regras que valem aqui

- **Leitura no servidor, envio por rota de API.** A lateral e a conversa são componentes de servidor. O envio (mensagem do chat ou comentário do chamado) é sempre rota de API, nunca Server Action: a mensagem porque precisa transmitir a resposta aos poucos, o comentário porque é a mesma função (`criarComentario`) que as outras telas do chamado já usam, sem depender de existir uma Conversa.
- **NDJSON só nas rotas de mensagem.** `mensagens/route.ts` e `[id]/mensagens/route.ts` respondem `application/x-ndjson` com `inicio`, `parcial`, `fim` ou `reserva`, seguido de um quadro `cartao` opcional (spec 0004: `cartao` preenchido quando nasce ou muda um cartão resumo, `cartao: null` quando o cartão anterior deixou de valer sem outro no lugar). Os schemas vivem em `shared/conversas/quadro.schemas.ts`, e o cabeçalho `X-Accel-Buffering: no` existe porque o nginx da VPS bufferiza por padrão e mataria o efeito. A rota de comentário (`chamado/[chamadoId]/comentarios/route.ts`) é JSON simples, sem streaming: não tem resposta para transmitir aos poucos.
- **Montar e confirmar o cartão nunca chamam o modelo.** `revisarAberturaAction` e `confirmarAberturaAction` só leem `propostaIa` do banco (via `lib/assistente`); confiança, motivo e prioridade sugerida nunca saem do servidor, em nenhum payload de cartão, quadro ou retorno de ação (spec 0004, AC-5).
- **Chamado sem serviço do catálogo é normal vindo do chat.** `Chamado.catalogServiceId`/`subtypeId` só são obrigatórios fora do canal `chat`; o cartão manual abre o chamado com só tipo, unidade e local, e a classificação do Preposto exige o serviço depois.
- **A rota sem `id` é a única dona da criação.** Ela chama `criarConversa` e depois `enviarMensagem`; se o envio falhar por qualquer motivo, ela chama `descartarRascunho` no rascunho recém criado antes de responder. Nunca sobra conversa vazia no banco.
- **Depois do quadro `inicio`, toda tentativa vai para a rota com `id`.** É isso que impede a nova tentativa de criar um segundo rascunho. Ver `useEnvio.ts`.
- **Texto parcial nunca é gravado.** Só o objeto final, aprovado pelo schema Zod, vira `ConversaMensagem`.
- **Nenhuma rota lança por falha de negócio.** O motivo de `lib/conversas` vira status em `_lib/fluxo.ts`, e `sem_permissao` sai como `nao_encontrada` com 404, para não revelar conversa de terceiro. A rota de comentário segue a mesma regra: chamado inexistente e sem permissão respondem os dois com 404 `nao_encontrada`.
- **Toda frase de erro sai de `FALHA_FRASES`.** Motivo cru nunca aparece na tela. Motivo novo em `lib/conversas` exige frase nova aqui. A rota de comentário tem a frase própria dela em `COMENTARIO_FRASES`/`fraseDoComentario`, porque os motivos dela não vêm de `lib/conversas`.
- **O endereço de cada linha é calculado no servidor**, em `_lib/lateral.ts`: o `conversaId` quando há conversa, o `chamadoId` quando não há. O cliente nunca adivinha.
- **Quem pode escolher comentário interno vem pronto do servidor.** `lerLinhaDoTempo` calcula `podeComentarInterno` (gestão ou técnico atribuído) e `_lib/leitura.ts` repassa em `LeituraChamado`; a tela lê esse valor, nunca recalcula quem é gestão ou técnico no cliente.
- **Só o solicitante dono vê o convite para avaliar.** `souSolicitante`, também vindo de `lerLinhaDoTempo`, gira o botão "Avaliar atendimento" em `PainelChamado`; sem essa trava, técnico e gestão veriam um botão que `submitTicketEvaluationAction` só aceita do solicitante.

## Acessibilidade, que é requisito e não enfeite

- A região ao vivo é educada (`role="status"`, `aria-live="polite"`, `aria-atomic="true"`): anuncia que o assistente está respondendo no primeiro quadro e recebe o texto completo uma vez no fim.
- A bolha em construção fica `aria-hidden="true"` enquanto cresce, para o leitor de tela não ler pedaço a pedaço.
- Todo alvo de toque tem no mínimo 44 pixels, e todo botão de ícone tem nome acessível.

## Celular e computador

Uma tela por vez no celular, as duas lado a lado no computador. A troca é por CSS e rota dentro do `ConversasShell`, sem gaveta. No celular, `/conversas/[id]` traz o botão de voltar e manda o foco para o título.

## Tempo real

O `ConversasShell` escuta o evento de navegador `notification:new`, que o `RealtimeProvider` já dispara, espera 800ms (`AGRUPAR_MS`) para agrupar rajadas e chama `router.refresh()` uma vez. Prefira sempre um evento que o `RealtimeProvider` já emita; nenhuma sala nova foi criada para esta tela.

Desde a spec 0005, o `RealtimeProvider` também repassa `ticket:classified` e `ticket:comment_added` para esta tela (sempre silenciosos aqui: só `emitNotificationEvent()`, sem som nem toast), e `ticket:paused` só quando `payload.reason` é exatamente `PAUSE_REASON_LABELS.aguardando_solicitante` (uma pausa por cotação usa o mesmo evento com outro motivo, e é ignorada). O manipulador de `ticket:assigned` também mudou: compara `payload.assignedTo.id` ao `userId` que o `RealtimeProvider` recebe do layout do dashboard, para mostrar texto e link próprios ao técnico ou ao solicitante.

## Testes

Os testes de componente são `*.test.tsx` e abrem com `// @vitest-environment jsdom`, porque a suíte roda em Node por padrão. O fluxo completo pelo navegador está em `e2e/conversas.spec.ts`, e a lista de conferência manual em `docs/specs/0003-tela-chat-chamados/verify.md`, `docs/specs/0004-abertura-chamado-ia/verify.md` e `docs/specs/0005-andamento-conversa-tecnico/verify.md`.

_Drafted by /sync from the introducing change, worth a quick human pass._
