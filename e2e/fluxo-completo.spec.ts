import { expect, test } from '@playwright/test';

import { login } from './fixtures/auth';

/**
 * Fluxo completo do ciclo de vida de um chamado:
 * aberto → validado → em atendimento → concluído → encerrado
 *
 * Usa test.describe.serial para garantir ordem dos passos.
 * IMPORTANTE: requer que o seed tenha sido executado (users, SLA configs, catálogo).
 */
test.describe.serial('Fluxo completo: abrir → classificar → atribuir → executar → encerrar', () => {
  const ticketTitle = `E2E completo ${Date.now()}`;

  test('1. Solicitante abre chamado', async ({ page }) => {
    await login(page, 'solicitante');
    await page.goto('/meus-chamados');

    await page.getByRole('button', { name: /novo chamado/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByPlaceholder(/local exato/i).fill('Sala 301 - E2E');
    await dialog.getByText('Manutenção Predial').click();
    await dialog.getByPlaceholder(/descreva/i).fill(ticketTitle);
    await dialog.getByText('Padrão').first().click();

    await dialog.getByRole('button', { name: /abrir chamado|enviar|criar/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByText(ticketTitle)).toBeVisible({ timeout: 10000 });
  });

  test('2. Preposto classifica chamado (define prioridade e SLA)', async ({ page }) => {
    await login(page, 'preposto');
    await page.goto('/gestao');

    // Localiza o chamado
    await expect(page.getByText(ticketTitle)).toBeVisible({ timeout: 15000 });
    await page.getByText(ticketTitle).click();

    // Abre dialog de classificação
    const classificarBtn = page.getByRole('button', { name: /classificar/i });
    await expect(classificarBtn).toBeVisible({ timeout: 5000 });
    await classificarBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Seleciona prioridade NORMAL
    await dialog.getByText('NORMAL').click();

    // Confirma
    await dialog.getByRole('button', { name: /confirmar|classificar|salvar/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
  });

  test('3. Preposto atribui chamado a técnico', async ({ page }) => {
    await login(page, 'preposto');
    await page.goto('/gestao');

    // Aguarda recarregar — chamado deve estar em "validado"
    await expect(page.getByText(ticketTitle)).toBeVisible({ timeout: 15000 });
    await page.getByText(ticketTitle).click();

    // Abre dialog de atribuição
    const atribuirBtn = page.getByRole('button', { name: /atribuir/i });
    await expect(atribuirBtn).toBeVisible({ timeout: 5000 });
    await atribuirBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Confirma atribuição (pode ter seleção automática de técnico)
    await dialog.getByRole('button', { name: /confirmar|atribuir|salvar/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
  });

  test('4. Técnico registra execução', async ({ page }) => {
    await login(page, 'tecnico');
    await page.goto('/chamados-atribuidos');

    // Localiza o chamado atribuído
    await expect(page.getByText(ticketTitle)).toBeVisible({ timeout: 15000 });
    await page.getByText(ticketTitle).click();

    // Abre formulário de execução
    const executarBtn = page.getByRole('button', { name: /registrar|execução|concluir/i });
    await expect(executarBtn).toBeVisible({ timeout: 5000 });
    await executarBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Preenche descrição do serviço
    const descField = dialog.getByPlaceholder(/descreva|serviço|executado/i);
    if (await descField.isVisible()) {
      await descField.fill('Lâmpada substituída com sucesso - teste E2E');
    } else {
      // Tenta textarea
      await dialog.locator('textarea').first().fill('Lâmpada substituída com sucesso - teste E2E');
    }

    // Confirma execução
    await dialog.getByRole('button', { name: /confirmar|registrar|salvar|concluir/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
  });

  test('5. Preposto encerra chamado', async ({ page }) => {
    await login(page, 'preposto');
    await page.goto('/gestao');

    // Localiza chamado concluído
    await expect(page.getByText(ticketTitle)).toBeVisible({ timeout: 15000 });
    await page.getByText(ticketTitle).click();

    // Abre dialog de encerramento
    const encerrarBtn = page.getByRole('button', { name: /encerrar/i });
    await expect(encerrarBtn).toBeVisible({ timeout: 5000 });
    await encerrarBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Confirma encerramento
    await dialog.getByRole('button', { name: /confirmar|encerrar|salvar/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
  });

  test('6. Solicitante vê chamado encerrado', async ({ page }) => {
    await login(page, 'solicitante');
    await page.goto('/meus-chamados');

    // Localiza o chamado
    await expect(page.getByText(ticketTitle)).toBeVisible({ timeout: 15000 });

    // Verifica que tem indicação de encerrado
    const ticketCard = page.getByText(ticketTitle).locator('..');
    await expect(ticketCard.locator('..').getByText(/encerrado/i)).toBeVisible({ timeout: 5000 });
  });
});
