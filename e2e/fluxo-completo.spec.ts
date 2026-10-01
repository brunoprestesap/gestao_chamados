import { expect, test } from '@playwright/test';

import { selectFirstEligibleTechnicianAndAtribuir } from './fixtures/atribuir-dialog';
import { login } from './fixtures/auth';
import { selectFinalPriorityInClassificarDialog } from './fixtures/classificar-dialog';
import { gestaoChamadoCard } from './fixtures/gestao';
import {
  gotoChamadosAtribuidosReady,
  gotoGestaoChamadosReady,
  waitChamadosAtribuidosSearchApplied,
} from './fixtures/navigation';
import { selectFirstSubtypeAndCatalogService } from './fixtures/new-ticket-dialog';

/**
 * Fluxo completo do ciclo de vida de um chamado:
 * aberto → validado → em atendimento → concluído → encerrado (pela avaliação, spec 0010)
 *
 * Usa test.describe.serial para garantir ordem dos passos.
 * IMPORTANTE: requer que o seed tenha sido executado (users, SLA configs, catálogo).
 */
test.describe.serial('Fluxo completo: abrir → classificar → atribuir → executar → avaliar', () => {
  test.describe.configure({ timeout: 90_000 });
  const ticketTitle = `E2E completo ${Date.now()}`;

  test('1. Solicitante abre chamado', async ({ page }) => {
    await login(page, 'solicitante');
    await page.goto('/meus-chamados');

    await page.getByRole('button', { name: /novo chamado/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Seleciona unidade/setor
    await dialog.getByRole('combobox', { name: /unidade/i }).click();
    await page.getByRole('option').first().click();

    // Usa ticketTitle como localExato — garante que o título auto-gerado
    // (`${tipoServico} — ${localExato}`) seja localizável nos steps subsequentes
    // (gestaoChamadoCard filtra por hasText no título da linha).
    await dialog.getByLabel(/local exato/i).fill(ticketTitle);
    await dialog.getByText('Manutenção Predial').click();
    await selectFirstSubtypeAndCatalogService(page, dialog);
    await dialog.getByPlaceholder(/descreva/i).fill(ticketTitle);
    await dialog.getByText('Padrão').first().click();

    await dialog.getByRole('button', { name: /abrir chamado|enviar|criar/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 15000 });
    // Localiza pela linha da tabela contendo o ticketTitle no título auto-gerado.
    await expect(page.getByRole('row').filter({ hasText: ticketTitle }).first()).toBeVisible({
      timeout: 15000,
    });
  });

  test('2. Preposto classifica chamado (define prioridade e SLA)', async ({ page }) => {
    await login(page, 'preposto');
    await gotoGestaoChamadosReady(page);

    // Localiza o chamado
    const card2 = gestaoChamadoCard(page, ticketTitle);
    await expect(card2).toBeVisible({ timeout: 15000 });
    const classificarBtn = card2.getByRole('button', { name: /classificar/i });
    await expect(classificarBtn).toBeVisible({ timeout: 5000 });
    await classificarBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await selectFinalPriorityInClassificarDialog(page, dialog, 'Normal');

    // Confirma
    await dialog.getByRole('button', { name: /confirmar|classificar|salvar/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 30000 });
  });

  test('3. Preposto atribui chamado a técnico', async ({ page }) => {
    await login(page, 'preposto');
    await page.goto('/gestao');

    // Aguarda recarregar — chamado deve estar em "validado"
    const card3 = gestaoChamadoCard(page, ticketTitle);
    await expect(card3).toBeVisible({ timeout: 15000 });
    const atribuirBtn = card3.getByRole('button', { name: /atribuir/i });
    await expect(atribuirBtn).toBeVisible({ timeout: 5000 });
    await atribuirBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await selectFirstEligibleTechnicianAndAtribuir(dialog);
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
  });

  test('4. Técnico registra execução', async ({ page }) => {
    await login(page, 'tecnico');
    await gotoChamadosAtribuidosReady(page);

    const busca = page.getByRole('textbox', { name: /buscar chamados/i });
    const listaPronta = waitChamadosAtribuidosSearchApplied(page, ticketTitle);
    await busca.fill(ticketTitle);
    await listaPronta;

    // Após filtrar só deve existir um botão por chamado — ok em desktop ou mobile cards.
    const registrarBtn = page.getByRole('button', { name: /^registrar execução$/i }).first();
    await expect(registrarBtn).toBeVisible({ timeout: 20000 });
    await registrarBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog
      .getByLabel(/descrição do serviço executado/i)
      .fill('Lâmpada substituída com sucesso - teste E2E');

    await dialog.getByLabel(/materiais utilizados/i).fill('1x Lâmpada LED 15W, 1x Fita isolante');

    await dialog.getByLabel(/observações/i).fill('Serviço realizado sem intercorrências.');

    const submitExec = dialog.getByRole('button', { name: /^registrar e concluir$/i });
    await submitExec.scrollIntoViewIfNeeded();
    await submitExec.click({ force: true });
    await expect(dialog).not.toBeVisible({ timeout: 30000 });
  });

  test('5. Preposto não vê mais "Encerrar" (spec 0010, AC-8)', async ({ page }) => {
    await login(page, 'preposto');
    await gotoGestaoChamadosReady(page);

    const card5 = gestaoChamadoCard(page, ticketTitle);
    await expect(card5).toBeVisible({ timeout: 15000 });
    // O concluído com o prazo aberto ainda pode ser reaberto, nunca encerrado à mão.
    await expect(card5.getByRole('button', { name: /reabrir/i })).toBeVisible({ timeout: 5000 });
    await expect(card5.getByRole('button', { name: /encerrar/i })).toHaveCount(0);
  });

  test('6. Solicitante avalia dentro do prazo e o chamado encerra (spec 0010, AC-2, AC-10)', async ({
    page,
  }) => {
    await login(page, 'solicitante');
    await page.goto('/meus-chamados');

    const row = page.getByRole('row').filter({ hasText: ticketTitle }).first();
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row.getByText(/Avalie ou recuse até \d{2}\/\d{2} às \d{2}:\d{2}/)).toBeVisible();

    await row.getByRole('button', { name: /^avaliar chamado$/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /^5 estrelas$/i }).click();
    const enviar = dialog.getByRole('button', { name: /enviar avaliação/i });
    await enviar.scrollIntoViewIfNeeded();
    await enviar.click({ force: true });
    await expect(dialog).not.toBeVisible({ timeout: 30000 });

    const closedRow = page.getByRole('row').filter({ hasText: ticketTitle }).first();
    await expect(closedRow.getByText('Encerrado').first()).toBeVisible({ timeout: 15000 });
    // O encerrado é definitivo: nada de avaliar nem recusar, só "O problema voltou" (AC-11).
    await expect(closedRow.getByRole('button', { name: /^avaliar chamado$/i })).toHaveCount(0);
    await expect(closedRow.getByRole('button', { name: /o problema voltou/i })).toBeVisible();
  });
});
