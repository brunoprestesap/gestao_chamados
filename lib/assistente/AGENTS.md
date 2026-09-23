# AGENTS.md — Assistente da conversa

O assistente que responde na tela `/conversas` e abre o chamado a partir dela. Specs: [0003](../../docs/specs/0003-tela-chat-chamados/index.md) (a conversa) e [0004](../../docs/specs/0004-abertura-chamado-ia/index.md) (a abertura). Ele fala com o modelo só através de [lib/llm](../llm/AGENTS.md), e a tela que o consome tem contexto próprio em [app/(dashboard)/conversas/AGENTS.md](<../../app/(dashboard)/conversas/AGENTS.md>).

## Arquivos

| Arquivo        | O que faz                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`     | Único ponto de entrada. Quem chama usa só `responderNaConversa`, `revisarAbertura` e `confirmarAbertura`                                        |
| `responder.ts` | Grava a mensagem do solicitante, chama a tarefa `conversa.abertura`, transmite a resposta em quadros e grava proposta/cartão                    |
| `prompt.ts`    | `ABERTURA_TASK = 'conversa.abertura'`, `PROMPT_VERSION` e `montarSistema({ catalogo, perfil, proposta })`                                        |
| `schema.ts`    | `respostaAberturaSchema`: a extração (serviço, prioridade, local, `completo`) antes da `resposta` final, até 600 caracteres                      |
| `catalogo.ts`  | `lerCatalogoParaPrompt()`: as linhas do catálogo ativo para o prompt e o mapa de `code` para ids                                                 |
| `proposta.ts`  | Valida a extração contra o catálogo e monta a `PropostaIa`; compara o conteúdo visível de duas propostas                                        |
| `cartao.ts`    | `montarCartao(proposta, perfil)` e `revisarAbertura(viewer, conversaId)`, sem chamar o modelo                                                    |
| `confirmar.ts` | `confirmarAbertura(viewer, entrada)`: conferências, `abrirChamadoDaConversa`, decisões, mensagem final e notificação; `montarTituloChat`          |
| `perfil.ts`    | `lerPerfil(userId)`: a unidade ativa de quem relata, ou `SEM_PERFIL`                                                                             |
| `config.ts`    | Tetos que mudam com deploy: `CATALOGO_PROMPT_MAX_CARACTERES`, `CATALOGO_DESCRICAO_MAX`, `ENTRADA_MAX_CARACTERES`, `MOTIVO_VAZIO`                 |
| `mensagens.ts` | Frases fixas do Sigma: reserva, chamado aberto e as frases do cartão                                                                             |

## Regras que valem aqui

- **Nada lança.** Falha do modelo vira quadro `reserva`; resposta boa que não pôde ser gravada vira `fim` com `mensagemId: null`. Quem chama nunca precisa de `try`.
- **O dono é conferido antes do modelo.** `responderNaConversa` começa por `lerConversa`, que resolve existência, permissão e histórico de uma vez. É isso que impede um pedido de terceiro de gastar vaga na GPU compartilhada.
- **Este módulo nunca cria nem descarta rascunho.** Isso é da rota sem `id` em `app/api/conversas/mensagens/`.
- **Texto de reserva é sempre do Sigma, nunca do modelo.** Se o modelo falhou, é exatamente por isso que estamos na reserva. Motivo novo de `LlmFailure` exige frase nova em `mensagens.ts`.
- **`cancelled` não grava nada.** Quem desistiu foi a pessoa, e uma mensagem de sistema só sujaria a conversa no recarregamento.
- **Montar cartão e confirmar nunca chamam o modelo.** `revisarAbertura` e `confirmarAbertura` só leem `propostaIa` do banco; o botão `Revisar e abrir` e a confirmação não geram tráfego ao vLLM.
- **Confiança, motivo e prioridade sugerida nunca saem do servidor.** Ficam em `propostaIa`; nenhum payload de cartão, quadro ou retorno de ação os expõe (spec 0004, AC-5).
- **Nenhum log traz texto de relato, resposta ou local.** As linhas `[assistente]` levam só `conversaId`, se o código veio válido, `completo`, o destino do cartão e a duração.
- **Só servidor.** Todo arquivo importa `server-only`.
- **`PROMPT_VERSION` muda junto com o texto do prompt.** É ele que amarra um registro de `LlmCall` à redação que o produziu.

## Abertura do chamado (spec 0004)

A cada mensagem, a tarefa `conversa.abertura` devolve, no mesmo objeto, a extração (código do serviço ou nulo, prioridade, local exato, `completo`) e a `resposta` para a pessoa. O servidor valida o código contra o `ServiceCatalog` ativo, guarda a proposta em `Conversa.propostaIa` e, quando ela está completa (serviço válido, local preenchido), grava sozinho um cartão resumo (`ConversaMensagem` tipo `cartao`). Sem IA, sem serviço reconhecido ou com o código inválido, o cartão nasce em modo `manual` (só tipo, unidade e local) e o chamado abre do mesmo jeito, para o Preposto escolher o serviço na classificação — nenhuma falha da IA impede a abertura.
