# Escopo: Ciclo de vida do chamado

Parte do escopo do Sigma. Tabela geral, Deferred e legenda em [index.md](index.md).

## Ciclo de vida do chamado

### 22. Prazo para avaliar e encerramento definitivo · done · GA

Pedido de stakeholder (modelo do e-SOSTI): depois da conclusão, o solicitante tem um prazo para avaliar ou recusar; passado o prazo o chamado encerra sozinho e não reabre mais, e o problema que volta vira chamado novo ligado ao anterior. Mexe no tempo de atendimento e no SLA medidos pelo IMR (glosa), por isso GA.
**Done when:** a conclusão grava o prazo (48 horas, configurável pelo Admin); avaliar encerra na hora; o cron encerra o que venceu; nenhum perfil reabre um encerrado; o encerramento manual sai da Gestão; "O problema voltou" abre um chamado novo com o vínculo visível.
spec [0010](../specs/0010-prazo-avaliacao-encerramento-definitivo/index.md) · code in `app/(dashboard)/meus-chamados/`, `app/(dashboard)/gestao/`, `app/(dashboard)/chamados-atribuidos/actions.ts`, `app/(dashboard)/conversas/`, `app/api/cron/encerramento-automatico/`, `lib/chamados/encerramento-automatico.ts`, `shared/chamados/janela-avaliacao.ts`, `models/Chamado.ts`

- [x] Design it (spec): `/architect prazo para avaliar e encerramento definitivo`
- [x] Build it: `/develop prazo para avaliar e encerramento definitivo`
  - [x] O fio: concluir grava o prazo, avaliar encerra, e o detalhe do solicitante mostra o prazo · AC-1, AC-2, AC-5, AC-10
  - [x] As travas: recusa e reabertura só na janela, encerrado terminal, encerramento manual removido · AC-3, AC-4, AC-5, AC-8
  - [x] Encerramento pelo sistema: cron, preenchimento do legado, crontab num bloco só, `ticket:closed` para o solicitante · AC-6, AC-7, AC-9b
  - [x] Configuração e aviso: prazo em `/configuracoes/expediente`, aviso de conclusão com o prazo · AC-9, AC-13
  - [x] Reincidência e demais telas: "O problema voltou", vínculo, dica de recorrência, chat, cards e painéis · AC-11, AC-12, AC-14, AC-15, AC-16
- [x] Verify it: `/check verify prazo para avaliar e encerramento definitivo`
- [x] Test it: `/test prazo para avaliar e encerramento definitivo`
- [x] Review it (fresh model): `/check review prazo para avaliar e encerramento definitivo`
- [x] Document it: `/document prazo para avaliar e encerramento definitivo` · pulado

### 29. Correções de integridade do chamado · done

Dois bugs que vinham do Deferred desde a spec 0002 e continuam no código: o histórico do catálogo grava uma ação fora do enum e falha depois de já ter alterado o chamado, e o número do chamado sai sem trava (a preventiva por categoria da 0013 agora gera vários de uma vez). from spec 0002
**Done when:** corrigir o catálogo pela gestão grava o histórico sem erro, ou não altera nada se o histórico falhar; dois chamados criados ao mesmo tempo, inclusive no lote da preventiva, nunca recebem o mesmo número; um teste de banco real prova a corrida.
code in `app/(dashboard)/gestao/actions.ts` (`updateTicketCatalogAction`), `lib/chamado-utils.ts` (`generateTicketNumber`), `models/Contador.ts`, `shared/chamados/history.constants.ts`

- [x] Build it: `/develop correções de integridade do chamado`
- [x] Verify it: `/check verify correções de integridade do chamado`
- [x] Test it: `/test correções de integridade do chamado`
