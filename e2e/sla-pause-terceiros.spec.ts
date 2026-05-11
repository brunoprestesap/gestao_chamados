/**
 * Testes E2E — Pausas de SLA: Dependência de Terceiros
 *
 * Cobre os fluxos de pausa e retomada de chamados que envolvem espera por
 * fornecedor, peça ou aprovação externa, a partir das perspectivas do Técnico
 * e do Admin/Preposto (via Gestão Kanban).
 *
 * PRÉ-REQUISITOS
 * ──────────────
 * 1. Servidor rodando em localhost:3000 (ou E2E_BASE_URL).
 * 2. Seed executado: `node scripts/seed.js`
 *    Garante usuários, catálogo de serviços e configs de SLA no banco.
 * 3. Usuários E2E provisionados (global-setup cria automaticamente):
 *    admin / preposto / tecnico / solicitante  (senha: 123456)
 *
 * ESTRUTURA
 * ─────────
 * • setup serial — cria um chamado único por suite e avança até "em atendimento"
 * • cenários independentes — cada cenário usa o mesmo chamado de setup
 *   (para cenários que alteram o status, o setup re-executa dentro de describe.serial)
 *
 * NÃO EXECUTAR estes testes diretamente — requerem servidor ativo.
 * Use: npm run test:e2e -- --grep "Pausas de SLA"
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
  reloadGestaoKanbanReady,
} from './fixtures/navigation';
import { selectFirstSubtypeAndCatalogService } from './fixtures/new-ticket-dialog';
import {
  abrirPauseDialogNaDetalhe,
  abrirResumeDialogNaDetalhe,
  confirmarPausa,
  confirmarRetomada,
  selecionarMotivoPausa,
} from './fixtures/pause-dialog';

// ---------------------------------------------------------------------------
// Helpers locais
// ---------------------------------------------------------------------------

/**
 * Cria um chamado como solicitante, classifica como preposto e atribui ao
 * técnico. Retorna o título único do chamado criado.
 *
 * Reutilizado em múltiplos describe.serial para que cada suite parta de
 * um chamado próprio no status "em atendimento".
 */
async function criarChamadoEmAtendimento(
  page: Parameters<typeof login>[0],
  sufixo: string,
): Promise<string> {
  const titulo = `E2E Pausa SLA ${sufixo} ${Date.now()}`;

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

/**
 * Navega para a lista de chamados atribuídos do técnico e retorna o locator
 * do card correspondente ao título informado, seguido do link/botão para a
 * página de detalhe.
 *
 * Retorna a URL da página de detalhe (/chamados-atribuidos/{id}).
 */
async function navegarParaDetalheChamadoTecnico(
  page: Parameters<typeof login>[0],
  titulo: string,
): Promise<string> {
  await login(page, 'tecnico');
  await gotoChamadosAtribuidosReady(page);

  await clickChamadosAtribuidosRowOpenDetail(page, titulo);
  await page.waitForURL(/\/chamados-atribuidos\/.+/, { timeout: 30000, waitUntil: 'commit' });
  return page.url();
}

// ---------------------------------------------------------------------------
// Suite 1 — Técnico pausa com motivo "Aguardando Fornecedor"
// ---------------------------------------------------------------------------

test.describe.serial('Pausas de SLA — Técnico pausa com motivo Aguardando Fornecedor', () => {
  let tituloChamado = '';

  test('setup: cria chamado e avança até em atendimento', async ({ page }) => {
    test.slow(); // setup faz múltiplos logins + dialogs
    tituloChamado = await criarChamadoEmAtendimento(page, 'Fornecedor');
  });

  test('deve pausar o chamado e exibir status Aguardando Terceiros', async ({ page }) => {
    await navegarParaDetalheChamadoTecnico(page, tituloChamado);

    const dialog = await abrirPauseDialogNaDetalhe(page);
    await selecionarMotivoPausa(page, dialog, 'Aguardando Fornecedor');
    await confirmarPausa(dialog);

    await expect(
      page.locator('[data-slot="badge"]').filter({ hasText: /aguardando terceiros/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('deve exibir o botão Retomar Atendimento após a pausa', async ({ page }) => {
    await navegarParaDetalheChamadoTecnico(page, tituloChamado);

    await expect(page.getByRole('button', { name: /retomar atendimento/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('não deve exibir o botão Pausar Atendimento quando já pausado', async ({ page }) => {
    // Arrange
    await navegarParaDetalheChamadoTecnico(page, tituloChamado);

    // Assert — botão de pausa não deve estar visível
    await expect(page.getByRole('button', { name: /pausar atendimento/i })).not.toBeVisible({
      timeout: 5000,
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Validação de detalhes obrigatórios para motivo "Outro"
// ---------------------------------------------------------------------------

test.describe.serial('Pausas de SLA — Validação de detalhes obrigatórios para motivo Outro', () => {
  let tituloChamado = '';

  test('setup: cria chamado e avança até em atendimento', async ({ page }) => {
    test.slow(); // setup faz múltiplos logins + dialogs
    tituloChamado = await criarChamadoEmAtendimento(page, 'Outro');
  });

  test('deve mostrar erro ao tentar submeter sem detalhes', async ({ page }) => {
    await navegarParaDetalheChamadoTecnico(page, tituloChamado);
    const dialog = await abrirPauseDialogNaDetalhe(page);

    await selecionarMotivoPausa(page, dialog, 'Outro Motivo');
    const btnSubmit = dialog.getByRole('button', { name: /^pausar atendimento$/i });
    await btnSubmit.click();

    await expect(
      dialog.getByText(/detalhes obrigatórios|mín\. 10 caracteres/i),
    ).toBeVisible({ timeout: 5000 });

    await expect(dialog).toBeVisible();
  });

  test('deve mostrar erro ao preencher detalhes com menos de 10 caracteres', async ({ page }) => {
    await navegarParaDetalheChamadoTecnico(page, tituloChamado);
    const dialog = await abrirPauseDialogNaDetalhe(page);

    await selecionarMotivoPausa(page, dialog, 'Outro Motivo');
    await dialog.getByRole('textbox').fill('curto');
    await dialog.getByRole('button', { name: /^pausar atendimento$/i }).click();

    await expect(
      dialog.getByText(/mín\. 10 caracteres|detalhes obrigatórios/i),
    ).toBeVisible({ timeout: 5000 });
  });

  test('deve exibir asterisco no campo detalhes quando motivo é Outro', async ({ page }) => {
    await navegarParaDetalheChamadoTecnico(page, tituloChamado);
    const dialog = await abrirPauseDialogNaDetalhe(page);
    await selecionarMotivoPausa(page, dialog, 'Outro Motivo');

    const labelDetalhes = dialog.locator('label').filter({ hasText: /detalhes/i });
    await expect(labelDetalhes).toContainText('*');
  });

  test('deve pausar com sucesso ao preencher detalhes com 10 ou mais caracteres', async ({
    page,
  }) => {
    await navegarParaDetalheChamadoTecnico(page, tituloChamado);
    const dialog = await abrirPauseDialogNaDetalhe(page);

    await selecionarMotivoPausa(page, dialog, 'Outro Motivo');
    await dialog
      .getByRole('textbox')
      .fill('Motivo detalhado para teste E2E com mais de dez caracteres.');
    await confirmarPausa(dialog);

    await expect(
      page.locator('[data-slot="badge"]').filter({ hasText: /aguardando terceiros/i }),
    ).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Admin pausa chamado via Gestão Kanban
// ---------------------------------------------------------------------------

test.describe('Pausas de SLA — Admin pausa chamado via Gestão Kanban', () => {
  let tituloChamado: string;

  test.describe.serial('setup e fluxo de pausa via gestão', () => {
    test('cria chamado e avança até em atendimento', async ({ page }) => {
      test.slow(); // setup faz múltiplos logins + dialogs
      tituloChamado = await criarChamadoEmAtendimento(page, 'Admin Pausa');
    });

    test('admin clica no card em atendimento e pausa pelo Sheet de detalhes', async ({ page }) => {
      test.slow(); // server action pode demorar em dev mode
      // Arrange
      await login(page, 'admin');
      await gotoGestaoChamadosReady(page);

      // Localiza card na coluna "Em atendimento"
      const card = gestaoChamadoCard(page, tituloChamado);
      await expect(card).toBeVisible({ timeout: 15000 });

      await gestaoOpenDetailSheetFromRow(card);

      const sheet = page.locator('[data-slot="sheet-content"]');
      await expect(sheet).toBeVisible({ timeout: 5000 });

      // Act — clica no botão "Pausar" dentro do Sheet
      const btnPausar = sheet.getByRole('button', { name: /^pausar$/i });
      await expect(btnPausar).toBeVisible({ timeout: 5000 });
      await btnPausar.click();

      // O Sheet fecha e o dialog de pausa abre
      const pauseDialog = page.getByRole('dialog');
      await expect(pauseDialog).toBeVisible({ timeout: 5000 });

      // Seleciona motivo e confirma
      await selecionarMotivoPausa(page, pauseDialog, 'Aguardando Aprovação');
      await confirmarPausa(pauseDialog);

      // Assert — chamado deve aparecer na coluna "Aguardando Terceiros" do kanban
      await page.waitForTimeout(1500); // aguarda revalidação ISR
      await reloadGestaoKanbanReady(page);

      const cardAtualizado = gestaoChamadoCard(page, tituloChamado);
      await expect(cardAtualizado).toBeVisible({ timeout: 15000 });
      // /gestão usa StatusBadge como <span> (sem data-slot="badge"); a célula da tabela espelha o rótulo.
      await expect(
        cardAtualizado.getByRole('cell', { name: /aguardando terceiros/i }),
      ).toBeVisible({ timeout: 15000 });
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Admin retoma chamado pausado via Gestão Kanban
// ---------------------------------------------------------------------------

test.describe('Pausas de SLA — Admin retoma chamado pausado via Gestão Kanban', () => {
  let tituloChamado: string;

  test.describe.serial('setup: chamado pausado e retomada via gestão', () => {
    test('cria chamado, avança até em atendimento e pausa', async ({ page }) => {
      test.slow(); // setup faz múltiplos logins + dialogs + pausa
      test.setTimeout(180_000); // criar + atribuir + login técnico + pausa pode exceder 90s em dev
      tituloChamado = await criarChamadoEmAtendimento(page, 'Admin Retoma');

      // Técnico pausa o chamado
      await navegarParaDetalheChamadoTecnico(page, tituloChamado);
      const dialog = await abrirPauseDialogNaDetalhe(page);
      await selecionarMotivoPausa(page, dialog, 'Aguardando Fornecedor');
      await confirmarPausa(dialog);
      await expect(
        page.locator('[data-slot="badge"]').filter({ hasText: /aguardando terceiros/i }),
      ).toBeVisible({ timeout: 10000 });
    });

    test('admin abre o Sheet de chamado pausado e clica em Retomar', async ({ page }) => {
      test.slow(); // retomada + reload + verificação pode demorar em dev mode
      // Arrange
      await login(page, 'admin');
      await gotoGestaoChamadosReady(page);

      const card = gestaoChamadoCard(page, tituloChamado);
      await expect(card).toBeVisible({ timeout: 15000 });
      await gestaoOpenDetailSheetFromRow(card);

      const sheet = page.locator('[data-slot="sheet-content"]');
      await expect(sheet).toBeVisible({ timeout: 5000 });

      // Assert — botão Retomar visível no Sheet
      const btnRetomar = sheet.getByRole('button', { name: /^retomar$/i });
      await expect(btnRetomar).toBeVisible({ timeout: 5000 });

      // Act — clica em Retomar
      await btnRetomar.click();

      // Dialog de retomada abre
      const resumeDialog = page.getByRole('dialog');
      await expect(resumeDialog).toBeVisible({ timeout: 5000 });

      // Assert — dialog exibe o motivo da pausa registrado anteriormente
      await expect(resumeDialog.getByText(/aguardando fornecedor/i)).toBeVisible({
        timeout: 5000,
      });

      // Assert — dialog exibe tempo pausado (pode ser "0min" ou "1min")
      await expect(resumeDialog.getByText(/tempo pausado:\s/i)).toBeVisible({ timeout: 5000 });

      // Act — confirma retomada
      await confirmarRetomada(resumeDialog);

      // Assert — chamado volta para "Em atendimento" no kanban
      await page.waitForTimeout(2000);
      await reloadGestaoKanbanReady(page);

      const cardAtualizado = gestaoChamadoCard(page, tituloChamado);
      await expect(cardAtualizado).toBeVisible({ timeout: 30000 });
      await expect(cardAtualizado.getByRole('cell', { name: /em atendimento/i })).toBeVisible({
        timeout: 15000,
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — Técnico retoma chamado pausado na página de detalhe
// ---------------------------------------------------------------------------

test.describe('Pausas de SLA — Técnico retoma chamado pela página de detalhe', () => {
  let tituloChamado: string;
  let urlDetalhe: string;

  test.describe.serial('setup: chamado pausado e retomada pelo técnico', () => {
    test('cria chamado, avança até em atendimento e pausa', async ({ page }) => {
      test.slow(); // setup faz múltiplos logins + dialogs + pausa
      test.setTimeout(180_000);
      tituloChamado = await criarChamadoEmAtendimento(page, 'Tecnico Retoma');

      // Navega ao detalhe e pausa
      urlDetalhe = await navegarParaDetalheChamadoTecnico(page, tituloChamado);
      const dialog = await abrirPauseDialogNaDetalhe(page);
      await selecionarMotivoPausa(page, dialog, 'Aguardando Acesso ao Local');
      await confirmarPausa(dialog);
      await expect(
        page.locator('[data-slot="badge"]').filter({ hasText: /aguardando terceiros/i }),
      ).toBeVisible({ timeout: 10000 });
    });

    test('técnico acessa a página de detalhe do chamado pausado', async ({ page }) => {
      // Arrange — acessa diretamente via URL guardada no setup
      await login(page, 'tecnico');
      await page.goto(urlDetalhe ?? '/chamados-atribuidos');

      if (!urlDetalhe) {
        // Fallback: navega pela lista
        await navegarParaDetalheChamadoTecnico(page, tituloChamado);
      }

      // Assert — status "Aguardando Terceiros" visível
      await expect(
        page.locator('[data-slot="badge"]').filter({ hasText: /aguardando terceiros/i }),
      ).toBeVisible({ timeout: 10000 });
    });

    test('dialog de retomada exibe motivo da pausa e tempo pausado', async ({ page }) => {
      // Arrange
      await login(page, 'tecnico');
      await page.goto(urlDetalhe ?? '/chamados-atribuidos');
      if (!urlDetalhe) await navegarParaDetalheChamadoTecnico(page, tituloChamado);

      // Act — abre dialog de retomada
      const dialog = await abrirResumeDialogNaDetalhe(page);

      // Assert — motivo da pausa exibido (acesso ao local)
      await expect(dialog.getByText(/acesso ao local/i)).toBeVisible({
        timeout: 5000,
      });

      // Assert — tempo pausado exibido (formato: Xmin ou Xh Ymin)
      await expect(dialog.getByText(/tempo pausado:\s/i)).toBeVisible({ timeout: 5000 });
    });

    test('técnico confirma retomada e status volta para Em atendimento', async ({ page }) => {
      // Arrange
      await login(page, 'tecnico');
      await page.goto(urlDetalhe ?? '/chamados-atribuidos');
      if (!urlDetalhe) await navegarParaDetalheChamadoTecnico(page, tituloChamado);

      // Act — retoma
      const dialog = await abrirResumeDialogNaDetalhe(page);
      await confirmarRetomada(dialog);

      // Assert — status volta para "Em atendimento" (badge)
      await expect(
        page.locator('[data-slot="badge"]').filter({ hasText: /em atendimento/i }),
      ).toBeVisible({ timeout: 10000 });
    });

    test('botão Pausar Atendimento reaparece após retomada', async ({ page }) => {
      // Arrange — acessar após retomada
      await login(page, 'tecnico');
      await page.goto(urlDetalhe ?? '/chamados-atribuidos');
      if (!urlDetalhe) await navegarParaDetalheChamadoTecnico(page, tituloChamado);

      // Assert
      await expect(page.getByRole('button', { name: /pausar atendimento/i })).toBeVisible({
        timeout: 10000,
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — Chamado pausado bloqueia registro de execução
// ---------------------------------------------------------------------------

test.describe.serial('Pausas de SLA — Chamado pausado bloqueia registro de execução', () => {
  let tituloChamado = '';
  let urlDetalhe = '';

  test('setup: cria chamado e avança até em atendimento', async ({ page }) => {
    test.slow(); // setup faz múltiplos logins + dialogs
    tituloChamado = await criarChamadoEmAtendimento(page, 'Bloqueia Exec');
  });

  test('botão Registrar Execução está visível antes da pausa', async ({ page }) => {
    urlDetalhe = await navegarParaDetalheChamadoTecnico(page, tituloChamado);

    await expect(page.getByRole('button', { name: /registrar execução/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test('botão Registrar Execução não deve estar visível após a pausa', async ({ page }) => {
    const url = await navegarParaDetalheChamadoTecnico(page, tituloChamado);

    const dialog = await abrirPauseDialogNaDetalhe(page);
    await selecionarMotivoPausa(page, dialog, 'Aguardando Solicitante');
    await confirmarPausa(dialog);

    await expect(
      page.locator('[data-slot="badge"]').filter({ hasText: /aguardando/i }).first(),
    ).toBeVisible({ timeout: 10000 });

    await expect(page.getByRole('button', { name: /registrar execução/i })).not.toBeVisible({
      timeout: 5000,
    });

    urlDetalhe = url;
  });

  test('botão Retomar Atendimento está visível enquanto pausado', async ({ page }) => {
    await login(page, 'tecnico');
    await page.goto(urlDetalhe || (await navegarParaDetalheChamadoTecnico(page, tituloChamado)));

    await expect(page.getByRole('button', { name: /retomar atendimento/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('button', { name: /registrar execução/i })).not.toBeVisible({
      timeout: 5000,
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — Todos os motivos de pausa podem ser selecionados
// ---------------------------------------------------------------------------

test.describe.serial('Pausas de SLA — Todos os motivos de pausa estão disponíveis no select', () => {
  /** Motivos no Select quando o papel é técnico (sem fluxo de cotação exclusivo do Preposto). */
  const MOTIVOS_ESPERADOS_TECNICO = [
    'Aguardando Solicitante',
    'Aguardando Fornecedor',
    'Falta de Peça (Responsabilidade da Contratada)',
    'Aguardando Aprovação',
    'Aguardando Acesso ao Local',
    'Outro Motivo',
  ];

  let tituloChamado = '';

  test('setup: cria chamado até em atendimento', async ({ page }) => {
    test.slow(); // setup faz múltiplos logins + dialogs
    tituloChamado = await criarChamadoEmAtendimento(page, 'Motivos Select');
  });

  test('deve listar todos os motivos de pausa no Select', async ({ page }) => {
    // Arrange
    await navegarParaDetalheChamadoTecnico(page, tituloChamado);
    const dialog = await abrirPauseDialogNaDetalhe(page);

    // Abre o Select de motivos
    await dialog.getByRole('combobox').first().click();

    // Assert — cada motivo esperado deve estar disponível
    for (const motivo of MOTIVOS_ESPERADOS_TECNICO) {
      await expect(page.getByRole('option', { name: motivo, exact: true })).toBeVisible({
        timeout: 5000,
      });
    }

    // Fecha o select sem selecionar
    await page.keyboard.press('Escape');
  });

  test('campo detalhes não exibe asterisco quando motivo não é Outro', async ({ page }) => {
    // Arrange
    await navegarParaDetalheChamadoTecnico(page, tituloChamado);
    const dialog = await abrirPauseDialogNaDetalhe(page);

    // Seleciona motivo que não exige detalhes
    await selecionarMotivoPausa(page, dialog, 'Aguardando Fornecedor');

    // Assert — label de detalhes não deve ter asterisco
    const labelDetalhes = dialog.locator('label').filter({ hasText: /^detalhes$/i });
    await expect(labelDetalhes).not.toContainText('*');
  });

  test('descrição do dialog informa que o SLA será pausado', async ({ page }) => {
    // Arrange
    await navegarParaDetalheChamadoTecnico(page, tituloChamado);
    const dialog = await abrirPauseDialogNaDetalhe(page);

    // Assert — mensagem informativa sobre SLA visível (pode haver 2: description + info box)
    await expect(
      dialog.getByText(/sla.*pausado|prazo.*pausado/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test('botão Cancelar fecha o dialog sem pausar', async ({ page }) => {
    // Arrange
    await navegarParaDetalheChamadoTecnico(page, tituloChamado);
    const dialog = await abrirPauseDialogNaDetalhe(page);

    // Act — clica em cancelar sem submeter
    await selecionarMotivoPausa(page, dialog, 'Aguardando Fornecedor');
    await dialog.getByRole('button', { name: /cancelar/i }).click();

    // Assert — dialog fechado e status não alterado
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
    // Badge de status — usa locator específico do badge para evitar ambiguidade
    await expect(
      page.locator('[data-slot="badge"]').filter({ hasText: /em atendimento/i }),
    ).toBeVisible({ timeout: 5000 });
  });
});
