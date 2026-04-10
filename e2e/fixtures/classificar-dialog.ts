import type { Locator, Page } from '@playwright/test';

/**
 * No ClassificarChamadoDialog há dois Select (Radix): natureza (0) e prioridade final (1).
 * As opções de prioridade usam rótulos humanos ("Alta", "Normal"), não os valores enum.
 */
export async function selectFinalPriorityInClassificarDialog(
  page: Page,
  dialog: Locator,
  label: 'Alta' | 'Normal' | 'Baixa' | 'Emergencial',
) {
  await dialog.getByRole('combobox').nth(1).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}
