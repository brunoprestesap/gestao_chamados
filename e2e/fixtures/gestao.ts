import type { Page } from '@playwright/test';

/**
 * Card de chamado no Kanban de /gestao (shadcn Card com data-slot="card").
 *
 * A página renderiza cards duplicados: mobile (md:hidden, DOM primeiro)
 * e desktop (hidden md:flex, DOM segundo). No viewport padrão do Playwright
 * (1280x720 = desktop), o card mobile fica hidden.
 * Usa `.last()` para pegar o card do container desktop (visível).
 */
export function gestaoChamadoCard(page: Page, textFragment: string) {
  return page.locator('[data-slot="card"]').filter({ hasText: textFragment }).last();
}
