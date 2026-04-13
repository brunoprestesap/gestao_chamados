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
 * Se já estiver logado (redirect automático ao acessar /login), trata
 * fazendo logout primeiro e reentrando com as credenciais corretas.
 */
export async function login(page: Page, user: UserKey) {
  const { username, password } = USERS[user];

  // Limpa cookies para garantir sessão limpa (evita redirect de /login)
  await page.context().clearCookies();

  await page.goto('/login', { waitUntil: 'load' });

  // Aguarda o campo de matrícula aparecer e ficar editável.
  // Usa .first() porque o React pode renderizar o input duplicado
  // momentaneamente durante a hidratação.
  const usernameField = page.getByPlaceholder('Ex: ap20256').first();
  await usernameField.waitFor({ state: 'visible', timeout: 15000 });

  await usernameField.fill(username);
  const passwordField = page.getByPlaceholder('Sua senha').first();
  await passwordField.waitFor({ state: 'visible', timeout: 15000 });
  await passwordField.fill(password);
  await page.getByRole('button', { name: 'Entrar' }).first().click();

  // Aguarda navegação ou erro. O login bem-sucedido redireciona via Server Action.
  try {
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  } catch {
    if (page.isClosed()) {
      throw new Error(
        `Login para "${username}": página/contexto fechado (timeout global do teste ou runner encerrou o browser).`,
      );
    }
    // Se ficou em /login, verifica se há erro de credenciais
    const errorAlert = page.locator('[role="alert"][aria-live="polite"]');
    if (await errorAlert.isVisible().catch(() => false)) {
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
