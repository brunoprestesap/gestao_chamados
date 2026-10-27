# Verify: motivo e histórico no cadastro de material · spec 0022 · updated 2026-10-27

_Passos tirados dos critérios de aceite da spec 0022. O `/check verify` roda estes passos; o `/test` transforma os duráveis em teste._

## UI / manual

Entre como Admin em `/configuracoes/material`.

- [x] Seção Designações: clique em "Revogar…" numa designação vigente → o diálogo diz o efeito e mostra o campo "Motivo", com "Mínimo de 10 caracteres" e "0 de 500" embaixo → AC-5
- [x] No mesmo diálogo, escreva 9 caracteres e confirme → nada é enviado, o erro aparece no campo e o foco fica nele → AC-1, AC-5
- [x] Escreva só espaços (10 ou mais) e confirme → recusado do mesmo jeito → AC-1
- [x] Escreva um motivo válido e confirme → toast "Designação revogada.", a linha some da lista → AC-1, AC-5
- [x] Marque "Mostrar revogadas" e abra "Histórico" na linha revogada → "Revogada em DD/MM/AAAA, HH:MM por <seu nome>" e "Motivo: <texto>" → AC-6
- [x] Revogue perto da meia noite de Belém (ou confira um ato gravado entre 21:00 e 23:59 de Belém) → a data mostrada é a de Belém, não a de UTC → AC-6
- [x] Seção Faixas: desative uma faixa com motivo → toast "Faixa desativada."; em "N desativadas", a faixa mostra data, autor e motivo → AC-2, AC-6
- [x] Seção Empenhos: inative um empenho com motivo, depois reative com outro → toasts "Empenho inativado." e "Empenho reativado."; em "Histórico" do cartão aparecem Reativado e Inativado, do mais novo ao mais antigo, junto dos reforços e anulações, cada um com data, hora e nome → AC-3, AC-6
- [x] Abra o diálogo de inativar em duas abas; confirme numa e depois na outra → a segunda recebe "O empenho já está inativo. Recarregue." em toast, o diálogo fica aberto com o texto e a tela não recarrega → AC-3, AC-5
- [x] Feche e reabra qualquer diálogo de confirmação → o campo de motivo vem vazio → AC-5
- [x] Num banco com dados de antes da spec: a designação revogada antiga mostra "Motivo não registrado"; a faixa desativada antiga mostra "Desativada antes do registro do motivo"; o empenho inativo antigo mostra "Inativado antes do registro do motivo" no fim do histórico; o empenho que nunca mudou de situação mostra só os movimentos → AC-7
- [ ] Revogue uma designação com um Admin, depois desative esse Admin (isActive false) → o histórico continua mostrando o nome dele → AC-6
- [x] Entre como Preposto e chame as três actions (ou abra `/configuracoes/material`) → recusado, sem gravar → AC-8
- [ ] Abra uma cotação autorizada no empenho que você inativou e reativou (TRF1, contratada e técnico), o cartão do chamado, a fila e o PDF → nenhum motivo, autor ou data dos atos do cadastro aparece → AC-8
- [x] Com uma faixa ativa, um empenho elegível e as designações vigentes, a lista "Para aprovar a primeira cotação" e as notas da navegação contam como antes; uma cotação ainda é aprovada → AC-9

## Comandos

- [x] `npx tsc --noEmit` → sem erro → AC-9
- [x] `npx vitest run shared/material "app/(dashboard)/configuracoes/material"` → verde (diálogo, histórico, linha do tempo, data em Belém, actions) → AC-1, AC-2, AC-3, AC-5, AC-6, AC-7, AC-8
- [x] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/material` → verde, inclusive `motivo-cadastro.db.test.ts` (atos, corrida, hook do histórico, revogação automática, leitura do painel, varredura) → AC-1 a AC-4, AC-6 a AC-9
- [x] `npm run test:e2e -- e2e/cotacao-flow.spec.ts` num banco próprio → o passo do cadastro abre "Desativar faixa", o motivo curto fica com erro e foco, e o diálogo passa no axe → AC-5

## Origem de cada valor (tabela Value sourcing)

- [x] Motivo: o texto gravado é o digitado, sem os espaços das pontas; na revogação automática é "Revogada automaticamente: cadastro simultâneo com período sobreposto." → AC-1
- [x] Autor: com dois Admins diferentes, cada ato mostra o nome de quem estava na sessão, nunca o do designado nem o do criador → AC-6
- [x] Data do ato: é a hora do servidor no momento da escrita, mostrada no fuso de Belém igual no servidor e no navegador → AC-6
- [x] Situação nova do empenho: pedir "inativar" num empenho já inativo não grava item no histórico → AC-3
- [x] Nome do autor: usuário apagado da coleção `users` aparece como "Usuário removido" (e campo vazio continua "—") → AC-6
- [x] Ato antigo: designação com motivo `""` também mostra "Motivo não registrado" (teste falsy) → AC-7
- [x] Ordem da linha do tempo: um reforço gravado depois de uma inativação aparece acima dela → AC-6

## Acceptance-criteria coverage

- AC-1: diálogo de designação, motivo curto e só espaços, revogação automática, `motivo-cadastro.db.test.ts`
- AC-2: diálogo e histórico da faixa, `motivo-cadastro.db.test.ts`
- AC-3: inativar e reativar, corrida em duas abas, `motivo-cadastro.db.test.ts`
- AC-4: hook do empenho e `somenteInclusao` em `motivo-cadastro.db.test.ts`
- AC-5: campo, contador, mínimo, erro no campo, recusa por toast, E2E com axe
- AC-6: histórico das três linhas, data em Belém, nome do autor desligado ou removido
- AC-7: frases do ato antigo
- AC-8: Preposto recusado, varredura da cotação
- AC-9: typecheck, suíte de `lib/material`, primeira cotação aprovada como antes
