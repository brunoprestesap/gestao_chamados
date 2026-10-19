# Review, feat/material-fatia-2-ateste-pdf, 2026-10-19

**Reviewed by**: Claude Sonnet 5.5 (fresh review; author model not stated)
**Scope**: 23 files (14 tracked + 9 untracked, docs/manuais excluded), branch vs main
**Verdict**: Approve with nits

## Summary

Fatia 2 of spec 0019: provisional/definitive receipt with a Belem 5-day deadline badge (AC-21), a one-time invoice (NF) on `atestada` (AC-22), and a TRF1-only PDF with a SHA-256 stored per emission (AC-23). Everything goes through `transicionar` (conditional write on situacao+versao, event, rollback), serialization stays in `serializarCotacao`, and the PDF copies the contract-report pattern correctly (emission id created before render, hash recorded before delivery, never throws). No blockers or majors. The findings are edge cases and visibility choices.

## Minor

### 🟡 Invoice date accepts impossible dates and ends in a generic error, `shared/material/cotacao.schemas.ts:142` / `lib/material/transicoes.ts:683`

**Problem**: `ymd` is only `^\d{4}-\d{2}-\d{2}$`. `2026-02-31` passes, `new Date('2026-02-31T12:00:00.000Z')` is an Invalid Date, and Mongoose throws a CastError in `findOneAndUpdate`. The action wrapper catches it and returns the generic error (with a `console.error`), so the "no rule function throws" convention is broken and the user gets no hint.
**Why it matters**: Rare, but the wrong message sends the contractor in circles. The uploaded NF file stays orphaned.
**Suggested fix**: Validate the calendar date in `NotaFiscalSchema` (round trip through a Date) and return "Data inválida." Add a test for it.

### 🟡 Contractor loses sight of an `atestada` cotacao after 90 days, so the NF cannot be reached, `lib/material/serializar.ts:210`, `lib/material/leitura.ts:300`

**Problem**: `atestada` is not `emTramite`. `visaoDe` and `listarFila` show the contractor only `emTramite` or `updatedAt` within 90 days. A cotacao waiting for its NF for more than 90 days disappears from the contractor's queue and detail (the `registrar_nf` action still works, but the UI is unreachable). The new "Minhas ações" NF clause is cut by the same `$and` filter.
**Why it matters**: The AC-22 pending item becomes unreachable exactly when it is most overdue.
**Suggested fix**: Treat `atestada` without `notaFiscal` as visible to the contractor regardless of age, in both `visaoDe` and the fila filter.

### 🟡 Deadline badge and receipt authors are visible to the contractor, `lib/material/serializar.ts:301-311`, `lib/material/leitura.ts:337`

**Problem**: `recebimentoProvisorio/Definitivo` (with the gestor's name), `prazoAteste` and the fila `prazoAteste` are serialized for `contratada` as well as `trf1`. AC-21 describes the badge without saying who sees it. TRF1's own "Recebimento ... atrasado" status and staff names go to the supplier.
**Why it matters**: AC-15 makes the serializer the single visibility gate, and this widens it silently. It may be intended (the contractor needs to know when receipt happened), but the overdue badge is internal.
**Suggested fix**: Decide explicitly. Suggest showing the contractor the receipt dates but not the overdue badge (`prazoAteste` only for `trf1`), and record the choice in the spec.

### 🟡 PDF for a draft returns a misleading 403, `lib/material/pdf/gerar.tsx:49`

**Problem**: For a `rascunho`, `lerDetalhe` returns null for the TRF1 side, so the route answers 403 "O PDF da cotação é só do lado TRF1" even to a fiscal. The button is hidden for drafts, so only direct calls see it.
**Suggested fix**: Return 404 when `detalhe` is null, 403 only when the visao is not trf1.

### 🟡 Admin without designation can issue the official PDF, `lib/material/leitura.ts:104`

**Problem**: `gerarPdf` is true for `leitorAdmin`. The area convention says an undesignated Admin "só lê". The PDF is the hashed document sent to the SEI and each click writes an immutable emission row, so a reader can now create official records without a role.
**Why it matters**: Low risk (same data they can already read), but the emission log fills with non-role authors and the convention is bent. Flagged as asked, not wrong by itself.
**Suggested fix**: Either keep it and document it in `lib/material/AGENTS.md` and the spec, or limit to fiscal/gestor/aprovador.

### 🟡 NF cannot be corrected and gets no notification, `lib/material/transicoes.ts:676`

**Problem**: One NF only, no replacement, and file removal is only allowed in `rascunho`/`devolvida`, so a wrong number or date is permanent. Registering the NF notifies nobody (the `de !== para` guard), so the gestor/fiscal only find out by opening the cotacao. The NF date is also unbounded (future date or before execution accepted).
**Why it matters**: Defensible for an audit trail, but there is no exit for a typing mistake and no signal to the receiving side.
**Suggested fix**: Keep it one-time but add a confirm step in the dialog showing number and date, and consider a plain `Notification` to the gestor (no value). A sanity check of the date against `executadoEm` is cheap.

### 🟡 Test gaps, `lib/material/__tests__/ateste.db.test.ts`

**Problem**: Good coverage of the happy path, order, one-time NF, roles and the PDF hash, but nothing for: impossible NF date, the fila filter for the contractor NF clause (combined with the 90 day clause), an NF file from another cotacao or already removed, a race between two provisional clicks, and no component test for `AtesteCotacao`/`SeloPrazoAteste`.
**Suggested fix**: Add at least the fila and wrong-file cases.

## Nits

- ⚪ `lib/material/pdf/gerar.tsx:62`, the render has no timeout and shares the in-memory lock with the contract report; a hung render blocks both until restart. Acceptable under the one-instance rule, worth a line in AGENTS.
- ⚪ `lib/material/AGENTS.md:3,45`, still says only Fatia 1 is built and Fatias 2 to 5 do not exist; update on /sync.
- ⚪ `app/(dashboard)/cotacoes/_components/apoio.tsx:80`, `ROTULO_ETAPA_ATESTE` was added to `mensagens.ts` but the badge builds its own provisório/definitivo strings; use one source.
- ⚪ `lib/material/transicoes.ts:663-674`, the "já registrado" and "registre antes o provisório" checks duplicate what `acoesDisponiveis` and the versao check already enforce; fine as server defense, but not covered by the `acoes.test.ts` mirror.

## Strengths

- State changes stay inside `transicionar`; the new receipts reuse the conditional write, the event row and the rollback, and `de !== para` correctly avoids a false notification on the provisional step.
- The PDF follows the contract-report discipline: id created before render, hash of the delivered bytes stored through an append-only model, errors mapped without leaking values or names, TRF1 gate reusing `lerDetalhe`/`visaoDe`.
- Deadline logic is a small pure function in Belem time with boundary tests (02:59 vs 03:00 UTC), and the real-DB test covers ordering, roles, one-time NF, wrong-situation upload and the emission hash plus append-only.
- The NF check verifies that the file belongs to this cotacao, has type `nota_fiscal` and is not removed.

## Test coverage

Unit: `prazos.test.ts` (boundaries, Belem tz, stages) and `acoes.test.ts` (role/situation matrix for the new actions and `gerarPdf`). Real DB: `ateste.db.test.ts` covers AC-21, AC-22 and AC-23 end to end. Missing: invalid NF date, fila filter for the contractor, cross-cotacao/removed NF file, UI components. PDF content itself is checked only by the `%PDF-` header and hash, consistent with the contract report.
