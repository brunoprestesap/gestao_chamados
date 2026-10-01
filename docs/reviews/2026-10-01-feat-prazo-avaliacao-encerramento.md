# Review, feat/prazo-avaliacao-encerramento, 2026-10-01

**Reviewed by**: Claude Sonnet 5.5 (revisor independente, sem editar código)
**Scope**: 51 arquivos rastreados mais 20 novos, branch contra main (tudo ainda na árvore de trabalho, nada commitado)
**Verdict**: Approve with nits

## Resumo

A mudança implementa a spec 0010: o prazo para avaliar nasce na conclusão, a avaliação encerra o chamado na mesma escrita, o cron encerra os vencidos, o encerrado vira definitivo e o "O problema voltou" cria um chamado novo ligado ao anterior. As guardas de avaliar, recusar e reabrir ficam dentro do filtro do `findOneAndUpdate`, e o cron confere status e prazo no filtro de cada chamado, então não achei corrida que perca nota nem encerre duas vezes. `tsc --noEmit` passa limpo. Não há blocker nem major; sobram pontos menores de resiliência do cron, um detalhe de vazamento de estado e documentação ainda por atualizar.

## Minor

### 🟡 O erro de estado vem antes da checagem de dono, `app/(dashboard)/meus-chamados/actions.ts:220`

**Problem**: Em `submitTicketEvaluationAction` e `refuseServiceAction`, quando a escrita atômica não acha o chamado, `erroForaDaJanela` roda antes de conferir `solicitanteId`. Qualquer usuário logado que conheça um `ticketId` aprende se o chamado de outra pessoa está encerrado ou com prazo vencido.
**Why it matters**: É um vazamento pequeno de estado de chamado alheio (leitura por IDOR). A spec define essa precedência (AC-5), então não é desvio do contrato, mas vale reavaliar.
**Suggested fix**: Conferir o dono primeiro e só então devolver as mensagens de encerrado e de prazo, ou devolver "Chamado não encontrado." para quem não é dono. Se a ordem da spec for mantida, registrar o risco como aceito.

### 🟡 Emissão em série dentro do cron pode estourar o `--max-time 60`, `lib/chamados/encerramento-automatico.ts:111`

**Problem**: Para cada um dos até 200 chamados, o cron faz `await emitToRoom(...)`, que tem timeout de 1200 ms. Com o socket-server fora do ar e falhando por timeout (não por recusa imediata), são até 240 s no pior caso. O `curl` do crontab corta em 60 s e a rota declara `maxDuration = 60`.
**Why it matters**: O encerramento continua correto (o chamado já foi gravado antes do emit), mas o `curl` registra falha, o `revalidatePath` do fim pode não rodar e a resposta com as contagens se perde.
**Suggested fix**: Emitir sem `await`, ou em paralelo limitado, ou depois do loop. Alternativa: reduzir o lote quando o socket estiver indisponível.

### 🟡 Falha no histórico depois da escrita principal devolve erro, `app/(dashboard)/meus-chamados/actions.ts:237`

**Problem**: Na avaliação, o chamado já foi gravado como `encerrado` com a nota quando `ChamadoHistoryModel.create` roda. Se o histórico lançar, o `catch` externo devolve `{ ok: false }` e o solicitante vê erro, embora a avaliação tenha valido. Uma segunda tentativa recebe "Este chamado já foi encerrado.".
**Why it matters**: Mensagem enganosa e histórico sem a entrada de encerramento. O mesmo padrão já existia nas outras ações, e a spec aceita o risco só para o cron.
**Suggested fix**: Proteger a escrita do histórico num try/catch próprio com `console.error` e seguir devolvendo `{ ok: true }`, como o cron já faz.

### 🟡 A corrida avaliação contra cron só é provada com banco real, `lib/chamados/__tests__/encerramento-automatico.db.test.ts`

**Problem**: Os testes de banco real cobrem a corrida, a precedência dos erros e a reincidência, mas os `*.db.test.ts` são pulados na CI sem `MONGO_TEST_URI`. O `verify.md` registra a execução só local.
**Why it matters**: A principal garantia de atomicidade (AC-2, AC-6) não protegeria contra regressão na CI se alguém mexer nos filtros.
**Suggested fix**: Se possível, subir o Mongo no job de testes unitários da CI e definir `MONGO_TEST_URI`. No mínimo, manter testes unitários que conferem que o filtro de cada escrita contém `status: 'concluído'` e a janela.

## Nits

- ⚪ `app/(dashboard)/gestao/AGENTS.md` e `AGENTS.md` raiz: ainda citam `closeTicketAction`, `EncerrarChamadoDialog`, o ciclo de vida antigo, `ticket:closed` com `closedBy` e o cron só de recorrentes. A spec já manda o `/sync` atualizar depois do build.
- ⚪ `docs/specs/0010-prazo-avaliacao-encerramento-definitivo/verify.md`: três passos seguem sem marca (relógio do navegador adiantado, `crontab -l` no container depois do deploy, E2E `fluxo-completo`). O de `crontab -l` é o que prova que o `printf` de três linhas entrou de fato.
- ⚪ `components/realtime/RealtimeProvider.tsx:271`: qualquer `ticket:closed` sem `motivo: 'avaliacao'` mostra "encerrado automaticamente", inclusive evento sem `motivo` vindo de cliente em cache. Trocar a condição para `motivo === 'automatico'` deixa a leitura mais honesta.
- ⚪ `lib/email/templates.ts:120` e `models/Notification.ts`: o template e o tipo `ticket:closed` ficam sem nenhum emissor de e-mail ou `Notification` depois desta spec. Código morto inofensivo.

## Pontos verificados sem achado

- Guardas atômicas: avaliar, recusar e reabrir usam `filtroJanelaAberta(now)` dentro do filtro; a avaliação mantém `'evaluation.rating': { $exists: false }`. O cron filtra por `_id`, `status: 'concluído'` e o `prazoAvaliacaoAte` lido, então recusa ou reabertura seguida de nova conclusão (prazo novo) não é encerrada por engano.
- Corrida do preenchimento (AC-7): o `updateMany` só atinge `prazoAvaliacaoAte: null` em `concluído`, e os prazos novos ficam no futuro, fora do `$lte: agora` do `find`.
- `closedAt` e IMR: o IMR continua filtrando `encerrado` por `closedAt` e medindo o tempo por `sla.resolvedAt`. A avaliação grava `closedAt = agora`, o cron grava `closedAt = prazo`. O deslocamento de período é o aceito na spec.
- Autorização: `chamadoAnteriorId` só é gravado por `createTicketAction`, com dono e `encerrado` no filtro; o `POST /api/meus-chamados` não aceita o campo. As rotas de leitura devolvem o número do anterior só a quem já pode ver o chamado novo (dono ou gestão).
- Cron: 401 sem segredo ou com `CRON_SECRET` vazio, no formato do `sla-monitor`; histórico com `actorType: 'sistema'` e `userId` nulo; `ticket:closed` só para `user:<solicitanteId>`.
- Crontab do container: bloco único com `printf` e uma linha por job, `--max-time 60` em todos, `$$CRON_SECRET` expandido pelo shell dentro de aspas duplas. Não apaga a linha de `recurring-tickets`. O `sla-monitor` passa a rodar de verdade (efeito já descrito na spec: pode gerar escalonamentos que antes não saíam).
- Código removido: `closeTicketAction`, `EncerrarChamadoDialog`, `close-ticket.schemas.ts`, `onEncerrar` e `showEncerrar` não têm mais referência em código; só sobram menções em docs e em `.claude/commands`.
- Reabrir: `fromStatus` ficou só `'concluído'` no payload; o diálogo não recebe mais `chamadoStatus`; botões saem da lista, do menu e do painel quando a janela está fechada.

## Strengths

- Funções puras e testáveis em `shared/chamados/janela-avaliacao.ts` (`filtroJanelaAberta`, `erroForaDaJanela`, `camposJanelaDTO`) reaproveitadas por ações, rotas, leitura da conversa e dashboard, sem recalcular a janela no navegador.
- A janela é calculada no servidor e entregue como `janelaAvaliacaoAberta`, cumprindo o AC-10 sem depender da hora do cliente.
- O cron é idempotente, determinístico (`closedAt = prazo`), com lote de 200, falha isolada por chamado e o risco sem transação documentado no código.
- Boa cobertura de testes: unitários por ação, rota do cron, schema do expediente, componente do formulário de reincidência e testes de banco real para a corrida.

## Test coverage

Cobertos: cálculo e formatação do prazo, janela e precedência dos erros, `registerExecutionAction` com prazo e payload separado, avaliar, recusar, reabrir e criar com `chamadoAnteriorId`, o cron (lote, idempotência, 401), o schema e a rota do expediente, a projeção da Gestão, `PainelChamado` e `NewTicketDialog` com reincidência. A corrida real depende de `MONGO_TEST_URI` e não roda na CI (ver o minor acima). Não vi teste para o comportamento do cron com `emitToRoom` lento ou falhando.
