import { expect, type Page } from '@playwright/test';

/** Credenciais dos usuários do seed (scripts/seed.js). Senha padrão: 123456 */
export const USERS = {
  admin: { username: 'admin', password: '123456', role: 'Admin' },
  preposto: { username: 'preposto01', password: '123456', role: 'Preposto' },
  tecnico: { username: 'tecnico01', password: '123456', role: 'Técnico' },
  solicitante: { username: 'solicitante01', password: '123456', role: 'Solicitante' },
  solicitante2: { username: 'solicitante02', password: '123456', role: 'Solicitante' },
} as const;

export type UserKey = keyof typeof USERS;

/**
 * Faz login via UI preenchendo o formulário em /login.
 * Aguarda redirect para /dashboard (ou callbackUrl).
 */
export async function login(page: Page, user: UserKey) {
  const { username, password } = USERS[user];
  await page.goto('/login');
  await page.getByPlaceholder('Ex: ap20256').fill(username);
  await page.getByPlaceholder('Sua senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Aguarda navegação para fora do /login
  await expect(page).not.toHaveURL(/\/login/);
}

/**
 * Verifica que o usuário está na área logada (dashboard shell visível).
 */
export async function expectLoggedIn(page: Page) {
  await expect(page).toHaveURL(/\/(dashboard|meus-chamados|gestao|chamados-atribuidos)/);
}

/**
 * Faz logout clicando no botão de sair na sidebar/menu.
 */
export async function logout(page: Page) {
  // Em mobile pode ser necessário abrir o menu primeiro
  const logoutButton = page.getByRole('button', { name: /sair/i });
  if (await logoutButton.isVisible()) {
    await logoutButton.click();
  }
  await expect(page).toHaveURL(/\/login/);
}
