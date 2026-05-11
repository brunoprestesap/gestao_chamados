import { expect, test } from '@playwright/test';

import { login } from './fixtures/auth';
import { selectFirstSubtypeAndCatalogService } from './fixtures/new-ticket-dialog';

test.describe('Criação de chamado', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'solicitante');
    await page.goto('/meus-chamados');
  });

  test('abre dialog de novo chamado, preenche e submete com sucesso', async ({ page }) => {
    // Local exato único permite localizar o chamado na lista após criar.
    // O título é auto-gerado pela API (`${tipoServico} — ${localExato}`).
    const localExato = `Sala E2E Criar ${Date.now()}`;

    // Abre o dialog
    await page.getByRole('button', { name: /novo chamado/i }).click();

    // Aguarda o dialog abrir
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Seleciona unidade/setor
    await dialog.getByRole('combobox', { name: /unidade/i }).click();
    await page.getByRole('option').first().click();

    // Preenche local exato
    await dialog.getByLabel(/local exato/i).fill(localExato);

    // Seleciona tipo de serviço (botões de card)
    await dialog.getByText('Manutenção Predial').click();
    await selectFirstSubtypeAndCatalogService(page, dialog);

    // Preenche descrição
    await dialog.getByPlaceholder(/descreva/i).fill('Lâmpada queimada no corredor principal');

    // Seleciona natureza (Padrão deve estar selecionável)
    await dialog.getByText('Padrão').first().click();

    // Submete
    await dialog.getByRole('button', { name: /abrir chamado|enviar|criar/i }).click();

    // Dialog deve fechar após sucesso
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // Chamado deve aparecer na lista — verificamos pela coluna "Título" da tabela,
    // que contém o título auto-gerado ("Manutenção Predial — Sala E2E Criar <ts>").
    await expect(
      page.getByRole('row').filter({ hasText: localExato }).first(),
    ).toBeVisible({
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
