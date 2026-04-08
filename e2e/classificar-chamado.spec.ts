import { expect, test } from '@playwright/test';

import { login } from './fixtures/auth';

test.describe('Classificação de chamado', () => {
  // Este teste depende de um chamado com status "aberto" existir.
  // O seed cria os dados base, mas um chamado precisa ser criado antes.
  // Usamos test.describe.serial para garantir ordem.

  let ticketTitle: string;

  test.describe.serial('fluxo classificação + SLA', () => {
    test('solicitante cria chamado', async ({ page }) => {
      await login(page, 'solicitante');
      await page.goto('/meus-chamados');

      ticketTitle = `Teste classificação ${Date.now()}`;

      await page.getByRole('button', { name: /novo chamado/i }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      await dialog.getByPlaceholder(/local exato/i).fill('Sala 202');
      await dialog.getByText('Manutenção Predial').click();
      await dialog.getByPlaceholder(/descreva/i).fill(ticketTitle);
      await dialog.getByText('Padrão').first().click();

      await dialog.getByRole('button', { name: /abrir chamado|enviar|criar/i }).click();
      await expect(dialog).not.toBeVisible({ timeout: 10000 });

      // Confirma que apareceu na lista
      await expect(page.getByText(ticketTitle)).toBeVisible({ timeout: 10000 });
    });

    test('preposto classifica o chamado em /gestao', async ({ page }) => {
      await login(page, 'preposto');
      await page.goto('/gestao');

      // Aguarda a página carregar e procura o chamado na coluna "aberto"
      await expect(page.getByText(ticketTitle)).toBeVisible({ timeout: 15000 });

      // Clica no card do chamado para abrir detalhes/ações
      await page.getByText(ticketTitle).click();

      // Procura bot��o de classificar
      const classificarBtn = page.getByRole('button', { name: /classificar/i });
      await expect(classificarBtn).toBeVisible({ timeout: 5000 });
      await classificarBtn.click();

      // Aguarda dialog de classificação
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // Seleciona prioridade ALTA
      await dialog.getByText('ALTA').click();

      // Confirma classificação
      await dialog.getByRole('button', { name: /confirmar|classificar|salvar/i }).click();

      // Dialog deve fechar
      await expect(dialog).not.toBeVisible({ timeout: 10000 });

      // Chamado deve sair da coluna "aberto" e ir para "validado"
      // Aguarda o chamado aparecer com indicativo de validado
      await page.waitForTimeout(1000); // Aguarda revalidação
      await page.reload();

      // O chamado não deve mais estar na coluna aberto
      // (pode estar em validado ou outra coluna)
    });
  });
});
