import type { Locator, Page } from '@playwright/test';

/**
 * Após escolher o tipo de serviço, o formulário exige subtipo e permite catálogo.
 * Sem catalogServiceId a API de técnicos elegíveis em /gestao não retorna ninguém.
 */
export async function selectFirstSubtypeAndCatalogService(page: Page, dialog: Locator) {
  await dialog.getByRole('combobox', { name: /^subtipo$/i }).click();
  await page.getByRole('option').nth(1).click();

  await dialog.getByRole('combobox', { name: /serviço/i }).click();
  await page.getByRole('option').nth(1).click();
}
