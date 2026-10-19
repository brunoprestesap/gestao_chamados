# Verify: Cotação e fornecimento de material · spec 0019 · updated 2026-10-19

_Steps derived from spec 0019 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Esta versão cobre a Fatia 1 (AC-1 a AC-20)._

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
