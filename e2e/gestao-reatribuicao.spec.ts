import { expect, test } from '@playwright/test';

import { login } from './fixtures/auth';

/**
 * Testes E2E para o fluxo de reatribuição de chamados com justificativa obrigatória.
 *
 * PRÉ-REQUISITO: O seed padrão (scripts/seed.js) cria apenas UM técnico ("tecnico").
 * Para que os cenários de validação do campo justificativa sejam executados, é necessário
 * um SEGUNDO técnico cadastrado. Adicione ao seed:
 *
 *   { username: "tecnico2", name: "Técnico 02", email: "tecnico2@empresa.gov.br",
 *     passwordHash: HASH_123456, role: "Técnico", unitId: unitTI,
 *     specialties: [tPredial, tAC], maxAssignedTickets: 5,
 *     isActive: true, createdAt: now, updatedAt: now }
 *
 * Sem o segundo técnico, a API /eligible-technicians-reassign retorna lista vazia e
 * o formulário de justificativa não é renderizado. Os testes de validação de campo
 * serão marcados como skipped com mensagem explicativa nesses casos.
 *
 * Estrutura:
 *   1. Bloco serial de setup — cria chamado e avança até status "em_atendimento"
 *   2. Cenários de validação do dialog de reatribuição
 */

test.describe('Reatribuição de chamado com justificativa obrigatória', () => {
  /**
   * Título único por execução para isolar dados entre runs paralelos/sequenciais.
   */
  const ticketTitle = `E2E Reatribuição ${Date.now()}`;

  // ---------------------------------------------------------------------------
  // Setup: avança o chamado até "em_atendimento" para habilitar a reatribuição
  // ---------------------------------------------------------------------------

  test.describe.serial('setup: chamado em_atendimento', () => {
    test('solicitante abre chamado', async ({ page }) => {
      await login(page, 'solicitante');
      await page.goto('/meus-chamados');

      await page.getByRole('button', { name: /novo chamado/i }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      await dialog.getByRole('combobox', { name: /unidade/i }).click();
      await page.getByRole('option').first().click();

      await dialog.getByLabel(/local exato/i).fill('Sala 404 - Reatribuição E2E');
      await dialog.getByText('Manutenção Predial').click();
      await dialog.getByPlaceholder(/descreva/i).fill(ticketTitle);
      await dialog.getByText('Padrão').first().click();

      await dialog.getByRole('button', { name: /abrir chamado|enviar|criar/i }).click();
      await expect(dialog).not.toBeVisible({ timeout: 15000 });
      await expect(page.getByText(ticketTitle)).toBeVisible({ timeout: 15000 });
    });

    test('preposto classifica e atribui o chamado', async ({ page }) => {
      await login(page, 'preposto');
      await page.goto('/gestao');

      await expect(page.getByText(ticketTitle)).toBeVisible({ timeout: 15000 });
      await page.getByText(ticketTitle).click();

      // Classificar
      const classificarBtn = page.getByRole('button', { name: /classificar/i });
      await expect(classificarBtn).toBeVisible({ timeout: 5000 });
      await classificarBtn.click();

      const classDialog = page.getByRole('dialog');
      await expect(classDialog).toBeVisible();
      await classDialog.getByText('NORMAL').click();
      await classDialog.getByRole('button', { name: /confirmar|classificar|salvar/i }).click();
      await expect(classDialog).not.toBeVisible({ timeout: 10000 });

      // Reabrir painel do chamado para atribuir
      await page.getByText(ticketTitle).click();

      const atribuirBtn = page.getByRole('button', { name: /^atribuir$/i });
      await expect(atribuirBtn).toBeVisible({ timeout: 5000 });
      await atribuirBtn.click();

      const atribDialog = page.getByRole('dialog');
      await expect(atribDialog).toBeVisible();
      await atribDialog.getByRole('button', { name: /confirmar|atribuir|salvar/i }).click();
      await expect(atribDialog).not.toBeVisible({ timeout: 10000 });
    });
  });

  // ---------------------------------------------------------------------------
  // Cenários de validação do dialog de reatribuição
  // ---------------------------------------------------------------------------

  test.describe('dialog de reatribuição', () => {
    /**
     * Abre o dialog de reatribuição para o chamado criado no setup.
     * Retorna true se o formulário com técnicos elegíveis for exibido,
     * false se a API retornar lista vazia (sem segundo técnico no seed).
     */
    async function abrirDialogReatribuicao(page: Parameters<typeof login>[0]): Promise<boolean> {
      await login(page, 'preposto');
      await page.goto('/gestao');

      await expect(page.getByText(ticketTitle)).toBeVisible({ timeout: 15000 });
      await page.getByText(ticketTitle).click();

      const reatribuirBtn = page.getByRole('button', { name: /reatribuir/i });
      await expect(reatribuirBtn).toBeVisible({ timeout: 5000 });
      await reatribuirBtn.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // Aguarda o loading de técnicos terminar
      await expect(dialog.getByText(/carregando técnicos/i)).not.toBeVisible({ timeout: 10000 });

      // Verifica se o formulário com técnicos elegíveis foi renderizado
      const semTecnicos = dialog.getByText('Nenhum outro técnico disponível');
      const temFormulario = dialog.getByLabel(/justificativa/i);

      if (await semTecnicos.isVisible()) {
        return false;
      }

      await expect(temFormulario).toBeVisible({ timeout: 5000 });
      return true;
    }

    test('botão "Reatribuir" está desabilitado ao abrir o dialog sem justificativa', async ({
      page,
    }) => {
      const temTecnicos = await abrirDialogReatribuicao(page);

      if (!temTecnicos) {
        test.skip(
          true,
          'Sem segundo técnico elegível no seed — adicione "tecnico2" ao scripts/seed.js para habilitar este teste.',
        );
        return;
      }

      const dialog = page.getByRole('dialog');
      const btnReatribuir = dialog.getByRole('button', { name: /^reatribuir$/i });

      // Nenhum técnico selecionado, campo justificativa vazio → botão desabilitado
      await expect(btnReatribuir).toBeDisabled();
    });

    test('mensagem de mínimo de caracteres aparece ao digitar menos de 10 chars', async ({
      page,
    }) => {
      const temTecnicos = await abrirDialogReatribuicao(page);

      if (!temTecnicos) {
        test.skip(
          true,
          'Sem segundo técnico elegível no seed — adicione "tecnico2" ao scripts/seed.js para habilitar este teste.',
        );
        return;
      }

      const dialog = page.getByRole('dialog');
      const campoJustificativa = dialog.getByLabel(/justificativa/i);

      await campoJustificativa.fill('12345');

      // Mensagem "Mínimo 10 caracteres (5/10)" deve aparecer
      await expect(dialog.getByText(/mínimo 10 caracteres \(5\/10\)/i)).toBeVisible();

      // Botão ainda deve estar desabilitado
      const btnReatribuir = dialog.getByRole('button', { name: /^reatribuir$/i });
      await expect(btnReatribuir).toBeDisabled();
    });

    test('contador de caracteres exibe contagem correta ao digitar', async ({ page }) => {
      const temTecnicos = await abrirDialogReatribuicao(page);

      if (!temTecnicos) {
        test.skip(
          true,
          'Sem segundo técnico elegível no seed — adicione "tecnico2" ao scripts/seed.js para habilitar este teste.',
        );
        return;
      }

      const dialog = page.getByRole('dialog');
      const campoJustificativa = dialog.getByLabel(/justificativa/i);

      const textoComQuinzeChars = 'Texto de teste!';
      await campoJustificativa.fill(textoComQuinzeChars);

      // Contador deve mostrar "15/2000"
      await expect(dialog.getByText('15/2000')).toBeVisible();
    });

    test('botão "Reatribuir" é habilitado com justificativa válida e técnico selecionado', async ({
      page,
    }) => {
      const temTecnicos = await abrirDialogReatribuicao(page);

      if (!temTecnicos) {
        test.skip(
          true,
          'Sem segundo técnico elegível no seed — adicione "tecnico2" ao scripts/seed.js para habilitar este teste.',
        );
        return;
      }

      const dialog = page.getByRole('dialog');
      const btnReatribuir = dialog.getByRole('button', { name: /^reatribuir$/i });

      // Seleciona o primeiro técnico elegível disponível (não sobrecarregado).
      // Os cards de técnico são <button type="button"> dentro da div de listagem,
      // identificados pela matrícula visível ("Matrícula: ...").
      const cardTecnico = dialog.locator('button[type="button"]:not([disabled])').filter({
        hasText: /matrícula:/i,
      });
      await cardTecnico.first().click();

      // Preenche justificativa com mais de 10 caracteres
      const campoJustificativa = dialog.getByLabel(/justificativa/i);
      await campoJustificativa.fill('Técnico indisponível por licença médica.');

      // Botão deve estar habilitado
      await expect(btnReatribuir).toBeEnabled();
    });
  });
});
