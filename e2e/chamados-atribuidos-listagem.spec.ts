import { expect, test } from '@playwright/test';

import { login } from './fixtures/auth';
test.describe('Chamados Atribuídos — Listagem', () => {
  test('deve aplicar filtro por status sem quebrar a listagem', async ({ page }) => {
    await login(page, 'tecnico');
    await page.goto('/chamados-atribuidos');
    await page.waitForLoadState('networkidle');

    const filtroStatus = page.getByRole('combobox', { name: /filtrar por status/i }).first();
    await filtroStatus.click();
    await page.getByRole('option', { name: /em atendimento/i }).first().click();

    const cardsVisiveis = page.locator('[data-slot="card"]:visible');
    const vazio = page.getByText(/nenhum chamado atribuído|nenhum resultado encontrado/i).first();
    await expect(cardsVisiveis.first().or(vazio)).toBeVisible({ timeout: 15000 });
  });

  test('deve buscar termo inexistente e mostrar empty state filtrado', async ({ page }) => {
    await login(page, 'tecnico');
    await page.goto('/chamados-atribuidos');
    await page.waitForLoadState('networkidle');

    const busca = page.getByRole('textbox', { name: /buscar chamados/i }).first();
    await busca.fill(`__sem_resultado__${Date.now()}`);

    await expect(page.getByText(/nenhum resultado encontrado/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /limpar filtros/i }).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test('deve abrir detalhe ao clicar em card visível quando existir resultado', async ({ page }) => {
    await login(page, 'tecnico');
    await page.goto('/chamados-atribuidos');
    await page.waitForLoadState('networkidle');

    const primeiroCard = page.locator('[data-slot="card"]:visible').first();
    if ((await primeiroCard.count()) === 0) {
      test.skip(true, 'Sem chamados visíveis para validar navegação ao detalhe.');
      return;
    }

    await expect(primeiroCard).toBeVisible({ timeout: 10000 });
    await primeiroCard.click();
    await page.waitForURL(/\/chamados-atribuidos\/.+/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: /detalhes do chamado/i })).toBeVisible({
      timeout: 10000,
    });
  });
});
