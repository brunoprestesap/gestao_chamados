/**
 * Testes E2E — Fluxo de Cotação com SLA Condicional
 *
 * Cenários cobertos (permissões segregadas por role):
 * 1. Técnico tenta pausar com "Falta de Peça (Responsabilidade da Contratada)" →
 *    SISTEMA BLOQUEIA com alerta destrutivo + botão de submit desabilitado.
 * 2. Técnico **não vê** a opção "Falta de Peça (Aguardando Aprovação do Cliente)"
 *    no dropdown de pausa — apenas Preposto pode iniciar fluxo de cotação.
 * 3. Preposto (via Gestão → Sheet → Pausar) seleciona o motivo, preenche cotação
 *    e envia → chamado vai para "aguardando_terceiros" e SLA pausa.
 * 4. Admin (Gestor do Contrato) vê CotacaoApprovalCard com botões Aprovar/Recusar →
 *    aprova → chamado volta a "em atendimento".
 * 5. Preposto **não vê** botões Aprovar/Recusar (somente leitura após submeter).
 *
 * PRÉ-REQUISITOS
 * ──────────────
 * 1. Servidor rodando em localhost:3000 (ou E2E_BASE_URL).
 * 2. Seed executado: `node scripts/seed.js`.
 * 3. Usuários E2E: admin / preposto / tecnico / solicitante (senha 123456).
 *
 * NÃO EXECUTAR diretamente — requer servidor ativo.
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
import { abrirPauseDialogNaDetalhe, selecionarMotivoPausa } from './fixtures/pause-dialog';

// ---------------------------------------------------------------------------
// Helpers locais
// ---------------------------------------------------------------------------

async function criarChamadoEmAtendimento(
  page: Parameters<typeof login>[0],
  sufixo: string,
): Promise<string> {
  const titulo = `E2E Cotacao ${sufixo} ${Date.now()}`;

  await login(page, 'solicitante');
  await page.goto('/meus-chamados');
  await page.getByRole('button', { name: /novo chamado/i }).click();

  const novoDialog = page.getByRole('dialog');
  await expect(novoDialog).toBeVisible();
  await novoDialog.getByRole('combobox', { name: /unidade/i }).click();
  await page.getByRole('option').first().click();
  // titulo no localExato torna o título auto-gerado (`Manutenção Predial — <titulo>`)
  // localizável via gestaoChamadoCard (filtra row da tabela por hasText).
  await novoDialog.getByLabel(/local exato/i).fill(titulo);
  await novoDialog.getByText('Manutenção Predial').click();
  await selectFirstSubtypeAndCatalogService(page, novoDialog);
  await novoDialog.getByPlaceholder(/descreva/i).fill(titulo);
  await novoDialog.getByText('Padrão').first().click();
  await novoDialog.getByRole('button', { name: /abrir chamado|enviar|criar/i }).click();
  await expect(novoDialog).not.toBeVisible({ timeout: 15000 });

  await login(page, 'preposto');
  await gotoGestaoChamadosReady(page);

  const card = gestaoChamadoCard(page, titulo);
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole('button', { name: /classificar/i }).click();

  const classDialog = page.getByRole('dialog');
  await expect(classDialog).toBeVisible();
  await selectFinalPriorityInClassificarDialog(page, classDialog, 'Normal');
  await classDialog.getByRole('button', { name: /confirmar|classificar|salvar/i }).click();
  await expect(classDialog).not.toBeVisible({ timeout: 30000 });

  const card2 = gestaoChamadoCard(page, titulo);
  await expect(card2).toBeVisible({ timeout: 15000 });
  await gestaoRowAtribuirButton(card2).click();

  const atribDialog = page.getByRole('dialog');
  await expect(atribDialog).toBeVisible();
  await selectFirstEligibleTechnicianAndAtribuir(atribDialog);
  await expect(atribDialog).not.toBeVisible({ timeout: 30000 });

  return titulo;
}

async function navegarDetalheTecnico(
  page: Parameters<typeof login>[0],
  titulo: string,
): Promise<string> {
  await login(page, 'tecnico');
  await gotoChamadosAtribuidosReady(page);
  // /chamados-atribuidos foi revitalizada para tabela (linhas com role="row").
  await clickChamadosAtribuidosRowOpenDetail(page, titulo);
  await page.waitForURL(/\/chamados-atribuidos\/.+/, { timeout: 30000, waitUntil: 'commit' });
  return page.url();
}

// Abre o sheet de detalhes de um chamado em /gestao e clica em "Pausar" dentro do sheet.
async function abrirPauseDialogNaGestao(
  page: Parameters<typeof login>[0],
  titulo: string,
): Promise<ReturnType<typeof page.getByRole>> {
  const card = gestaoChamadoCard(page, titulo);
  await expect(card).toBeVisible({ timeout: 15000 });
  await gestaoOpenDetailSheetFromRow(card);

  const sheet = page.locator('[data-slot="sheet-content"]');
  await expect(sheet).toBeVisible({ timeout: 5000 });

  const btnPausar = sheet.getByRole('button', { name: /^pausar$/i });
  await expect(btnPausar).toBeVisible({ timeout: 5000 });
  await btnPausar.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 5000 });
  return dialog;
}

// ---------------------------------------------------------------------------
// Suite 1 — "Falta de Peça (Responsabilidade da Contratada)" bloqueia pausa
// ---------------------------------------------------------------------------

test.describe.serial('Cotação — Falta de peça contratada bloqueia pausa', () => {
  let tituloChamado = '';

  test('cria chamado até em atendimento', async ({ page }) => {
    test.slow();
    tituloChamado = await criarChamadoEmAtendimento(page, 'Bloqueio');
  });

  test('técnico recebe alerta ao selecionar motivo 100% contratada', async ({ page }) => {
    await navegarDetalheTecnico(page, tituloChamado);

    const dialog = await abrirPauseDialogNaDetalhe(page);
    await selecionarMotivoPausa(
      page,
      dialog,
      'Falta de Peça (Responsabilidade da Contratada)',
    );

    await expect(
      dialog.getByText(/responsabilidade da contratada/i).first(),
    ).toBeVisible({ timeout: 5000 });

    const btnSubmit = dialog.getByRole('button', { name: /pausar atendimento/i });
    await expect(btnSubmit).toBeDisabled();
  });

  test('técnico NÃO vê opção "Aguardando Aprovação do Cliente" no dropdown', async ({
    page,
  }) => {
    await navegarDetalheTecnico(page, tituloChamado);

    const dialog = await abrirPauseDialogNaDetalhe(page);
    await dialog.getByRole('combobox').first().click();

    await expect(
      page.getByRole('option', {
        name: 'Falta de Peça (Aguardando Aprovação do Cliente)',
        exact: true,
      }),
    ).toHaveCount(0, { timeout: 3000 });

    await page.keyboard.press('Escape');
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Preposto submete cotação, Admin aprova (fluxo completo)
// ---------------------------------------------------------------------------

test.describe('Cotação — Fluxo de envio (Preposto) e aprovação (Admin)', () => {
  let tituloChamado: string;

  test.describe.serial('setup e envio da cotação', () => {
    test('cria chamado até em atendimento', async ({ page }) => {
      test.slow();
      tituloChamado = await criarChamadoEmAtendimento(page, 'Fluxo');
    });

    test('Preposto envia cotação via Gestão → Sheet → Pausar', async ({ page }) => {
      test.slow();
      test.skip(!tituloChamado, 'setup não executado — pulando dependente');

      await login(page, 'preposto');
      await gotoGestaoChamadosReady(page);

      const pauseDialog = await abrirPauseDialogNaGestao(page, tituloChamado);
      await selecionarMotivoPausa(
        page,
        pauseDialog,
        'Falta de Peça (Aguardando Aprovação do Cliente)',
      );

      // Preposto vê o botão "Continuar para Cotação"
      const btnContinuar = pauseDialog.getByRole('button', {
        name: /continuar para cotação/i,
      });
      await expect(btnContinuar).toBeVisible({ timeout: 5000 });
      await btnContinuar.click();

      // Pausar fecha e o SubmitCotacaoDialog abre — não usar getByRole('dialog') genérico
      // (sempre resolve para um dialog visível e falha o expect.not.toBeVisible).
      const cotacaoHeading = page.getByRole('heading', { name: /solicitar aprovação de cotação/i });
      await expect(cotacaoHeading).toBeVisible({ timeout: 10000 });
      const cotacaoDialog = page.getByRole('dialog').filter({ has: cotacaoHeading });
      await expect(cotacaoDialog).toBeVisible({ timeout: 5000 });

      await cotacaoDialog.getByLabel(/valor estimado/i).fill('1500');
      await cotacaoDialog
        .getByLabel(/material\/serviço/i)
        .fill('Lâmpada LED 18W, 20 unidades, marca especificada no contrato.');
      await cotacaoDialog.getByLabel(/prazo de entrega/i).fill('5');

      await cotacaoDialog.getByRole('button', { name: /enviar para aprovação/i }).click();
      await expect(cotacaoDialog).not.toBeVisible({ timeout: 30000 });
    });

    test('Preposto vê a cotação no sheet SEM botões Aprovar/Recusar', async ({ page }) => {
      test.slow();
      test.skip(!tituloChamado, 'setup não executado — pulando dependente');

      await login(page, 'preposto');
      await gotoGestaoChamadosReady(page);

      const card = gestaoChamadoCard(page, tituloChamado);
      await expect(card).toBeVisible({ timeout: 15000 });
      await gestaoOpenDetailSheetFromRow(card);

      const sheet = page.locator('[data-slot="sheet-content"]');
      await expect(sheet).toBeVisible({ timeout: 5000 });

      // Card de cotação visível
      await expect(
        sheet.getByText(/cotação aguardando aprovação/i).first(),
      ).toBeVisible({ timeout: 10000 });

      // Botões Aprovar/Recusar NÃO existem para Preposto (apenas Admin aprova)
      await expect(sheet.getByRole('button', { name: /^aprovar$/i })).toHaveCount(0);
      await expect(sheet.getByRole('button', { name: /^recusar$/i })).toHaveCount(0);
    });

    test('Admin aprova a cotação e SLA retoma', async ({ page }) => {
      test.slow();
      test.skip(!tituloChamado, 'setup não executado — pulando dependente');
      await login(page, 'admin');
      await gotoGestaoChamadosReady(page);

      const card = gestaoChamadoCard(page, tituloChamado);
      await expect(card).toBeVisible({ timeout: 15000 });
      await gestaoOpenDetailSheetFromRow(card);

      const sheet = page.locator('[data-slot="sheet-content"]');
      await expect(sheet).toBeVisible({ timeout: 5000 });

      await expect(
        sheet.getByText(/cotação aguardando aprovação/i).first(),
      ).toBeVisible({ timeout: 10000 });
      await expect(sheet.getByText(/R\$\s*1\.500,00/)).toBeVisible();

      const btnAprovar = sheet.getByRole('button', { name: /^aprovar$/i });
      await expect(btnAprovar).toBeVisible();
      await btnAprovar.click();

      // Após aprovação, card ativo desaparece (status do chamado volta a "em atendimento")
      await expect(
        sheet.getByText(/cotação aguardando aprovação/i).first(),
      ).not.toBeVisible({ timeout: 10000 });
    });
  });
});
