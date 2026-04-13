import { expect, type Locator, type Page } from '@playwright/test';

// Labels exibidos na UI — espelham PAUSE_REASON_LABELS do shared
export type PauseReasonLabel =
  | 'Aguardando Solicitante'
  | 'Aguardando Fornecedor'
  | 'Aguardando Peça/Material'
  | 'Aguardando Aprovação'
  | 'Aguardando Acesso ao Local'
  | 'Outro Motivo';

/**
 * Abre o dialog de pausa a partir da página de detalhe do chamado atribuído.
 * Pressupõe que o botão "Pausar Atendimento" está visível (status "em atendimento").
 */
export async function abrirPauseDialogNaDetalhe(page: Page): Promise<Locator> {
  const btn = page.getByRole('button', { name: /pausar atendimento/i });
  await expect(btn).toBeVisible({ timeout: 10000 });
  await btn.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 5000 });
  return dialog;
}

/**
 * Seleciona um motivo de pausa no Select do dialog.
 * O Select usa Radix UI — é necessário clicar no trigger e depois na opção.
 */
export async function selecionarMotivoPausa(
  page: Page,
  dialog: Locator,
  motivoLabel: string,
): Promise<void> {
  // Trigger do Select de motivo (único select no dialog de pausa)
  await dialog.getByRole('combobox').first().click();
  await page.getByRole('option', { name: motivoLabel, exact: true }).first().click();
}

/**
 * Submete o dialog de pausa e aguarda seu fechamento.
 */
export async function confirmarPausa(dialog: Locator): Promise<void> {
  const btnSubmit = dialog.getByRole('button', { name: /^pausar atendimento$/i });
  await expect(btnSubmit).toBeEnabled({ timeout: 5000 });
  await btnSubmit.click();
  await expect(dialog).not.toBeVisible({ timeout: 30000 });
}

/**
 * Abre o dialog de retomada a partir da página de detalhe do chamado atribuído.
 * Pressupõe que o botão "Retomar Atendimento" está visível (status aguardando_terceiros
 * ou aguardando_solicitante).
 */
export async function abrirResumeDialogNaDetalhe(page: Page): Promise<Locator> {
  const btn = page.getByRole('button', { name: /retomar atendimento/i });
  await expect(btn).toBeVisible({ timeout: 10000 });
  await btn.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 5000 });
  return dialog;
}

/**
 * Confirma a retomada e aguarda o dialog fechar.
 */
export async function confirmarRetomada(dialog: Locator): Promise<void> {
  const btnSubmit = dialog.getByRole('button', { name: /^retomar atendimento$/i });
  await expect(btnSubmit).toBeEnabled({ timeout: 5000 });
  await btnSubmit.click();
  await expect(dialog).not.toBeVisible({ timeout: 30000 });
}
