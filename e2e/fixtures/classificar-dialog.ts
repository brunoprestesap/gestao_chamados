import type { Locator, Page } from '@playwright/test';

/**
 * No ClassificarChamadoDialog há 4 Selects (Radix combobox): Subtipo, Serviço do Catálogo,
 * Natureza do Atendimento (Aprovada) e Prioridade Final. As opções de prioridade usam
 * rótulos humanos ("Alta", "Normal"), não os valores enum.
 *
 * Usa o accessible name para identificar especificamente o select de prioridade
 * (em vez de `.nth(N)`, que quebra quando a ordem dos campos muda).
 */
export async function selectFinalPriorityInClassificarDialog(
  page: Page,
  dialog: Locator,
  label: 'Alta' | 'Normal' | 'Baixa' | 'Emergencial',
) {
  await dialog.getByRole('combobox', { name: /prioridade\s*final/i }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}
