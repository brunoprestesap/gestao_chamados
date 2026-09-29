# Verify: revisão das decisões da IA pelo Preposto · spec 0009 · updated 2026-09-29

_Passos derivados dos critérios de aceitação da spec 0009. `/check verify` roda estes passos;
`/test` trava os duráveis. Cobre o Marco 1 (revisar de ponta a ponta), o Marco 2 (correção de
prioridade com o atendimento em curso) e o Marco 3 (correção de serviço) de ponta a ponta pelo
navegador, contra o app rodando de verdade. O achado do `/check verify` do marco 3 (AC-16 sem
teste dedicado para `corrigirServicoAction` num chamado atribuído pela regra) foi fechado com dois
testes novos em `atribuicao-automatica.db.test.ts` contra o Mongo de verdade; o ambiente de
desenvolvimento continua sem um chamado assim para exercitar ao vivo pelo navegador, mas o caminho
já tem prova automatizada. Ver a nota na cobertura de AC-16 abaixo.

O Marco 4 (avisos e regressão) está construído, testado (unitário e contra o Mongo de verdade) e
dirigido ao vivo no navegador: o toast `ticket:corrected` foi capturado em tempo real (duas abas,
uma logada como o técnico com o socket já conectado, outra como Admin corrigindo a prioridade), a
reatribuição foi conferida de ponta a ponta (histórico sem "Observações", `correcao_gestao` com o
motivo, o técnico novo recebendo o `ticket:assigned` de sempre, o solicitante não recebendo nada).
A troca de técnico pela correção de serviço (a outra metade do AC-14/AC-15) não foi exercitada ao
vivo nesta rodada, só por teste; fica para o próximo `/check verify` junto com o link do toast
(`/chamados-atribuidos/[id]`), que não pôde ser confirmado por clique devido à sessão do navegador
ter trocado de usuário no meio do teste (ver notas nas linhas de AC-14/AC-15 abaixo)._

## UI / manual

- [x] Como Preposto, abrir `/gestao`, escolher "Revisão da IA" → "Decidido pela IA, sem revisão" → só aparecem chamados com decisão `efeito: 'aplicado'` e `situacao: 'sem_revisao'` → AC-1
- [x] Escolher o recorte desconhecido via URL (`?revisaoIa=xyz`) → a API devolve 400 → AC-1
- [x] Combinar "Revisão da IA" com um status e uma busca por texto → os três filtros valem ao mesmo tempo → AC-2
- [x] Abrir cada um dos quatro recortes sem nenhum chamado correspondente → aparece a frase própria do recorte (ex.: "Nenhum chamado decidido pela IA aguardando revisão.") → AC-3
- [ ] O controle "Revisão da IA" entra na contagem de filtros ativos e some no "Limpar filtros"; funciona igual na tela larga e no painel do celular → AC-3
- [x] Abrir o detalhe de um chamado nascido do chat com decisão autônoma (`efeito: 'aplicado'`) → o painel "Serviço, prioridade e técnico" mostra, por linha: o valor atual, o que a IA escolheu, a confiança (ou "regra" quando `decididoPor: 'regra'`), o motivo, a situação e as correções → AC-4
- [ ] Como Solicitante ou Técnico, tentar acessar `GET /api/gestao/chamados/[id]/decisoes-ia` → 403 (sem sessão → 401) → AC-4
- [x] Abrir o detalhe de um chamado ainda `aberto` com sugestão de prioridade (`efeito: 'sugestao'`, `situacao: 'sem_revisao'`) → o painel mostra o valor sugerido, mas esconde confiança, motivo e o aviso de "divergente" → AC-4
- [x] Classificar esse chamado (a decisão sai de `sem_revisao`) → confiança, motivo e "divergente" voltam a aparecer na mesma linha → AC-4
- [x] Clicar "Confirmar" numa linha pendente → o badge de situação vira "Confirmada", o botão "Confirmar" some daquela linha → AC-5
- [ ] Clicar "Confirmar" duas vezes seguidas (ou confirmar, recarregar e confirmar de novo) → a segunda tentativa mostra um erro amigável, sem duplicar a entrada no histórico → AC-5, AC-17
- [ ] Com duas ou mais decisões pendentes, usar "Confirmar todas" → todas viram "Confirmada" numa chamada só → AC-5
- [x] Depois de confirmar (ou não ter mais nada `sem_revisao` e `aplicado`) todas as decisões de um chamado, ele some do recorte "Decidido pela IA, sem revisão" → AC-6
- [ ] Como Solicitante ou Técnico, abrir a linha do tempo do chamado (`/conversas` ou `/meus-chamados/[id]`) → nunca aparecem `correcao_ia`, `confirmacao_ia` nem `correcao_gestao`; a decisão original (`decisao_ia`) continua visível → AC-13
- [x] Como Preposto/Admin, a mesma linha do tempo mostra `confirmacao_ia` ("Confirmação de Decisão da IA") → AC-13
- [ ] Navegar o controle "Revisão da IA" e os botões "Confirmar"/"Confirmar todas" só pelo teclado, com foco visível o tempo todo → AC-19
- [ ] Conferir que o estado da decisão (pendente/confirmada/corrigida) e o aviso de "divergente" nunca dependem só de cor (têm rótulo de texto e, no caso do divergente, um ícone) → AC-19
- [x] Como Preposto, abrir o `CorrigirPrioridadeDialog` de um chamado `em atendimento` com técnico atribuído → as prioridades mais baixas que a atual aparecem desabilitadas, com o aviso "só o Admin baixa"; como Admin, nenhuma fica desabilitada → AC-10, AC-19
- [x] Escolher uma prioridade mais alta e mais baixa no diálogo → o texto curto do efeito no SLA muda conforme a direção → AC-7, AC-8, AC-9
- [x] Motivo com menos de 10 caracteres → erro de validação inline, formulário não envia → AC-7
- [x] Corrigir de verdade (subir, depois descer o mesmo chamado) → a lista e o histórico refletem a mudança real; `correcao_gestao` traz o motivo, a entrada neutra não; um caso real de "subida que não moveu o prazo, seguida de descida à mesma prioridade" somou zero, como a spec descreve → AC-8, AC-9, AC-12, AC-13, AC-21
- [x] Como Preposto/Admin, abrir o `CorrigirServicoDialog` de um chamado `em atendimento` com serviço já classificado → os seletores de tipo, subtipo e serviço vêm pré preenchidos com o serviço atual do chamado → AC-11 (chamado real CHM-2026-00019: veio com Manutenção Predial/Elétrica/ELET-002, igual ao chamado)
- [x] Escolher o mesmo serviço já classificado → o botão "Corrigir Serviço" fica desabilitado (clicar nele não faz nada, o diálogo continua aberto sem gravar) → AC-11
- [x] Escolher um serviço novo num chamado com técnico atribuído cuja especialidade não cobre o subtipo novo → o seletor de técnico aparece, com os elegíveis do serviço novo (exclui o técnico atual da lista); sem escolher um, o envio é recusado e nada muda no chamado → AC-11 (LUCIRA sem especialidade Split, tentativa sem escolher técnico: serviço e técnico do chamado continuaram os mesmos depois)
- [x] Escolher um serviço novo num chamado com técnico atribuído: o seletor de técnico aparece sempre que o serviço muda (mesmo dentro do mesmo subtipo, é uma conveniência da tela, não uma trava), com "Manter o técnico atual" pré selecionado; escolhendo um técnico novo com a especialidade, a correção troca serviço e técnico numa gravação só (`reatribuicao_tecnico` sem "Observações"); mantendo "Manter o técnico atual" quando ele já tem a especialidade do serviço novo, a correção troca só o serviço e não grava `reatribuicao_tecnico` → AC-11 (ambos os casos rodados de verdade no CHM-2026-00019: troca para ARCO-002/Técnico 01 E2E, depois troca para ARCO-001 do mesmo subtipo Split mantendo Técnico 01 E2E, sem nova `reatribuicao_tecnico` no histórico)
- [x] Corrigir de verdade o serviço de um chamado → a lista, o detalhe e o histórico (`correcao_gestao` com o motivo, entrada neutra "Classificação do Chamado" sem motivo) refletem o serviço novo e o `tipoServico` derivado (`Manutenção Predial` → `Ar-Condicionado`) → AC-11, AC-12, AC-13
- [x] Corrigir a prioridade de um chamado `em atendimento` cujo técnico continua o mesmo → o técnico recebe o toast "Prioridade do chamado #N mudou para X", sem o motivo → AC-14 (duas abas reais: uma logada como Técnico 01 E2E com o socket já conectado antes da correção, outra como Admin corrigindo a prioridade de CHM-2026-00019 para Alta; o toast "Prioridade do chamado #CHM-2026-00019 mudou para Alta" apareceu ao vivo na aba do técnico, com "Corrigido por: Administrador E2E" e sem o motivo; a `Notification` persistida bate exatamente, lida pela própria API do técnico. O clique em "Abrir" não pôde ser confirmado: a sessão do navegador trocou de usuário entre a captura do toast e o clique, então o link não foi verificado ao vivo, só existe no código (`/chamados-atribuidos/[id]`))
- [x] Reatribuir um chamado a outro técnico (`ReatribuirChamadoDialog`) → o técnico novo recebe o aviso de atribuição de sempre (`ticket:assigned`); o solicitante não recebe nada; o histórico mostra `Reatribuição de Técnico` sem a palavra "Observações" → AC-15 (CHM-2026-00019 reatribuído de Técnico 01 E2E para Técnico 02 E2E: o histórico mostrou "Reatribuição de Técnico" sem "Observações" e "Correção pela Gestão" com o motivo digitado, os dois ao vivo; a `Notification` do Técnico 02 E2E é `ticket:assigned` com `assignedBy` o Admin e sem motivo; o solicitante do chamado (o próprio Admin) não tinha nenhuma notificação nova depois da reatribuição)
- [ ] Corrigir o serviço trocando o técnico (chamado sem a especialidade) → o técnico novo recebe o mesmo aviso de atribuição, o anterior não recebe nada, `ticket:corrected` não sai → AC-14, AC-15 (não exercitado ao vivo nesta rodada, só por teste — ver `actions.test.ts`)

## Commands

- [x] `npm run typecheck` → passa, sem erros
- [x] `npm run lint` → passa (sem novos erros; o aviso pré-existente de `set-state-in-effect` continua)
- [x] `npm test` → todos os testes passam (2868 passed, 9 skipped) com `MONGO_TEST_URI` apontado para um banco local isolado — os `*.db.test.ts` (inclusive `update-ticket-priority.db.test.ts` e `atribuicao-automatica.db.test.ts`, este último com os testes de AC-16 dos marcos 3 e 4 e o `reassignTicketAction` do marco 4, e `corrigir-servico.db.test.ts` do marco 3) rodaram contra o Mongo de verdade, não só mocados

## Acceptance-criteria coverage

- AC-1 · recorte `revisaoIa` e 400 no valor desconhecido · coberto pelo filtro em `GET /api/gestao/chamados` e pelo controle "Revisão da IA"
- AC-2 · combinação com `q` e `status`, `pagination.total` reflete o recorte · coberto pela rota
- AC-3 · controle "Revisão da IA" na lista, contagem de filtros, frases de recorte vazio · coberto pelo `RevisaoIaSelect` e pelo `page.tsx`
- AC-4 · painel "Serviço, prioridade e técnico", 401/403 explícitos, confiança/motivo/`divergente` escondidos enquanto a decisão for cega (tarefa 8) · coberto por `GET /api/gestao/chamados/[id]/decisoes-ia` (testado em `__tests__/route.test.ts`) e pelo `RevisaoIaPainel`
- AC-5 · `confirmarDecisoesIaAction`, update condicional, idempotência, resultado por campo · coberto por `confirmarDecisao`/`camposPendentesDeConfirmacao` e pela action
- AC-6 · chamado sai do recorte `sem_revisao` só quando tudo foi revisado · coberto pelo filtro (derivado da `DecisaoIa`, sem campo próprio no `Chamado`)
- AC-7 · janela `validado`/`em atendimento`, filtro atômico com os valores lidos, motivo obrigatório · coberto por `updateTicketPriorityAction` e `update-ticket-priority.db.test.ts` (atomicidade e corrida contra o Mongo de verdade)
- AC-8 · corrigir para cima nunca dá mais prazo · coberto por `montarSnapshotCorrecao` (`lib/__tests__/sla-snapshot.test.ts`) e pela action contra o Mongo
- AC-9 · corrigir para baixo dá o prazo da prioridade nova, com e sem técnico · idem AC-8
- AC-10 · só o Admin baixa com técnico atribuído · coberto pela action (unit + DB) e pelo `CorrigirPrioridadeDialog` (desabilita as opções mais baixas para quem não é Admin)
- AC-11 · `corrigirServicoAction` troca `catalogServiceId`/`subtypeId`/`tipoServico`, recusa serviço igual e `tipoServico` desconhecido, mantém o técnico com a especialidade ou exige `novoTecnicoId` válido, só vale `em atendimento` para o `novoTecnicoId` · coberto por `actions.test.ts` e `corrigir-servico.db.test.ts` (atomicidade e corrida contra o Mongo de verdade) e dirigido ao vivo no `CorrigirServicoDialog` (pré-preenchimento, botão desabilitado no mesmo serviço, recusa sem técnico escolhido, troca de técnico numa gravação só, manutenção do técnico com especialidade)
- AC-12 · toda correção registrada na `DecisaoIa` por `resolverDecisao` · coberto pela action (prioridade e serviço)
- AC-13 (completo: `correcao_gestao` sai das três ações — prioridade, serviço e reatribuição) · `correcao_ia`/`confirmacao_ia`/`correcao_gestao` fora da leitura de quem não é gestão · coberto em `GET /api/chamados/[id]/history` e `lerLinhaDoTempo`, testado com entradas reais de `updateTicketPriorityAction`, `corrigirServicoAction` e `reassignTicketAction` (unitário e contra o Mongo de verdade), e visto ao vivo no histórico do CHM-2026-00019 (`correcao_gestao` com o motivo, `Classificação do Chamado` sem motivo, `Reatribuição de Técnico` sem "Observações"). O vazamento do `classificationNotes` já estava fechado desde o marco 2 (schema trocou o campo por `motivo`; a ação nunca escreve nele)
- AC-14 (dirigido ao vivo para a correção de prioridade; a de serviço só por teste) · `ticket:corrected` ao técnico quando prioridade ou serviço mudam sem trocar de técnico, sem motivo, sem email · coberto por `notificar-correcao.test.ts` (payload, título, falha propaga), pelos passos novos de `updateTicketPriorityAction`/`corrigirServicoAction` em `actions.test.ts` (com técnico avisa, sem técnico não tenta, falha no aviso não desfaz a correção), e visto ao vivo: toast real no navegador do técnico ("Prioridade do chamado #CHM-2026-00019 mudou para Alta", sem motivo) e a `Notification` persistida lida pela API dele
- AC-15 (dirigido ao vivo para a reatribuição; a troca de técnico pela correção de serviço só por teste) · troca de técnico (reatribuição ou correção de serviço) avisa só o novo, por `notificarAtribuicao` com `avisarSolicitante: false`; `reassignTicketAction` filtra também por `catalogServiceId` · coberto por `notificar-atribuicao.test.ts` (o parâmetro novo) e por `actions.test.ts`/`atribuicao-automatica.db.test.ts` (o `reassignTicketAction` inteiro, sem teste próprio antes desta fatia), e visto ao vivo: reatribuir CHM-2026-00019 gravou o histórico sem "Observações" e com `correcao_gestao`, o técnico novo recebeu `ticket:assigned` (mesmo formato da atribuição manual) e o solicitante (o Admin, neste chamado) não recebeu nada
- AC-16 · chamado atribuído pela regra (spec 0008) aceita correção de prioridade e de serviço · coberto por `atribuicao-automatica.db.test.ts` (revoga o antigo AC-19 da 0008), com um describe por ação: "correção de prioridade num chamado atribuído pela regra" e "correção de serviço num chamado atribuído pela regra", cada um com o caso atribuído sozinho (marcador `atribuicaoAutomatica.resultado: 'atribuido'` sobrevive à correção) e o caso sem técnico automático (`resultado: 'sem_tecnico'`, a correção ainda vale). Sem exercício ao vivo pelo navegador: o ambiente de desenvolvimento não tem nenhum chamado assim para abrir na tela
- AC-17 (completo: `confirmar`, `corrigir_prioridade`, `corrigir_servico` e `reatribuir`) · log `[revisao-ia]` · coberto por `logRevisaoIa`, chamado em `confirmarDecisoesIaAction`, `updateTicketPriorityAction`, `corrigirServicoAction` e `reassignTicketAction`
- AC-18 · atribuição manual, reatribuição, atribuição automática e calibração ficam intactas · coberto pela suíte inteira passando sem nenhuma asserção pré-existente alterada (2868 testes, contra o Mongo de verdade); a reatribuição nunca teve teste próprio antes desta fatia, então não havia asserção antiga para mudar — só testes novos somados
- AC-19 · acessibilidade do filtro e do painel · `Select`, `Button` e `Textarea` do design system (Radix), navegáveis por teclado; toast do Sonner cobre o anúncio do resultado
- AC-20 · monitor de SLA filtra por prazo lido · coberto por `lib/__tests__/sla-monitor.test.ts`
- AC-21 (completo: os 6 passos, nas três ações) · ordem das gravações e isolamento de falhas, inclusive o aviso (passo 6) · coberto por `actions.test.ts` (testes de falha injetada por passo, prioridade, serviço e reatribuição) e pela limpeza de `SlaEscalation` com nova tentativa
