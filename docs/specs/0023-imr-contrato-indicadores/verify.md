# Verify: IMR do contrato, indicadores 3 e 4 · spec 0023 · updated 2026-10-27

_Passos tirados dos critérios de aceite da spec 0023. `/check verify` roda estes passos; `/test` trava os que forem duráveis. Fatia 1 (indicador 3 em prévia); as próximas fatias acrescentam os seus._

## UI / manual

- [x] Entrar como Admin, abrir o menu Material → "IMR do contrato" → a tela abre em `/relatorios/imr-contrato` com o primeiro contrato e o mês permitido mais recente já escolhidos → AC-1
- [x] Trocar o contrato no seletor → o campo Mês mostra só meses dentro da vigência e até o mês corrente → AC-1
- [x] Abrir a URL com `mes=` fora da vigência (ex.: `2020-01`) → a tela cai no mês permitido mais recente, sem erro → AC-1
- [x] Sem nenhum contrato cadastrado → cartão "Nenhum contrato cadastrado" com link para Contratos → AC-1
- [x] No mês escolhido, o cartão do indicador 3 mostra pontos de 0 a 20 coerentes com a contagem de atrasos (0 = 20, 1 = 15, 2 = 10, 3 = 5, 4 ou mais = 0) → AC-4
- [x] Cada linha da tabela mostra número do chamado, solicitante, setor, data da solicitação, descrição, início ou "sem início", tempo até o início, prazo e situação; o topo mostra "Apurado em" e os feriados usados → AC-16
- [x] Entrar como Preposto, Técnico e Solicitante → o item não aparece no menu, e abrir a URL direto redireciona para `/dashboard` → AC-14
- [x] Em 390px de largura, a página não rola na horizontal (só a tabela, dentro do próprio quadro) → AC-16

## Value sourcing (uma checagem por fonte)

- [x] Prazo de resposta: um chamado aberto numa sexta à noite com a segunda cadastrada como feriado ativo tem prazo na terça às 18:00 (fim do expediente de `getBusinessCalendarConfig`); desativar o feriado e recarregar muda o prazo para segunda → AC-2
- [x] Dia de Belém: um chamado aberto às 23:00 de Belém (02:00 UTC do dia seguinte) tem prazo no dia útil seguinte ao dia de Belém, não ao de UTC → AC-2
- [x] Corte do mês: um chamado aberto em 31/08 às 19:00 (prazo 01/09) entra em setembro e não em agosto → AC-2
- [x] Início do atendimento: um chamado reatribuído mantém como início a primeira atribuição (`sla.responseStartedAt`), não a última → AC-3
- [x] Encerrado sem atender: chamado cancelado antes do prazo some da base; cancelado depois do prazo vencido, sem início, aparece como atraso "sem início" (data do cancelamento pelo `ChamadoHistory` `cancelamento`) → AC-3
- [x] Dado antigo: chamado `encerrado` sem `responseStartedAt` aparece só na contagem "Sem registro de início" e não conta → AC-3
- [x] Preventiva: chamado com `originTemplateId` nunca aparece no indicador 3 → AC-2
- [x] Solicitante removido e chamado sem unidade aparecem como "Usuário removido" e "Sem unidade" → AC-16
- [x] Escopo do contrato: só chamados com `tipoServico` entre os `tiposServico` do contrato → AC-2

## Commands

- [x] `npx vitest run lib/imr-contrato components/dashboard` → todos passam → AC-2, AC-3, AC-4, AC-14, AC-16
- [x] `npm run typecheck` e `npm run lint` → sem erro → todos

## Acceptance-criteria coverage

- AC-1: passos de UI 1 a 4 (soma, faixa e foto do mês fechado chegam na fatia 4)
- AC-2: value sourcing 1, 2, 3, 7, 9 e o teste `prazo de resposta`
- AC-3: value sourcing 4, 5, 6 e o teste `apurarMes, indicador 3`
- AC-4: passo de UI 5 e o teste `escala e faixas`
- AC-14: passo de UI 7 e o teste `NAV_ITEMS · IMR do contrato` (ações e PDF com 403 chegam nas fatias 3 a 5)
- AC-16: passos de UI 6 e 8, value sourcing 8

## Fatia 2: indicador 4 (fornecimento de material)

### UI / manual

- [x] Como Admin, abrir `/configuracoes/material?secao=parametros` → aparece "Prazo de fornecimento do material" com 5 e "dias úteis" ao lado; gravar 0 ou 31 é recusado com "de 1 a 30"; gravar 3 entra no histórico de parâmetros com de 5 para 3 → AC-6
- [x] Autorizar uma cotação numa quinta (N = 5) → o documento da cotação tem `fornecimentoAte` na quinta seguinte às 18:00 de Belém → AC-6
- [x] Na cotação autorizada com o prazo ainda por vencer, a contratada faz `alterar` → `fornecimentoAte` volta a null; reenviar e autorizar de novo grava um prazo novo → AC-6
- [x] Numa cotação com `fornecimentoAte` já vencido, `alterar` → o prazo continua o mesmo; reautorizar não o troca → AC-6
- [x] Em `/relatorios/imr-contrato`, o cartão do indicador 4 mostra pontos pela escala, e a lista mostra número da cotação, número do chamado, data da autorização (ou "autorização desfeita"), prazo de fornecimento, execução ou "sem execução" e situação → AC-5, AC-16
- [x] Cotação autorizada antes desta fatia (sem `fornecimentoAte`) aparece com "prazo estimado" na linha e na frase acima da lista → AC-6

### Value sourcing (uma checagem por fonte)

- [x] Cotações do contrato: cotação de um chamado do contrato aberto mais de 30 dias antes do mês, com prazo no mês, entra na base; cotação de chamado de outro tipo de serviço não entra; preventiva entra → AC-5
- [x] Prazo de fornecimento: com um feriado ativo entre a autorização e o prazo, o prazo anda um dia útil; o N vem de `MaterialConfig.prazoFornecimentoDiasUteis` no ato da autorização → AC-6
- [x] Prazo estimado: cotação sem `fornecimentoAte` e com `autorizadoEm` usa N = 5 mesmo com o parâmetro em outro valor → AC-6
- [x] Execução e encerramento: executada a tempo e cancelada depois não é atraso; cancelada antes do prazo some (data pelo último `CotacaoMaterialEvento` para `cancelada` ou `reprovada`); cancelada depois do prazo vencido conta → AC-5

### Commands

- [x] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/imr-contrato lib/material/__tests__/transicoes.db.test.ts lib/material/__tests__/fatia5.test.ts` → todos passam → AC-5, AC-6

### Acceptance-criteria coverage (fatia 2)

- AC-5: UI 5, value sourcing 1 e 4, os testes `apurarMes, indicador 4` e `leitura.db.test.ts`
- AC-6: UI 1 a 4 e 6, value sourcing 2 e 3, os testes `prazo de fornecimento (spec 0023, AC-6)` e o limite em `fatia5.test.ts`
- AC-16: UI 5 e o teste dos feriados usados do indicador 4

## Fatia 3: marcações do fiscal e do gestor

### UI / manual

- [x] Entre como Admin com designação `fiscal` vigente, abra `/relatorios/imr-contrato` num mês com um atraso no indicador 3 → a linha tem o botão "Desconsiderar atraso" e a seção tem "Marcar não atendimento" → AC-7, AC-8, AC-14
- [x] Clique em "Desconsiderar atraso", escreva 9 caracteres e confirme → o campo mostra o erro do mínimo e nada é gravado; com 10 caracteres grava → a linha fica riscada, com motivo, nome, `fiscal` e data, e o cartão do indicador 3 sobe uma faixa da escala (por exemplo de 15 para 20) → AC-4, AC-7
- [x] Na mesma linha, "Desfazer desconsideração" com motivo → a linha volta a "Atraso" e a pontuação volta ao valor anterior → AC-7
- [x] "Marcar não atendimento", digite só o final do número (`123` para `CHM-2026-00123`) de um chamado atendido no prazo → acha o chamado; confirme com motivo → ele aparece na lista como "Não atendimento" e o indicador 3 fica com 0, "zerado por não atendimento" → AC-4, AC-8
- [x] Busque um número que não tem prazo no mês → "O chamado ... não está na base do indicador 3 deste mês." → AC-8
- [x] No indicador 4, "Marcar não fornecido", escolha uma cotação entregue no prazo, confirme com motivo → linha "Não fornecido" e o indicador 4 com 0; "Desfazer não fornecido" volta à escala → AC-4, AC-8
- [x] Entre como Admin sem designação → a tela aparece igual, sem a coluna Ações e sem os botões de marcação → AC-14
- [x] Mude o `tipoServico` de um chamado marcado para um tipo fora do contrato (no banco) e recarregue → a marcação sai da lista e aparece em "Marcações fora da base", sem contar → AC-9

### Value sourcing (uma checagem por fonte)

- [x] Marcações vigentes: grave no banco duas marcações do mesmo alvo com o mesmo `em` (desconsiderar e desfazer) → vale a de maior `_id` → AC-7
- [x] Papel: com designação `fiscal` e `gestor` ao mesmo tempo, a marcação grava `papel: 'fiscal'`; só com `gestor`, grava `gestor`; designação vencida (vigência no passado) recebe "Só o fiscal ou o gestor..." → AC-7, AC-14
- [x] Nome do autor: renomeie o usuário depois de marcar → a tela mostra o nome novo (o nome só fica preso na foto do fechamento, fatia 4) → AC-7

### Commands

- [x] `npx vitest run lib/imr-contrato` → os testes de `marcacoes.test.ts` passam → AC-4, AC-7, AC-8, AC-9

### Acceptance-criteria coverage (fatia 3)

- AC-4: UI 2, 4 e 6, os testes `não atendimento e não fornecido`
- AC-7: UI 1 a 3, value sourcing 1 a 3, os testes `desconsiderar`
- AC-8: UI 4 a 6, os testes `busca pelo número`
- AC-9: UI 8 e os testes `marcações ignoradas`; a recusa com o mês fechado e o intervalo fechado lido do banco ficam para a fatia 4

## Fatia 4: fechamento e reabertura · atualizado 2026-10-27

### UI / manual

- [x] Como fiscal, abra `/relatorios/imr-contrato` no mês corrente → em vez do botão, a tela diz "O mês pode ser fechado a partir de 01/MM/AAAA" → AC-10
- [x] Num mês passado aberto, clique "Fechar o mês", digite 41 no indicador 1 → o campo recusa com "Informe um número inteiro de 0 a 40"; com 40 e 18, a soma e a faixa aparecem ao vivo no diálogo → AC-10, AC-17
- [x] Confirme o fechamento → selo "Fechado, versão 1", cartões 1 e 2 com os pontos e a observação, cartão "Soma e faixa" com total, faixa e fator, e os botões de marcação somem → AC-1, AC-9, AC-10
- [x] Compare os pontos do I3 e do I4 e as linhas da prévia (antes de fechar) com a foto → números iguais → AC-15
- [x] Com o mês fechado, chame `marcarImrAction` direto (console ou teste) → "O mês está fechado. Reabra para alterar." → AC-9
- [x] Clique "Reabrir o mês" com motivo de 5 caracteres → o diálogo recusa; com 10 ou mais → a tela volta à prévia, e o card "Fechamentos e reaberturas" mostra a versão 1 com "Reaberta por ... : motivo" → AC-11
- [x] Clique "Ver a versão 1" → a foto antiga aparece com o selo "Versão 1, reaberta" e sem ações; feche de novo → versão 2, as duas na lista → AC-11
- [x] Feche dois meses seguidos com o I3 em 0 nos dois → o mês mais novo mostra "Reincidência de zero no indicador 3: multa de 0,3% sobre a nota fiscal mensal" → AC-12
- [x] Mês com o anterior aberto → "Reincidência não avaliada: o mês anterior não foi fechado"; primeiro mês da vigência → "... primeiro mês do contrato" → AC-12
- [x] Como Admin sem designação, abra um mês fechado e um aberto → vê tudo, sem "Fechar o mês" nem "Reabrir o mês" → AC-14
- [x] Confira no texto do cartão "Soma e faixa" a frase da RN-50 (quatro indicadores em 100 pontos) → AC-17

### Fontes de valor

- [x] Mude um feriado ou o expediente depois de fechar → a foto não muda (feriados e expediente gravados em `parametros`); a prévia de um mês aberto muda → AC-10, Value sourcing "fechamento"
- [x] Renomeie o usuário que fechou → a foto continua com o nome antigo (`fechadoPorNome`), a reabertura mostra o nome novo → AC-11
- [x] "Mês terminou" usa o dia de Belém: às 22h do dia 31 em Belém (01h UTC do dia 1) o fechamento ainda é recusado → AC-10, Value sourcing "mês terminou"
- [x] Reincidência lê só a maior versão sem reabertura do mês anterior: reabra o mês anterior → o mês atual passa a "não avaliada" → AC-12, Value sourcing "reincidência"

### Commands

- [x] `MONGO_TEST_URI=mongodb://127.0.0.1:27017 npx vitest run lib/imr-contrato` → todos passam, inclusive `fechamento.db.test.ts` → AC-9, AC-10, AC-11, AC-15, AC-18
- [x] `npx vitest run lib/imr-contrato/__tests__/fechamento.regras.test.ts` → faixas 80/79/70/69/60/59/50/49 e reincidência → AC-10, AC-12

### Acceptance-criteria coverage (fatia 4)

- AC-1: UI 3, 7 · AC-9: UI 3, 5 e o teste "ignora a marcação gravada com o mês fechado" · AC-10: UI 1 a 3 e Commands · AC-11: UI 6, 7 · AC-12: UI 8, 9 · AC-14: UI 10 · AC-15: UI 4 e o teste "grava a versão 1 com os números da prévia" · AC-17: UI 2, 11 · AC-18: testes de corrida em `fechamento.db.test.ts`

## Fatia 5 e 6: PDF do fechamento, banco real e axe · atualizado em 27/10/2026

### UI / manual

- [x] Como fiscal ou gestor, abra um mês ainda aberto: não aparece "Emitir PDF", e `POST /api/relatorios/imr-contrato/pdf` com esse mês responde 409 → AC-13
- [x] Feche o mês e clique em "Emitir PDF": baixa `imr-contrato-<número>-<mês>-v1.pdf`, e a seção "PDFs emitidos" mostra versão, data, quem emitiu, papel, código e o SHA-256 → AC-13
- [x] Abra o PDF: cabeçalho com contrato, mês, versão, quem fechou e quando; pontos dos quatro indicadores, soma, faixa e fator; texto da RN-50; reincidência; linhas do I3 e do I4 com a desconsiderada riscada; parâmetros (expediente, feriados, N) → AC-13, AC-16, AC-17
- [x] Mude um chamado ou um feriado depois do fechamento e emita de novo: os números do PDF não mudam (sai só da foto) → AC-13
- [x] Rode `sha256sum` no arquivo baixado: bate com o hash da emissão na tela → AC-13
- [x] Como Admin sem designação, abra o mês fechado: vê "Emitir PDF", não vê "Reabrir"; a emissão fica com o papel Admin → AC-13, AC-14
- [x] Reabra o mês: o botão some e a rota volta a responder 409; as emissões da versão 1 continuam na lista → AC-11, AC-13
- [x] Peça dois PDFs ao mesmo tempo (este e o do relatório por contrato): o segundo responde 429 com "Outro PDF está sendo gerado" → AC-13
- [x] Como Preposto ou Técnico, `POST /api/relatorios/imr-contrato/pdf` responde 403 → AC-14

### Comandos

- [x] `npx vitest run lib/imr-contrato/pdf app/api/relatorios/imr-contrato` → passa (geração, render, rota) → AC-13, AC-14
- [x] `MONGO_TEST_URI=mongodb://localhost:27017 npx vitest run lib/imr-contrato` → passa, inclusive `pdf.db.test.ts` e as corridas de `fechamento.db.test.ts` → AC-13, AC-18
- [x] `E2E_BASE_URL=<servidor num banco próprio> npx playwright test e2e/imr-contrato.spec.ts` → passa, com o axe sem violação na prévia, na foto e depois da emissão → AC-1, AC-10, AC-13, AC-14

### Value sourcing do PDF

- [x] PDF, conteúdo: só o `ImrFechamento` vigente; `fechadoPorNome` e `contratoNumero` vêm da foto mesmo depois de renomear o usuário ou o contrato → AC-13
