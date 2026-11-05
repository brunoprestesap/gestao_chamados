# Verify: checagem do almoxarifado antes da cotação · spec 0024 · updated 2026-11-05

_Passos derivados dos critérios de aceitação da spec 0024. O `/check verify` roda estes passos; o `/test` trava os duráveis._

Para rodar sem Oracle, use o serviço falso de `e2e/fixtures/sicam-falso.ts`, num banco próprio (nunca o `manutencao`), com `SICAM_GATEWAY_URL=http://localhost:3902` e `SICAM_GATEWAY_SECRET=e2e-sicam`. Os passos marcados com **Oracle real** só valem com a conta de serviço e a rede prontas.

## UI / manual

Entrada

- [x] Com o interruptor desligado (padrão), o técnico registra material → a cotação nasce `Rascunho`, sem etapa de checagem na jornada, e o serviço não recebe chamada → AC-1
- [x] Com uma cotação antiga aberta, ligue o interruptor em Parâmetros → ela continua com 7 etapas e pode ser enviada sem nenhum impedimento novo → AC-1, AC-27
- [x] Com uma cotação em checagem, desligue o interruptor → ela continua podendo ser concluída → AC-1
- [x] Ligue o interruptor e registre um item sem material parecido → nasce `Rascunho`, sem pausa, com "Sem material parecido no estoque" e as palavras na trilha → AC-3
- [x] Registre um item com material parecido → nasce `Em checagem`, o chamado vai a aguardando terceiros, e o almoxarifado recebe o aviso → AC-2, AC-4, AC-18
- [x] Busque por "lavatorio", sem acento, contra um material "LAVATÓRIO" → ele aparece como candidato → AC-2
- [x] Derrube o serviço e registre material → nasce `Em checagem`, sem nenhum item liberado sozinho, e a criação não falha → AC-4
- [x] Deixe o serviço demorar mais de 6 segundos no `criar` → todos os itens contam como SICAM fora → AC-2

Decisão

- [x] Abra como almoxarifado → cada item em aberto mostra descrição, unidade, quantidade, até 10 candidatos com código, saldo, reservado, disponível, preço médio e a hora → AC-5
- [x] Busque por texto e por código um material de saldo zero → ele aparece na busca, mas não entre os candidatos → AC-5
- [x] Deixe um item sem decisão → o botão de concluir fica desligado, e pelo servidor a recusa não grava nada → AC-6
- [x] Decida `cotar mesmo assim` sem motivo, e depois com menos de 10 letras → recusado → AC-6
- [x] Use 4 de 10 → volta a `Rascunho`, o item fica com 6, e a trilha guarda pedido, atendido, saída e restante → AC-7
- [x] Em `devolvida` com orçamento, atenda um item por inteiro → o preço dele sai do orçamento, o total é recalculado, e o responsável técnico consegue salvar → AC-7
- [x] Item em metros, material em rolo → a tela pede as duas quantidades e o valor sai da saída; com a mesma unidade em caixa diferente (UN e un), pede só uma → AC-8
- [x] Baixe o saldo entre abrir e concluir → recusa com o saldo novo, sem gravar → AC-9
- [x] Decida `usar` em dois itens que tiram do mesmo material, somando acima do disponível → recusa → AC-9
- [x] Conclua e abra a trilha como fiscal → saldo visto, reservado, hora, origem, autor e papel aparecem → AC-10
- [x] Atenda tudo → `Atendida pelo almoxarifado`, final, sem itens; o chamado segue em atendimento e o técnico abre outra cotação; o solicitante vê a fase encerrada → AC-11

SICAM fora

- [x] Com o serviço fora, abra a checagem → a tela avisa e oferece o registro manual; saldo, motivo e preço são obrigatórios em `usar`, e o código é opcional → AC-12
- [x] Abra com o serviço fora, religue, e conclua no manual → recusa pedindo para refazer com o material → AC-12
- [x] Material com saldo e `VL_ATU` vazio → `usar` pede preço, e a entrada marca preço digitado → AC-13

Papel e demora

- [x] Em Designações, tente designar `almoxarifado` a um Técnico → recusado; a um Solicitante e a um Admin → aceito, com motivo e histórico → AC-14 _(a recusa funciona, mas com o texto de fiscal: `lib/material/cadastro.ts:167`)_
- [x] Conclua como fiscal, antes do prazo → a trilha grava o papel `fiscal` → AC-15
- [x] Revogue o almoxarifado → o aviso e `Minhas ações` apontam para os fiscais, e "O que falta" mostra a falta → AC-15
- [x] Vença o prazo e rode `material-conciliacao` duas vezes → os gestores recebem um aviso só, e a cotação continua em checagem → AC-16

Fluxo

- [x] Como contratada, acrescente um item ou aumente acima da liberada → "Pronta para enviar?" e o `enviar` apontam `item_sem_checagem` → AC-17
- [x] Use "Conferir de novo no almoxarifado" → busca só nesses itens; sem candidato mantém a situação, com candidato vai a `em_checagem` e volta à origem → AC-17
- [x] Troque só o texto da descrição → não reabre a checagem → AC-17
- [x] Refaça a checagem a partir de `devolvida` → não abre outra pausa, e a do envio continua aberta na volta → AC-18
- [x] Pause o chamado por outro motivo antes de refazer a checagem → a checagem não abre nem retoma → AC-18
- [x] Em checagem, tente concluir o chamado → recusado; cancele o chamado → a cotação é cancelada → AC-19
- [x] Como técnico, em checagem sem montagem → cancela, mas não edita; depois de o responsável técnico montar → não cancela → AC-19
- [ ] Decida `usar` → o técnico recebe o aviso com descrição, quantidade e unidade, sem valor em nenhum canal; nada é escrito no SICAM → AC-20 _(em aberto: o aviso gravado no sino não traz valor; e-mail e socket não foram observados)_

Custo

- [x] Use material num chamado em atendimento → a parte Almoxarifado fica zero; conclua → aparece na seção Custo e na ficha, somada ao total → AC-21, AC-22
- [ ] Reabra, cancele ou recuse esse chamado → a parte volta a zero → AC-21 _(em aberto: reabrir e cancelar zeram a parte; a recusa não foi dirigida)_
- [x] Compare o total na ficha, na aba Ativos do IMR, no relatório por contrato e no critério de substituição → o mesmo número → AC-22
- [x] Como solicitante e técnico, leia `GET /api/chamados/[id]/cotacoes` → sem `almoxarifadoCentavos` → AC-22
- [x] Mude `VL_ATU` depois da decisão → o custo não muda → AC-23

Visibilidade

- [x] Leia o detalhe como contratada e técnico → só o resultado por item e a quantidade liberada, sem saldo, preço, motivo, nome nem material do SICAM → AC-24
- [x] Leia como almoxarifado → itens, chamado, local e checagem, sem orçamento, preço da cotação, empenho, faixa, arquivo nem PDF → AC-25
- [x] Como fiscal, procure um rascunho que passou pela checagem → não aparece; a mesma cotação em checagem aparece → AC-25
- [x] Como Solicitante com o papel, em chamado próprio → o cartão mostra só a fase → AC-25
- [x] Chame a busca sem sessão, e como gestor → 401 e 403 → AC-26
- [x] Entre como Solicitante com o papel → o menu mostra Cotações, com as abas `Minhas ações` e `Todas`; sem o papel, o item some → AC-27
- [x] Gere o PDF de uma cotação checada → a seção da checagem aparece, sem caractere trocado → AC-28
- [x] No relatório de material, confira a quantidade de atendidas e o valor, sem somar chamado cancelado → AC-28

Origem de cada valor (Value sourcing)

- [x] **Oracle real** · Código, descrição, unidade e saldo → compare um material na tela com `MATERIAL.CO_MAT`, `DE_MAT`, `CO_UNID_MEDIDA` e `QT_SALDO_ATU`
- [x] **Oracle real** · Reservado → escolha uma das 15 linhas com `ALMX_QT_RESERVADA` e compare com a soma por `ALMX_CO_MAT`
- [x] Disponível → com reservado maior que o saldo, a tela mostra zero, nunca negativo
- [x] **Oracle real** · Preço médio → confira com o almoxarifado, numa linha real, que `VL_ATU / QT_SALDO_ATU` é o preço médio; com saldo ou valor zero, a tela diz "sem preço" _(confirmado pelos dados em 05/11/2026, não por uma pessoa do almoxarifado: `VL_ATU` fecha como valor total nas 9.691 linhas, e as saídas de 2026 saem pelo custo médio em 139 de 144 materiais)_
- [x] Palavras → "Torneira para lavatório 3/4" busca `torneira`, `lavatorio` e `3/4`, sem `para`
- [x] `consultadoEm` → a hora gravada é a da releitura no concluir, não a de abrir a tela (abra, espere, conclua e compare)
- [x] Saldo manual, preço manual, motivo e quantidades → vêm da entrada só no registro manual; com o SICAM no ar, um preço enviado pela tela é ignorado
- [x] `valorCentavos` → saída fracionada (0,333 × R$ 10,00) dá um único arredondamento, igual a `valorDaLinhaCentavos`
- [x] Novo `quantidade` do item → 0,3 menos 0,1 dá 0,2 exato, sem sobra de ponto flutuante
- [x] `prazoAte` → entrando numa sexta, com N = 1, o prazo é o fim da segunda (ou do próximo dia útil, com feriado), no fuso de Belém _(sexta e feriado conferidos em `prazoEmDiasUteis`; pela tela, quinta com N = 1 e N = 3)_
- [x] `almoxarifadoCentavos` → soma toda entrada `usar`, mesmo de item rechecado depois
- [x] Autor → renomeie o usuário depois da decisão: a trilha continua com o nome antigo
- [x] Resultado por item → com duas entradas no mesmo item, contratada e técnico veem a última

Implantação

- [ ] **Oracle real** · Siga os passos de `DOCKER_PRODUCAO.md` → o `/healthz` responde de dentro do `next-app`, e a busca devolve materiais → AC-29 _(em aberto: `/healthz` e a busca funcionam em container na máquina de desenvolvimento, com a conta do frequenciajus; faltam a conta de serviço do DBA, com `SELECT` só nas duas tabelas, a transação somente leitura contra escrita real e a rota a partir da VPS)_
- [x] Rode `docker compose up -d --build` sem o perfil `sicam` → nada do serviço é construído, e o `next-app` conta o SICAM como fora → AC-1
- [x] **Oracle real** · Confirme que `docker compose ps` não publica porta do `sicam-gateway`, e que os logs não trazem o texto da busca → AC-29

## Commands

- [x] `cd sicam-gateway && npm test` → 12 testes passam: 401 sem segredo, segredo vazio, limites, bind e tabelas permitidas → AC-29
- [x] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/material shared/material app/api/cotacoes` → verde → AC-1 a AC-13, AC-15 a AC-21, AC-23 a AC-28
- [x] `npx playwright test e2e/cotacao-flow.spec.ts -g "checagem do almoxarifado"`, num banco próprio → 4 cenários e o axe limpo → AC-2, AC-4, AC-5, AC-7, AC-24, AC-25, AC-27
- [x] `docker compose --profile sicam build sicam-gateway` → a imagem constrói → AC-29

## Acceptance-criteria coverage

- AC-1 interruptor · AC-2, AC-3, AC-4 entrada · AC-5 a AC-11 decisão · AC-12, AC-13 SICAM fora · AC-14, AC-15, AC-16 papel e demora · AC-17 a AC-20 fluxo · AC-21, AC-22, AC-23 custo · AC-24 a AC-28 visibilidade · AC-29 serviço e implantação
