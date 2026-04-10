import { expect, type Locator } from '@playwright/test';

/** Cards de técnico em AtribuirChamadoDialog: <button> com texto "Matrícula:". */
export async function selectFirstEligibleTechnicianAndAtribuir(dialog: Locator) {
  await expect(dialog.getByText(/carregando técnicos elegíveis/i)).not.toBeVisible({
    timeout: 20000,
  });
  const semTecnicos = dialog.getByText('Nenhum técnico disponível');
  if (await semTecnicos.isVisible().catch(() => false)) {
    throw new Error(
      'Atribuir: nenhum técnico elegível. Rode scripts/seed.js e confira servicecatalogs + specialties.',
    );
  }
  // Preferir o técnico do login E2E (`tecnico`), não necessariamente o primeiro da lista.
  const techCard = dialog
    .locator('button[type="button"]:not([disabled])')
    .filter({ hasText: /matrícula:/i })
    .filter({ hasText: /técnico 01/i });
  const fallback = dialog.locator('button[type="button"]:not([disabled])').filter({
    hasText: /matrícula:/i,
  });
  if ((await techCard.count()) > 0) {
    await techCard.first().click();
  } else {
    await expect(fallback.first()).toBeVisible({ timeout: 15000 });
    await fallback.first().click();
  }
  await dialog.getByRole('button', { name: /^atribuir$/i }).click();
}
