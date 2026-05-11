import { expect, test } from '@playwright/test';

import { login } from './fixtures/auth';

test.describe('Dashboard Técnico', () => {
  test('deve exibir os novos cards de métricas e seções revitalizadas', async ({ page }) => {
    await login(page, 'tecnico');
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Verifica o título do dashboard
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
    await expect(
      page.getByText(/visão geral da sua carga de trabalho e chamados atribuídos/i),
    ).toBeVisible();

    // Verifica os 4 cards de estatísticas (StatCard)
    await expect(page.getByText(/minha carga de trabalho/i).first()).toBeVisible();
    await expect(page.getByText(/em atendimento/i).first()).toBeVisible();
    await expect(page.getByText(/prontos para concluir/i).first()).toBeVisible();
    await expect(page.getByText(/concluídos \(aguardando\)/i).first()).toBeVisible();

    // Verifica a seção de Especialidades
    await expect(page.getByText(/meus serviços \/ especialidades/i).first()).toBeVisible();

    // Verifica a seção de Últimos Chamados Atribuídos
    await expect(page.getByText(/últimos chamados atribuídos/i).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /ver todos/i })).toBeVisible();
  });
});
