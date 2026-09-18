# AGENTS.md — Tela de conversas

Contexto da rota `/conversas` e das rotas de envio em `app/api/conversas/`. Spec: [0003](../../../docs/specs/0003-tela-chat-chamados/index.md). O assistente que responde tem contexto próprio em [lib/assistente/AGENTS.md](../../../lib/assistente/AGENTS.md).

## Como a tela se divide

| Arquivo                | O que faz                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout.tsx`           | Monta a lateral no servidor e envolve as duas rotas no `ConversasShell`                                                                             |
| `page.tsx`             | Boas vindas da conversa nova. Não grava nada: a conversa nasce no envio                                                                             |
| `[id]/page.tsx`        | Resolve o `id` como conversa primeiro e como chamado depois                                                                                         |
| `_lib/lateral.ts`      | A lateral: rascunhos por `listarRascunhos`, chamados por cursor composto                                                                            |
| `_lib/leitura.ts`      | O chamado em modo leitura, pela `lerLinhaDoTempo` de `lib/conversas`                                                                                |
| `_components/`         | `ConversasShell` (quadro e tempo real), `ListaLateral`, `PainelConversa`, `PainelChamado`, `Mensagens`, `Composer`, `DescartarRascunho`, `useEnvio` |
| `_constants.ts`        | Todo o texto fixo da tela, inclusive uma frase por motivo de falha                                                                                  |
| `_types.ts`            | O modelo de leitura que atravessa para o cliente: só valor simples, datas em ISO                                                                    |
| `actions.ts`           | As duas Server Actions: `Carregar mais` e descartar rascunho                                                                                        |
| `../../api/conversas/` | `mensagens/route.ts` (conversa nova), `[id]/mensagens/route.ts` (continua), `_lib/fluxo.ts` (o que as duas compartilham)                            |

## Regras que valem aqui

- **Leitura no servidor, envio por rota de API.** A lateral e a conversa são componentes de servidor. Só o envio de mensagem é rota de API, porque precisa transmitir a resposta aos poucos; Server Action não serve para isso.
- **NDJSON, um quadro por linha.** As rotas respondem `application/x-ndjson` com `inicio`, `parcial`, `fim` ou `reserva`. Os schemas vivem em `shared/conversas/quadro.schemas.ts`, e o cabeçalho `X-Accel-Buffering: no` existe porque o nginx da VPS bufferiza por padrão e mataria o efeito.
- **A rota sem `id` é a única dona da criação.** Ela chama `criarConversa` e depois `enviarMensagem`; se o envio falhar por qualquer motivo, ela chama `descartarRascunho` no rascunho recém criado antes de responder. Nunca sobra conversa vazia no banco.
- **Depois do quadro `inicio`, toda tentativa vai para a rota com `id`.** É isso que impede a nova tentativa de criar um segundo rascunho. Ver `useEnvio.ts`.
- **Texto parcial nunca é gravado.** Só o objeto final, aprovado pelo schema Zod, vira `ConversaMensagem`.
- **Nenhuma rota lança por falha de negócio.** O motivo de `lib/conversas` vira status em `_lib/fluxo.ts`, e `sem_permissao` sai como `nao_encontrada` com 404, para não revelar conversa de terceiro.
- **Toda frase de erro sai de `FALHA_FRASES`.** Motivo cru nunca aparece na tela. Motivo novo em `lib/conversas` exige frase nova aqui.
- **O endereço de cada linha é calculado no servidor**, em `_lib/lateral.ts`: o `conversaId` quando há conversa, o `chamadoId` quando não há. O cliente nunca adivinha.

## Acessibilidade, que é requisito e não enfeite

- A região ao vivo é educada (`role="status"`, `aria-live="polite"`, `aria-atomic="true"`): anuncia que o assistente está respondendo no primeiro quadro e recebe o texto completo uma vez no fim.
- A bolha em construção fica `aria-hidden="true"` enquanto cresce, para o leitor de tela não ler pedaço a pedaço.
- Todo alvo de toque tem no mínimo 44 pixels, e todo botão de ícone tem nome acessível.

## Celular e computador

Uma tela por vez no celular, as duas lado a lado no computador. A troca é por CSS e rota dentro do `ConversasShell`, sem gaveta. No celular, `/conversas/[id]` traz o botão de voltar e manda o foco para o título.

## Tempo real

O `ConversasShell` escuta o evento de navegador `notification:new`, que o `RealtimeProvider` já dispara, espera 800ms para agrupar rajadas e chama `router.refresh()` uma vez. Não há sala nova nem evento novo: se precisar de outro gatilho, prefira outro evento que o provider já emita.

## Testes

Os testes de componente são `*.test.tsx` e abrem com `// @vitest-environment jsdom`, porque a suíte roda em Node por padrão. O fluxo completo pelo navegador está em `e2e/conversas.spec.ts`, e a lista de conferência manual em `docs/specs/0003-tela-chat-chamados/verify.md`.

_Drafted by /sync from the introducing change, worth a quick human pass._
