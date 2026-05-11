import type { Locator, Page } from '@playwright/test';

/**
 * Localiza a linha de um chamado em /gestao.
 *
 * A página foi revitalizada: em desktop renderiza <Table> (TableRow → role="row").
 * No viewport padrão do Playwright (1280x720) estamos em desktop e o helper casa pela
 * linha da tabela contendo o `textFragment` (ex.: número do chamado, título, ou trecho
 * único como `Sala E2E ${Date.now()}`).
 */
export function gestaoChamadoCard(page: Page, textFragment: string) {
  return page.getByRole('row').filter({ hasText: textFragment }).first();
}

/** Coluna Ações na /gestão: botão ícone com aria-label "Atribuir chamado". */
export function gestaoRowAtribuirButton(row: Locator) {
  return row.getByRole('button', { name: /atribuir chamado/i });
}

/** Abre o sheet de detalhe a partir da linha na tabela /gestão (evita overlays que bloqueiam `tr.click()`). */
export async function gestaoOpenDetailSheetFromRow(row: Locator): Promise<void> {
  await row.locator('td').first().click({ force: true });
}
