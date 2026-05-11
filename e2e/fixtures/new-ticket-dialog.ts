import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Após escolher o tipo de serviço, o formulário exige subtipo e permite catálogo.
 * Sem catalogServiceId a API de técnicos elegíveis em /gestao não retorna ninguém.
 *
 * Aguarda as opções carregarem via fetch antes de selecionar. O componente carrega
 * subtipos assincronamente quando o tipo de serviço é selecionado. Se o dropdown
 * abre antes dos dados chegarem, fecha e reabre após um intervalo.
 */
export async function selectFirstSubtypeAndCatalogService(page: Page, dialog: Locator) {
  // Os FormLabels do dialog incluem asterisco em campos obrigatórios (ex.: "Subtipo *"),
  // então o regex precisa casar o nome com sufixo opcional " *".
  await selectOptionWithRetry(page, dialog, /^subtipo\s*\*?$/i);
  await selectOptionWithRetry(page, dialog, /serviço/i);
}

async function selectOptionWithRetry(page: Page, dialog: Locator, comboboxName: RegExp) {
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await dialog.getByRole('combobox', { name: comboboxName }).click();
    try {
      await expect(page.getByRole('option').nth(1)).toBeVisible({ timeout: 5000 });
      await page.getByRole('option').nth(1).click();
      return;
    } catch {
      // Fecha o dropdown com Escape antes de tentar novamente
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }
  }
  throw new Error(`Nenhuma opção carregou para o combobox ${comboboxName} após ${maxAttempts} tentativas`);
}
