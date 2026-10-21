# Verify: Repaginação das telas da cotação de material · spec 0021 · updated 2026-10-21

_Steps derived from spec 0021 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Fatia 1: peças compartilhadas e fila

### UI / manual

- [ ] Entre como fiscal e abra `/cotacoes` → o resumo do topo mostra Esperando você, Em aprovação (com o valor somado a reservar), Ateste fora do prazo e Saldo dos empenhos elegíveis → AC-2
- [ ] Entre como responsável técnico (Preposto) e abra `/cotacoes` → o resumo mostra Esperando você, Devolvidas e NF pendente, sem nenhum valor em reais; a tabela não tem a coluna Valor → AC-2, AC-24
- [ ] Cada aba mostra a contagem ao lado do nome; ligue "Só urgentes" e busque um número → as contagens das abas mudam, o resumo do topo não muda → AC-2, AC-3
- [ ] Na aba Análise, busque pelo número de um chamado (com ou sem `#`) com "Só urgentes" ligado → só a cotação daquele chamado aparece, e o endereço fica `?aba=analise&q=...&urgente=1` → AC-3
- [ ] Recarregue a página com o filtro do passo anterior → a aba, a busca e o "Só urgentes" continuam iguais → AC-3
- [ ] Busque pelo código de um ativo (ex.: `MNT-0412`, também em minúsculas) e pelo começo do número da cotação (ex.: `cot-2026`) → aparecem as cotações certas → AC-3
- [ ] Busque `.*(` → a tela mostra "Nenhuma cotação com esses filtros.", sem erro → AC-3
- [ ] Com mais de 25 cotações numa aba, abra `?pagina=99` → cai na última página, e o rodapé diz "Mostrando X–Y de N" → AC-3
- [ ] Nas abas Minhas ações, Análise, Aprovação e Ateste, a ordem indicada é "Mais tempo na etapa" (quem está há mais dias vem primeiro); em Todas, "Mais recentes" → AC-3
- [ ] Cada linha mostra número e quantidade de itens, chamado (número e título, com link), ativo e local quando houver, selo com a jornada em miniatura, sinais, valor (só TRF1) e "na etapa há"; acima de 5 dias o "na etapa há" fica em destaque → AC-4
- [ ] Uma cotação devolvida mostra a jornada em miniatura com a barra laranja na etapa de onde voltou → AC-4, AC-5
- [ ] Aba sem nada → uma frase (ex.: "Nada esperando por você agora."), nunca uma tabela vazia → AC-4
- [ ] A 390 px de largura → cada linha vira um cartão com número, selo, título do chamado, sinais e "na etapa há", sem rolagem horizontal da página → AC-4, AC-25
- [ ] O selo da situação é o mesmo na fila, no detalhe (`/cotacoes/[id]`) e no cartão do chamado → AC-1
- [ ] Navegue a fila só pelo teclado → as abas têm foco visível, a busca tem rótulo, o "Só urgentes" anuncia ligado ou desligado → AC-26

### Value sourcing

- [ ] "Na etapa há": uma cotação autorizada há 8 dias e conciliada ontem mostra "8 dias", não "1 dia" nem "hoje" (o `updatedAt` e o evento `conciliar` não contam) → AC-4
- [ ] Título do chamado e local: troque o título do chamado e recarregue → a linha mostra o título novo; cotação sem local mostra só o ativo → AC-4
- [ ] Quantidade de itens: uma cotação com 1 item mostra "1 item"; com 3, "3 itens" → AC-4
- [ ] Contagem por aba: o número da aba é igual ao total do rodapé quando a aba está aberta, com e sem busca → AC-3
- [ ] Saldo elegível: sem empenho elegível o bloco mostra "—" e "nenhum empenho elegível", nunca R$ 0,00 → AC-2
- [ ] Ateste fora do prazo: uma cotação executada há mais de 5 dias sem recebimento provisório entra na contagem; com o provisório registrado hoje, sai → AC-2

### Commands

- [ ] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/material shared/material "app/(dashboard)/cotacoes"` → tudo passa, sem mudar expectativa dos testes antigos → AC-29
- [ ] `npx tsc --noEmit` e `npm run lint` → sem erro → AC-29
- [ ] `npm run test:e2e -- cotacao-flow` num banco próprio (nunca o `manutencao`) → os testes da fila passam, inclusive o axe sem violação a 1280 px e a 390 px → AC-25, AC-26

## Acceptance-criteria coverage

- AC-1: selo nos três lugares, teste `compartilhado.test.tsx`
- AC-2: resumo por lado, `fila.db.test.ts` (resumo) e passos manuais
- AC-3: busca, filtro, ordem, página e endereço, `fila.db.test.ts`, `fila-pecas.test.ts` e E2E
- AC-4: linha, "na etapa há" e cartão no celular, `fila.db.test.ts` e passos manuais
- AC-24: valor só no TRF1, `fila.db.test.ts`
- AC-25, AC-26: E2E com axe a 390 px e no desktop
- AC-27, AC-28: textos em `mensagens.ts` e a variante `gradiente` do `Button` (ainda sem uso na fila, que não tem botão primário)
- AC-29: suíte de `lib/material` sem mudança de expectativa
- Fatias 2 a 8 (AC-5 a AC-23): passos entram quando cada fatia for construída
