# Verify: Repaginação das telas da cotação de material · spec 0021 · updated 2026-10-22 (fatias 1 a 4)

_Steps derived from spec 0021 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Fatia 1: peças compartilhadas e fila

### UI / manual

- [x] Entre como fiscal e abra `/cotacoes` → o resumo do topo mostra Esperando você, Em aprovação (com o valor somado a reservar), Ateste fora do prazo e Saldo dos empenhos elegíveis → AC-2
- [x] Entre como responsável técnico (Preposto) e abra `/cotacoes` → o resumo mostra Esperando você, Devolvidas e NF pendente, sem nenhum valor em reais; a tabela não tem a coluna Valor → AC-2, AC-24
- [x] Cada aba mostra a contagem ao lado do nome; ligue "Só urgentes" e busque um número → as contagens das abas mudam, o resumo do topo não muda → AC-2, AC-3
- [x] Na aba Análise, busque pelo número de um chamado (com ou sem `#`) com "Só urgentes" ligado → só a cotação daquele chamado aparece, e o endereço fica `?aba=analise&q=...&urgente=1` → AC-3
- [x] Recarregue a página com o filtro do passo anterior → a aba, a busca e o "Só urgentes" continuam iguais → AC-3
- [x] Busque pelo código de um ativo (ex.: `MNT-0412`, também em minúsculas) e pelo começo do número da cotação (ex.: `cot-2026`) → aparecem as cotações certas → AC-3
- [x] Busque `.*(` → a tela mostra "Nenhuma cotação com esses filtros.", sem erro → AC-3
- [x] Com mais de 25 cotações numa aba, abra `?pagina=99` → cai na última página, e o rodapé diz "Mostrando X–Y de N" → AC-3
- [x] Nas abas Minhas ações, Análise, Aprovação e Ateste, a ordem indicada é "Mais tempo na etapa" (quem está há mais dias vem primeiro); em Todas, "Mais recentes" → AC-3
- [x] Cada linha mostra número e quantidade de itens, chamado (número e título, com link), ativo e local quando houver, selo com a jornada em miniatura, sinais, valor (só TRF1) e "na etapa há"; acima de 5 dias o "na etapa há" fica em destaque → AC-4
- [x] Uma cotação devolvida mostra a jornada em miniatura com a barra laranja na etapa de onde voltou → AC-4, AC-5
- [x] Aba sem nada → uma frase (ex.: "Nada esperando por você agora."), nunca uma tabela vazia → AC-4
- [x] A 390 px de largura → cada linha vira um cartão com número, selo, título do chamado, sinais e "na etapa há", sem rolagem horizontal da página → AC-4, AC-25
- [x] O selo da situação é o mesmo na fila, no detalhe (`/cotacoes/[id]`) e no cartão do chamado → AC-1
- [x] Navegue a fila só pelo teclado → as abas têm foco visível, a busca tem rótulo, o "Só urgentes" anuncia ligado ou desligado → AC-26

### Value sourcing

- [x] "Na etapa há": uma cotação autorizada há 8 dias e conciliada ontem mostra "8 dias", não "1 dia" nem "hoje" (o `updatedAt` e o evento `conciliar` não contam) → AC-4
- [x] Título do chamado e local: troque o título do chamado e recarregue → a linha mostra o título novo; cotação sem local mostra só o ativo → AC-4
- [x] Quantidade de itens: uma cotação com 1 item mostra "1 item"; com 3, "3 itens" → AC-4
- [x] Contagem por aba: o número da aba é igual ao total do rodapé quando a aba está aberta, com e sem busca → AC-3
- [x] Saldo elegível: sem empenho elegível o bloco mostra "—" e "nenhum empenho elegível", nunca R$ 0,00 → AC-2
- [x] Ateste fora do prazo: uma cotação executada há mais de 5 dias sem recebimento provisório entra na contagem; com o provisório registrado hoje, sai → AC-2

### Commands

- [x] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/material shared/material "app/(dashboard)/cotacoes"` → tudo passa, sem mudar expectativa dos testes antigos → AC-29
- [x] `npx tsc --noEmit` e `npm run lint` → sem erro → AC-29
- [x] `npm run test:e2e -- cotacao-flow` num banco próprio (nunca o `manutencao`) → os testes da fila passam, inclusive o axe sem violação a 1280 px e a 390 px → AC-25, AC-26

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
- [x] `npm run test:e2e -- cotacao-flow` num banco próprio → o passo da aprovação acha o empenho no bloco Empenho e o "limite no ato" na aba Trilha; o detalhe passa no axe a 1280 e a 390 px → AC-25, AC-26

## Fatia 3: ateste

### UI / manual

- [ ] Como gestor, abra `/cotacoes/[id]` de uma cotação executada → o ateste vem antes das abas, com três cartões em ordem: 1 Recebimento provisório (Agora, com "Prazo até dd/mm"), 2 Recebimento definitivo (A seguir), 3 Nota fiscal (A seguir), e a regra "5 dias corridos por etapa" → AC-9
- [ ] A mesma cotação executada há mais de 5 dias → o cartão 1 fica laranja, com "Atrasado N dias" e "O prazo era dd/mm" → AC-9
- [x] O painel "Sua vez" diz "Receber o material", "Você atua como Gestor." e o botão gradiente "Registrar recebimento provisório"; clique → abre o diálogo de confirmação com "Cancelar" e "Confirmar"; confirme → o cartão 1 vira "Registrado" com data e nome, o 2 vira "Agora" com o prazo novo → AC-6, AC-9
- [x] Registre o definitivo pelo painel → a cotação fica atestada, o cartão 2 vira "Registrado" e o 3 diz "Aguardando a contratada." → AC-6, AC-9
- [x] Como responsável técnico, abra a mesma cotação atestada → o painel diz "Registrar a nota fiscal" com o botão "Registrar nota fiscal"; o diálogo pede número, data e arquivo, passa pela conferência e, registrada, o cartão 3 mostra "Nº X, de dd/mm/aaaa." e o link "Arquivo da nota fiscal" → AC-6, AC-9
- [x] Como responsável técnico, numa cotação executada → os cartões abertos dizem só "Aguardando o TRF1.", sem prazo nem atraso, e os registrados mostram a data sem o nome de quem recebeu → AC-9, AC-24
- [x] A tabela "Autorizado e aplicado" mostra, por item, Qtd. autorizada, Valor autorizado, Qtd. aplicada (em destaque quando difere) e Valor aplicado, com o total no rodapé; "Informado pelo técnico em …" no topo → AC-9
- [x] As evidências aparecem embaixo da tabela como lista, cada uma com ícone de foto ou de PDF, "Foto · 120 KB" ou "PDF · 1,2 MB", e baixam pelo link; não há mais a seção solta "Evidências da aplicação" nessa fase → AC-9
- [x] Como técnico atribuído, abra a cotação executada → não vê o ateste; vê as evidências na seção própria, como antes → AC-9, AC-24
- [x] A 390 px → os três cartões empilham, a tabela rola dentro da caixa, o painel "Sua vez" desce para depois do conteúdo, sem rolagem horizontal da página → AC-25

### Value sourcing

- [x] Valor autorizado: item de 6 unidades a R$ 284,50 de preço aplicado → R$ 1.707,00; item com quantidade decimal (2,5 × R$ 10,01) → R$ 25,03, o mesmo arredondamento de `valorDaLinhaCentavos` → AC-9
- [x] Valor aplicado: é o `valorExecutadoCentavos` gravado no item, não a conta refeita na tela; o total do rodapé é o `valorExecutadoCentavos` da cotação → AC-9
- [x] Prazo e atraso: vêm só de `prazoAteste` (TRF1); a contratada nunca vê "Prazo" nem "Atrasado", mesmo com a cotação atrasada → AC-9, AC-24
- [ ] Dias de atraso: com o prazo vencido ontem (em Belém), o cartão diz "Atrasado 1 dia"; perto da meia-noite UTC (21h em Belém) a conta continua pelo dia de Belém → AC-9

### Commands

- [x] `npx vitest run lib/material shared/material "app/(dashboard)/cotacoes" "app/(dashboard)/gestao"` → 631 passam (os `*.db.test.ts` pulam sem `MONGO_TEST_URI`), inclusive `AtesteCotacao.test.tsx` com os casos novos de etapas, tabela e evidências → AC-9, AC-29
- [x] `npx tsc --noEmit` e o ESLint dos arquivos da fatia → sem erro → AC-29
- [x] `npm run test:e2e -- cotacao-flow` num banco próprio → o detalhe executado mostra "Etapas do ateste" e a tabela, passa no axe a 1280 e a 390 px, e o gestor registra o provisório pelo painel → AC-6, AC-9, AC-25, AC-26

## Fatia 4: diálogos

### UI / manual

- [ ] Como fiscal que assumiu, numa cotação em análise com um item nas duas tabelas, um orçamento vencido e urgência pedida, clique "Encaminhar para aprovação" → o diálogo diz "Resolva os 3 pontos abaixo." e numera 1 · Base do item, 2 · Orçamento com validade vencida, 3 · Urgência → AC-10
- [ ] No ponto da base, cada opção mostra o preço por unidade e a diferença para a outra tabela em % (ex.: "3,9% menor") → AC-10
- [x] Resolva os pontos um a um → cada título ganha o sinal de resolvido, o rodapé conta "N de 3 resolvidos" e o botão Encaminhar só habilita no último → AC-10
- [x] Como aprovador com faixa, numa cotação em aprovação, clique "Aprovar" → o texto diz "Ao aprovar, R$ X ficam reservados no empenho escolhido e a compra fica autorizada.", há uma barra por empenho elegível com "Depois: R$ Y" e a caixa "Sua faixa: <nome> · até R$ Z" → AC-10
- [x] Um empenho em que o valor passa da parcela relevante do saldo aparece em laranja com "usaria N% do saldo"; um empenho sem saldo fica travado com "sem saldo para esta cotação" → AC-10
- [ ] Devolver, Reprovar, Cancelar cotação, Descartar rascunho e Recusar a urgência abrem o mesmo diálogo de motivo, com "Mínimo de N caracteres" e o contador "N de M" embaixo do campo → AC-11
- [x] Escreva menos que o mínimo e confirme → o erro aparece no próprio campo (vermelho, lido pelo leitor de tela) e nada é enviado → AC-11
- [ ] Reprovar, Cancelar e Descartar usam o botão vermelho; Devolver e Recusar usam o gradiente; o botão de fechar se chama "Cancelar" em todos, inclusive Encaminhar e Aprovar → AC-11, AC-28
- [ ] Depois de devolver, reprovar, cancelar ou recusar, o toast diz o que aconteceu ("Cotação devolvida.", "Cotação reprovada." ...), nunca "Feito." → AC-27
- [ ] A 390 px, os diálogos Encaminhar e Aprovar rolam dentro de si e cabem na largura, sem rolagem horizontal → AC-25

### Value sourcing

- [ ] Diferença em %: Anexo V R$ 1.380,00 e SINAPI R$ 1.325,60 → SINAPI "3,9% menor", Anexo V "4,1% maior"; um dos preços vazio → só "sem preço", sem % → AC-10
- [x] Barra por empenho: vem de `empenho.barras` em modo `aprovacao` (saldo depois = saldo menos o valor); o "saldo" do cabeçalho de cada opção é o saldo de agora → AC-10
- [ ] Destaque: só os empenhos em `projecoes` do detalhe (`consomeParcelaRelevante` com `parcelaRelevantePercentual`); mude o percentual em Parâmetros e reabra → o destaque acompanha → AC-10
- [ ] Faixa de quem aprova: é a designação vigente de aprovador de quem lê, com o nome e o limite da faixa ativa (`Designado.faixaNome`); um aprovador cuja faixa não cobre o valor não vê a caixa (nem o botão) → AC-10
- [ ] Tamanho do motivo: devolver, reprovar e cancelar de 5 a 2000 (`MOTIVO_MIN`/`MOTIVO_MAX`, os mesmos do schema); recusar a urgência de 10 a 500 (`TEXTO_CURTO_*`) → AC-11

### Commands

- [x] `npx vitest run "app/(dashboard)/cotacoes" lib/material shared/material` → passam, inclusive `DialogosCotacao.test.tsx` (10 casos novos) → AC-10, AC-11, AC-29
- [x] `MONGO_TEST_URI=mongodb://127.0.0.1:27017 npx vitest run lib/material` → 413 passam com o banco → AC-29
- [x] `npx tsc --noEmit` e o ESLint dos arquivos da fatia → sem erro → AC-29
- [x] `npm run test:e2e -- cotacao-flow` num banco próprio → o aprovador escolhe o empenho pelo radio novo e aprova; a tela passa no axe → AC-10, AC-26

## Fatia 5: editor da contratada em passos

### UI / manual

- [x] Como responsável técnico num rascunho, a montagem mostra 4 passos (Itens, Preço de tabela, Orçamentos, Revisar e enviar); clique em qualquer passo → ele abre direto, marcado como o passo atual → AC-12
- [x] Vá até Orçamentos e clique "Salvar rascunho" → o toast confirma e a tela continua em Orçamentos, sem voltar para Itens → AC-12
- [x] "Salvar e enviar para análise" só aparece no passo 4; nos outros, o rodapé tem "Voltar para ...", "Salvar rascunho" e "Continuar para ..." (gradiente) → AC-12, AC-28
- [x] No passo 2, um item sem preço mostra "sem preço ainda"; clique "Buscar preço" → a busca abre dentro do próprio item, com Anexo V e SINAPI lado a lado no desktop e um embaixo do outro no celular → AC-13
- [x] Clique "Usar" num resultado → o rascunho é salvo, o preço da tabela entra no item com a origem (Anexo V ou SINAPI) e a contagem "N de M resolvidos" sobe; "Usar três orçamentos" manda o item para a grade → AC-13
- [x] No passo 3, cada fornecedor tem o seu cartão ("Orçamento N") e a grade tem uma linha por item sem preço de tabela e uma coluna por fornecedor → AC-14
- [x] Lance 3 preços num item → o menor fica em verde e o item mostra "3 de 3" com as empresas; um fornecedor sem validade ou sem arquivo aparece no cabeçalho da coluna com o que falta → AC-14
- [x] Na coluna lateral, abaixo de "Sua vez", a lista "Pronta para enviar?" diz o que está pronto e o que falta, com a barra de progresso; mude um preço ou um CNPJ → a lista e o "Total até agora" mudam na hora, sem salvar → AC-15
- [x] No passo 4, a lista aparece dentro do conteúdo, com o resumo dos itens e o pedido de urgência (caixa e justificativa) → AC-12, AC-15
- [x] Marque "Pedir urgência" e escreva menos de 10 caracteres na justificativa → a lista mostra "Falta:" na linha "Justificativa da urgência", e "Salvar e enviar para análise" mostra o erro sem salvar; com a justificativa certa e o envio recusado, a caixa e o texto continuam lá → AC-15
- [x] Os textos novos do editor ("Pronta para enviar?", "Total até agora", "Salvar e enviar para análise") vêm de `mensagens.ts` → AC-27
- [x] A 390 px, os 4 passos e a grade cabem na tela; a grade rola dentro de si, sem rolagem horizontal da página → AC-25

### Value sourcing

- [x] Itens da lista: cada linha junta os códigos de `impedimentosDeEnvio` (o mesmo do servidor, agora em `shared/material/controles.ts`), rodando sobre o formulário pelo mesmo `montarEntrada` e `SalvarRascunhoSchema` do salvar → AC-15
- [x] Paridade com o envio: use a mesma raiz de CNPJ em dois orçamentos → a lista mostra "Empresas da mesma raiz" e o envio é recusado pelo mesmo motivo; o mesmo vale para o CNPJ da contratada (`raizCnpjContratada`, que só sai para a contratada que monta) → AC-15
- [ ] O que só o servidor sabe continua no envio: tabelas do mês e o preço de uma referência SINAPI nova; a lista avisa isso no rodapé → AC-15
- [x] Total até agora: soma do menor preço de cada item vezes a quantidade (preço de tabela ou menor orçamento), em centavos; itens sem preço não entram e aparecem como "N itens ainda sem preço" → AC-15
- [x] Menor preço da grade: o menor valor válido entre os fornecedores do item; célula vazia ou inválida não conta → AC-14

### Commands

- [x] `npx vitest run "app/(dashboard)/cotacoes" lib/material shared/material` → passam, inclusive `editor/__tests__/formulario.test.ts` (paridade da lista com o envio) e `EditorContratada.test.tsx` (passos, busca, grade e lista) → AC-12 a AC-15, AC-29
- [x] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run "app/(dashboard)/cotacoes" lib/material shared/material` → 647 passam com o banco, sem expectativa alterada em `lib/material` → AC-29
- [x] `npx tsc --noEmit` e o ESLint dos arquivos da fatia → sem erro → AC-29
- [x] `npm run test:e2e` no banco `severino_e2e` → 121 passam; a montagem vai pelos passos e pela grade, passa no axe e cabe a 390 px → AC-12, AC-14, AC-15, AC-25, AC-26

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
- AC-9: etapas, tabela e evidências, `AtesteCotacao.test.tsx` e E2E (etapas e o provisório pelo painel)
- AC-6 (fatia 3): o painel abre os diálogos do ateste, `AtesteCotacao.test.tsx` e E2E
- AC-10: Encaminhar numerado e Aprovar com barras e faixa, `DialogosCotacao.test.tsx` e E2E (aprovar)
- AC-11: `DialogMotivo` com contador, mínimo e erro no campo, `DialogosCotacao.test.tsx`
- AC-27 (fatia 4): textos dos diálogos em `mensagens.ts` (`TEXTO_DIALOGO_MOTIVO`, `TEXTO_ENCAMINHAR`, `TEXTO_APROVAR`)
- AC-12: 4 passos com navegação livre e o passo mantido depois de salvar, `EditorContratada.test.tsx` e E2E
- AC-13: busca no Anexo V e no SINAPI dentro do item, `EditorContratada.test.tsx`
- AC-14: grade por fornecedor com o menor preço e "N de 3", `EditorContratada.test.tsx` e E2E
- AC-15: lista "Pronta para enviar?" e total ao vivo, com paridade com o envio, `formulario.test.ts`, `formulario.db.test.ts` (contra `salvarRascunho` e `transicionar` no Mongo), `EditorContratada.test.tsx` e E2E
- AC-27 (fatia 5): textos do editor em `mensagens.ts` (`TEXTO_EDITOR`, `ROTULO_PASSO_MONTAGEM`)
- Fatias 6 a 8 (AC-16 a AC-23): passos entram quando cada fatia for construída
