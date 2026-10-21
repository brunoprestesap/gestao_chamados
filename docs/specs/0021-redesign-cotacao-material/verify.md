# Verify: Repaginação das telas da cotação de material · spec 0021 · updated 2026-10-21 (fatias 1 e 2)

_Steps derived from spec 0021 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Fatia 1: peças compartilhadas e fila

### UI / manual

- [x] Entre como fiscal e abra `/cotacoes` → o resumo do topo mostra Esperando você, Em aprovação (com o valor somado a reservar), Ateste fora do prazo e Saldo dos empenhos elegíveis → AC-2
- [ ] Entre como responsável técnico (Preposto) e abra `/cotacoes` → o resumo mostra Esperando você, Devolvidas e NF pendente, sem nenhum valor em reais; a tabela não tem a coluna Valor → AC-2, AC-24
- [x] Cada aba mostra a contagem ao lado do nome; ligue "Só urgentes" e busque um número → as contagens das abas mudam, o resumo do topo não muda → AC-2, AC-3
- [x] Na aba Análise, busque pelo número de um chamado (com ou sem `#`) com "Só urgentes" ligado → só a cotação daquele chamado aparece, e o endereço fica `?aba=analise&q=...&urgente=1` → AC-3
- [x] Recarregue a página com o filtro do passo anterior → a aba, a busca e o "Só urgentes" continuam iguais → AC-3
- [x] Busque pelo código de um ativo (ex.: `MNT-0412`, também em minúsculas) e pelo começo do número da cotação (ex.: `cot-2026`) → aparecem as cotações certas → AC-3
- [x] Busque `.*(` → a tela mostra "Nenhuma cotação com esses filtros.", sem erro → AC-3
- [x] Com mais de 25 cotações numa aba, abra `?pagina=99` → cai na última página, e o rodapé diz "Mostrando X–Y de N" → AC-3
- [ ] Nas abas Minhas ações, Análise, Aprovação e Ateste, a ordem indicada é "Mais tempo na etapa" (quem está há mais dias vem primeiro); em Todas, "Mais recentes" → AC-3
- [ ] Cada linha mostra número e quantidade de itens, chamado (número e título, com link), ativo e local quando houver, selo com a jornada em miniatura, sinais, valor (só TRF1) e "na etapa há"; acima de 5 dias o "na etapa há" fica em destaque → AC-4
- [x] Uma cotação devolvida mostra a jornada em miniatura com a barra laranja na etapa de onde voltou → AC-4, AC-5
- [x] Aba sem nada → uma frase (ex.: "Nada esperando por você agora."), nunca uma tabela vazia → AC-4
- [ ] A 390 px de largura → cada linha vira um cartão com número, selo, título do chamado, sinais e "na etapa há", sem rolagem horizontal da página → AC-4, AC-25
- [x] O selo da situação é o mesmo na fila, no detalhe (`/cotacoes/[id]`) e no cartão do chamado → AC-1
- [x] Navegue a fila só pelo teclado → as abas têm foco visível, a busca tem rótulo, o "Só urgentes" anuncia ligado ou desligado → AC-26

### Value sourcing

- [x] "Na etapa há": uma cotação autorizada há 8 dias e conciliada ontem mostra "8 dias", não "1 dia" nem "hoje" (o `updatedAt` e o evento `conciliar` não contam) → AC-4
- [ ] Título do chamado e local: troque o título do chamado e recarregue → a linha mostra o título novo; cotação sem local mostra só o ativo → AC-4
- [x] Quantidade de itens: uma cotação com 1 item mostra "1 item"; com 3, "3 itens" → AC-4
- [x] Contagem por aba: o número da aba é igual ao total do rodapé quando a aba está aberta, com e sem busca → AC-3
- [x] Saldo elegível: sem empenho elegível o bloco mostra "—" e "nenhum empenho elegível", nunca R$ 0,00 → AC-2
- [x] Ateste fora do prazo: uma cotação executada há mais de 5 dias sem recebimento provisório entra na contagem; com o provisório registrado hoje, sai → AC-2

### Commands

- [x] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/material shared/material "app/(dashboard)/cotacoes"` → tudo passa, sem mudar expectativa dos testes antigos → AC-29
- [x] `npx tsc --noEmit` e `npm run lint` → sem erro → AC-29
- [ ] `npm run test:e2e -- cotacao-flow` num banco próprio (nunca o `manutencao`) → os testes da fila passam, inclusive o axe sem violação a 1280 px e a 390 px → AC-25, AC-26

## Fatia 2: detalhe

### UI / manual

- [x] Como fiscal, abra `/cotacoes/[id]` de uma cotação em análise → o topo mostra a trilha de navegação "Cotações / COT-…", o número, o selo, Urgente quando houver, o chamado (número e título, com link), o ativo, "Montada por <nome> (contratada)" e o total à direita → AC-5
- [x] Logo abaixo, a jornada de 7 etapas com a data de cada etapa vencida; a etapa atual fica marcada → AC-5
- [x] Abra uma cotação devolvida e depois reenviada → a jornada mostra as datas do reenvio, não as da primeira passada; uma reprovada mostra o desvio na etapa em que foi reprovada → AC-5
- [x] Como o fiscal que assumiu, com um orçamento vencido → o painel "Sua vez" à direita diz "Analisar e encaminhar", "Você atua como Fiscal.", lista "Orçamento vencido" com o nome do fornecedor em "Para encaminhar", as advertências com título e os botões Encaminhar para aprovação (gradiente), Devolver e Reprovar → AC-6
- [ ] Como responsável técnico, abra a mesma cotação → o painel diz "Agora é a vez de: Fiscal.", sem o nome do fiscal, sem botões e sem o bloco Empenho → AC-6, AC-24
- [x] Como técnico atribuído, abra uma cotação autorizada → o painel diz "Aplicar o material" com o botão Registrar execução; a jornada aparece sem datas → AC-6, AC-24
- [x] Na aba Itens e preços, cada item mostra a etiqueta colorida da origem e a referência na tabela, e o total no rodapé → AC-7
- [x] Na aba Orçamentos, a grade tem um item por linha e um fornecedor por coluna, o menor preço do envio em verde, "não cotou" nas células vazias, a validade (e "validade vencida" ou a confirmação) e "Complemento da urgência" no cabeçalho, e o link de cada arquivo embaixo → AC-7
- [ ] Na aba Trilha, como TRF1 → ato, autor e papel, data, motivo, limite no ato, valor reservado ou liberado e projeção; "Conciliação do saldo" aparece pelo rótulo. Como contratada → sem autor no recebimento e sem a conciliação → AC-7
- [x] Em aprovação, o bloco Empenho mostra uma barra por empenho elegível com Comprometido, Esta cotação e Saldo depois (saldo menos o valor), a projeção e "Podem aprovar este valor: …" → AC-8
- [x] Autorizada → o bloco mostra só o empenho da cotação, com a reserva separada como "Esta cotação" e o saldo depois igual ao saldo de agora → AC-8
- [x] Sem empenho elegível → o bloco diz que não há empenho elegível, sem nenhum R$ 0,00 → AC-8
- [x] A 390 px → o painel "Sua vez", o Empenho e o Documento descem para depois do conteúdo; as tabelas e as abas rolam dentro da caixa, sem rolagem horizontal da página → AC-25
- [x] Navegue o detalhe só pelo teclado → as abas têm foco visível e trocam com as setas; os botões do painel são `button` de verdade → AC-26

### Value sourcing

- [x] Data de cada etapa: uma cotação devolvida em 14/10 e reenviada em 16/10 mostra "Enviada 16/10", e o rascunho continua com a data da criação → AC-5
- [x] Quem montou: troque o nome do responsável técnico no cadastro de usuários e recarregue → o cabeçalho mostra o nome novo → AC-5
- [x] Saldo depois em aprovação: empenho de R$ 1.000 com R$ 200 comprometidos e cotação de R$ 300 → Saldo depois R$ 500 → AC-8
- [x] Saldo depois autorizada: o mesmo empenho, agora com R$ 500 comprometidos (a reserva de R$ 300 dentro) → Comprometido R$ 200, Esta cotação R$ 300, Saldo depois R$ 500 (sem descontar duas vezes) → AC-8
- [x] Quem age: em análise com fiscal que assumiu, o TRF1 vê o nome dele e a contratada só "Fiscal" → AC-6, AC-24

### Commands

- [x] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/material shared/material "app/(dashboard)/cotacoes"` → tudo passa, inclusive `detalhe.db.test.ts`, `detalhe-pecas.test.ts` e `DetalheCotacaoView.test.tsx`, sem mudar expectativa dos testes antigos → AC-29
- [ ] `npm run test:e2e -- cotacao-flow` num banco próprio → o passo da aprovação acha o empenho no bloco Empenho e o "limite no ato" na aba Trilha; o detalhe passa no axe a 1280 e a 390 px → AC-25, AC-26

## Acceptance-criteria coverage

- AC-1: selo nos três lugares, teste `compartilhado.test.tsx`
- AC-2: resumo por lado, `fila.db.test.ts` (resumo) e passos manuais
- AC-3: busca, filtro, ordem, página e endereço, `fila.db.test.ts`, `fila-pecas.test.ts` e E2E
- AC-4: linha, "na etapa há" e cartão no celular, `fila.db.test.ts` e passos manuais
- AC-24: valor só no TRF1, `fila.db.test.ts`
- AC-25, AC-26: E2E com axe a 390 px e no desktop
- AC-27, AC-28: textos em `mensagens.ts` e a variante `gradiente` do `Button` (ainda sem uso na fila, que não tem botão primário)
- AC-29: suíte de `lib/material` sem mudança de expectativa
- AC-5: cabeçalho e jornada datada, `detalhe.db.test.ts`, `detalhe-pecas.test.ts` e `DetalheCotacaoView.test.tsx`
- AC-6: painel "Sua vez" (ação principal, pontos, secundárias, quem age), `DetalheCotacaoView.test.tsx`
- AC-7: abas Itens, Orçamentos (grade e menor preço) e Trilha (com a conciliação), `DetalheCotacaoView.test.tsx`
- AC-8: bloco Empenho por situação, sem desconto em dobro, `detalhe.db.test.ts`
- AC-24 (fatia 2): `etapas`, `montadoPorNome`, `quemAgeAgora` e `empenho` por visão, `detalhe.db.test.ts`
- Fatias 3 a 8 (AC-9 a AC-23): passos entram quando cada fatia for construída
