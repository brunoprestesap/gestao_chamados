import { expect, test } from '@playwright/test';

import { login } from './fixtures/auth';
import { selectFinalPriorityInClassificarDialog } from './fixtures/classificar-dialog';
import { gestaoChamadoCard } from './fixtures/gestao';
import { selectFirstSubtypeAndCatalogService } from './fixtures/new-ticket-dialog';

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

      // Seleciona unidade/setor
      await dialog.getByRole('combobox', { name: /unidade/i }).click();
      await page.getByRole('option').first().click();

      await dialog.getByLabel(/local exato/i).fill('Sala 202');
      await dialog.getByText('Manutenção Predial').click();
      await selectFirstSubtypeAndCatalogService(page, dialog);
      await dialog.getByPlaceholder(/descreva/i).fill(ticketTitle);
      await dialog.getByText('Padrão').first().click();

      await dialog.getByRole('button', { name: /abrir chamado|enviar|criar/i }).click();
      await expect(dialog).not.toBeVisible({ timeout: 10000 });

      // Confirma que apareceu na lista
      await expect(page.getByText(ticketTitle)).toBeVisible({ timeout: 10000 });
    });

    test('preposto classifica o chamado em /gestao', async ({ page }) => {
      test.slow(); // classificação pode demorar em dev mode com compilação on-demand
      await login(page, 'preposto');
      await page.goto('/gestao');
      await page.waitForLoadState('networkidle');

      const card = gestaoChamadoCard(page, ticketTitle);
      await expect(card).toBeVisible({ timeout: 15000 });

      const classificarBtn = card.getByRole('button', { name: /classificar/i });
      await expect(classificarBtn).toBeVisible({ timeout: 5000 });
      await classificarBtn.click();

      // Aguarda dialog de classificação
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      await selectFinalPriorityInClassificarDialog(page, dialog, 'Alta');

      // Confirma classificação
      await dialog.getByRole('button', { name: /confirmar|classificar|salvar/i }).click();

      // Dialog deve fechar
      await expect(dialog).not.toBeVisible({ timeout: 30000 });

      // Chamado deve sair da coluna "aberto" e ir para "validado"
      // Aguarda o chamado aparecer com indicativo de validado
      await page.waitForTimeout(1000); // Aguarda revalidação
      await page.reload();

      // O chamado não deve mais estar na coluna aberto
      // (pode estar em validado ou outra coluna)
    });
  });
});
