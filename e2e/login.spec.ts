import { expect, test } from '@playwright/test';

import { login, USERS } from './fixtures/auth';

test.describe('Login', () => {
  test('credenciais corretas redirecionam para /dashboard', async ({ page }) => {
    await login(page, 'solicitante');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('credenciais erradas exibem mensagem de erro', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Ex: ap20256').fill('solicitante01');
    await page.getByPlaceholder('Sua senha').fill('senha_errada');
    await page.getByRole('button', { name: 'Entrar' }).click();

    // Deve permanecer em /login e exibir alerta de erro
    await expect(page).toHaveURL(/\/login/);
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/incorretos/i);
  });

  test('campos vazios mostram validação', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Entrar' }).click();

    // Deve exibir mensagens de validação do formulário
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/matrícula/i)).toBeVisible();
  });

  test('login com cada role funciona', async ({ page }) => {
    for (const [key, user] of Object.entries(USERS)) {
      if (key === 'solicitante2') continue; // pular duplicata
      await page.goto('/login');
      await page.getByPlaceholder('Ex: ap20256').fill(user.username);
      await page.getByPlaceholder('Sua senha').fill(user.password);
      await page.getByRole('button', { name: 'Entrar' }).click();
      await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 });

      // Voltar para login para o próximo
      await page.goto('/login');
    }
  });

  test('redireciona para /login quando acessa rota protegida sem sessão', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
