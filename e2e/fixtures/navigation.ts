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
 * Aguarda o GET `/api/chamados-atribuidos` com `q === trimmed` (debounce ~300 ms).
 * Não lê `response.json()` aqui — o Playwright consumiria o corpo antes do `fetch` da página terminar de parsear.
 * Depois da espera use `expect` na linha/card da UI (timeout) para garantir resultado não vazio.
 */
export async function waitChamadosAtribuidosSearchApplied(
  page: Page,
  qRaw: string,
  timeout = 45000,
): Promise<void> {
  const trimmed = qRaw.trim();

  await page.waitForResponse(
    (r) => {
      if (r.request().method() !== 'GET' || !r.url().includes('/api/chamados-atribuidos')) {
        return false;
      }
      if (!r.ok()) return false;
      try {
        return new URL(r.url()).searchParams.get('q') === trimmed;
      } catch {
        return false;
      }
    },
    { timeout },
  );
}

/**
 * `/chamados-atribuidos` — aguarda o GET da lista antes de localizar cards.
 */
export async function gotoChamadosAtribuidosReady(page: Page, timeout = 45000): Promise<void> {
  const resp = page.waitForResponse(
    (r) => r.request().method() === 'GET' && r.url().includes('/api/chamados-atribuidos') && r.ok(),
    { timeout },
  );
  await page.goto('/chamados-atribuidos', { waitUntil: 'load' });
  await expect(page.getByRole('heading', { name: /chamados atribuídos/i })).toBeVisible({
    timeout: 15000,
  });
  await resp;
}

/**
 * Tabela em /chamados-atribuidos: usa a busca (`q`) para achar o chamado mesmo fora da página 1,
 * depois abre o detalhe. `tr.click({ force: true })` evita intercept do header/sidebar.
 */
export async function clickChamadosAtribuidosRowOpenDetail(
  page: Page,
  rowTextFragment: string,
): Promise<void> {
  const busca = page.getByRole('textbox', { name: /buscar chamados/i });
  const trimmed = rowTextFragment.trim();
  const listReady = waitChamadosAtribuidosSearchApplied(page, trimmed);
  await busca.fill(trimmed);
  await listReady;

  // Desktop: tabela com role row. Mobile (md:hidden): cards com título em <h3>.
  const linha = page.getByRole('row').filter({ hasText: trimmed }).first();
  const mobileTitulo = page.getByRole('heading', { level: 3 }).filter({ hasText: trimmed }).first();
  const alvo = linha.or(mobileTitulo);
  await expect(alvo).toBeVisible({ timeout: 45000 });
  await alvo.click({ force: true });
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
