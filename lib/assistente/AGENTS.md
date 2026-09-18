# AGENTS.md — Assistente da conversa

O assistente que responde na tela `/conversas`. Spec: [0003](../../docs/specs/0003-tela-chat-chamados/index.md). Ele fala com o modelo só através de [lib/llm](../llm/AGENTS.md), e a tela que o consome tem contexto próprio em [app/(dashboard)/conversas/AGENTS.md](<../../app/(dashboard)/conversas/AGENTS.md>).

## Arquivos

| Arquivo        | O que faz                                                                      |
| -------------- | ------------------------------------------------------------------------------ |
| `index.ts`     | Único ponto de entrada. Quem chama usa só `responderNaConversa`                |
| `responder.ts` | Grava a mensagem do solicitante e transmite a resposta em quadros              |
| `prompt.ts`    | Texto de sistema, `ASSISTENTE_TASK`, `PROMPT_VERSION` e os tetos da tarefa     |
| `schema.ts`    | O único formato de resposta aceito: `{ resposta: string }`, até 600 caracteres |
| `mensagens.ts` | Uma frase fixa do Sigma por motivo de falha da IA                              |

## Regras que valem aqui

- **Nada lança.** Falha do modelo vira quadro `reserva`; resposta boa que não pôde ser gravada vira `fim` com `mensagemId: null`. Quem chama nunca precisa de `try`.
- **O dono é conferido antes do modelo.** `responderNaConversa` começa por `lerConversa`, que resolve existência, permissão e histórico de uma vez. É isso que impede um pedido de terceiro de gastar vaga na GPU compartilhada.
- **Este módulo nunca cria nem descarta rascunho.** Isso é da rota sem `id` em `app/api/conversas/mensagens/`.
- **Texto de reserva é sempre do Sigma, nunca do modelo.** Se o modelo falhou, é exatamente por isso que estamos na reserva. Motivo novo de `LlmFailure` exige frase nova em `mensagens.ts`.
- **`cancelled` não grava nada.** Quem desistiu foi a pessoa, e uma mensagem de sistema só sujaria a conversa no recarregamento.
- **Nenhum log traz texto de relato.** As linhas `[assistente]` levam só `conversaId`, motivo e duração.
- **Só servidor.** Todo arquivo importa `server-only`.
- **`PROMPT_VERSION` muda junto com o texto do prompt.** É ele que amarra um registro de `LlmCall` à redação que o produziu.

## Andaime assumido

Nesta fatia o assistente só acolhe: confirma em uma frase o que entendeu e faz no máximo uma pergunta. Ele não escolhe serviço, não define prioridade, não sugere técnico, não grava `DecisaoIa` e não abre chamado. Isso é a funcionalidade 12 do escopo, e o prompt de acolhimento provavelmente sai quando ela entrar.

_Drafted by /sync from the introducing change, worth a quick human pass._
