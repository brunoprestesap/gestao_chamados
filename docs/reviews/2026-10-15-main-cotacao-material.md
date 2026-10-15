# Review, main (uncommitted), 2026-10-15

**Reviewed by**: Claude Sonnet 5.5 (author on a different model)
**Scope**: 101 files (docs/manuais excluded), uncommitted on main
**Verdict**: Changes requested

## Summary

Fatia 1 of spec 0019 builds the CotacaoMaterial state machine, the empenho reserve without transactions, designations, the append-only trail, upload/download routes, notifications and the hooks into the ticket lifecycle. The structure follows the spec closely, the serializer is a single choke point and the visibility rules (AC-1, AC-15) hold in the paths I traced. The headline problems are in the compensation logic around the reserve (the loser of a race can release the winner's reserve when two empenhos are involved), a way for the contratada to alter diagnostic items by repeating an item id, and a one-shot, never-retried cancellation of the quote when the ticket is cancelled, which can strand saldo with no sweep to recover it.

## Major

### 🟠 Compensation can release another approver's reserve, `lib/material/transicoes.ts:601-628` and `lib/material/saldo.ts:80-133`

**Problem**: `reservar` is idempotent per cotação only inside the same empenho document (`'reservas.cotacaoId': {$ne}` is evaluated on one Empenho). `liberar(cotacaoId)` then finds "the" reserve with `findOne({'reservas.cotacaoId': id})` across all empenhos. Two aprovadores acting on the same cotação and version, choosing different empenhos, can both reserve (E1 by A, E2 by B). A wins the conditional write; B loses it and calls `liberar(cotacao)`, which may find and release A's legitimate reserve in E1 and leave B's orphan in E2. Result: cotação `autorizada` with `empenhoId = E1` and no reserve there (E1 can be overspent), plus a stuck reserve in E2. The conciliation never fixes it because the cotação is in `autorizada`, a reserve-holding state.
**Why it matters**: breaks the central invariant (every reserve points to an authorized cotação, comprometido matches the real commitments) and lets an empenho be overcommitted. Low probability, financial impact, cheap fix.
**Suggested fix**: make `liberar` (and `ajustar`) take the `empenhoId` and use it in the compensation of `aprovar`; and/or make `reservar` refuse when any empenho already holds a reserve for the cotação (checked across the collection; not atomic, but backed by the single-winner conditional write). Add a db test with two approvals on two empenhos.

### 🟠 Repeated item id bypasses the "diagnostic items are immutable" rule, `lib/material/transicoes.ts:309-326` with `shared/material/cotacao.schemas.ts:316-319`

**Problem**: `salvarRascunho` (RT branch) validates against `novos = new Map(entrada.itens.map(i => [i.id, i]))`, so only the last entry per id is compared. The Zod schema does not reject duplicate ids. A request with two entries carrying the same diagnostic item id (one altered, one untouched) passes the check, and both are stored with the same `_id`; the altered copy inherits `doDiagnostico: true` from `atuais.get(i.id)`. The contratada can thus change description, unit or quantity of a diagnostic item (AC-1) and inflate the value. The same lack of uniqueness applies to orçamento ids and to price rows (`itemId`) of one orçamento.
**Why it matters**: the party with the financial interest can defeat a rule whose purpose is to keep the technician's diagnosis intact; a duplicate `_id` in a subdocument array also breaks later lookups by id (prices, execution quantities).
**Suggested fix**: reject duplicate item ids, duplicate orçamento ids and duplicate `itemId` within an orçamento in the Zod schema (superRefine) and again in `salvarRascunho`; add a test.

### 🟠 Cancelling the ticket cancels the quote once, with no retry and no sweep, `lib/material/chamado.ts:214-235`

**Problem**: `cancelarCotacaoPeloChamado` runs after the ticket is already `cancelado`, reads `versao`, calls `transicionar` once and only logs on any failure (version conflict, an event write failure that throws after rollback, a transient DB error). Nothing retries, and `conciliarReservas` only frees reserves whose cotação is NOT in `autorizada/executada/atestada`, so an `autorizada` cotação left on a cancelled ticket keeps its reserve forever. `executar` also does not check the ticket status (`lib/material/transicoes.ts:549-552`), so the technician could still execute on a cancelled ticket.
**Why it matters**: AC-12 is the rule that guarantees saldo is released when work is dropped; a silent one-shot failure strands money with no recovery path other than manual DB work.
**Suggested fix**: retry once or twice on version conflict (re-read and call again), and extend the daily conciliation (or add a second sweep) to cancel/release cotações em trâmite whose ticket is `cancelado`/`recusado`. Make `executar` refuse when the ticket is cancelled/recusado.

## Minor

### 🟡 `reservar` is not idempotent for a retry after a crash, `lib/material/saldo.ts:72-99`

The spec calls the reserve idempotent per cotação, but the code refuses (returns `false`) when a reserve for the cotação already exists. After a crash between the reserve and the cotação write, the approver's retry gets "o empenho não tem saldo" until the 03:00 conciliation (plus the 10 minute tolerance). Treat an existing reserve of the same value in the chosen empenho as success, or return a distinct message.

### 🟡 Pause bookkeeping undone when the quote moves on quickly, `lib/material/transicoes.ts:755-761`

The `pauseLogId` write is filtered by `situacao: 'enviada'`. If the fiscal assumes the quote within milliseconds (`em_analise`), the write matches nothing and `desfazerPausa` un-pauses a ticket whose quote is still in trâmite (AC-2 violated, SLA runs). Filter by "still in trâmite and `pauseLogId` null" and undo only when the quote reached a terminal state.

### 🟡 Omitting `orcamentos` wipes them, `lib/material/transicoes.ts:327`

`orcamentos` is optional in `SalvarRascunhoSchema`; `entrada.orcamentos ?? []` then overwrites the stored orçamentos with an empty list. Keep the existing ones when the field is absent.

### 🟡 Orçamento file integrity is not rechecked at send time, `lib/material/transicoes.ts:333-344, 474-477`

`salvarRascunho` accepts the same `arquivoId` for several orçamentos (it compares against the set size), so one PDF can back three "different" suppliers and satisfy the 3-orçamento rule; and `enviar` does not re-verify that each orçamento file is still active (removing a file only marks `removidoEm` while the orçamento still references it). Reject repeated `arquivoId` and re-check active files in `enviar`. The CNPJ rules are Fatia 4, but this one is independent of them.

### 🟡 Silent drift when `ajustar`/`liberar` give up, `lib/material/transicoes.ts:710-738`, `lib/material/saldo.ts:105-167`

Both loops return `null` after 3 attempts and the callers do not log or flag it. For `executar`, a failed `ajustar` leaves the full authorized amount reserved on an `executada` cotação and the conciliation will never touch it. Log an error and surface it (or retry with backoff).

### 🟡 Conciliation event may state a false `para`, `lib/material/saldo.ts:239-249`

When the cotação does not exist the event records `para: 'cancelada'`, asserting a state change that never happened. Use the current situation or a neutral value; the trail has evidentiary value.

### 🟡 Designation overlap check is not atomic and role is not rechecked at use, `lib/material/cadastro.ts:116-139`, `lib/material/papeis.ts:281-314`

Two concurrent `criarDesignacao` calls can both pass the overlap check. And `PERFIS_POR_PAPEL` is verified only on creation: a user whose role changes afterwards keeps the designation and can end up with both views (`visaoDe` gives `trf1` first). Check the role in `carregarPapeis` (ignore designations whose role no longer fits) and re-check after insert.

### 🟡 Append-only hooks miss `bulkWrite`, `models/_somente-inclusao.ts:19-28`

`Model.bulkWrite` (update/delete ops) bypasses all eight query hooks. Add a `bulkWrite` hook or at least make the sweep test grep for `bulkWrite` and `.collection.` on these models.

### 🟡 Sweep test for final ticket status is weak, `lib/material/__tests__/varredura-chamado.test.ts`

The regex only matches `status: '<final>'` with single quotes, and passing means "the file imports `@/lib/material/chamado`", so a new write of `cancelado` inside `gestao/actions.ts` (which already imports the hook for reject) is accepted without the hook being called. Match double quotes, `CHAMADO_STATUS` constants and `$set` forms, and assert per function that the gate/cancel hook is called.

### 🟡 `cotacaoAnteriorId` is not validated, `lib/material/transicoes.ts:249`

Any valid ObjectId is stored. Check that it points to a `reprovada`/`cancelada` cotação of the same ticket (RN-16).

### 🟡 Pause log left open when a ticket with a quote-owned pause is cancelled, `lib/material/transicoes.ts:774-782` and `lib/material/chamado.ts:86-89`

`retomarPelaCotacao` returns false (ticket no longer `aguardando_terceiros`) and the caller then clears `pauseLogId` anyway, leaving the `PauseLog` open forever. Close the log (set `resumedAt`) in the cancel path, or keep `pauseLogId` when resume returned false.

### 🟡 Technician cannot clear his own mistaken rascunho, `lib/material/leitura.ts:86`

Only RT or gestor can cancel, yet a `rascunho` blocks concluding the ticket (AC-13). With no RT designated, the technician is stuck. Consistent with the spec text, but worth an explicit decision (for example allow the technician to cancel an unsent rascunho).

### 🟡 Cost section links to a page a Preposto cannot open, `app/(dashboard)/gestao/_components/CustoChamadoSecao.tsx`

The executed-material list links to `/cotacoes/<id>`; a Preposto without designation gets a 404 from `lerDetalhe`. Hide the link when the viewer cannot open it.

## Nits

- ⚪ `lib/material/transicoes.ts:459` `unset` is declared and never filled; drop it.
- ⚪ `lib/material/transicoes.ts:184` `getFullYear()` uses the server time zone; the spec counts years in Belém.
- ⚪ `lib/material/transicoes.ts:672-694` the saldo event repeats the action (`cancelar`/`alterar`), so the trail shows the action twice (once without value, once with); give it a distinct `acao` to keep the trail readable.
- ⚪ `lib/material/serializar.ts:573` the technician's trail also shows motives of `cancelar` and `alterar`; the spec lists devolução and reprovação.
- ⚪ `lib/material/arquivos.ts:82-87` the 10-files-per-type limit is a count-then-insert (a race can exceed it), and a missing `Content-Length` skips the early 413 (body is buffered up to the framework limit).
- ⚪ `lib/material/` has no `AGENTS.md` yet (listed in the spec as a neutral consequence); `/sync` should add it.
- ⚪ `components/realtime/RealtimeProvider.tsx` the toast always links to `/cotacoes/<id>` while the bell sends the technician to the ticket; align.

## Strengths

- `transicionar` is a single, readable pipeline (read, reserve, conditional write on `situacao + versao`, event with rollback, effects, notices) and the reserve step is a true atomic `findOneAndUpdate` with `$expr` on the free balance; the two-approval race and the orphan-reserve case have real-database tests.
- Visibility is centralised in `visaoDe`/`serializarCotacao`, applied the same way in the file route, the card API, the queue and the detail page; the rascunho exclusion for the TRF1 side is enforced in three places (visão, queue filter, download).
- Notices (Notification, e-mail, socket) carry no value; the socket event, `ALLOWED_EVENTS`, `getNotificationUrl` and the bell were all wired.
- The ticket-lifecycle gates (conclusion, manual resume, cancel, reject) sit on the three places that write final statuses, with an explicit sweep test; legacy `submitCotacaoAction` is closed and the old dialog removed cleanly, and old `aprovada` quotes still count in cost.
- Upload hardening reuses the project's safe-path and magic-byte checks, never uses the original name on disk, serves attachments with `nosniff`, and the proxy/nginx exceptions are consistent.

## Test coverage

Configured (Vitest; real-DB suites need `MONGO_TEST_URI`). Coverage is broad: state machine and visibility (`acoes.test.ts`, `serializar.test.ts`), saldo race/orphan/conciliation (`saldo.db.test.ts`), the full flow and lifecycle hooks (`fio.db.test.ts`), append-only schema behavior, routes, actions, cost. Gaps tied to the findings: no test for two approvals on two different empenhos through `transicionar`, none for the event-write rollback path (cotação and reserve restored), none for duplicate item/orçamento ids, none for `cancelarCotacaoPeloChamado` failing or conflicting, none for a send racing a fiscal assume, and no `bulkWrite` check in the append-only suite. Known gap acknowledged by the author: `e2e/cotacao-flow.spec.ts` still drives the old, now refused quote flow and will fail until updated.
