# AGENTS.md — Chamados atribuídos (técnico)

## Overview

A tela do técnico: os chamados atribuídos a ele, e as ações do atendimento (registrar execução, pausar, observação de material, cotação). A API de leitura desta tela (`/api/chamados-atribuidos/[id]`) é restrita a `role === 'Técnico'`; gestão não acessa esta rota, mesmo podendo agir sobre o mesmo chamado por `/gestao`.

## Key files

| Arquivo                                    | Owns                                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `actions.ts`                               | `registerExecutionAction`, `pauseTicketAction`, `resumeTicketAction`, `addMaterialObservationAction`, `pauseForRequesterAction`, `resumeFromRequesterAction` |
| `cotacao.actions.ts`                       | `submitCotacaoAction` (compartilhada com `/gestao`), `approveCotacaoAction`, `rejectCotacaoAction` (usadas só por `/gestao`)                                 |
| `[id]/page.tsx`                            | O painel do chamado, com `canPause`/`canRegisterExecution`/`canResume` derivados só do `status` do chamado, não do papel de quem vê                          |
| `[id]/_components/PauseTicketDialog.tsx`   | O diálogo de pausa; motivo de cotação some do dropdown a menos que `userRole === 'Preposto'` (ver `AGENTS.md` de `gestao`)                                   |
| `[id]/_components/SubmitCotacaoDialog.tsx` | Valor estimado, material/serviço, prazo; reaproveitado por `/gestao` quando o Preposto escolhe o motivo de cotação                                           |

## Conventions

- Mesmo padrão de Server Action do `AGENTS.md` raiz. Aqui a maioria confere `session.role` dentro da própria action, não só via guard de rota.
- Pausa e retomada têm dois pares: `pauseTicketAction`/`resumeTicketAction` (motivo livre, inclui o que abre cotação) e `pauseForRequesterAction`/`resumeFromRequesterAction` (especificamente "Aguardando Solicitante", o par que a spec 0005 passou a repassar ao vivo em `/conversas`).

## Gotchas

- **`/api/chamados-atribuidos/[id]` é técnico-only.** Preposto e Admin recebem 403 (`Acesso restrito a técnicos`) se tentarem essa API; para agir sobre o mesmo chamado como gestão, é preciso usar `/gestao`, que tem seu próprio painel de detalhe e suas próprias ações (algumas nesta pasta, como a cotação).
- **O motivo de pausa "Falta de Peça (Aguardando Aprovação do Cliente)" nunca aparece aqui de verdade.** `PauseTicketDialog` já existe nesta pasta e é usado tanto aqui quanto em `/gestao`, mas como só esta tela é acessível a técnico, e o motivo de cotação só é visível a `userRole === 'Preposto'`, o caminho real para abrir uma cotação é sempre por `/gestao`, nunca por `/chamados-atribuidos/[id]`, mesmo o diálogo estando fisicamente nesta pasta.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
