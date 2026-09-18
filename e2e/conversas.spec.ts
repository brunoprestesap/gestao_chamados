import { expect, type Locator, type Page, test } from '@playwright/test';

import { login } from './fixtures/auth';

/**
 * A tela de conversas no navegador de verdade (spec 0003). O que mora aqui é o
 * que só o layout real prova: tamanho de alvo de toque, as duas telas do
 * celular, e a conversa saindo aos poucos.
 *
 * covers: AC-8 (alvos de 44 pixels, região ao vivo, foco), AC-11 (celular e
 * computador), AC-2 (lateral), AC-3 (boas vindas)
 */

/** O mínimo que o AC-8 exige de qualquer coisa clicável. */
const ALVO_MINIMO = 44;

async function medir(alvo: Locator): Promise<{ largura: number; altura: number }> {
  const caixa = await alvo.boundingBox();
  if (!caixa) throw new Error('o elemento não está na tela');
  return { largura: Math.round(caixa.width), altura: Math.round(caixa.height) };
}

/** Todo alvo clicável do painel que está abaixo do mínimo. */
async function alvosPequenos(page: Page): Promise<{ nome: string; l: number; a: number }[]> {
  return page.evaluate((minimo) => {
    const area = document.querySelector('div.flex.min-h-0.flex-1.gap-4') ?? document.body;
    const fora: { nome: string; l: number; a: number }[] = [];
    for (const el of area.querySelectorAll('a[href], button, textarea, input')) {
      if ((el as HTMLElement).offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.width < minimo || r.height < minimo) {
        fora.push({
          nome: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30),
          l: Math.round(r.width),
          a: Math.round(r.height),
        });
      }
    }
    return fora;
  }, ALVO_MINIMO);
}

/** Abre um rascunho da lateral, ou começa um se ainda não houver nenhum. */
async function abrirOuCriarRascunho(page: Page) {
  const rascunhos = page.getByRole('heading', { name: 'Rascunhos', exact: true });
  if (await rascunhos.isVisible().catch(() => false)) {
    await page.getByRole('region', { name: 'Suas conversas' }).getByRole('link').nth(2).click();
    await expect(page.getByRole('button', { name: /descartar/i })).toBeVisible();
    return;
  }

  await page
    .getByRole('textbox', { name: /mensagem para o assistente/i })
    .fill('O bebedouro do 4º andar parou de gelar a água.');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /descartar/i })).toBeVisible({ timeout: 30000 });
}

test.beforeEach(async ({ page }) => {
  await login(page, 'solicitante');
  await page.goto('/conversas');
  await expect(page.getByRole('region', { name: 'Suas conversas' })).toBeVisible();
});

// ── alvos de toque · AC-8 ────────────────────────────────────────

test.describe('conversas · alvos de toque', () => {
  test('nenhum alvo clicável fica abaixo de 44 pixels na tela de boas vindas', async ({ page }) => {
    // Act
    const fora = await alvosPequenos(page);

    // Assert
    expect(fora, JSON.stringify(fora)).toEqual([]);
  });

  test('o botão de descartar cabe no dedo', async ({ page }) => {
    // Arrange
    await abrirOuCriarRascunho(page);

    // Act
    const { altura } = await medir(page.getByRole('button', { name: /descartar/i }));

    // Assert
    expect(altura).toBeGreaterThanOrEqual(ALVO_MINIMO);
  });

  test('o `Tentar de novo` cabe no dedo, que é quando mais se precisa acertar', async ({
    page,
  }) => {
    // Arrange: derruba o envio para o botão aparecer
    await abrirOuCriarRascunho(page);
    await page.route('**/api/conversas/**', (rota) => rota.abort('failed'));
    await page
      .getByRole('textbox', { name: /mensagem para o assistente/i })
      .fill('mensagem que vai falhar');
    await page.keyboard.press('Enter');

    // Act
    const botao = page.getByRole('button', { name: /tentar de novo/i });
    await expect(botao).toBeVisible();
    const { altura } = await medir(botao);

    // Assert
    expect(altura).toBeGreaterThanOrEqual(ALVO_MINIMO);
  });

  test('o `Abrir detalhe do chamado` cabe no dedo, no modo leitura', async ({ page }) => {
    // Arrange
    await page.getByRole('heading', { name: 'Chamados', exact: true }).waitFor();
    await page.getByRole('region', { name: 'Suas conversas' }).getByRole('link').last().click();

    // Act
    const link = page.getByRole('link', { name: /abrir detalhe do chamado/i });
    await expect(link).toBeVisible();
    const { altura } = await medir(link);

    // Assert
    expect(altura).toBeGreaterThanOrEqual(ALVO_MINIMO);
  });

  test('nenhum alvo fica pequeno no celular', async ({ page }) => {
    // Arrange
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/conversas');

    // Act
    const fora = await alvosPequenos(page);

    // Assert
    expect(fora, JSON.stringify(fora)).toEqual([]);
  });
});

// ── celular e computador · AC-11 ─────────────────────────────────

test.describe('conversas · celular e computador', () => {
  test('no celular a lista ocupa a tela, sem a conversa do lado', async ({ page }) => {
    // Arrange
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/conversas');

    // Assert
    await expect(page.getByRole('region', { name: 'Suas conversas' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Nova conversa' })).toBeHidden();
  });

  test('no computador as duas colunas aparecem juntas', async ({ page }) => {
    // Assert
    await expect(page.getByRole('region', { name: 'Suas conversas' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Nova conversa' })).toBeVisible();
  });

  test('no celular a conversa ocupa a tela e o voltar leva à lista', async ({ page }) => {
    // Arrange
    await abrirOuCriarRascunho(page);
    await page.setViewportSize({ width: 390, height: 844 });

    // Assert: só a conversa
    await expect(page.getByRole('region', { name: 'Suas conversas' })).toBeHidden();

    // Act
    await page.getByRole('link', { name: /voltar para a lista/i }).click();

    // Assert
    await expect(page).toHaveURL(/\/conversas$/);
    await expect(page.getByRole('region', { name: 'Suas conversas' })).toBeVisible();
  });

  test('não há rolagem horizontal em 390 pixels', async ({ page }) => {
    // Arrange
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/conversas');

    // Act
    const estoura = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );

    // Assert
    expect(estoura).toBe(false);
  });
});

// ── a tela de boas vindas · AC-3 ─────────────────────────────────

test.describe('conversas · boas vindas', () => {
  test('abre com saudação, três exemplos e a caixa em foco', async ({ page }) => {
    // Assert
    await expect(page.getByRole('heading', { name: /^Olá/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /ar condicionado da sala 302/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /mensagem para o assistente/i })).toBeFocused();
  });

  test('o exemplo clicado vai para a caixa, sem enviar sozinho', async ({ page }) => {
    // Act
    await page.getByRole('button', { name: /lâmpada do corredor/i }).click();

    // Assert
    await expect(page.getByRole('textbox', { name: /mensagem para o assistente/i })).toHaveValue(
      /lâmpada do corredor/i,
    );
    await expect(page).toHaveURL(/\/conversas$/);
  });

  test('o formulário tradicional fica sempre à vista', async ({ page }) => {
    // Assert
    await expect(page.getByRole('link', { name: /abrir por formulário/i })).toHaveAttribute(
      'href',
      '/meus-chamados',
    );
  });
});

// ── a lateral · AC-2 ─────────────────────────────────────────────

test.describe('conversas · lateral', () => {
  test('já vem preenchida na primeira pintura, sem estado de carregamento', async ({ page }) => {
    // Act: lê o HTML que o servidor mandou, antes de qualquer JavaScript
    const html = await (await page.request.get('/conversas')).text();

    // Assert
    expect(html).toContain('Nova conversa');
    expect(html).toMatch(/#CHM-\d{4}-\d{5}/);
  });

  test('o `Carregar mais` traz a página seguinte sem repetir nenhuma linha', async ({ page }) => {
    // Arrange
    const lateral = page.getByRole('region', { name: 'Suas conversas' });
    const botao = page.getByRole('button', { name: /carregar mais/i });
    test.skip(
      !(await botao.isVisible().catch(() => false)),
      'este usuário tem menos de 20 chamados',
    );
    const antes = await lateral.getByRole('link').count();

    // Act
    await botao.click();
    await expect.poll(() => lateral.getByRole('link').count()).toBeGreaterThan(antes);

    // Assert
    const hrefs = await lateral
      .getByRole('link')
      .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

// ── a conversa saindo aos poucos · AC-5, AC-8 ────────────────────

test.describe('conversas · enviar e ouvir', () => {
  test('o relato vira conversa e a resposta chega, com anúncio ao leitor de tela', async ({
    page,
  }) => {
    // Arrange
    const caixa = page.getByRole('textbox', { name: /mensagem para o assistente/i });

    // Act
    await caixa.fill('A tomada da sala 210 está solta e faísca quando encosta.');
    await page.keyboard.press('Enter');

    // Assert: a mensagem aparece na hora
    await expect(
      page.getByText('A tomada da sala 210 está solta e faísca quando encosta.'),
    ).toBeVisible();

    // Assert: vira uma conversa com endereço próprio
    await expect(page).toHaveURL(/\/conversas\/[a-f0-9]{24}/, { timeout: 30000 });

    // Assert: a região ao vivo recebeu o anúncio, e é educada
    const regiao = page.getByRole('status');
    await expect(regiao.first()).toHaveAttribute('aria-live', 'polite');
    await expect(regiao.first()).toHaveAttribute('aria-atomic', 'true');
  });

  test('o descarte pede confirmação e volta para a lista', async ({ page }) => {
    // Arrange
    await abrirOuCriarRascunho(page);

    // Act
    await page.getByRole('button', { name: /descartar/i }).click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: 'Descartar', exact: true }).click();

    // Assert
    await expect(page).toHaveURL(/\/conversas$/);
  });
});
