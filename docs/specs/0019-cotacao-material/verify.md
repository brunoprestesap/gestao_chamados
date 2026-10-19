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
- [ ] Como responsável técnico, na `atestada`: a aba "Minhas ações" lista a cotação; `Registrar nota fiscal` com número, data e arquivo → a seção Ateste mostra "Nº ..., de dd/mm/aaaa" com o link do arquivo; o botão some e um segundo registro é recusado → AC-22
- [x] Como técnico atribuído e como solicitante → o link do arquivo da nota fiscal responde 403 → AC-15, AC-22
- [x] Como fiscal, gestor ou aprovador, `Gerar PDF para o SEI` → baixa `cotacao-COT-<ano>-####.pdf` com resumo, itens com origem e base aplicada, orçamentos, conferências, advertências e a trilha inteira com autor, papel e limite no ato; o rodapé de toda página traz o código da emissão → AC-23
- [x] Como responsável técnico e como técnico → o botão não aparece, e `POST /api/cotacoes/<id>/pdf` com a sessão deles responde 403 → AC-23
- [ ] Como Admin sem designação → lê a cotação, mas não vê `Gerar PDF para o SEI`, e o `POST /api/cotacoes/<id>/pdf` responde 403; num rascunho, o `POST` de um fiscal responde 409 → AC-23 · added 2026-10-19 (review)
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
- [ ] Registrar a NF de verdade (número, data de hoje, arquivo) → passa pela conferência; o gestor recebe no sino "Nota fiscal registrada na cotação COT-…", sem valor e sem o número da NF, e não aparece toast de "Cotação … atestada" na tela dele → AC-16, AC-22
- [x] Como responsável técnico, abrir uma cotação com recebimento provisório registrado → o bloco Ateste mostra a data e a hora, sem o nome do gestor e sem selo de prazo; na trilha, a linha "Recebimento provisório registrado" mostra só "Gestor" → AC-21
- [x] Como responsável técnico, em `/cotacoes` → só as abas `Minhas ações`, `Ateste` e `Todas`; `/cotacoes?aba=analise` abre `Minhas ações`; em `Ateste` aparecem a coluna Recebimento com as datas e o selo "Nota fiscal pendente", sem selo de prazo → AC-21, AC-22
- [x] Como gestor, na aba `Ateste` → o selo de prazo continua aparecendo → AC-21
- [x] Como Admin sem designação, abrir uma cotação enviada → o botão do PDF aparece e o PDF baixa; nenhum outro botão de ação aparece → AC-23
- [x] Como responsável técnico, chamar `POST /api/cotacoes/<id inexistente>/pdf` e `POST /api/cotacoes/<id de rascunho>/pdf` → 403 nos dois; como fiscal, o rascunho → 404 → AC-23

### Value sourcing

- [ ] Data da NF no dia de Belém: com o relógio do servidor às 22:00 de Belém (01:00 UTC do dia seguinte), a data de hoje em Belém passa e a de amanhã é recusada; a virada é às 03:00 UTC (coberto em `revisao-19-10.test.ts`) → AC-22
- [x] Piso da data a partir de `autorizadoEm` em Belém: cotação autorizada às 01:00 UTC do dia 11 aceita NF do dia 10 → AC-22
- [x] Janela de 90 dias da contratada contada de `updatedAt`: NF registrada há 30 dias aparece; há 91 dias some; a `atestada` sem NF de 400 dias continua aparecendo → AC-15
- [x] `papel` da emissão do PDF: fiscal grava `fiscal`, gestor grava `gestor`, Admin sem designação grava `admin` (conferir em `cotacaomaterialpdfemissoes`) → AC-23

### Commands

- [x] `MONGO_TEST_URI=mongodb://localhost:27017/severino_test npx vitest run lib/material "app/(dashboard)/cotacoes"` → passa, inclusive `revisao-19-10.test.ts`, `pendencia.db.test.ts` (paridade entre `visaoDe` e o filtro da fila) e os casos novos de `ateste.db.test.ts` → AC-15, AC-16, AC-21, AC-22, AC-23

### Acceptance-criteria coverage

- AC-15 · NF pendente sempre visível, paridade memória e Mongo · AC-16 · aviso da NF sem toast de "atestada" · AC-21 · datas sem nome, trilha sem autor do recebimento, abas da contratada · AC-22 · data entre a autorização e hoje, remoção da NF não ligada · AC-23 · Admin sem designação emite com `papel: admin`, 403 antes da busca, 404 no rascunho
