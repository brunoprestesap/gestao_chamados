import { expect, test } from '@playwright/test';

import { login } from './fixtures/auth';
test.describe('Chamados Atribuídos — Listagem', () => {
  test('deve aplicar filtro por status sem quebrar a listagem', async ({ page }) => {
    await login(page, 'tecnico');
    await page.goto('/chamados-atribuidos');
    await page.waitForLoadState('networkidle');

    // StatusMultiSelect: botão "Todos os status" + checkboxes no popover (não é combobox).
    await page
      .getByRole('button', { name: /todos os status/i })
      .first()
      .click();
    const statusPopover = page.locator('[data-slot="popover-content"]');
    await statusPopover.getByText('Em atendimento', { exact: true }).click();
    await page.keyboard.press('Escape');

    // /chamados-atribuidos foi revitalizada para tabela: linhas têm role="row".
    // Filtra somente linhas do body (excluindo header) usando hasText do badge "Em atendimento".
    const linhasFiltradas = page.getByRole('row').filter({ hasText: /em atendimento/i });
    const vazio = page.getByText(/nenhum chamado atribuído|nenhum resultado encontrado/i).first();
    await expect(linhasFiltradas.first().or(vazio)).toBeVisible({ timeout: 15000 });
  });

  test('deve buscar termo inexistente e mostrar empty state filtrado', async ({ page }) => {
    await login(page, 'tecnico');
    await page.goto('/chamados-atribuidos');
    await page.waitForLoadState('networkidle');

    const busca = page.getByRole('textbox', { name: /buscar chamados/i }).first();
    await busca.fill(`__sem_resultado__${Date.now()}`);

    await expect(page.getByText(/nenhum resultado encontrado/i).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('button', { name: /limpar filtros/i }).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test('deve abrir detalhe ao clicar em card visível quando existir resultado', async ({
    page,
  }) => {
    await login(page, 'tecnico');
    await page.goto('/chamados-atribuidos');
    await page.waitForLoadState('networkidle');

    // /chamados-atribuidos é tabela: getByRole('row') casa todas as rows (header + data).
    // Filtramos pelo conteúdo da coluna "Em atendimento" para excluir o header.
    const dataRows = page.getByRole('row').filter({ hasText: /em atendimento/i });
    if ((await dataRows.count()) === 0) {
      test.skip(true, 'Sem chamados visíveis para validar navegação ao detalhe.');
      return;
    }

    const primeiraLinha = dataRows.first();
    await expect(primeiraLinha).toBeVisible({ timeout: 10000 });
    await primeiraLinha.getByRole('cell').first().click({ force: true });
    await page.waitForURL(/\/chamados-atribuidos\/.+/, { timeout: 10000 });
    // Página de detalhe: h1 com número + seção de descrição (UI revitalizada)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: /descrição do problema/i })).toBeVisible({
      timeout: 10000,
    });
  });
});
