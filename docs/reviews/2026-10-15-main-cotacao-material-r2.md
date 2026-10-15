# Review, main (uncommitted), 2026-10-15, round 2

**Reviewed by**: Claude Sonnet 5.5 (author on a different model)
**Scope**: Fatia 1 of spec 0019, uncommitted on main (docs/manuais excluded); second round after the /debug pass
**Verdict**: Approve with nits

## Summary

The three majors of round 1 are fixed in the code and each has a test (a db test per fix plus a schema unit test and a cron route test). I traced the fixes for regressions: cancel from `em_aprovacao` is safe (no reserve exists before the `aprovar` write, so skipping `liberar` is correct), the compensation paths now release only their own empenho, and the daily cancel round loses cleanly to a concurrent manual action through the conditional write on `situacao + versao`. No blocker or major remains. What is left is the round 1 minors (none were in scope of the fix pass) and three small new items. I could not run the db tests here (they need `MONGO_TEST_URI`), so the evidence below is from reading code and tests.

## Achados da rodada anterior

### Majors

| #   | Finding                                                                       | Status                                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Compensation releases another approver's reserve                              | **Resolved**                           | `liberar(cotacaoId, empenhoId)` and `ajustar(cotacaoId, empenhoId, valor)` now filter the `findOne` by the given empenho (`lib/material/saldo.ts:107-179`). All callers pass the right one: lost write and event rollback in `aprovar` use `e.empenhoId` (`transicoes.ts:638, 672`), `alterar`/`cancelar` use the empenho stored on the cotação read before the write (`:724`), `executar` uses `gravada.empenhoId` (`:739`), conciliation uses the empenho of the reserve it found (`saldo.ts:248`). Test: `transicoes.db.test.ts` "duas aprovações simultâneas com empenhos diferentes" asserts one reserve, in the winner's empenho, and total comprometido 2000. |
| M2  | Repeated item id bypasses the diagnostic lock                                 | **Resolved**                           | `idsRepetidosDoRascunho` rejects repeated item ids, orçamento ids and `itemId` within one orçamento (`shared/material/cotacao.schemas.ts:69-80`); used in `superRefine` (`:92-95`) and again in `salvarRascunho` before any role branch (`transicoes.ts:307-308`), so it covers the technician branch too. Tests: `cotacao.schemas.test.ts:103` and `transicoes.db.test.ts:432` (quantity stays 2).                                                                                                                                                                                                                                                                  |
| M3  | One-shot cancel of the quote on ticket cancel, no sweep, `executar` not gated | **Resolved** (with a residual, see N1) | `cancelarCotacoesDeChamadosEncerrados` (`chamado.ts:246-268`) cancels every in-trâmite cotação whose ticket is `cancelado`/`recusado`; the cron calls it before `conciliarReservas` (`route.ts:20-21`). Autorizada is in `SITUACOES_EM_TRAMITE`, so the stranded-reserve case is covered. `transicionar` refuses `executar` on a cancelled or refused ticket (`transicoes.ts:559-561`). Tests: `transicoes.db.test.ts:385-425` (sweep cancels, releases saldo, event `papel: sistema`, motivo `chamado_cancelado`; execute refused) and the cron route test. A retry on version conflict inside the hook was not added; the daily sweep replaces it.                 |

### Minors

| Finding                                                                 | Status     | Evidence                                                                                                                                                                                             |
| ----------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------ |
| `reservar` not idempotent after a crash                                 | Still open | `saldo.ts:84` still refuses when a reserve for the cotação exists in the empenho; retry gets "sem saldo" until conciliation.                                                                         |
| Pause bookkeeping undone when the quote moves on quickly                | Still open | `transicoes.ts:773-777`, still filtered by `situacao: 'enviada'`.                                                                                                                                    |
| Omitting `orcamentos` wipes them                                        | Still open | `transicoes.ts:335` `entrada.orcamentos ?? []`, then `set.orcamentos` overwrites.                                                                                                                    |
| Orçamento file integrity (repeated `arquivoId`, not rechecked at send)  | Still open | `transicoes.ts:341-351` compares to the set size; `enviar` (`:475-499`) does not recheck files.                                                                                                      |
| Silent drift when `ajustar`/`liberar` give up                           | Still open | `transicoes.ts:724-736, 739-755`: `null` is ignored without a log.                                                                                                                                   |
| Conciliation event states a false `para`                                | Still open | `saldo.ts:254` `para: s ?? 'cancelada'`.                                                                                                                                                             |
| Designation overlap not atomic, role not rechecked at use               | Still open | `cadastro.ts:116-139` unchanged; `papeis.ts` `carregarPapeis` does not check `PERFIS_POR_PAPEL`.                                                                                                     |
| Append-only hooks miss `bulkWrite`                                      | Still open | `models/_somente-inclusao.ts:19-28` list unchanged.                                                                                                                                                  |
| Sweep test for final ticket status is weak                              | Still open | `varredura-chamado.test.ts:62-70` still only checks the file imports the hook.                                                                                                                       |
| `cotacaoAnteriorId` not validated                                       | Still open | `transicoes.ts:254`.                                                                                                                                                                                 |
| Pause log left open when a ticket with a quote-owned pause is cancelled | Still open | `transicoes.ts:791-799` clears `pauseLogId` even when `retomarPelaCotacao` returns false. The new sweep makes this path more common (the ticket is already cancelled when the cotação is cancelled). |
| Technician cannot clear his own mistaken rascunho                       | Still open | `leitura.ts:86` (`cancelar: (rt                                                                                                                                                                      |     | gestor) && emTramite`); needs a decision, not a code defect. |
| Cost section links to a page a Preposto cannot open                     | Still open | `CustoChamadoSecao.tsx:267`.                                                                                                                                                                         |

### Nits

All seven nits from round 1 are unchanged (dead `unset` at `transicoes.ts:467`, `getFullYear` at `:189`, saldo event reusing the action at `:699`, technician trail motives, count-then-insert in `arquivos.ts:82`, no `lib/material/AGENTS.md`, toast link in `RealtimeProvider.tsx:396`).

## Minor (new)

### 🟡 Conciliation ignores a reserve held in the wrong empenho, `lib/material/saldo.ts:237-247`

**Problem**: conciliation decides by the cotação's situation only (`autorizada/executada/atestada` means keep). With the M1 fix, a loser that crashes between its `reservar` and its compensation leaves an orphan reserve in empenho E2 while the cotação is `autorizada` with `empenhoId = E1`. The conciliation sees an authorized cotação and keeps the orphan forever.
**Why it matters**: needs a process crash in a small window, but the result is permanently lost saldo with no recovery path. The old code had the same blind spot, so this is not a regression, only a gap the fix made reachable by design (compensation is now per empenho).
**Suggested fix**: select `empenhoId` in the cotação lookup and release (or flag) a reserve whose empenho differs from the cotação's `empenhoId` when the cotação holds a reserve state. Add a db test with an orphan in a second empenho.

### 🟡 The cancel round can abort the whole cron run, `app/api/cron/material-conciliacao/route.ts:20-21`

**Problem**: `cancelarCotacoesDeChamadosEncerrados` runs two unguarded queries before `conciliarReservas` in the same `try`. If either throws, the handler returns 500 and the reserve conciliation does not run that day, although the two jobs are independent.
**Why it matters**: the safety net of the daily job depends on a new step. Low probability (a DB failure also breaks the second step), but cheap to isolate.
**Suggested fix**: wrap the cancel round in its own try/catch (log and continue with `cotacoesCanceladas: 0`), then always run `conciliarReservas`.

### 🟡 Missing test for the cancel round skipping a lost race, `lib/material/__tests__/transicoes.db.test.ts:385`

The new tests cover the happy sweep and the `executar` refusal. Not covered: the sweep meeting a cotação whose version moved (manual action in between) returning `canceladas: 0` without throwing, a `recusado` ticket, and cancel from `em_aprovacao` leaving no reserve movement. The code handles these correctly as read; the tests would pin it.

## Nits (new)

- ⚪ `lib/material/chamado.ts:231` a version conflict between the sweep and a manual action logs through `console.error` as a failure; it is an expected outcome and the next run handles it. Log it at `warn` or distinguish `MSG_VERSAO_DESATUALIZADA`.
- ⚪ `app/api/cron/material-conciliacao/route.ts:22` the response mixes `verificadas` (reserves) with `cotacoesCanceladas` (cotações) with no counterpart for the cancel round's own `verificadas`; the shape is additive and the test pins it, so no consumer breaks, but `cotacoesVerificadas` would read better. The crontab (`docker-compose.yml:163`) ignores the body.
- ⚪ A stranded reserve on a cancelled ticket now waits for the 06:00 run (up to about 24h) when the in-line hook fails. Acceptable for the spec; mention it in `lib/material/AGENTS.md` when `/sync` writes it.

## Regression checks asked for

- **Cancel from `em_aprovacao` no longer calls `liberar`**: correct. `empenhoId` is only set in the `aprovar` write, so a cotação in `em_aprovacao` has none, and `aplicarEfeitos` skips `liberar` when it is null (`transicoes.ts:724`). A concurrent `aprovar` that has already reserved either wins the conditional write (then `cancelar` loses and returns the version message) or loses it and releases its own reserve (`:638`). No path leaves a reserve behind.
- **Cancel from `autorizada` and crash before `liberar`**: the cotação is `cancelada`, not in `SITUACOES_COM_RESERVA`, so conciliation releases it after the 10 minute tolerance.
- **Race between the daily round and a manual action**: both go through `transicionar`'s conditional write on `situacao + versao`; exactly one wins and the other gets a clean failure, no double release (`liberar` is also idempotent per empenho and cotação).
- **`executar` vs cancelled ticket**: the guard reads the ticket status once at the start; the window between that read and the write is the same class as any other check-then-act in the pipeline, and the sweep cancels the cotação afterwards and releases whatever `ajustar` left. No double spend.
- **Cron response shape**: `{ ok, verificadas, liberadas, cotacoesCanceladas }`, additive; 401 and 500 shapes unchanged; the route test covers it.

## Strengths

- Each of the three fixes has a focused regression test at the right level (real-DB race, schema unit, route), and the dup-id guard is applied at both the schema and the domain function.
- Making the empenho a required argument of `liberar`/`ajustar` removes the whole class of cross-empenho mistakes by signature instead of by convention.
- The sweep reuses `transicionar` with an `ator.tipo = 'sistema'`, so the trail, saldo release and chamado history stay on the one audited path.
- `cancelarCotacaoPeloChamado` stays non-throwing and the sweep reports counts, so the cron stays observable.

## Test coverage

Configured. The fixes are covered (two-empenho race, duplicate ids in schema and domain, sweep, `executar` refusal, cron shape). Gaps: the three items above plus the round 1 gaps that remain (event-write rollback path, send racing a fiscal assume, `bulkWrite` in the append-only suite). `e2e/cotacao-flow.spec.ts` is still the known stale spec. I did not run the suites.
