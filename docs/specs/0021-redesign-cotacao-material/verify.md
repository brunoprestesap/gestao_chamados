# Verify: Repaginação das telas da cotação de material · spec 0021 · updated 2026-10-26 (fatias 1 a 8, verify completo)

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
- [x] Como responsável técnico, abra a mesma cotação → o painel diz "Agora é a vez de: Fiscal.", sem o nome do fiscal, sem botões e sem o bloco Empenho → AC-6, AC-24
- [x] Como técnico atribuído, abra uma cotação autorizada → o painel diz "Aplicar o material" com o botão Registrar execução; a jornada aparece sem datas → AC-6, AC-24
- [x] Na aba Itens e preços, cada item mostra a etiqueta colorida da origem e a referência na tabela, e o total no rodapé → AC-7
- [x] Na aba Orçamentos, a grade tem um item por linha e um fornecedor por coluna, o menor preço do envio em verde, "não cotou" nas células vazias, a validade (e "validade vencida" ou a confirmação) e "Complemento da urgência" no cabeçalho, e o link de cada arquivo embaixo → AC-7
- [x] Na aba Trilha, como TRF1 → ato, autor e papel, data, motivo, limite no ato, valor reservado ou liberado e projeção; "Conciliação do saldo" aparece pelo rótulo. Como contratada → sem autor no recebimento e sem a conciliação → AC-7
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

- [x] Como gestor, abra `/cotacoes/[id]` de uma cotação executada → o ateste vem antes das abas, com três cartões em ordem: 1 Recebimento provisório (Agora, com "Prazo até dd/mm"), 2 Recebimento definitivo (A seguir), 3 Nota fiscal (A seguir), e a regra "5 dias corridos por etapa" → AC-9
- [x] A mesma cotação executada há mais de 5 dias → o cartão 1 fica laranja, com "Atrasado N dias" e "O prazo era dd/mm" → AC-9
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
- [x] Dias de atraso: com o prazo vencido ontem (em Belém), o cartão diz "Atrasado 1 dia"; perto da meia-noite UTC (21h em Belém) a conta continua pelo dia de Belém → AC-9

### Commands

- [x] `npx vitest run lib/material shared/material "app/(dashboard)/cotacoes" "app/(dashboard)/gestao"` → 631 passam (os `*.db.test.ts` pulam sem `MONGO_TEST_URI`), inclusive `AtesteCotacao.test.tsx` com os casos novos de etapas, tabela e evidências → AC-9, AC-29
- [x] `npx tsc --noEmit` e o ESLint dos arquivos da fatia → sem erro → AC-29
- [x] `npm run test:e2e -- cotacao-flow` num banco próprio → o detalhe executado mostra "Etapas do ateste" e a tabela, passa no axe a 1280 e a 390 px, e o gestor registra o provisório pelo painel → AC-6, AC-9, AC-25, AC-26

## Fatia 4: diálogos

### UI / manual

- [x] Como fiscal que assumiu, numa cotação em análise com um item nas duas tabelas, um orçamento vencido e urgência pedida, clique "Encaminhar para aprovação" → o diálogo diz "Resolva os 3 pontos abaixo." e numera 1 · Base do item, 2 · Orçamento com validade vencida, 3 · Urgência → AC-10
- [x] No ponto da base, cada opção mostra o preço por unidade e a diferença para a outra tabela em % (ex.: "3,9% menor") → AC-10
- [x] Resolva os pontos um a um → cada título ganha o sinal de resolvido, o rodapé conta "N de 3 resolvidos" e o botão Encaminhar só habilita no último → AC-10
- [x] Como aprovador com faixa, numa cotação em aprovação, clique "Aprovar" → o texto diz "Ao aprovar, R$ X ficam reservados no empenho escolhido e a compra fica autorizada.", há uma barra por empenho elegível com "Depois: R$ Y" e a caixa "Sua faixa: <nome> · até R$ Z" → AC-10
- [x] Um empenho em que o valor passa da parcela relevante do saldo aparece em laranja com "usaria N% do saldo"; um empenho sem saldo fica travado com "sem saldo para esta cotação" → AC-10
- [x] Devolver, Reprovar, Cancelar cotação, Descartar rascunho e Recusar a urgência abrem o mesmo diálogo de motivo, com "Mínimo de N caracteres" e o contador "N de M" embaixo do campo → AC-11
- [x] Escreva menos que o mínimo e confirme → o erro aparece no próprio campo (vermelho, lido pelo leitor de tela) e nada é enviado → AC-11
- [x] Reprovar, Cancelar e Descartar usam o botão vermelho; Devolver e Recusar usam o gradiente; o botão de fechar se chama "Cancelar" em todos, inclusive Encaminhar e Aprovar → AC-11, AC-28
- [x] Depois de devolver, reprovar, cancelar ou recusar, o toast diz o que aconteceu ("Cotação devolvida.", "Cotação reprovada." ...), nunca "Feito." → AC-27
- [x] A 390 px, os diálogos Encaminhar e Aprovar rolam dentro de si e cabem na largura, sem rolagem horizontal → AC-25

### Value sourcing

- [x] Diferença em %: Anexo V R$ 1.380,00 e SINAPI R$ 1.325,60 → SINAPI "3,9% menor", Anexo V "4,1% maior"; um dos preços vazio → só "sem preço", sem % → AC-10
- [x] Barra por empenho: vem de `empenho.barras` em modo `aprovacao` (saldo depois = saldo menos o valor); o "saldo" do cabeçalho de cada opção é o saldo de agora → AC-10
- [x] Destaque: só os empenhos em `projecoes` do detalhe (`consomeParcelaRelevante` com `parcelaRelevantePercentual`); mude o percentual em Parâmetros e reabra → o destaque acompanha → AC-10
- [x] Faixa de quem aprova: é a designação vigente de aprovador de quem lê, com o nome e o limite da faixa ativa (`Designado.faixaNome`); um aprovador cuja faixa não cobre o valor não vê a caixa (nem o botão) → AC-10
- [x] Tamanho do motivo: devolver, reprovar e cancelar de 5 a 2000 (`MOTIVO_MIN`/`MOTIVO_MAX`, os mesmos do schema); recusar a urgência de 10 a 500 (`TEXTO_CURTO_*`) → AC-11

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
- [x] O que só o servidor sabe continua no envio: tabelas do mês e o preço de uma referência SINAPI nova; a lista avisa isso no rodapé → AC-15
- [x] Total até agora: soma do menor preço de cada item vezes a quantidade (preço de tabela ou menor orçamento), em centavos; itens sem preço não entram e aparecem como "N itens ainda sem preço" → AC-15
- [x] Menor preço da grade: o menor valor válido entre os fornecedores do item; célula vazia ou inválida não conta → AC-14

### Commands

- [x] `npx vitest run "app/(dashboard)/cotacoes" lib/material shared/material` → passam, inclusive `editor/__tests__/formulario.test.ts` (paridade da lista com o envio) e `EditorContratada.test.tsx` (passos, busca, grade e lista) → AC-12 a AC-15, AC-29
- [x] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run "app/(dashboard)/cotacoes" lib/material shared/material` → 647 passam com o banco, sem expectativa alterada em `lib/material` → AC-29
- [x] `npx tsc --noEmit` e o ESLint dos arquivos da fatia → sem erro → AC-29
- [x] `npm run test:e2e` no banco `severino_e2e` → 121 passam; a montagem vai pelos passos e pela grade, passa no axe e cabe a 390 px → AC-12, AC-14, AC-15, AC-25, AC-26

## Fatia 6: cartão no chamado

### UI / manual

- [x] Como técnico atribuído, num chamado com cotação `autorizada`, abra `/chamados-atribuidos/<id>` → o cartão mostra o selo, a jornada em barrinhas, a caixa "Aplicar o material" com o botão "Registrar execução" e até 3 itens com "+N itens", sem valor → AC-16
- [x] No mesmo cartão, "Registrar execução" → o diálogo mostra "Quantidades aplicadas", as evidências com ícone de foto ou PDF e "Cancelar"; anexar uma evidência mantém o diálogo aberto → AC-16, AC-27
- [x] Num chamado em atendimento sem cotação, "Registrar material" → o diálogo tem "Acrescentar item" e o botão primário em gradiente → AC-27, AC-28
- [x] Como fiscal (lado TRF1) no sheet da `/gestao`, numa cotação `em_analise` que um fiscal assumiu → o cartão mostra Itens, Valor e "Agora é a vez de: Fiscal (nome)" → AC-16, AC-24
- [x] Como Preposto responsável técnico, no mesmo chamado → o cartão mostra a próxima ação dela com o botão que leva ao detalhe e "Agora é a vez de: Fiscal.", sem nome → AC-16, AC-24
- [x] Como solicitante, em `/meus-chamados/<id>` → o cartão mostra a frase da fase e a barra Pedido, Aprovação, Instalação com a fase atual marcada, sem número, valor nem nomes; numa cotação reprovada ou cancelada, só a frase, sem a barra → AC-16, AC-24
- [x] No sheet da gestão de um chamado com cotação antiga `enviada` → o bloco "Histórico: sistema anterior" já vem aberto, com Aprovar e Recusar; num chamado só com antigas decididas, vem fechado; sem nenhuma, não aparece → AC-17
- [x] A 390 px, as quatro versões do cartão e os dois diálogos cabem sem rolagem horizontal da página → AC-25

### Value sourcing

- [x] Versão do cartão: sai de `cotacao.visao` (de `visaoDe`), nunca do perfil; o Preposto designado responsável técnico recebe a versão `contratada`, e um Admin fiscal a versão `trf1` → AC-16
- [x] Fase do solicitante: `FASE_DA_SITUACAO` em `mensagens.ts`, entregue por `serializarCotacao` só na visão `solicitante`; varie a situação (rascunho, devolvida, em aprovação, autorizada, executada, atestada, reprovada, cancelada) e confira pedido, pedido, aprovação, aprovação, instalação, instalação, encerrada, encerrada → AC-16
- [x] Quem age agora: `quemAgeAgora` por situação; o nome do fiscal que assumiu só na visão TRF1, nulo para contratada e técnico, e o campo nem existe para o solicitante → AC-16, AC-24
- [x] Próxima ação: técnico só `executar` e `editarDiagnostico` no próprio cartão; contratada a primeira de `ACOES_DA_VEZ` liberada em `acoesDisponiveis`, com link para `/cotacoes/<id>`; TRF1 sem ação no cartão → AC-16

### Commands

- [x] `npx vitest run "app/(dashboard)/cotacoes" "app/(dashboard)/gestao" lib/material shared/material` → passam, inclusive `CartaoCotacaoMaterial.test.tsx` (as quatro versões), `CotacaoApprovalCard.test.tsx` (bloco recolhido) e `serializar.test.ts` (fase) → AC-16, AC-17, AC-24
- [x] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/material` → passam, inclusive o cartão por visão em `fatia4.db.test.ts` (Preposto responsável técnico sem o nome do fiscal) → AC-16, AC-24, AC-29
- [x] `npx tsc --noEmit` e o ESLint dos arquivos da fatia → sem erro → AC-29
- [x] `npm run test:e2e -- cotacao-flow` num banco próprio → o técnico executa pelo cartão novo, o solicitante vê a fase Instalação, e o cartão passa no axe → AC-16, AC-25, AC-26

## Fatia 7: cadastro de material

### UI / manual

- [x] Como Admin, abra `/configuracoes/material` → abre a seção Empenhos (padrão), marcada na navegação lateral, e o endereço não tem `secao` → AC-18
- [x] Clique "Faixas de aprovação" na navegação → o endereço fica `?secao=faixas`; recarregue → continua em Faixas → AC-18
- [x] A navegação mostra as notas: Empenhos "N elegíveis", Designações "N vigentes", Faixas "N ativas", Anexo V "N itens" (ou "revisão aberta" com importação do Anexo V em aberto), SINAPI o mês mais recente (ex.: "set/2026"), Parâmetros sem nota → AC-18
- [x] Abra `?secao=lixo` → cai em Empenhos, sem erro → AC-18
- [x] No topo, "Para aprovar a primeira cotação" mostra 4 itens (Empenho elegível, Faixas de aprovação, Designações, Anexo V sem código SINAPI) com "N de 4 prontos"; o que falta fica em laranja e o link de cada um leva à seção certa; não há mais o painel amarelo "O que falta" nem "caminho 1/2" → AC-19
- [x] Revogue o gestor (ou deixe sem aprovador) → o item Designações diz "falta gestor" (ou "falta aprovador") → AC-19
- [x] Em Empenhos, cada empenho é um cartão com número, selo (Elegível, Fora do exercício ou vencido, Inativo), exercício e vigência, a barra de saldo e Valor líquido, Comprometido, Saldo e Projeção; o inativo aparece apagado, sem barra → AC-20
- [x] Em Designações, as pessoas ficam agrupadas por papel (Fiscal, Gestor do contrato, Aprovador, Responsável técnico), cada uma com a vigência e o ato; o aprovador mostra a faixa e o limite; papel sem ninguém diz "Ninguém designado." → AC-20
- [x] Em Faixas, a escada lista as faixas ativas do menor para o maior limite, com "ninguém vigente" em laranja na faixa sem aprovador e, embaixo, "Cotação acima de R$ X não tem quem aprove." → AC-20
- [x] "Inativar…", "Reativar…", "Revogar…" e "Desativar…" abrem um diálogo que diz o efeito antes de agir, com "Cancelar"; cancelar não muda nada; confirmar age e o toast diz o que aconteceu → AC-21
- [x] Com um CSV do Anexo V em revisão, a seção mostra os resumos Novos, Alterados e "Saem da versão nova" como botões de filtro; nos alterados, o valor antigo aparece riscado ao lado do novo; no SINAPI, o terceiro resumo é "Fora deste mês" → AC-22
- [x] Em Parâmetros, cada campo mostra a unidade ao lado (% ou dias), e a taxa de administração aparece como 0 %, travada → AC-22
- [x] A 390 px, as seis seções, a lista inicial e os diálogos cabem sem rolagem horizontal da página; a navegação vira duas colunas com o nome inteiro → AC-25

### Value sourcing

- [x] Lista inicial: vem de `lerPendenciasMaterial` (`primeiraCotacao`): empenhos por `filtroElegivel`, faixas com `ativa: true`, papéis fiscal, gestor e aprovador por `filtroVigente` no dia de Belém, itens do Anexo V vigente com `sinapiCodigo` nulo; mude cada um no banco e recarregue → o item acompanha → AC-19
- [x] Notas: "revisão aberta" só com `ImportacaoMaterial` do tipo `anexo_v` e `emAberto: true`; a contagem de itens soma os itens das versões vigentes (`AnexoVVigencia`) de todos os contratos → AC-18
- [x] Escada: só faixas ativas; o aprovador conta só com designação vigente (revogada ou fora da vigência não conta); o teto é o maior limite entre as faixas com aprovador, não o maior limite de todas → AC-20
- [x] Projeção no cartão do empenho: `projecoesDosEmpenhos` sobre o saldo de agora, só para o elegível → AC-20

### Commands

- [x] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run "app/(dashboard)/configuracoes/material" shared/material lib/material "app/(dashboard)/cotacoes" "app/(dashboard)/gestao"` → 1020 passam, inclusive `GerirMaterial.test.tsx`, `TabelasPreco.test.tsx`, `ParametrosMaterial.test.tsx`, `shared/material/__tests__/cadastro.test.ts` e o painel em `fatia3.db.test.ts` → AC-18 a AC-22, AC-29
- [x] `npx tsc --noEmit` e o ESLint de `app/(dashboard)/configuracoes/material` → sem erro → AC-29
- [x] `npm run test:e2e -- cotacao-flow` no banco `severino_e2e` → 17 passam; a seção vai no endereço e sobrevive ao recarregar, desativar faixa pede confirmação, e as seis seções passam no axe a 1280 e a 390 px sem rolagem horizontal → AC-18, AC-21, AC-25, AC-26

## Fatia 8: relatório de material

### UI / manual

- [x] Como Admin, abra `/relatorios/material` sem parâmetros → o atalho "Mês atual" vem marcado e o período vai do dia 1 do mês até hoje → AC-23
- [x] Clique "Trimestre atual" e "Ano atual" → o endereço vira `?inicio=...&fim=...` do primeiro dia do trimestre (ou de 1º de janeiro) até hoje, e o atalho clicado fica marcado → AC-23
- [x] Abra "Outro período", escolha De e Até e clique "Ver período" → o relatório mostra o período pedido, com "Outro período" aberto; um período de mais de 366 dias avisa e mostra o mês corrente → AC-23
- [x] O topo mostra quatro números: do envio à autorização (média, com a mediana), devolvidas em %, impedimento na primeira tentativa e divergência entre autorizado e executado; sem cotação, a frase "sem cotações no período", nunca 0% → AC-23
- [x] "Custo por equipamento" mostra uma barra por equipamento (até 20, do maior para o menor), com o link do ativo, o valor e a quantidade de cotações → AC-23
- [x] "Empenhos: saldo e projeção" mostra cada empenho com a projeção curta, o saldo e o consumo por dia → AC-23
- [x] "Pontos de atenção" lista urgências (com quantas têm pesquisa pendente), sinais de fracionamento e itens acima do estimado; cada um leva à lista dele mais abaixo; sem nada, diz "Nada a apontar no período." → AC-23
- [x] Nenhum texto da tela tem "RN-36" → AC-23, AC-27
- [x] A 390 px, a tela cabe sem rolagem horizontal da página; as tabelas de urgências e de consumo rolam dentro da própria caixa → AC-25

### Value sourcing

- [x] Atalhos: `periodosDosAtalhos(hojeEmBelem())`; perto da meia noite UTC (21h em Belém) do último dia do mês, "Mês atual" ainda é o mês de Belém → AC-23
- [x] Os quatro números: `tempoAutorizacao`, `devolvidas`, `impedimentoPrimeiraTentativa` e `divergencia` de `RelatorioMaterial`, sem conta nova na tela → AC-23
- [x] Barras de custo: `custoPorAtivo.ativos` (já limitado a 20), a largura relativa ao maior valor → AC-23
- [x] Pontos de atenção: contagens de `urgencias`, `fracionamento` e `consumoAnexoV` com `acima` → AC-23

### Commands

- [x] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run "app/(dashboard)/relatorios/material" "app/(dashboard)/configuracoes/material" shared/material lib/material "app/(dashboard)/cotacoes" "app/(dashboard)/gestao"` → 1034 passam, inclusive `RelatorioMaterialTela.test.tsx` e `shared/material/__tests__/relatorio.test.ts` → AC-23, AC-29
- [x] `npx tsc --noEmit` e o ESLint de `app/(dashboard)/relatorios/material` e `shared/material` → sem erro → AC-29
- [x] `npm run test:e2e -- cotacao-flow` no banco `severino_e2e` → 18 passam; os atalhos trocam o período e o relatório passa no axe a 1280 e a 390 px sem rolagem horizontal → AC-23, AC-25, AC-26

## Acceptance-criteria coverage

- AC-1: selo nos três lugares, teste `compartilhado.test.tsx`
- AC-2: resumo por lado, `fila.db.test.ts` (resumo) e passos manuais
- AC-3: busca, filtro, ordem, página e endereço, `fila.db.test.ts`, `fila-pecas.test.ts` e E2E
- AC-4: linha, "na etapa há" e cartão no celular, `fila.db.test.ts` e passos manuais
- AC-24: valor só no TRF1, `fila.db.test.ts`
- AC-25, AC-26: E2E com axe a 390 px e no desktop
- AC-27, AC-28: textos em `mensagens.ts` e a variante `gradiente` do `Button` (ainda sem uso na fila, que não tem botão primário)
- AC-29: suíte de `lib/material` sem mudança de expectativa, com duas exceções previstas, ambas de leitura e nenhuma de regra: o painel do cadastro (fatia 7: `lerPendenciasMaterial` troca `faltando` por `primeiraCotacao`, `notas`, `contratosSemAnexo` e `sinapiAtrasado`, pelos AC-18 e AC-19) e a visão do solicitante (revisão de 26/10: `serializarParaSolicitante` devolve só `{ id, visao, fase }`, pelo AC-24, e o teste da spec 0019 que esperava a `situacao` passa a afirmar que ela não vem)
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
- AC-16: as quatro versões pela `visao`, `CartaoCotacaoMaterial.test.tsx`, `serializar.test.ts`, `fatia4.db.test.ts` e E2E
- AC-17: bloco recolhido da cotação antiga, `CotacaoApprovalCard.test.tsx`
- AC-24 (fatia 6): `fase` só para o solicitante, nome do fiscal só no TRF1, `serializar.test.ts` e `fatia4.db.test.ts`
- AC-27 (fatia 6): textos do cartão e dos diálogos em `mensagens.ts` (`TEXTO_CARTAO`, `TEXTO_FASE_SOLICITANTE`, `TEXTO_DIALOGO_MATERIAL`, `TEXTO_DIALOGO_EXECUCAO`, `TEXTO_HISTORICO_ANTERIOR`)
- AC-18: seção no endereço e notas da navegação, `GerirMaterial.test.tsx`, `cadastro.test.ts`, `fatia3.db.test.ts` (notas) e E2E (recarregar)
- AC-19: lista "Para aprovar a primeira cotação" com a seção de cada item, `fatia3.db.test.ts` e `GerirMaterial.test.tsx`
- AC-20: cartões de empenho, designações por papel e escada de faixas, `GerirMaterial.test.tsx` e `cadastro.test.ts` (`escadaDeFaixas`)
- AC-21: confirmação com o efeito antes de agir, `GerirMaterial.test.tsx` e E2E (desativar faixa)
- AC-22: revisão com filtros e antes riscado, unidades e taxa travada, `TabelasPreco.test.tsx` e `ParametrosMaterial.test.tsx`
- AC-25, AC-26 (fatia 7): E2E com axe nas seis seções a 1280 e a 390 px
- AC-27 (fatia 7): textos em `mensagens.ts` (`TEXTO_CADASTRO`, `TEXTO_CADASTRO_SECOES`, `TEXTO_CONFIRMACAO_CADASTRO`, `TEXTO_CADASTRO_TABELAS`, `TEXTO_PARAMETROS`, `UNIDADE_PARAMETRO`)
- AC-23: atalhos de período, quatro números, barras, empenhos e pontos de atenção, `RelatorioMaterialTela.test.tsx`, `relatorio.test.ts` e E2E (atalhos e axe)
- AC-27 (fatia 8): textos em `mensagens.ts` (`TEXTO_RELATORIO`)
