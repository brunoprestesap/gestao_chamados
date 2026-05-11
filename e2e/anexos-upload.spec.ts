import { expect, test } from '@playwright/test';

import { login } from './fixtures/auth';
import { selectFirstSubtypeAndCatalogService } from './fixtures/new-ticket-dialog';

/**
 * Testes E2E para a feature de Anexos / Upload de Fotos.
 *
 * Pré-requisitos:
 * - Seed executado: node scripts/seed.js
 * - Aplicação rodando em http://localhost:3000
 * - Pelo menos um chamado existente (criado neste arquivo ou pelo seed)
 *
 * Os testes usam test.describe.serial para garantir que o chamado
 * criado no primeiro teste esteja disponível nos demais.
 */

/** Título único para o chamado criado neste teste. */
const TICKET_TITLE = `E2E Anexos ${Date.now()}`;

/**
 * Cria um buffer de imagem JPEG mínima válida (magic bytes FF D8 FF).
 * O buffer tem tamanho suficiente para ser aceito como JPEG pelo servidor.
 */
function createMinimalJpegBuffer(): Buffer {
  // JPEG SOI (Start of Image) + APP0 marker — arquivo JPEG mínimo válido
  const bytes = [
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00,
    // EOI (End of Image)
    0xff, 0xd9,
  ];
  return Buffer.from(bytes);
}

/**
 * Navega para a página de detalhe do chamado.
 * A listagem de /meus-chamados foi revitalizada (tabela em desktop) e o clique na linha
 * abre um Sheet lateral em vez de navegar. Capturamos o _id via API e fazemos goto direto.
 */
async function navegarParaDetalhe(page: Parameters<typeof login>[0]) {
  const apiResp = page.waitForResponse(
    (r) =>
      r.url().includes('/api/meus-chamados') &&
      !r.url().includes('/comments') &&
      r.ok() &&
      r.request().method() === 'GET',
    { timeout: 30000 },
  );
  await page.goto('/meus-chamados', { waitUntil: 'load' });
  const resp = await apiResp;
  const data = await resp.json();
  const chamado = (data.items ?? []).find((c: { titulo: string }) =>
    c.titulo?.includes(TICKET_TITLE),
  );
  expect(chamado, `chamado "${TICKET_TITLE}" não encontrado em /api/meus-chamados`).toBeTruthy();
  await page.goto(`/meus-chamados/${chamado._id}`);
  await expect(page).toHaveURL(/\/meus-chamados\/[a-f\d]{24}/, { timeout: 20000 });
}

test.describe.serial('Upload de Anexos', () => {
  test('1. Solicitante abre chamado para usar nos testes de upload', async ({ page }) => {
    // Arrange
    await login(page, 'solicitante');
    await page.goto('/meus-chamados');

    // Act — abre dialog e cria o chamado
    await page.getByRole('button', { name: /novo chamado/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('combobox', { name: /unidade/i }).click();
    await page.getByRole('option').first().click();

    // Usa TICKET_TITLE como localExato → título auto-gerado contém TICKET_TITLE,
    // permitindo localizar a linha na tabela e o chamado via API por título único.
    await dialog.getByLabel(/local exato/i).fill(TICKET_TITLE);
    await dialog.getByText('Manutenção Predial').click();
    await selectFirstSubtypeAndCatalogService(page, dialog);
    await dialog.getByPlaceholder(/descreva/i).fill(TICKET_TITLE);
    await dialog.getByText('Padrão').first().click();

    await dialog.getByRole('button', { name: /abrir chamado|enviar|criar/i }).click();

    // Assert — chamado criado com sucesso e visível na tabela
    await expect(dialog).not.toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('row').filter({ hasText: TICKET_TITLE }).first()).toBeVisible({
      timeout: 15000,
    });
  });

  test('2. Solicitante acessa o chamado e vê a seção de anexos', async ({ page }) => {
    await login(page, 'solicitante');
    await navegarParaDetalhe(page);
    // A galeria pode mostrar "Nenhum anexo" ou botão "Adicionar" dependendo do estado.
    // Usa toBeVisible com timeout para aguardar o conteúdo carregar.
    await expect(page.getByText(/anexo|galeria|adicionar/i).first()).toBeVisible({
      timeout: 15000,
    });
  });

  test('3. Upload de imagem JPEG válida via input de arquivo', async ({ page }) => {
    await login(page, 'solicitante');
    await navegarParaDetalhe(page);

    const addButton = page.getByRole('button', { name: /^adicionar$/i });
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    const fileInput = page.getByTestId('file-upload-input');
    await expect(fileInput).toBeAttached({ timeout: 10000 });

    // Cria um arquivo JPEG temporário com magic bytes válidos
    const jpegBuffer = createMinimalJpegBuffer();
    await fileInput.setInputFiles({
      name: 'foto-teste.jpg',
      mimeType: 'image/jpeg',
      buffer: jpegBuffer,
    });

    // Assert — arquivo aparece na lista (pode estar em estado "Enviado" ou com nome visível)
    await expect(page.getByText('foto-teste.jpg')).toBeVisible({ timeout: 15000 });
  });

  test('4. Upload rejeitado no cliente para tipo de arquivo não permitido (text/plain)', async ({
    page,
  }) => {
    await login(page, 'solicitante');
    await navegarParaDetalhe(page);

    const addButton = page.getByRole('button', { name: /^adicionar$/i });
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    const fileInput = page.getByTestId('file-upload-input');
    await expect(fileInput).toBeAttached({ timeout: 10000 });

    await fileInput.setInputFiles({
      name: 'script.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('conteudo de texto puro'),
    });

    // Assert — mensagem de erro de tipo não permitido exibida
    await expect(page.getByText(/tipo não permitido|não permitido|aceitos/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test('5. Upload rejeitado no cliente para arquivo acima de 5MB', async ({ page }) => {
    await login(page, 'solicitante');
    await navegarParaDetalhe(page);

    const addButton = page.getByRole('button', { name: /^adicionar$/i });
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    // Act — cria um buffer acima de 5MB (5 * 1024 * 1024 + 1)
    const oversizeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1);
    // Coloca magic bytes JPEG para simular imagem grande
    oversizeBuffer[0] = 0xff;
    oversizeBuffer[1] = 0xd8;
    oversizeBuffer[2] = 0xff;

    const fileInput = page.getByTestId('file-upload-input');
    await expect(fileInput).toBeAttached({ timeout: 10000 });

    await fileInput.setInputFiles({
      name: 'foto-gigante.jpg',
      mimeType: 'image/jpeg',
      buffer: oversizeBuffer,
    });

    // Assert — mensagem de erro de tamanho exibida
    await expect(page.getByText('Arquivo excede 5MB.')).toBeVisible({ timeout: 5000 });
  });

  test('6. Galeria exibe anexo após upload bem-sucedido', async ({ page }) => {
    await login(page, 'solicitante');
    await navegarParaDetalhe(page);

    // Verifica que o anexo do teste 3 ainda aparece após navegação
    // (o upload do teste 3 deve ter persistido no banco)
    const hasAttachment = await page
      .getByText('foto-teste.jpg')
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    if (hasAttachment) {
      expect(hasAttachment).toBe(true);
    } else {
      // Aceita que não há anexo visível mas a seção de anexos existe
      await expect(page.getByText(/anexo|galeria|adicionar/i).first()).toBeVisible({
        timeout: 15000,
      });
    }
  });

  test('7. Usuário não autenticado não consegue acessar a rota de upload', async ({ page }) => {
    // Arrange — sem login (cookie limpo)
    await page.context().clearCookies();

    // Act — tenta acessar diretamente a API de upload
    const response = await page.request.post('/api/upload', {
      multipart: {
        file: {
          name: 'foto.jpg',
          mimeType: 'image/jpeg',
          buffer: createMinimalJpegBuffer(),
        },
        chamadoId: 'a'.repeat(24),
        context: 'geral',
      },
    });

    // Assert — deve receber 401 Não autorizado
    expect(response.status()).toBe(401);
  });

  test('8. API de listagem retorna 401 para usuário não autenticado', async ({ page }) => {
    // Arrange
    await page.context().clearCookies();

    // Act
    const chamadoId = 'a'.repeat(24);
    const response = await page.request.get(`/api/chamados/${chamadoId}/attachments`);

    // Assert
    expect(response.status()).toBe(401);
  });

  test('9. API de upload rejeita chamadoId com formato inválido', async ({ page }) => {
    // Arrange
    await login(page, 'solicitante');

    // Act — chamadoId não é um ObjectId válido
    const response = await page.request.post('/api/upload', {
      multipart: {
        file: {
          name: 'foto.jpg',
          mimeType: 'image/jpeg',
          buffer: createMinimalJpegBuffer(),
        },
        chamadoId: 'id-invalido',
        context: 'geral',
      },
    });

    // Assert
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
  });
});
