import { expect, test } from '@playwright/test';

import { login } from './fixtures/auth';

test.describe('Restrição de acesso por role', () => {
  test('Solicitante não acessa /gestao — redireciona para /dashboard', async ({ page }) => {
    await login(page, 'solicitante');
    await page.goto('/gestao');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('Solicitante não acessa /relatorios/imr — redireciona para /dashboard', async ({ page }) => {
    await login(page, 'solicitante');
    await page.goto('/relatorios/imr');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('Técnico não acessa /gestao — redireciona para /dashboard', async ({ page }) => {
    await login(page, 'tecnico');
    await page.goto('/gestao');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('Técnico não acessa /relatorios/imr — redireciona para /dashboard', async ({ page }) => {
    await login(page, 'tecnico');
    await page.goto('/relatorios/imr');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('Preposto não acessa /relatorios/imr — redireciona para /dashboard', async ({ page }) => {
    await login(page, 'preposto');
    await page.goto('/relatorios/imr');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('Preposto acessa /gestao com sucesso', async ({ page }) => {
    await login(page, 'preposto');
    await page.goto('/gestao');
    await expect(page).toHaveURL(/\/gestao/);
  });

  test('Admin acessa /gestao com sucesso', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/gestao');
    await expect(page).toHaveURL(/\/gestao/);
  });

  test('Admin acessa /relatorios/imr com sucesso', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/relatorios/imr');
    await expect(page).toHaveURL(/\/relatorios\/imr/);
  });

  test('Técnico acessa /chamados-atribuidos com sucesso', async ({ page }) => {
    await login(page, 'tecnico');
    await page.goto('/chamados-atribuidos');
    await expect(page).toHaveURL(/\/chamados-atribuidos/);
  });

  test('Solicitante não acessa /chamados-atribuidos — redireciona', async ({ page }) => {
    await login(page, 'solicitante');
    await page.goto('/chamados-atribuidos');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
