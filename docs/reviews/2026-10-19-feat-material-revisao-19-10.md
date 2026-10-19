# Review, feat/material-revisao-19-10, 2026-10-19

**Reviewed by**: Sonnet 5.5 (author on unspecified model)
**Scope**: 27 files (excluding docs/manuais), branch vs main (uncommitted)
**Verdict**: Approve with nits

## Summary

Implements step 13a of spec 0019: NF date limits and unlinked-NF removal, the single `pendenciaDaContratada` predicate (memory and Mongo forms) shared by `visaoDe` and the queue, contratada receipt dates without names, the Admin-without-designation PDF with `papel` on the emission, and the NF notice to managers without a toast. The code follows the spec closely, keeps the server authoritative (versao CAS, 403 before lookup, 404 for draft) and does not leak values in notices. No blockers or majors found; a few minor and nit items remain.

## Minor

### 🟡 Technician trail still carries receipt authors, `lib/material/serializar.ts:~290`

**Problem**: The `tecnico` trail branch maps `autorNome: ev.autorNome` for every action, including `receber_provisorio`/`receber_definitivo`. Only the contratada branch uses `ACOES_SEM_AUTOR_PARA_CONTRATADA`.
**Why it matters**: The spec text (AC-21) only restricts the contratada, so this is not a violation; but the technician is a lower-privilege viewer than the contratada and can now see more than it.
**Suggested fix**: Decide explicitly (spec or code). Either apply the same omission to the technician trail or record in the spec that the technician is allowed to see it.

### 🟡 Orphan NF upload when the page is left without closing the dialog, `app/(dashboard)/cotacoes/_components/AtesteCotacao.tsx:~96-125`

**Problem**: Cleanup of an unlinked NF file (`soltarAnexo`) runs only on swap and on dialog close. Navigating away, tab close or a reload with an uploaded-but-unregistered file leaves it counted toward the 10-file limit.
**Why it matters**: Low, since a later session can still remove it via the same action and the limit is 10, but the UI has no way to list/remove such leftovers.
**Suggested fix**: Accept and note it in the spec, or reuse an existing unlinked NF file on reopening instead of uploading a new one.

### 🟡 Removal in `atestada` is not limited to the contratada role, `app/(dashboard)/cotacoes/actions.ts:~203`

**Problem**: `removerArquivoAction` checks only "who uploaded" plus `podeRemoverArquivo`. The spec says the exception is for the responsável técnico; since only the uploader can remove and only the RT can upload NF, the effect is equal today.
**Why it matters**: A later change to upload permissions would silently widen the exception.
**Suggested fix**: Optional: assert the RT role in the exception branch, or add a test pinning that only the uploader can remove.

## Nits

- ⚪ `app/(dashboard)/cotacoes/page.tsx:~100`, empty-state `colSpan={7}` is fixed, but the table has 5 to 7 columns depending on `trf1` and `comRecebimento`.
- ⚪ `lib/material/leitura.ts:~277`, `listarFila` reassigns the `abaPedida` parameter; a `const aba = abas.includes(x) ? x : 'minhas'` is clearer.
- ⚪ `lib/material/pdf/gerar.tsx:~66`, the `visao !== 'trf1'` branch after the `papel` check is effectively unreachable for non-draft; harmless defensive code.
- ⚪ `lib/material/AGENTS.md`, stale lines (PDF 409/Admin cannot emit, `deveNotaFiscal`, contratada sees names); already planned for /sync.

## Strengths

- One predicate with two forms in `pendencia.ts`, used by `visaoDe`, the queue filter, `Minhas ações`, plus a DB parity test over the same cotações.
- Order of checks in the PDF generator (403 before lookup, 404 for draft and for unknown id) avoids an existence oracle; the emission records the role.
- NF date rules compare Belém days with both limits inclusive and have boundary tests (02:59/03:00 UTC); text moved to `mensagens.ts`; notices carry no values and the socket event cleanly skips the "atestada" toast.

## Test coverage

Good: unit tests for the date rules, schema, `podeRemoverArquivo`, `visivelParaContratada`, `papelDaEmissao`, seal text; DB tests for parity and the ateste flow (double click, notices, foreign/removed NF file); component tests for `AtesteCotacao`. Not directly covered: the PDF route's status codes beyond `papelDaEmissao` unit tests (403 for unknown id, 404 draft) and the `RealtimeProvider` `aviso: 'nota_fiscal'` branch (no toast).
