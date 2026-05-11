import { expect, type Locator } from '@playwright/test';

/** Username do técnico usado no login E2E (`login(page, 'tecnico')`). */
const E2E_TECNICO_USERNAME = 'tecnico';

/** Cards de técnico em AtribuirChamadoDialog: <button> com texto "Matrícula:". */
export async function selectFirstEligibleTechnicianAndAtribuir(dialog: Locator) {
  // Suíte longa + dev server: GET eligible-technicians pode ultrapassar 30s sob carga.
  await expect(dialog.getByText(/carregando técnicos elegíveis/i)).not.toBeVisible({
    timeout: 60000,
  });
  const semTecnicos = dialog.getByText('Nenhum técnico disponível');
  if (await semTecnicos.isVisible().catch(() => false)) {
    throw new Error(
      'Atribuir: nenhum técnico elegível. Rode scripts/seed.js e confira servicecatalogs + specialties.',
    );
  }
  // Card: <button><p>Matrícula: tecnico</p></button>. normalize-space() distingue de "Matrícula: tecnico2".
  const matriculaExata = `Matrícula: ${E2E_TECNICO_USERNAME}`;
  const porMatricula = dialog.locator(
    `xpath=.//button[@type="button" and not(@disabled)][.//p[normalize-space()="${matriculaExata}"]]`,
  );

  if ((await porMatricula.count()) > 0) {
    await porMatricula.first().click();
    await dialog.getByRole('button', { name: /^atribuir$/i }).click();
    return;
  }

  const fuzzy = dialog
    .locator('button[type="button"]:not([disabled])')
    .filter({ hasText: new RegExp(`Matrícula:\\s*${E2E_TECNICO_USERNAME}\\b`, 'i') });
  await expect(
    fuzzy.first(),
    `E2E: "${E2E_TECNICO_USERNAME}" aparece apenas sobrecarregado ou ausente — confira global-setup (limpa atribuições E2E).`,
  ).toBeVisible({ timeout: 15000 });
  await fuzzy.first().click();
  await dialog.getByRole('button', { name: /^atribuir$/i }).click();
}
