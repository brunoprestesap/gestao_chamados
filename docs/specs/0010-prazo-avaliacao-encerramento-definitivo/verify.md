# Verify: prazo para avaliar e encerramento definitivo · spec 0010 · updated 2026-10-01

_Passos tirados dos critérios de aceite da spec 0010. `/check verify` roda estes passos; `/test` trava os que valem a pena manter._

## UI / manual

- [x] Como técnico, registre a execução de um chamado `em atendimento` → no banco, `prazoAvaliacaoAte` = `concludedAt` + 48 h → AC-1
- [x] Como Admin, mude "Prazo para avaliar (horas)" para 24 em `/configuracoes/expediente` e salve → o chamado concluído antes continua com o prazo de 48 h; a próxima execução grava 24 h → AC-1, AC-13
- [x] Em `/configuracoes/expediente`, tente salvar 0, 721 e 1,5 → o servidor recusa com a mensagem da faixa (1 a 720, inteiro) → AC-13
- [x] Como solicitante, abra `/meus-chamados/[id]` do concluído → aparecem "Avaliar Atendimento", "Recusar Serviço" e `Avalie ou recuse até DD/MM às HH:mm` no fuso de Belém → AC-10
- [x] Avalie com 4 estrelas → status `Encerrado`, nota 4/5 visível, histórico com uma entrada só "Encerrado pela Avaliação" (`Avaliação: 4/5`) → AC-2
- [x] Tente avaliar de novo o mesmo chamado (outra aba, já encerrado) → `Este chamado já foi encerrado.` → AC-2
- [x] Num concluído dentro do prazo, recuse o serviço → volta para `em atendimento` e `prazoAvaliacaoAte` fica nulo; nova execução grava outro prazo → AC-3
- [x] Como Preposto, num concluído dentro do prazo, use "Reabrir" → volta para `em atendimento` com prazo limpo → AC-4
- [x] Como Admin, chame `reopenTicketAction` num encerrado (a tela não mostra o botão) → `Chamado encerrado definitivamente. Abra um novo chamado.` → AC-4
- [x] Ponha `prazoAvaliacaoAte` no passado num concluído (sem rodar o cron) → as telas escondem avaliar, recusar e reabrir; chamar as ações devolve `O prazo para avaliar este chamado terminou.` → AC-5
- [x] Tente cancelar um concluído → continua bloqueado, como antes → AC-5
- [x] Em `/gestao`, em qualquer status, não existe botão "Encerrar" (lista, menu e painel lateral) → AC-8
- [x] Como solicitante com a página do chamado aberta, rode o cron num chamado vencido dele → toast "encerrado automaticamente" e a tela se atualiza; técnico e gestores não recebem nada; nenhuma `Notification` nova → AC-9b
- [x] Registre uma execução → a `Notification` e o e-mail do solicitante dizem `Avalie ou recuse o serviço até DD/MM às HH:mm`; os dos gestores continuam com o texto antigo → AC-9
- [x] Num encerrado sem nota, a tela mostra "Encerrado sem avaliação"; num encerrado com nota, a nota; nunca avaliar nem recusar → AC-10
- [x] Em `/conversas`, abra o concluído → avaliar, recusar e a frase do prazo; no encerrado, "O problema voltou" → AC-10, AC-11
- [x] No encerrado, clique "O problema voltou" → formulário abre com tipo, subtipo, serviço, unidade e local do anterior e a descrição em branco; envie → chamado novo `aberto`, sem prioridade nem SLA → AC-11
- [x] Reincidência de chamado do chat sem serviço do catálogo → subtipo e serviço vêm em branco e o formulário os exige → AC-11
- [x] Chame `createTicketAction` com `chamadoAnteriorId` de outro solicitante, ou de um anterior que não está encerrado → `Chamado anterior inválido.` → AC-11
- [x] O chamado novo mostra "Reincidência do chamado #N" com link no detalhe do solicitante e no painel da Gestão; o histórico de abertura diz `Reincidência do chamado #N` → AC-12
- [x] No painel do Preposto/Admin, o card de concluídos se chama "Aguardando avaliação", com a mesma contagem → AC-14
- [x] No painel do solicitante, "Avaliações pendentes" conta só concluídos com prazo aberto (não os encerrados sem nota) → AC-15
- [x] Classifique o chamado de reincidência → a dica de recorrência não lista o chamado anterior → AC-16

## Origem dos valores (um passo por linha da tabela)

- [x] `prazoAvaliacaoAte` na execução: mude o prazo configurado para 6 h → a execução seguinte grava `concludedAt + 6 h`, com `concludedAt` = hora do servidor → AC-1
- [x] Prazo dos concluídos sem prazo: tire o campo de um concluído e rode o cron → ganha `hora do cron + prazoAvaliacaoHoras` → AC-7
- [x] `closedAt` do automático: rode o cron 3 h depois do vencimento → `closedAt` é igual ao `prazoAvaliacaoAte`, não à hora do cron → AC-6
- [x] `closedAt` da avaliação: é a hora da ação no servidor → AC-2
- [ ] "Agora" das guardas: mude o relógio do navegador para dois dias depois → os botões continuam valendo pela hora do servidor → AC-5, AC-10
- [x] `DD/MM às HH:mm`: troque o fuso do expediente para America/Manaus → a frase muda uma hora; um prazo às 01:30 UTC aparece no dia anterior em Belém → AC-9, AC-10
- [x] Janela aberta nas telas: vem de `janelaAvaliacaoAberta` da rota, calculada no servidor → AC-10
- [x] Texto do aviso de execução: mesmo `prazoAvaliacaoAte` gravado, no fuso do `BusinessCalendar` → AC-9
- [x] Campos do "O problema voltou": vêm do chamado anterior lido pela tela de detalhe → AC-11
- [x] `#N` do vínculo: é o `ticket_number` do anterior, devolvido pela rota de detalhe e pela lista da Gestão → AC-12
- [x] "Aguardando avaliação": mesma contagem `status: 'concluído'` de antes → AC-14

## Commands

- [x] `npx vitest run shared/chamados/__tests__/janela-avaliacao.test.ts lib/chamados/__tests__/encerramento-automatico.test.ts app/api/cron/encerramento-automatico "app/(dashboard)/meus-chamados/__tests__" "app/(dashboard)/chamados-atribuidos/__tests__/actions.test.ts" "app/(dashboard)/conversas/_components/__tests__/PainelChamado.test.tsx" lib/__tests__/recorrencia.test.ts` → tudo verde → AC-1 a AC-16
- [x] `MONGO_TEST_URI=mongodb://localhost:27018/severino_test npx vitest run lib/chamados/__tests__/encerramento-automatico.db.test.ts` → 12 verdes, inclusive a corrida avaliação contra cron → AC-2, AC-6
- [x] `curl -X POST http://localhost:3000/api/cron/encerramento-automatico` sem header → 401; com `-H "x-cron-secret: $CRON_SECRET"` → `{ "encerrados": N, "prazosPreenchidos": M }`; a segunda chamada seguida → `{ "encerrados": 0, "prazosPreenchidos": 0 }` → AC-6, AC-7
- [ ] Depois do deploy: `docker exec severino-cron-1 crontab -l` → três linhas (`recurring-tickets` a cada 30 min, `encerramento-automatico` e `sla-monitor` a cada 15 min) → AC-6
- [ ] `npm run test:e2e -- fluxo-completo` → o passo 5 não acha "Encerrar" e o passo 6 encerra pela avaliação → AC-2, AC-8, AC-10

## Acceptance-criteria coverage

- AC-1: execução e configuração (UI 1, 2; origem 1) · AC-2: avaliar (UI 5, 6; origem 4; comandos 2, 5) · AC-3: recusa (UI 7) · AC-4: reabrir (UI 8, 9) · AC-5: prazo vencido e cancelamento (UI 10, 11; origem 5) · AC-6: cron (origem 3; comandos 2, 3, 4) · AC-7: legado (origem 2; comando 3) · AC-8: sem "Encerrar" (UI 12; comando 5) · AC-9: aviso (UI 14; origem 6, 8) · AC-9b: `ticket:closed` (UI 13) · AC-10: telas (UI 3, 15, 16; origem 5, 6, 7) · AC-11: "O problema voltou" (UI 17, 18, 19; origem 9) · AC-12: vínculo (UI 20; origem 10) · AC-13: configuração (UI 2, 3) · AC-14: rótulo (UI 21; origem 11) · AC-15: pendentes (UI 22) · AC-16: dica de recorrência (UI 23)
