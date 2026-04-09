import { expect, type Page } from '@playwright/test';

/**
 * Credenciais dos usuários do seed (scripts/seed.js). Senha padrão: 123456.
 * IMPORTANTE: Execute o seed antes de rodar os testes E2E:
 *   node scripts/seed.js
 */
export const USERS = {
  admin: { username: 'admin', password: '123456', role: 'Admin' },
  preposto: { username: 'preposto', password: '123456', role: 'Preposto' },
  tecnico: { username: 'tecnico', password: '123456', role: 'Técnico' },
  solicitante: { username: 'solicitante', password: '123456', role: 'Solicitante' },
} as const;

export type UserKey = keyof typeof USERS;

/**
 * Faz login via UI preenchendo o formulário em /login.
 * Aguarda redirect para /dashboard (ou callbackUrl).
 *
 * Se falhar, verifica se há mensagem de erro visível e dá uma mensagem clara
 * (geralmente significa que o seed não foi executado).
 */
export async function login(page: Page, user: UserKey) {
  const { username, password } = USERS[user];
  await page.goto('/login');
  await page.getByPlaceholder('Ex: ap20256').fill(username);
  await page.getByPlaceholder('Sua senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // Aguarda navegação ou erro. O login bem-sucedido redireciona via Server Action.
  try {
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  } catch {
    // Se ficou em /login, verifica se há erro de credenciais
    const errorAlert = page.locator('[role="alert"][aria-live="polite"]');
    if (await errorAlert.isVisible()) {
      const errorText = await errorAlert.textContent();
      throw new Error(
        `Login falhou para "${username}": ${errorText}\n` +
          'Verifique se o seed foi executado: node scripts/seed.js',
      );
    }
    throw new Error(
      `Login não redirecionou para "${username}". ` +
        'Verifique se a app está rodando e o seed foi executado.',
    );
  }
}

/**
 * Verifica que o usuário está na área logada (dashboard shell visível).
 */
export async function expectLoggedIn(page: Page) {
  await expect(page).toHaveURL(/\/(dashboard|meus-chamados|gestao|chamados-atribuidos)/);
}
