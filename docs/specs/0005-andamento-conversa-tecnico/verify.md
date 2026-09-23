# Verify: Andamento e conversa com o técnico · spec 0005 · updated 2026-09-22

_Passos derivados dos critérios de aceitação da spec 0005. `/check verify` roda estes passos; `/test` trava os duráveis._

## UI / manual

- [x] Como Preposto/Admin, classificar um chamado aberto pelo chat, com o solicitante logado numa sessão à parte e com a conversa desse chamado aberta → o status muda para "Validado" sem recarregar a página → AC-1
- [x] Como Preposto/Admin, atribuir esse chamado a um técnico, com o solicitante e o técnico cada um numa sessão logada → os dois recebem um aviso ao vivo, com texto e link próprios (o do solicitante abre `/conversas/<id do chamado>`, o do técnico abre `/chamados-atribuidos/<id>`) → AC-2
- [x] Como o técnico atribuído, registrar a pausa "Aguardando Solicitante" nesse chamado, com o solicitante na conversa aberta → a pausa aparece ao vivo sem recarregar → AC-3
- [x] Registrar uma cotação para terceiros no mesmo chamado (dispara o mesmo evento de pausa, com outro motivo) → a conversa do solicitante não muda por causa desse evento → AC-3 — **exercido em 2026-09-23**: o gatilho real é a tela `/gestao` (não `/chamados-atribuidos/[id]`), motivo de pausa "Falta de Peça (Aguardando Aprovação do Cliente)", que só aparece no dropdown para o Preposto (`PauseTicketDialog`'s `visibleReasons`). Preposto pausou e enviou a cotação pelo `/gestao`; confirmado que o evento disparou de verdade (notificação persistida com `reason: "Aguardando Aprovação de Cotação"`, chamado foi para `aguardando_terceiros`) e que a conversa do solicitante, já aberta, nunca recarregou (zero requisições novas, selo continuou "Em atendimento").
- [x] Como técnico, registrar a execução; depois, como Preposto, encerrar o chamado — os dois com o solicitante na conversa aberta → as duas mudanças continuam aparecendo ao vivo, sem regressão → AC-4
- [x] Como o técnico atribuído, escrever um comentário público em `/conversas/[id]` do chamado, com o solicitante na conversa aberta → o comentário aparece ao vivo para o solicitante → AC-5, AC-7
- [x] Com dois gestores (um Preposto e um Admin) cada um com a mesma conversa aberta, um deles escreve um comentário público → o outro vê ao vivo, sem recarregar → AC-5
- [x] Como solicitante, escrever uma mensagem com o chamado em qualquer status (aberto, validado, em atendimento, aguardando solicitante, concluído) → o envio nunca é bloqueado, sempre vira comentário público → AC-6
- [x] Como técnico atribuído ou gestão, escrever um comentário e alternar entre público e interno → o alternador aparece e funciona; o comentário marcado como interno não aparece para o solicitante → AC-7
- [x] Como técnico, abrir `/conversas` → a lateral mostra só os chamados atribuídos a ele que ainda estão ativos (validado, em atendimento, aguardando solicitante, concluído) → AC-8
- [x] Como Preposto ou Admin, abrir `/conversas` → a lateral mostra os chamados que ainda não foram encerrados nem cancelados → AC-8
- [x] Como solicitante, abrir `/conversas` → a lateral continua mostrando só os próprios chamados, como antes → AC-8
- [x] Abrir pela primeira vez, em `/conversas/<chamadoId>`, um chamado criado pelo formulário tradicional (nunca teve Conversa) e escrever uma mensagem → grava direto como comentário do chamado; conferir no banco que `conversaId` continua nulo, sem Conversa nova → AC-9
- [x] Como o solicitante dono, abrir a conversa de um chamado encerrado e ainda sem avaliação → aparece o botão "Avaliar atendimento"; avaliar → o botão some e a nota (`X/5`) fica visível → AC-10
- [x] Como técnico ou gestão, abrir a conversa desse mesmo chamado encerrado → não aparece o botão de avaliar (só o solicitante dono avalia) → AC-10
- [x] Logado como um técnico não atribuído, tentar abrir `/conversas/<id>` de um chamado de outro técnico digitando a URL → recebe a mesma resposta de "não encontrada" (404) que já vale hoje, sem revelar que o chamado existe → AC-11
- [x] O mesmo teste com um solicitante tentando abrir a conversa de outro solicitante pela URL → "não encontrada" → AC-11

## Commands

- [x] `npm run typecheck && npm run lint && npm test` → tudo verde → base para todos os AC
- [x] Contra o Mongo de destino: confirmar que o índice `{ assignedToUserId: 1, updatedAt: -1, _id: -1 }` existe na coleção `chamados` (ex.: `db.chamados.getIndexes()`) → serve a lateral do técnico, AC-8

## Acceptance-criteria coverage

- AC-1 … classificação ao vivo · AC-2 … atribuição ao vivo para os dois papéis · AC-3 … pausa aguardando solicitante ao vivo, cotação ignorada · AC-4 … execução e encerramento sem regressão · AC-5 … comentário ao vivo entre os quatro perfis, incluindo gestor para gestor · AC-6 … solicitante escreve em qualquer status · AC-7 … técnico e gestão escrevem com alternador público/interno · AC-8 … lateral por perfil (técnico, gestão, solicitante) · AC-9 … chamado do formulário aceita comentário sem Conversa · AC-10 … avaliação na conversa, só para o solicitante · AC-11 … permissão de leitura e escrita para os quatro perfis, tentativa sem permissão
