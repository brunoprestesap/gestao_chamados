# Verify: Cotação e fornecimento de material · spec 0019 · updated 2026-10-19

_Steps derived from spec 0019 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Esta versão cobre a Fatia 1 (AC-1 a AC-20) e a Fatia 2 (AC-21 a AC-23)._

## Preparação

- [x] Em `/configuracoes/material`, como Admin: cadastrar um empenho do exercício corrente (ex.: R$ 100,00), duas faixas (R$ 15,00 e R$ 1.000,00) e designar um Preposto como responsável técnico, um Admin como fiscal, um Admin como gestor, um Admin como aprovador da faixa pequena e outro da faixa grande → o painel "O que falta" some → AC-19

## UI / manual

- [x] Como técnico atribuído, num chamado `em atendimento`, abrir `/chamados-atribuidos/<id>` → cartão "Material" com `Registrar material` → registrar 1 item (2 un) → cartão mostra `COT-<ano>-####` em `Rascunho`; o responsável técnico recebe aviso no sino, sem valor → AC-1, AC-16
- [x] Como fiscal, abrir `/cotacoes?aba=todas` → o rascunho não aparece para ele → AC-1
- [x] Como responsável técnico, abrir `/cotacoes/<id>` → item do diagnóstico com descrição, unidade e quantidade só leitura; acrescentar 3 orçamentos (arquivo PDF anexado em cada um) com preços 12,00 / 10,00 / 11,00 → salvar → o técnico perde o botão `Editar material` → AC-1, AC-4
- [x] Enviar com só 2 orçamentos cotando o item → recusado com "Cada item precisa de preço em ao menos 3 orçamentos" → AC-4
- [x] Enviar com os 3 → situação `Enviada`; o chamado vai para `aguardando_terceiros`; total R$ 20,00 (menor preço × 2) → AC-2, AC-4
- [x] Na tela do técnico, tentar `Retomar` o chamado → recusado com a mensagem da pausa da cotação → AC-2
- [x] Como fiscal: `Assumir análise` → `Em análise`; `Devolver` sem motivo → bloqueado; com motivo → `Devolvida`, motivo visível ao responsável técnico e ao técnico; reenviar → `Enviada` de novo, chamado continua pausado → AC-5
- [x] Inativar o empenho e tentar `Encaminhar` → impedimento "Nenhum empenho elegível tem saldo" → reativar e encaminhar → `Em aprovação` → AC-6
- [x] Como aprovador da faixa pequena: não vê `Aprovar` e vê o nome do aprovador que pode → AC-7
- [x] Como aprovador da faixa grande: `Aprovar` com o empenho pré selecionado → `Autorizada`; o chamado volta para `em atendimento`; o painel do empenho mostra R$ 20,00 comprometido; a trilha mostra o limite no ato → AC-2, AC-8, AC-9
- [x] Tentar concluir o chamado (`Registrar execução` do serviço) com a cotação `Autorizada` → recusado com a mensagem da cotação em trâmite → AC-13
- [x] Como técnico, `Registrar execução` do material sem evidência → impedimento de evidência; com aplicada 3 → "passa da autorizada"; anexar foto e aplicar 1 → `Executada`, advertência de divergência para o TRF1, comprometido cai para R$ 10,00 → AC-10
- [x] Como gestor, ver a seção "Custo" do chamado em `/gestao` → linha "Cotações de material executadas" com R$ 10,00 no total; a ficha do ativo, o IMR (aba Ativos) e o relatório por contrato mostram o mesmo número → AC-17
- [x] Com outra cotação autorizada, `Pedir alteração` (responsável técnico) → `Devolvida` com "Alteração após autorização", saldo liberado; reenviar volta para análise e pausa o chamado → AC-11
- [x] Cancelar o chamado com cotação autorizada → cotação `Cancelada`, saldo liberado, trilha com papel Sistema e motivo "O chamado foi cancelado" → AC-12
- [x] Reprovar uma cotação em análise → `Reprovada`, sem ação para voltar a tramitar; o técnico consegue registrar material de novo no chamado → AC-3, AC-14
- [x] Como solicitante, abrir `/meus-chamados/<id>` → só a linha "Material do chamado: <situação>", sem itens nem valores; `GET /api/cotacoes/arquivos/<orçamento>` devolve 403 → AC-15
- [x] Como técnico, baixar um orçamento pela URL do arquivo → 403; baixar a evidência → 200 com `Content-Disposition: attachment` e `X-Content-Type-Options: nosniff` → AC-15
- [x] Como responsável técnico, a tela da cotação não mostra empenho, saldo, limite nem advertência de divergência → AC-15
- [x] Notificação, e-mail e toast de cada mudança de situação não contêm "R$" → AC-16 (os três saem só de `tituloAvisoCotacao` e do link; `mensagens.test.ts` e `arquivos-avisos.db.test.ts`)
- [x] No `PauseTicketDialog` (técnico e gestão), o motivo "Falta de Peça (Aguardando Aprovação do Cliente)" não aparece; uma cotação antiga `enviada` ainda é aprovada pelo cartão antigo → AC-18
- [x] `/configuracoes/material` mostra "Taxa de administração sobre material: R$ 0,00" sem campo de edição → AC-20
- [x] Designar a mesma pessoa no mesmo papel em período que se cruza → recusado; designar um Técnico como fiscal → recusado; anular mais que o saldo livre → recusado → AC-19

## Value sourcing

- [x] Número: duas cotações seguidas no mesmo ano saem `COT-<ano>-0001` e `-0002` (contador `cotacao_material_<ano>`)
- [x] `ativoId`: vincular outro ativo ao chamado entre criar e enviar → a cotação enviada carrega o ativo novo
- [x] Preço caminho 3: mudar o menor orçamento antes do envio muda o total; depois do envio, o preço não muda
- [x] Valor da linha: quantidade 1,333 × R$ 0,03 → R$ 0,04 (um arredondamento só, como `shared/chamados/custo.ts`)
- [x] Trava do técnico: some no primeiro salvamento do responsável técnico
- [x] Empenhos elegíveis: um empenho com `vigenciaFim` ontem (Belém) ou exercício anterior não aparece na aprovação
- [x] Limite do aprovador: desativar a faixa grande → o aprovador perde o `Aprovar`
- [x] Executar: técnico reatribuído depois da autorização → o antigo não executa, o novo executa
- [x] Executar: data do servidor posterior a `autorizadoEm`
- [x] Cancelar pelo chamado: autor do evento = quem cancelou o chamado, motivo `chamado_cancelado`; recusa grava `chamado_recusado`
- [x] "Hoje" em Belém: designação com início amanhã (Belém) ainda não vale às 22:00 de hoje em Belém (01:00 UTC)
- [x] Custo: um chamado com cotação antiga aprovada, cotação nova executada e material fora de cotação soma os três na ficha, no IMR e no relatório

## Commands

- [x] `MONGO_TEST_URI=mongodb://127.0.0.1:27017/severino_test npx vitest run lib/material` → 5 arquivos, todos passando (corrida de saldo, queda e conciliação, só inclusão, fio completo, varredura) → AC-3, AC-8, AC-9, AC-12, AC-13
- [x] `npx vitest run` → suíte inteira verde → AC-18
- [x] `curl -X POST -H "x-cron-secret: <segredo>" http://localhost:3000/api/cron/material-conciliacao` → `{ ok: true, verificadas, liberadas }`; sem o header → 401 → AC-8

## Acceptance-criteria coverage

- AC-1 · rascunho, trava, aviso · AC-2 · pausa, retomada, trava da retomada manual · AC-3 · uma em trâmite · AC-4 · 3 orçamentos e menor preço · AC-5 · assumir, devolver, reprovar, encaminhar · AC-6 · empenho elegível · AC-7 · faixa e quem montou · AC-8 · reserva atômica e conciliação · AC-9 · trilha · AC-10 · execução · AC-11 · alteração · AC-12 · cancelamento · AC-13 · conclusão e varredura · AC-14 · reprovada · AC-15 · visibilidade · AC-16 · avisos sem valor · AC-17 · custo · AC-18 · envio antigo fechado · AC-19 · cadastro · AC-20 · taxa zero

## Fatia 2: ateste, nota fiscal e PDF · added 2026-10-19

_Pede uma cotação `executada` do fio da Fatia 1 e as mesmas designações da Preparação._

### UI / manual

- [x] Como gestor, abrir `/cotacoes?aba=ateste` → a cotação `executada` aparece com o selo "Recebimento provisório até dd/mm" (dia da execução em Belém + 5) → AC-21
- [x] Com uma cotação executada há mais de 5 dias (pode ajustar `executadoEm` no banco de teste) → o selo fica vermelho, "Recebimento provisório atrasado", e nada é bloqueado → AC-21
- [x] Como gestor, em `/cotacoes/<id>`, `Registrar recebimento provisório` → confirmar → a situação continua `Executada`, a seção Ateste mostra data e nome, o selo passa ao definitivo, e ninguém recebe aviso → AC-21
- [x] Ainda como gestor, `Registrar recebimento definitivo` → a situação vira `Atestada`, a trilha ganha os dois atos com papel Gestor, e o responsável técnico recebe "Cotação X atestada" sem valor → AC-21, AC-9, AC-16
- [x] Como fiscal ou aprovador (sem designação de gestor), na `executada` → nenhum botão de recebimento → AC-21
- [x] Como responsável técnico, na `executada` → sem `Registrar nota fiscal`; enviar arquivo `nota_fiscal` pela rota de upload → 409 → AC-22
- [x] Como responsável técnico, na `atestada`: a aba "Minhas ações" lista a cotação; `Registrar nota fiscal` com número, data e arquivo → a seção Ateste mostra "Nº ..., de dd/mm/aaaa" com o link do arquivo; o botão some e um segundo registro é recusado → AC-22
- [x] Como técnico atribuído e como solicitante → o link do arquivo da nota fiscal responde 403 → AC-15, AC-22
- [x] Como fiscal, gestor ou aprovador, `Gerar PDF para o SEI` → baixa `cotacao-COT-<ano>-####.pdf` com resumo, itens com origem e base aplicada, orçamentos, conferências, advertências e a trilha inteira com autor, papel e limite no ato; o rodapé de toda página traz o código da emissão → AC-23
- [x] Como responsável técnico e como técnico → o botão não aparece, e `POST /api/cotacoes/<id>/pdf` com a sessão deles responde 403 → AC-23
- [x] Como Admin sem designação → lê a cotação sem nenhum botão de ação, vê `Gerar PDF para o SEI`, e o `POST /api/cotacoes/<id>/pdf` responde 200 com a emissão gravando `papel: admin`; quem está fora do lado TRF1 recebe 403, mesmo com id inexistente; num rascunho, o `POST` do lado TRF1 responde 404 → AC-23 · added 2026-10-19 (review), corrigido em 2026-10-20 para a decisão do AC-23
- [x] Como responsável técnico, `Registrar nota fiscal` → `Conferir` mostra número, data e arquivo antes de gravar; `Corrigir` volta ao formulário; data futura não é aceita; ao confirmar, os gestores recebem "Nota fiscal registrada na cotação X", sem valor → AC-22, AC-16 · added 2026-10-19 (review)
- [x] Com uma `atestada` sem nota fiscal parada há mais de 90 dias → continua em "Minhas ações" e no detalhe do responsável técnico; o selo de atraso do ateste não aparece para ele, só as datas → AC-21, AC-22 · added 2026-10-19 (review)

### Value sourcing

- [x] Prazo do provisório: execução às 23:30 de Belém (02:30 UTC do dia seguinte) → o vencimento conta do dia de Belém, não do dia UTC → AC-21
- [x] Prazo do definitivo: conta do `recebimentoProvisorio.em`, não da execução → AC-21
- [x] Autor do recebimento e da nota fiscal: o usuário da sessão no ato, gravado na cotação e no evento → AC-9

### Commands

- [x] `sha256sum cotacao-COT-....pdf` → igual ao `sha256` do documento em `cotacaomaterialpdfemissoes` com o `_id` do header `X-Emissao-Id` → AC-23
- [x] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/material` → passa, inclusive `ateste.db.test.ts` e `prazos.test.ts` → AC-21, AC-22, AC-23

### Acceptance-criteria coverage

- AC-21 · provisório, definitivo, selo de prazo · AC-22 · nota fiscal só na atestada, pelo responsável técnico · AC-23 · PDF do lado TRF1 com SHA-256 da emissão

## Revisão de 19/10 (passo 13a) · added 2026-10-19

### UI / manual

- [x] Como responsável técnico, numa cotação `atestada` sem NF, abrir `Registrar nota fiscal` → o campo de data tem `min` no dia da autorização (em Belém) e `max` em hoje; o texto pede a data entre esses dois dias → AC-22
- [x] Digitar uma data anterior ao dia da autorização (forçando pelo teclado) e confirmar → recusa "A data da nota fiscal não pode ser anterior ao dia da autorização."; a nota não grava → AC-22
- [x] No mesmo diálogo, anexar `nf1.pdf` e depois `nf2.pdf` → o primeiro arquivo some da lista de arquivos da cotação; clicar `Voltar` → o segundo também some (removido, não apagado do disco) → AC-22
- [x] Registrar a NF de verdade (número, data de hoje, arquivo) → passa pela conferência; o gestor recebe no sino "Nota fiscal registrada na cotação COT-…", sem valor e sem o número da NF, e não aparece toast de "Cotação … atestada" na tela dele → AC-16, AC-22
- [x] Como responsável técnico, abrir uma cotação com recebimento provisório registrado → o bloco Ateste mostra a data e a hora, sem o nome do gestor e sem selo de prazo; na trilha, a linha "Recebimento provisório registrado" mostra só "Gestor" → AC-21
- [x] Como responsável técnico, em `/cotacoes` → só as abas `Minhas ações`, `Ateste` e `Todas`; `/cotacoes?aba=analise` abre `Minhas ações`; em `Ateste` aparecem a coluna Recebimento com as datas e o selo "Nota fiscal pendente", sem selo de prazo → AC-21, AC-22
- [x] Como gestor, na aba `Ateste` → o selo de prazo continua aparecendo → AC-21
- [x] Como Admin sem designação, abrir uma cotação enviada → o botão do PDF aparece e o PDF baixa; nenhum outro botão de ação aparece → AC-23
- [x] Como responsável técnico, chamar `POST /api/cotacoes/<id inexistente>/pdf` e `POST /api/cotacoes/<id de rascunho>/pdf` → 403 nos dois; como fiscal, o rascunho → 404 → AC-23

### Value sourcing

- [x] Data da NF no dia de Belém: com o relógio do servidor às 22:00 de Belém (01:00 UTC do dia seguinte), a data de hoje em Belém passa e a de amanhã é recusada; a virada é às 03:00 UTC (coberto em `revisao-19-10.test.ts`) → AC-22
- [x] Piso da data a partir de `autorizadoEm` em Belém: cotação autorizada às 01:00 UTC do dia 11 aceita NF do dia 10 → AC-22
- [x] Janela de 90 dias da contratada contada de `updatedAt`: NF registrada há 30 dias aparece; há 91 dias some; a `atestada` sem NF de 400 dias continua aparecendo → AC-15
- [x] `papel` da emissão do PDF: fiscal grava `fiscal`, gestor grava `gestor`, Admin sem designação grava `admin` (conferir em `cotacaomaterialpdfemissoes`) → AC-23

### Commands

- [x] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/material "app/(dashboard)/cotacoes"` → passa, inclusive `revisao-19-10.test.ts`, `pendencia.db.test.ts` (paridade entre `visaoDe` e o filtro da fila) e os casos novos de `ateste.db.test.ts` → AC-15, AC-16, AC-21, AC-22, AC-23

### Acceptance-criteria coverage

- AC-15 · NF pendente sempre visível, paridade memória e Mongo · AC-16 · aviso da NF sem toast de "atestada" · AC-21 · datas sem nome, trilha sem autor do recebimento, abas da contratada · AC-22 · data entre a autorização e hoje, remoção da NF não ligada · AC-23 · Admin sem designação emite com `papel: admin`, 403 antes da busca, 404 no rascunho

## Fatia 3: Anexo V e SINAPI · acrescentado em 2026-10-19

_Passos derivados de AC-24 a AC-30 e das linhas da Value sourcing da fatia 3. Antes, tenha um contrato ativo, vigente hoje e com o tipo de serviço `Manutenção Predial` em `/configuracoes/contratos`._

### Preparação

- [x] Montar um CSV do SINAPI com uma linha de título, uma vazia e o cabeçalho na linha 3 (`Código;Descrição;Unidade;PRECO;SOBRA`), com uma descrição entre aspas que tenha `;` dentro, e salvar em Windows-1252 (ANSI) → é o arquivo dos passos do SINAPI → AC-25
- [x] Montar um CSV do Anexo V com `ITEM;DESCRICAO;UNIDADE;QUANTIDADE;PRECO;CODIGO_SINAPI`: item 1 com código que existe no SINAPI e preço mais de 10% acima dele, item 2 com código e preço até 10% acima, item 3 sem código, itens 4 e 5 com o mesmo código → AC-24

### UI / manual

- [x] Em `/configuracoes/material`, aba `SINAPI`, enviar o CSV com o mês `08/2026` → aparece a revisão com o total de insumos; `Aplicar` → o mês aparece em "Meses importados" como mais recente, e a descrição com `;` foi lida inteira → AC-25
- [x] Enviar o mesmo mês de novo → "Este mês já foi importado." e nada muda → AC-25
- [x] Enviar um CSV sem a coluna `PRECO` → "Falta a coluna PRECO no cabeçalho."; enviar um com preço `1,234` → recusa com o número da linha, e nada é gravado → AC-24, AC-25
- [x] Aba `Anexo V`: escolher o contrato e enviar o CSV → revisão com 5 novos; `Aplicar` → a tabela do contrato mostra a versão 1; o item 1 tem a marca "acima do SINAPI além do percentual", o item 2 não → AC-24, AC-29
- [x] Com uma importação pendente, tentar enviar outra do mesmo tipo → o formulário diz que há uma aberta; `Descartar` libera o envio → AC-24
- [x] No item 3, `Marcar` com motivo → marca "marcado pelo Admin"; reimportar o Anexo V com o `CODIGO_SINAPI` do item 1 vazio → a revisão não conta o item 1 como alterado; depois de aplicar, o item 1 mantém o código e o item 3 mantém a marca manual (versão 2) → AC-24, AC-29
- [x] No item 3, `Código`, informar o código de um insumo mais barato que ele além de 10%, com motivo → a marca automática liga sozinha, e a manual continua → AC-24, AC-29
- [x] O painel "O que falta" lista o item do Anexo V sem código SINAPI; com um contrato vigente sem Anexo V, ele aparece; sem nenhum mês SINAPI, aparece "Nenhum mês do SINAPI importado" → AC-28, AC-30
- [x] Como responsável técnico, numa cotação em rascunho de um chamado `Manutenção Predial`, clicar `Buscar no Anexo V ou SINAPI` e buscar pela descrição do item 1 → aparece o item do Anexo V marcado "tem equivalente SINAPI" e o insumo na lista do SINAPI, com preço só para leitura → AC-26
- [x] `Usar` o item 1 → o item mostra "o fiscal escolhe a base", sem campo de preço e com a unidade travada; `Usar` um insumo só do SINAPI em outro item → origem SINAPI com o preço do mês; `Usar` o insumo dos itens 4 e 5 → "Este insumo equivale aos itens 4 e 5 do Anexo V; escolha um deles." → AC-26
- [x] Os orçamentos do editor só pedem preço para os itens que ficaram em "Três orçamentos"; uma cotação só com itens da tabela é enviada sem orçamento → AC-26
- [x] Num chamado de tipo de serviço sem contrato vigente, a busca diz que não há Anexo V e só oferece o SINAPI → AC-30
- [x] Classificar um item com o item do Anexo V e, antes de enviar, reimportar o Anexo V sem esse número → `Salvar e enviar` recusa com "classifique o item de novo" → AC-26
- [x] Como fiscal, assumir a cotação enviada → a coluna "Origem do preço" mostra as duas bases lado a lado com os preços, a advertência "Preço do Anexo V acima do SINAPI" e "Conferência obrigatória" no item 1; o item sem código mostra "sem referência SINAPI" → AC-27, AC-28, AC-29
- [x] `Encaminhar para aprovação` abre o diálogo pedindo a base e a justificativa do item 1 e a conferência dele; o botão só libera com os textos de 10 caracteres ou mais; depois de encaminhar, o preço do item vira o da base escolhida e a justificativa aparece → AC-27, AC-29
- [x] Como aprovador, abrir a cotação → vê as duas bases, a base escolhida e a advertência de preço → AC-27, AC-28
- [x] Devolver uma cotação com item `ambas` já escolhido → a base e a conferência somem, e o preço volta a "provisório" → AC-27
- [x] Como responsável técnico, abrir a cotação enviada → vê a origem e a referência (item do Anexo V, código SINAPI), mas não os dois preços lado a lado nem as advertências de preço → AC-15

### Value sourcing

- [x] Anexo V oferecido: mudar o tipo de serviço do chamado para um que o contrato não cobre, ou a vigência do contrato para terminar ontem (dia de Belém) → a busca deixa de oferecer o caminho 1 → AC-30
- [x] Origem nunca vem da entrada: chamar `classificarItemAction` com `escolha: { origem: 'anexo_v' }` ou com um preço junto → recusado pelo schema; com `{ sinapiCodigo }` de um insumo equivalente a um item vigente, a origem gravada é `ambas` → AC-26
- [x] Mês, UF e regime do SINAPI: o mês gravado é o do formulário, mesmo que o nome do arquivo diga outro; todo insumo tem `uf: 'AP'` e `regime: 'nao_desonerado'` (conferir em `sinapiinsumos`) → AC-25
- [x] Marca automática: importar um mês SINAPI mais novo em que o preço do item 1 sobe e fica dentro dos 10% → a marca automática desliga e a manual de outro item não muda; importar um mês mais antigo que o mais recente não mexe em marca nenhuma → AC-29
- [x] Lista de conferência lida no ato: marcar à mão um item depois de a cotação ser enviada → o encaminhar passa a pedir a conferência dele; a marca usada vai para `itensNoAto[].marcaAnomalia` do evento → AC-29
- [x] Preço do caminho 1: copiado do item vigente de mesmo número no envio; reimportar o Anexo V com outro preço depois do envio não muda a cotação → AC-26
- [x] Preço do caminho 2: o do mês SINAPI mais recente no envio; importar um mês mais novo depois do envio não muda a cotação → AC-26
- [x] Itens sem código no painel: só os da versão vigente com `sinapiCodigo` vazio; um item com código fora do mês mais recente não entra no painel, mas a cotação mostra "sem referência SINAPI" → AC-28

### Commands

- [x] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/material shared/material "app/(dashboard)/cotacoes" "app/(dashboard)/configuracoes/material"` → passa → AC-24 a AC-30 (os testes próprios da fatia 3 ainda são do `/test`)

### Acceptance-criteria coverage

- AC-24 · importação, revisão, versão, herança do código e da marca, correção do código · AC-25 · layout, cabeçalho procurado, Windows-1252, mês imutável · AC-26 · busca, classificação, origem derivada, preço congelado, `classificacao_desatualizada` · AC-27 · bases lado a lado, escolha com justificativa, devolução limpa · AC-28 · advertências de preço, painel de itens sem código · AC-29 · marca automática e manual, conferência no encaminhar · AC-30 · caminho 1 só com contrato e Anexo V, caminho 2 só com SINAPI, painel

## Fatia 4: controles do caminho 3 e urgência · acrescentado em 2026-10-20

_Passos do AC-31 ao AC-35, com as decisões e as regras finas de 20/10. Os CNPJs de teste das fatias 1 a 3 (`11111111000191` e parecidos) já passam no dígito verificador; o que mudou nos testes antigos foi a validade e a referência obrigatórias._

### UI / manual

- [x] Como responsável técnico, num rascunho, lançar um orçamento com CNPJ `11.111.111/0001-92` e salvar → recusado no salvar, com o nome do fornecedor e "dígito verificador" → AC-31
- [x] Lançar um orçamento com CNPJ da contratada (`03.543.374/0001-41`) e salvar → recusado no salvar, nomeando o fornecedor → AC-31
- [x] Lançar 3 orçamentos para o item, dois com a mesma raiz (`11.111.111/0001-91` e `11.111.111/0002-72`) e um de outra empresa, e enviar → a linha do item diz "de 2 empresas diferentes" e o envio dá o impedimento de 3 empresas (`cnpj_mesma_raiz`) → AC-31
- [x] Enviar com 3 empresas, mas sem referência no item → impedimento `sem_referencia` → AC-32
- [x] Acrescentar uma referência "Insumo do SINAPI" pelo código e salvar → aparece com o preço, a unidade e a fonte da tabela do mês mais recente; o campo de valor não existe para esse tipo → AC-32
- [x] Acrescentar uma referência "Outra fonte" com data de amanhã, e outra com data de 13 meses atrás → as duas recusadas no salvar → AC-32
- [x] Deixar um orçamento sem validade e enviar → impedimento `validade_ausente`; a validade anterior à data do orçamento é recusada no salvar → AC-34
- [x] Como fiscal que assumiu, acrescentar ao item uma referência livre bem abaixo do menor orçamento → a faixa "O menor orçamento de um item passa da menor referência" aparece e o encaminhar é recusado com `variacao_acima` → AC-33
- [x] Como outro fiscal, tentar retirar essa referência → não há botão; pela action, recusa "só o fiscal que assumiu" → AC-32
- [x] Como o fiscal que incluiu, `Retirar` a referência → ela fica riscada com "retirada" e o encaminhar passa → AC-32, AC-33
- [x] Devolver; como responsável técnico, salvar o rascunho → a referência do fiscal continua lá, marcada "informada pelo fiscal", sem o nome dele → AC-32, AC-15
- [x] Com um orçamento de validade de ontem, encaminhar → o diálogo pede a marca desse orçamento; sem marcar, o botão fica desligado; marcando, encaminha, e o detalhe mostra "Validade vencida confirmada pelo fiscal (nome) em ..." só para o lado TRF1 → AC-34
- [x] Com validade de hoje, encaminhar → nenhuma marca é pedida → AC-34
- [x] Devolver a cotação que tinha a confirmação → a confirmação some do detalhe → AC-34
- [x] Como responsável técnico, marcar "Pedir urgência no envio", justificar e enviar com 1 orçamento por item → enviada; a fila mostra o selo "Urgente" e o fiscal recebe o aviso "URGENTE: cotação ... enviada para análise" → AC-35, AC-16
- [x] Como fiscal, assumir e encaminhar sem marcar "Aceito a urgência" → o botão fica desligado; pela action, impedimento `urgencia_sem_decisao` → AC-35
- [x] Aceitar a urgência e encaminhar; aprovar; executar; registrar o provisório → o botão do definitivo não aparece, a faixa da urgência diz que a pesquisa está pendente → AC-35
- [x] Como responsável técnico, a cotação aparece em `Minhas ações` com "Pesquisa de preços pendente"; em `Completar a pesquisa da urgência`, acrescentar um orçamento mais barato que o aplicado → o preço, o valor autorizado e a reserva não mudam; o lado TRF1 vê a advertência de pesquisa posterior com preço menor; a contratada não → AC-35, AC-15
- [x] Acrescentar o orçamento que completa 3 empresas por item → a faixa mostra "Pesquisa de preços completa", os gestores recebem o aviso uma vez, sem valor e sem toast de situação, e o definitivo aparece e passa → AC-35, AC-16
- [x] Noutra cotação com urgência pedida, o fiscal clica `Recusar urgência` com motivo → vai para `devolvida`; o responsável técnico vê o motivo e não vê mais a opção de pedir urgência; o reenvio com 1 orçamento por item é recusado com `orcamentos_insuficientes` → AC-35
- [x] Como solicitante, abrir o chamado de uma cotação urgente → nenhuma marca de urgência nem justificativa; como técnico atribuído → só o selo "Urgente" no cartão → AC-35, AC-15
- [x] Gerar o PDF de uma cotação urgente com referência do fiscal e vencido confirmado → o PDF traz a seção "Referências de preço" com quem informou, a seção "Urgência", a fase do orçamento e a confirmação do vencido, e os eventos novos na trilha → AC-23

### Value sourcing

- [x] Raiz da contratada: mudar `MaterialConfig.raizCnpjContratada` no banco para outra raiz → o orçamento que antes era "da contratada" passa no salvar, e o da raiz nova é recusado → AC-31
- [x] Preço da referência SINAPI: importar um mês mais novo com outro preço para o mesmo código e reenviar → a referência da contratada é recopiada com o preço novo; um código ausente do mês novo dá `referencia_desatualizada`; a referência SINAPI do fiscal não é refeita → AC-32
- [x] Menor referência: com uma referência da contratada alta e uma do fiscal baixa, a variação é medida contra a do fiscal → AC-33
- [x] "Hoje" do vencido: encaminhar às 22:00 de Belém (01:00 UTC do dia seguinte) com validade igual ao dia de Belém → não pede marca → AC-34
- [x] Data da referência livre: às 22:00 de Belém, a data de hoje em Belém é aceita e a do dia seguinte recusada → AC-32
- [x] `pesquisaCompletaEm`: gravado na hora da inclusão que fecha as 3 empresas, ou no envio quando a urgência já chega completa (sem aviso aos gestores) → AC-35

### Commands

- [x] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/material` → passa, inclusive `fatia4.test.ts`, `fatia4.db.test.ts` e o teste de paridade de `pendencia.db.test.ts` com a urgência → AC-15, AC-31 a AC-35
- [x] `npm run test:e2e -- e2e/cotacao-flow.spec.ts` num banco próprio → o fio passa com a referência livre e a validade preenchidas → AC-32, AC-34

### Acceptance-criteria coverage

- AC-31 · CNPJ inválido e da contratada no salvar e no envio, 3 raízes distintas por item, mesma raiz conta uma vez · AC-32 · referência SINAPI pela tabela ou livre, do fiscal na análise, retirada só pelo próprio fiscal, salvar que não apaga a do fiscal, `referencia_desatualizada` · AC-33 · variação contra a menor referência ativa, também na urgência · AC-34 · validade obrigatória, vencido com marca por orçamento, devolução limpa · AC-35 · pedido, aceite no encaminhar, recusa que devolve, complemento sem mudar preço nem reserva, `pesquisa_pendente`, divergência posterior, pendência da contratada, avisos e marca · AC-15, AC-16, AC-23 · visibilidade dos campos novos, títulos de aviso, PDF

## Fatia 5: advertências, projeção, parâmetros e relatório · acrescentado em 2026-10-20

### Preparação

- [x] Como Admin, em `/configuracoes/material`, ter uma faixa ativa de R$ 1.000,00, um empenho com saldo de R$ 1.000,00 e um equipamento (ativo) usado em dois chamados → AC-36, AC-38

### UI / manual

- [x] Autorizar uma cotação de "Disjuntor 40A" de R$ 600,00 no equipamento; enviar outra de R$ 500,00 do mesmo item no mesmo equipamento; como fiscal, `Assumir` → o item mostra "Possível fracionamento" e a cotação segue para análise (não trava) → AC-36
- [x] Repetir com a cotação anterior autorizada há mais dias que a janela, ou num chamado sem equipamento → sem a advertência → AC-36
- [ ] Com duas outras cotações autorizadas no mesmo equipamento dentro da janela, assumir a terceira → "Reincidência" na cotação; com uma só, não aparece → AC-37
- [x] Item do Anexo V cujo consumo (executado mais autorizado mais esta cotação) passa da quantidade estimada → "consumo acumulado passa da quantidade estimada" já no assumir, antes de autorizar → AC-39
- [x] Item com três orçamentos e descrição quase igual a um insumo do SINAPI do mês mais recente (ou a um item do Anexo V do contrato) → "Item com três orçamentos cuja descrição se parece"; o item do caminho 1 com a mesma descrição não avisa → AC-40
- [ ] Devolver a cotação depois de assumir → as advertências da fatia 5 continuam no detalhe; um novo `Assumir` as refaz → AC-36 a AC-40
- [x] Abrir a mesma cotação como responsável técnico e como técnico atribuído → nenhuma das cinco advertências da fatia 5 aparece → AC-15
- [x] Como aprovador, abrir `Aprovar` numa cotação que vale 20% ou mais do saldo do empenho → aviso âmbar com saldo, consumo médio por dia e data estimada (ou "histórico insuficiente" num empenho com menos de 30 dias de movimento); abaixo de 20% o aviso não aparece → AC-38
- [x] Aprovar essa cotação → a trilha e o PDF (`Gerar PDF`) mostram a projeção gravada no ato → AC-38
- [ ] Como responsável técnico, tentar `Enviar` uma cotação sem orçamentos → recusa com os impedimentos; depois enviar corrigida → em `/relatorios/material` do dia, "Impedimento na primeira tentativa" conta 1 de 1 → AC-43, AC-41
- [x] Como Admin, aba `Parâmetros`: gravar janela 30 e parcela 50 → uma linha de histórico por campo, com autor e data; abrir a tela em duas abas, gravar nas duas → a segunda recebe "Os parâmetros mudaram… Recarregue" → AC-42
- [x] Gravar percentual 101 ou janela 0 → recusado com a mensagem do limite → AC-42
- [x] Mudar o percentual sobre o SINAPI → um item do Anexo V perto do limite entra ou sai da lista de anomalia automática sem nova importação → AC-42
- [x] Assumir uma cotação depois de mudar os parâmetros → a trilha (PDF) copia os quatro valores vigentes → AC-42
- [x] Como Admin, menu Material › `Relatório de material` → abre no mês corrente; período sem cotações mostra "sem cotações no período", nunca 0%; como Preposto, a rota redireciona → AC-41
- [ ] Cotação autorizada num mês e executada no outro → a diferença Anexo V e SINAPI aparece no mês da autorização (inclusive item `ambas` com base SINAPI) e a divergência e o custo por equipamento no mês da execução → AC-41
- [x] Período de 367 dias → recusado e a tela volta ao mês corrente com o aviso → AC-41

### Value sourcing

- [ ] Faixas do fracionamento: desativar a faixa de R$ 1.000,00 e assumir de novo → a advertência some (só faixas ativas no ato)
- [x] Janela: com `janelaDias` 30, uma cotação autorizada há 40 dias não conta; com 90, conta (dia contado em Belém)
- [ ] Consumo: item do Anexo V reimportado em versão nova → o consumo da versão antiga soma no mesmo número; o de outro contrato com o mesmo número não
- [ ] Item parecido: sem mês SINAPI importado, só o Anexo V do contrato do chamado é comparado
- [ ] Projeção: um reforço ou uma anulação do empenho não muda o consumo médio; o saldo usado é o de antes da reserva
- [ ] Tentativa: a recusa por versão desatualizada não grava tentativa

### Commands

- [x] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/material/__tests__/fatia5` → 38 testes passam → AC-36 a AC-43

### Acceptance-criteria coverage

- AC-36 fracionamento · AC-37 reincidência · AC-38 projeção · AC-39 consumo · AC-40 item parecido · AC-41 relatório · AC-42 parâmetros · AC-43 tentativa · AC-15 visibilidade dos códigos novos
