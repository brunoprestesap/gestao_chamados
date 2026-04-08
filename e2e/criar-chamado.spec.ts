import { expect, test } from '@playwright/test';

import { login } from './fixtures/auth';

test.describe('Criação de chamado', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'solicitante');
    await page.goto('/meus-chamados');
  });

  test('abre dialog de novo chamado, preenche e submete com sucesso', async ({ page }) => {
    // Abre o dialog
    await page.getByRole('button', { name: /novo chamado/i }).click();

    // Aguarda o dialog abrir
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Preenche local exato
    await dialog.getByPlaceholder(/local exato/i).fill('Sala 101 - Bloco A');

    // Seleciona tipo de serviço (botões de card)
    await dialog.getByText('Manutenção Predial').click();

    // Preenche descrição
    await dialog.getByPlaceholder(/descreva/i).fill('Lâmpada queimada no corredor principal');

    // Seleciona natureza (Padrão deve estar selecionável)
    await dialog.getByText('Padrão').first().click();

    // Submete
    await dialog.getByRole('button', { name: /abrir chamado|enviar|criar/i }).click();

    // Dialog deve fechar após sucesso
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // Chamado deve aparecer na lista (aguarda recarregar)
    await expect(page.getByText('Lâmpada queimada no corredor principal')).toBeVisible({
      timeout: 10000,
    });
  });

  test('validação impede submissão sem campos obrigatórios', async ({ page }) => {
    await page.getByRole('button', { name: /novo chamado/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Tenta submeter sem preencher nada
    await dialog.getByRole('button', { name: /abrir chamado|enviar|criar/i }).click();

    // Dialog deve permanecer aberto (validação bloqueou)
    await expect(dialog).toBeVisible();
  });
});
