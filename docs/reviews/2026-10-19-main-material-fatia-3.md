# Review, main (uncommitted), 2026-10-19

**Reviewed by**: Claude Sonnet 5.5 (fresh review; author model not stated)
**Scope**: 44 files (23 tracked + 20 untracked, docs/manuais excluded), uncommitted vs main
**Verdict**: Changes requested

## Summary

Fatia 3 of spec 0019: Anexo V and SINAPI CSV import (review, five-step apply without transaction, manual and automatic anomaly marks), classification of quote items into paths 1 and 2 with the origin always derived on the server (`derivarOrigem`, rerun at send), both bases shown only to the TRF1 side, base choice and mandatory conferences at `encaminhar`, and the Admin "what is missing" panel. Plus the `EditorContratada` fix (refusals via toast) with its regression test. The design follows the spec closely: origin and price never come from the input, every state change still goes through `transicionar`, the serializer remains the single visibility gate, and the apply order is genuinely repeatable. No blockers. The one major is that the new money-affecting logic has no tests yet (planned in `/test`); the rest are edge cases, one body-limit mismatch on the upload route and some UX gaps.

## Major

### 🟠 Untested new branching logic that decides prices and applies imports, `lib/material/precos.ts:241`, `lib/material/importacao/*.ts`, `lib/material/transicoes.ts:692`

**Problem**: The only test for the slice is the `EditorContratada` regression. Nothing covers `derivarOrigem` (ambas by Anexo V code, ambas by SINAPI equivalence, equivalent to several items, month change at send), `lerCsvAnexoV` / `lerCsvSinapi` (quotes, BOM, Windows-1252, header search, decimal formats), `revisarAnexoV`, `marcaAutomatica` / `acimaDoPercentual`, `valorTotalCentavos` with the provisional price, the `encaminhar` branch (bases, conferences, fiscal who assumed), the recomputed advertências, and the apply: retry after a crash between steps 2, 3 and 4, two clicks racing, `anexo_v_mudou`, month already imported. The runtime verify passed the 29 steps, but it does not guard regressions in code where an error changes the amount that gets reserved on an empenho.
**Why it matters**: Branching logic with money and no safety net. The apply is the hardest part to get right without a transaction and only a real-Mongo test (`*.db.test.ts`) proves the "repeat without damage" claim.
**Suggested fix**: Cover the above in `/test` before merge: pure unit tests for the CSV reader, revision, derivation, anomaly and totals; DB tests for apply (crash and resume, concurrent apply, pointer flip) and for classification and the send re-derivation. Add the AC-15 case: the contractor DTO of an `ambas` item carries neither `anexoVPrecoCentavos` nor `sinapiPrecoCentavos`.

## Minor

### 🟡 The advertised 10 MB file limit fails at the boundary, `app/api/material/importacoes/route.ts:23`, `nginx/default.conf:13`

**Problem**: The route accepts a file up to exactly 10 MiB (`TAMANHO_MAXIMO_IMPORTACAO_MATERIAL`) and allows 64 KiB of multipart overhead, but nginx caps the whole body at `10M`, and `proxy.ts` (which this path still goes through; it is not in the `matcher` exception) buffers only 10 MB and cuts the rest without error. A file between about 10 MiB minus the overhead and 10 MiB gets an HTML 413 from nginx (the screen shows a generic "Não foi possível enviar o arquivo") or a truncated body that `formData()` rejects, which the route answers with the misleading "Envie o arquivo CSV".
**Why it matters**: Admin only and a rare size, but the message sends the Admin to the wrong place. The project already documents this trap in `AGENTS.md`.
**Suggested fix**: Either lower the file limit to leave room (for example 9 MB, message included) or give this path the same treatment as the other large routes (matcher exception and an nginx block). The first is simpler for a 10 MB CSV.

### 🟡 `ImportacaoAberta` read pulls the whole parsed file for nothing, `lib/material/tabelas.ts:188`

**Problem**: `ImportacaoMaterialModel.find({ emAberto: true }).lean()` loads `linhas` (up to 20.000 rows, several MB of BSON) on every render of `/configuracoes/material`, only to drop it in the mapping below.
**Why it matters**: Every Admin page load pays for megabytes while an import is open.
**Suggested fix**: Select out `linhas` (`.select('-linhas')`).

### 🟡 Classification overwrites the unit of a diagnosis item, `lib/material/precos.ts:405`

**Problem**: `copiaParaDocumento` replaces `unidade` with the table unit. AC-1 says the responsável técnico cannot change description, unit and quantity of the technician's diagnosis items, and the quantity is kept. A technician's "10 un" classified against a table item in "cx" or "m²" silently becomes "10 cx" (the editor even shows the unit as read-only). The spec says to copy the unit (AC-26), so this is a conflict between two ACs rather than a slip.
**Why it matters**: Quantity and unit stop being consistent and the fiscal sees only the table unit. The amount is computed on the wrong quantity base.
**Suggested fix**: Decide it in the spec. At minimum, show the diagnosis unit next to the table unit when they differ in the classification dialog and in the fiscal view, or recuse the choice when the units differ for a `doDiagnostico` item.

### 🟡 Review screen hides the numbers that matter, `lib/material/importacao/revisao.ts:79`, `:128`

**Problem**: "Novos" and "removidos" lines carry only the key and the description. On a first import (everything is new) or a new SINAPI month, the Admin applies a table without ever seeing a single price, quantity or code. Only "alterados" show before/after.
**Why it matters**: The review is the single human checkpoint before prices become official. A column shift in the spreadsheet conversion (PRECO and QUANTIDADE swapped) is invisible there.
**Suggested fix**: Add unit, quantity and price (and the SINAPI code) to the new and removed lines, or at least a few sample rows with all fields.

### 🟡 Thousand-dot ambiguity in prices and quantities, `lib/material/importacao/csv.ts:170`, `:181`, `shared/material/valores.ts:115`

**Problem**: The Brazilian format is enforced (good: `12.50` is refused), but `2.500` is accepted as 2500 reais, and `lerQuantidade` does the same with `1.500`. A column exported with a dot decimal and three digits (`2.500` meaning 2.5) is read 1000 times larger without any message.
**Why it matters**: Low probability, large money error, and the review (see above) would not show it.
**Suggested fix**: Mention the exact format in the layout help, and let the review show price and quantity so the Admin catches it. Optionally warn when a price has a dot-thousands shape and no comma.

### 🟡 Contractor sees a total that includes a price it cannot see, `lib/material/serializar.ts:360`, `app/(dashboard)/cotacoes/_components/DetalheCotacaoView.tsx`

**Problem**: As noted by the runtime verify: for an `ambas` item without a chosen base, the contractor's line shows "—" but `valorTotalCentavos` already includes the larger of the two prices. The lines do not add up to the total and nothing explains it. Since the contractor knows its own Anexo V price and SINAPI is public, hiding the line protects nothing, while the screen looks wrong.
**Why it matters**: Confusing for the contractor, and it invites support calls. It does not break AC-15 (both bases are never shown side by side).
**Suggested fix**: Either show the contractor "valor provisório" on the line and a note on the total, or show only the total as provisional. Keep both bases hidden.

### 🟡 Trail of later acts repeats earlier warnings, `lib/material/transicoes.ts:886-901`

**Problem**: `advertenciasNoAto` is now the union of persisted warnings (`mantidas`) and the new ones, so a `divergencia_execucao` raised at `executar` shows up again in the events of `receber_provisorio`, `receber_definitivo` and `registrar_nf`, and the price warnings reappear in every act with a new `em`. Before, the field recorded what that act raised.
**Why it matters**: The trail is append-only evidence; "advertências no ato" no longer says what happened at that act. Also `set.advertencias` is now written on every transition, including ones that never touched it.
**Suggested fix**: Keep the event field for the warnings the act itself produced plus the price warnings in force, and keep the original `em` of a warning that did not change. Document the choice in `lib/material/AGENTS.md`.

### 🟡 "Invalid input" in English on a tampered classification, `shared/material/cotacao.schemas.ts:175`

**Problem**: As found in the runtime verify. The `z.union` of three strict objects reports Zod's default message for any invalid `escolha` (including a SINAPI code that normalizes to empty, which the UI cannot send but a stale client could).
**Why it matters**: Breaks the pt-BR rule for user-visible text; only reachable with a tampered or stale payload, so low impact.
**Suggested fix**: Give the union a Portuguese `error` message (for example "Escolha um item do Anexo V, um insumo do SINAPI ou três orçamentos.").

### 🟡 Several identical "Usar", "Marcar" and "Código" buttons, `app/(dashboard)/cotacoes/_components/DialogClassificar.tsx:147`, `:184`, `app/(dashboard)/configuracoes/material/_components/TabelasPreco.tsx` (item table actions)

**Problem**: Every result row has a button named just "Usar", and every row of the Anexo V table has "Marcar" and "Código". A screen reader user hears the same name N times.
**Why it matters**: WCAG 2.4.6 / 4.1.2; the project cares about accessibility.
**Suggested fix**: Add an `aria-label` with the item ("Usar o item 12 do Anexo V", "Marcar o item 12 para conferência").

### 🟡 Manual mark and code correction race a new version, `lib/material/tabelas.ts:48-95`

**Problem**: `itemVigente` checks the pointer and the write that follows is not conditional on it. If an Anexo V apply flips the pointer in between, the mark or the corrected code lands on the old version and is lost without any message (the new version already copied the old values).
**Why it matters**: Tiny window and Admin only, but the correction is silently dropped.
**Suggested fix**: Re-read the pointer after the write (or write with a filter on the version) and answer "o Anexo V mudou, tente de novo" when it moved.

## Nits

- ⚪ `lib/material/transicoes.ts:698`, the "only the fiscal who assumed" rule applies only when the cotação has items on the conference list; without them any fiscal can encaminhar and choose the bases. Pre-existing for `encaminhar`, but the spec text for AC-27 and AC-29 reads as the same actor.
- ⚪ `lib/material/precos.ts:469`, `buscarItensPreco` lets a fiscal search against a draft's contract; harmless (it returns only price tables), but the draft is otherwise invisible to the TRF1 side.
- ⚪ `app/(dashboard)/configuracoes/material/_components/TabelasPreco.tsx:329`, "A aplicação parou no meio" is shown for any `aplicando` import, including one another Admin is applying right now (fresh, under the 5 minute mark).
- ⚪ `lib/material/importacao/pendente.ts:62`, `haAberta` is a check-then-act before the unique partial index; the 409 from the index covers the race, so the pre-check is only to fail early and could say so in a comment.
- ⚪ `app/(dashboard)/cotacoes/_components/EditorContratada.tsx:176`, `classificar` refuses with "Anexe o arquivo de cada orçamento antes de salvar" even when the Admin-chosen path needs no budget at all; the save-before-classify design requires it, but the message could say why.
- ⚪ `lib/material/AGENTS.md` still says fatias 3 to 5 do not exist; `/sync` should update it (files table, `precos.ts`, `controles.ts`, `tabelas.ts`, `importacao/`, the `/api/material/importacoes` route and the new rules).

## Strengths

- The "origin and price never come from the input" rule is real: `ClassificarItemSchema` takes only the choice, `derivarOrigem` is one pure function used by the classification and again at send, and an `ambas` item cannot reach `encaminhar` without a chosen base and a 10 to 500 character justification.
- The apply is carefully built for repetition without a transaction: conditional `pendente` to `aplicando`, stale-resume window, pointer flip as the single visible write, `jaVirou` detection by `importacaoId`, upserts by the natural key, leftover rows deleted, and the anomaly recalculation never undoing an apply. The unique partial index and the partial TTL on `pendente` only are right.
- Visibility stays in `serializarCotacao`: the contractor gets origin and table reference but never both prices, the choice, the justification or the warnings, and the PDF and the fiscal dialog show both bases to the TRF1 side only.
- Anomaly recalculation writes by field path and never touches `anomalia.manual`; the mark is read live at `encaminhar` through the current version of the same number, so a manual mark carries over reimports.
- The CSV reader is strict and friendly: whole-file refusal with line numbers, header search in the first 20 lines, missing columns named, UTF-8 then Windows-1252, quoted fields with `;`.
- The `EditorContratada` fix targets the real cause (remount keyed by version) and its regression test reproduces that remount with a `Tela` wrapper.

## Test coverage

Only `app/(dashboard)/cotacoes/_components/__tests__/EditorContratada.test.tsx` is new: two cases (classification refusal and send refusal still reach the user after the editor remounts). It asserts real behavior (the toast or the text), not the mock. Everything else in the slice is untested: CSV reading, revision, `derivarOrigem`, the anomaly rule, provisional totals, the `encaminhar` bases and conferences, the five-step apply and its crash and race cases, the Admin actions, the pending panel and the serializer's contractor view for the new fields. Since `/test` is the planned next step, this review counts it as one open item (the Major above), not as repeated findings.
