import { expect, type Page } from '@playwright/test';

/**
 * Evita `networkidle` (pode nunca ocorrer no Next). Usa `load` + heading visível.
 */
export async function gotoWaitHeading(
  page: Page,
  path: string,
  heading: RegExp,
  timeout = 30000,
): Promise<void> {
  await page.goto(path, { waitUntil: 'load' });
  await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout });
}

/**
 * `/gestao` — aguarda também o GET da lista (cards do kanban vêm desse fetch).
 */
export async function gotoGestaoChamadosReady(page: Page, timeout = 45000): Promise<void> {
  const resp = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      r.url().includes('/api/gestao/chamados') &&
      !r.url().includes('eligible') &&
      r.ok(),
    { timeout },
  );
  await page.goto('/gestao', { waitUntil: 'load' });
  await expect(page.getByRole('heading', { name: /gestão de chamados/i })).toBeVisible({
    timeout: 15000,
  });
  await resp;
}

/**
 * `/chamados-atribuidos` — aguarda o GET da lista antes de localizar cards.
 */
export async function gotoChamadosAtribuidosReady(page: Page, timeout = 45000): Promise<void> {
  const resp = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      r.url().includes('/api/chamados-atribuidos') &&
      r.ok(),
    { timeout },
  );
  await page.goto('/chamados-atribuidos', { waitUntil: 'load' });
  await expect(page.getByRole('heading', { name: /chamados atribuídos/i })).toBeVisible({
    timeout: 15000,
  });
  await resp;
}

export async function reloadGestaoKanbanReady(page: Page, timeout = 45000): Promise<void> {
  const resp = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      r.url().includes('/api/gestao/chamados') &&
      !r.url().includes('eligible') &&
      r.ok(),
    { timeout },
  );
  await page.reload({ waitUntil: 'load' });
  await expect(page.getByRole('heading', { name: /gestão de chamados/i })).toBeVisible({
    timeout: 15000,
  });
  await resp;
}
