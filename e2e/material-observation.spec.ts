/**
 * Testes E2E — Observação de Material
 *
 * Cobre o fluxo de um técnico registrando observação de material necessário
 * em um chamado em atendimento, e verifica visibilidade para solicitante e preposto.
 *
 * PRÉ-REQUISITOS
 * ──────────────
 * 1. Servidor rodando em localhost:3000 (ou E2E_BASE_URL).
 * 2. Seed executado: `node scripts/seed.js`
 * 3. Usuários E2E provisionados (global-setup cria automaticamente):
 *    admin / preposto / tecnico / solicitante  (senha: 123456)
 */

import { expect, test } from '@playwright/test';

import { selectFirstEligibleTechnicianAndAtribuir } from './fixtures/atribuir-dialog';
import { login } from './fixtures/auth';
import { selectFinalPriorityInClassificarDialog } from './fixtures/classificar-dialog';
import {
  gestaoChamadoCard,
  gestaoOpenDetailSheetFromRow,
  gestaoRowAtribuirButton,
} from './fixtures/gestao';
import {
  clickChamadosAtribuidosRowOpenDetail,
  gotoChamadosAtribuidosReady,
  gotoGestaoChamadosReady,
} from './fixtures/navigation';
import { selectFirstSubtypeAndCatalogService } from './fixtures/new-ticket-dialog';

// ---------------------------------------------------------------------------
// Helpers locais
// ---------------------------------------------------------------------------

const MATERIAL_TEXT = 'Necessário 5 lâmpadas fluorescentes T8 de 32W para corredor do 3º andar';

/**
 * Cria um chamado como solicitante, classifica como preposto e atribui ao técnico.
 * Retorna o título único do chamado criado.
 */
async function criarChamadoEmAtendimento(page: Parameters<typeof login>[0]): Promise<string> {
  const titulo = `E2E Material ${Date.now()}`;

  // 1. Solicitante abre chamado
  await login(page, 'solicitante');
  await page.goto('/meus-chamados');
  await page.getByRole('button', { name: /novo chamado/i }).click();

  const novoDialog = page.getByRole('dialog');
  await expect(novoDialog).toBeVisible();
  await novoDialog.getByRole('combobox', { name: /unidade/i }).click();
  await page.getByRole('option').first().click();
  // titulo no localExato torna o título auto-gerado localizável via gestaoChamadoCard.
  await novoDialog.getByLabel(/local exato/i).fill(titulo);
  await novoDialog.getByText('Manutenção Predial').click();
  await selectFirstSubtypeAndCatalogService(page, novoDialog);
  await novoDialog.getByPlaceholder(/descreva/i).fill(titulo);
  await novoDialog.getByText('Padrão').first().click();
  await novoDialog.getByRole('button', { name: /abrir chamado|enviar|criar/i }).click();
  await expect(novoDialog).not.toBeVisible({ timeout: 15000 });

  // 2. Preposto classifica e atribui
  await login(page, 'preposto');
  await gotoGestaoChamadosReady(page);

  // Classificar — clicar no botão diretamente no card Kanban
  const card = gestaoChamadoCard(page, titulo);
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole('button', { name: /classificar/i }).click();

  const classDialog = page.getByRole('dialog');
  await expect(classDialog).toBeVisible();
  await selectFinalPriorityInClassificarDialog(page, classDialog, 'Normal');
  // Aguardar botão de submit estar habilitado e clicar
  const submitBtn = classDialog.getByRole('button', { name: /^classificar chamado$/i });
  await expect(submitBtn).toBeEnabled({ timeout: 10000 });
  await submitBtn.click();
  await expect(classDialog).not.toBeVisible({ timeout: 30000 });

  // Atribuir — clicar no botão diretamente no card Kanban
  const card2 = gestaoChamadoCard(page, titulo);
  await expect(card2).toBeVisible({ timeout: 15000 });
  await gestaoRowAtribuirButton(card2).click();

  const atribDialog = page.getByRole('dialog');
  await expect(atribDialog).toBeVisible();
  await selectFirstEligibleTechnicianAndAtribuir(atribDialog);
  await expect(atribDialog).not.toBeVisible({ timeout: 30000 });

  return titulo;
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

test.describe.serial('Observação de Material', () => {
  let titulo: string;

  test('setup — criar chamado em atendimento', async ({ page }) => {
    test.setTimeout(120000);
    titulo = await criarChamadoEmAtendimento(page);
  });

  test('técnico registra observação de material', async ({ page }) => {
    await login(page, 'tecnico');
    await gotoChamadosAtribuidosReady(page);
    await clickChamadosAtribuidosRowOpenDetail(page, titulo);
    await page.waitForURL(/\/chamados-atribuidos\/[^/?#]+$/, {
      timeout: 30000,
      waitUntil: 'commit',
    });
    await expect(page.getByText(titulo).last()).toBeVisible({ timeout: 15000 });

    // Clicar no botão "Observação de Material"
    const materialBtn = page.getByRole('button', { name: /observação de material/i });
    await expect(materialBtn.first()).toBeVisible({ timeout: 10000 });
    await materialBtn.first().click();

    // Preencher o dialog
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Verificar título do dialog
    await expect(dialog.getByText('Observação de Material')).toBeVisible();

    // Verificar banner informativo
    await expect(dialog.getByText(/status do chamado não será alterado/i)).toBeVisible();

    // Preencher textarea
    await dialog.getByRole('textbox').fill(MATERIAL_TEXT);

    // Submeter
    await dialog.getByRole('button', { name: /registrar observação/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 15000 });

    // Verificar que o chamado continua em atendimento
    await expect(page.getByText(/em atendimento/i).first()).toBeVisible({ timeout: 10000 });

    // Verificar seção "Material Necessário" aparece
    await expect(page.getByText('Material Necessário').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(MATERIAL_TEXT).first()).toBeVisible();
  });

  test('solicitante visualiza a observação de material', async ({ page }) => {
    await login(page, 'solicitante');

    await page.goto('/meus-chamados', { waitUntil: 'load' });
    const filtered = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        r.url().includes('/api/meus-chamados') &&
        !r.url().includes('/comments') &&
        r.url().includes('q=') &&
        r.ok(),
      { timeout: 30000 },
    );
    await page.getByRole('textbox', { name: /buscar chamados/i }).fill(titulo);
    const resp = await filtered;
    const data = await resp.json();
    const chamado = (data.items ?? []).find((c: { titulo: string }) => c.titulo?.includes(titulo));
    expect(chamado).toBeTruthy();

    // Navegar direto para a página de detalhe
    await page.goto(`/meus-chamados/${chamado!._id}`);

    // Verificar seção "Material Necessário" visível para solicitante
    await expect(page.getByText('Material Necessário').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(MATERIAL_TEXT).first()).toBeVisible();
  });

  test('preposto visualiza a observação de material no Sheet', async ({ page }) => {
    await login(page, 'preposto');
    await gotoGestaoChamadosReady(page);

    // Clicar no card do chamado para abrir o Sheet
    const card = gestaoChamadoCard(page, titulo);
    await expect(card).toBeVisible({ timeout: 15000 });
    await gestaoOpenDetailSheetFromRow(card);

    // Verificar seção "Material Necessário" visível no Sheet
    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible({ timeout: 10000 });
    await expect(sheet.getByText('Material Necessário')).toBeVisible({ timeout: 10000 });
    await expect(sheet.getByText(MATERIAL_TEXT)).toBeVisible();
  });

  test('observação aparece no histórico do chamado', async ({ page }) => {
    await login(page, 'tecnico');
    await gotoChamadosAtribuidosReady(page);
    await clickChamadosAtribuidosRowOpenDetail(page, titulo);
    await page.waitForURL(/\/chamados-atribuidos\/[^/?#]+$/, {
      timeout: 30000,
      waitUntil: 'commit',
    });

    // Verificar que o histórico contém a ação "Observação de Material"
    await expect(page.getByText('Observação de Material').first()).toBeVisible({ timeout: 15000 });
  });
});

// ---------------------------------------------------------------------------
// Validação de formulário
// ---------------------------------------------------------------------------

test.describe.serial('Observação de Material — validação', () => {
  let titulo: string;

  test('setup — criar chamado em atendimento', async ({ page }) => {
    test.setTimeout(120000);
    titulo = await criarChamadoEmAtendimento(page);
  });

  test('não permite submeter descrição curta demais', async ({ page }) => {
    await login(page, 'tecnico');
    await gotoChamadosAtribuidosReady(page);
    await clickChamadosAtribuidosRowOpenDetail(page, titulo);
    await page.waitForURL(/\/chamados-atribuidos\/[^/?#]+$/, {
      timeout: 30000,
      waitUntil: 'commit',
    });
    await expect(page.getByText(titulo).last()).toBeVisible({ timeout: 15000 });

    const materialBtn = page.getByRole('button', { name: /observação de material/i });
    await materialBtn.first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Preencher com texto curto
    await dialog.getByRole('textbox').fill('curto');

    // Submeter
    await dialog.getByRole('button', { name: /registrar observação/i }).click();

    // Dialog deve permanecer aberto com erro de validação
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/mínimo/i)).toBeVisible({ timeout: 5000 });
  });
});
