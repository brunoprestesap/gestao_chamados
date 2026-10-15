# AGENTS.md — Chamados atribuídos (técnico)

## Overview

A tela do técnico: os chamados atribuídos a ele, e as ações do atendimento (registrar execução, pausar, observação de material, cotação). A API de leitura desta tela (`/api/chamados-atribuidos/[id]`) é restrita a `role === 'Técnico'`; gestão não acessa esta rota, mesmo podendo agir sobre o mesmo chamado por `/gestao`.

## Key files

| Arquivo                                  | Owns                                                                                                                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actions.ts`                             | `registerExecutionAction`, `pauseTicketAction`, `resumeTicketAction`, `addMaterialObservationAction`, `pauseForRequesterAction`, `resumeFromRequesterAction`                            |
| `cotacao.actions.ts`                     | `submitCotacaoAction` (fechada pela spec 0019: recusa todo envio), `approveCotacaoAction`, `rejectCotacaoAction` (usadas só por `/gestao`, para terminar as cotações antigas `enviada`) |
| `[id]/page.tsx`                          | O painel do chamado, com `canPause`/`canRegisterExecution`/`canResume` derivados só do `status` do chamado, não do papel de quem vê                                                     |
| `[id]/_components/PauseTicketDialog.tsx` | O diálogo de pausa, usado aqui e em `/gestao`; o motivo de cotação (`falta_peca_aprovacao_cliente`) não aparece para ninguém desde a spec 0019                                          |

## Conventions

- Mesmo padrão de Server Action do `AGENTS.md` raiz. Aqui a maioria confere `session.role` dentro da própria action, não só via guard de rota.
- Pausa e retomada têm dois pares: `pauseTicketAction`/`resumeTicketAction` (motivo livre) e `pauseForRequesterAction`/`resumeFromRequesterAction` (especificamente "Aguardando Solicitante", o par que a spec 0005 passou a repassar ao vivo em `/conversas`). A pausa por cotação só nasce do envio da cotação de material, e `resumeTicketAction` a recusa enquanto ela estiver aberta (`impedimentoDeRetomada`, `lib/material/chamado.ts`).

## Gotchas

- **`/api/chamados-atribuidos/[id]` é técnico-only.** Preposto e Admin recebem 403 (`Acesso restrito a técnicos`) se tentarem essa API; para agir sobre o mesmo chamado como gestão, é preciso usar `/gestao`, que tem seu próprio painel de detalhe e suas próprias ações (algumas nesta pasta, como a cotação).
- **O material do chamado é o cartão `CartaoCotacaoMaterial`** (de `app/(dashboard)/cotacoes/_components/`): o técnico atribuído registra o material e a execução por ele. Há dois botões de nome quase igual na tela: "Registrar execução" (material, no cartão) e "Registrar Execução" (o serviço, que é recusado enquanto houver cotação de material em trâmite, `impedimentoDeConclusao`).

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
