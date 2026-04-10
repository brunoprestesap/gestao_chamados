import type { Page } from '@playwright/test';

/**
 * Card de chamado no Kanban de /gestao (shadcn Card com data-slot="card").
 */
export function gestaoChamadoCard(page: Page, textFragment: string) {
  return page.locator('[data-slot="card"]').filter({ hasText: textFragment });
}
