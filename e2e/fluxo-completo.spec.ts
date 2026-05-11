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
 * aberto → validado → em atendimento → concluído → encerrado
 *
 * Usa test.describe.serial para garantir ordem dos passos.
 * IMPORTANTE: requer que o seed tenha sido executado (users, SLA configs, catálogo).
 */
test.describe.serial('Fluxo completo: abrir → classificar → atribuir → executar → encerrar', () => {
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

  test('5. Preposto encerra chamado', async ({ page }) => {
    await login(page, 'preposto');
    await gotoGestaoChamadosReady(page);

    // Localiza chamado concluído
    const card5 = gestaoChamadoCard(page, ticketTitle);
    await expect(card5).toBeVisible({ timeout: 15000 });
    const encerrarBtn = card5.getByRole('button', { name: /encerrar/i });
    await expect(encerrarBtn).toBeVisible({ timeout: 5000 });
    await encerrarBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Submit do encerramento (Server Action): forçar clique evita overlay/anim
    // e locator ambíguo com regex larga.
    const confirmEncerrar = dialog.getByRole('button', { name: /^encerrar$/i });
    await confirmEncerrar.scrollIntoViewIfNeeded();
    await confirmEncerrar.click({ force: true });
    await expect(dialog).not.toBeVisible({ timeout: 30000 });
  });

  test('6. Solicitante vê chamado encerrado', async ({ page }) => {
    await login(page, 'solicitante');
    await page.goto('/meus-chamados');

    // Layout revitalizado: linha de tabela em desktop. Filtrar pela linha com o título do chamado.
    const closedRow = page.getByRole('row').filter({ hasText: ticketTitle }).first();
    await expect(closedRow).toBeVisible({ timeout: 15000 });
    await expect(closedRow.getByText('Encerrado').first()).toBeVisible({ timeout: 10000 });
  });
});
