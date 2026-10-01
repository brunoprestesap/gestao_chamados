import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import mongoose from 'mongoose';
import { resolve } from 'path';

import { login } from './fixtures/auth';
import { selectFirstSubtypeAndCatalogService } from './fixtures/new-ticket-dialog';

/**
 * O fio da gestão de ativos (spec 0011): o Preposto digita o tombamento em
 * `/ativos/ler`, chega na ficha, abre um chamado a partir dela, e o chamado
 * aparece na lista da ficha. Cobre AC-11, AC-13, AC-14 e AC-15.
 *
 * O ativo é fictício e criado direto no banco: a carga real do Tier A fica
 * fora do git (LGPD).
 */

const CODIGO = '990001';
const CODIGO_TIER_C = '990003';

function carregarMongoUri(): string | undefined {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const p = resolve(process.cwd(), '.env.local');
  if (!existsSync(p)) return undefined;
  for (const linha of readFileSync(p, 'utf8').split('\n')) {
    const m = linha.trim().match(/^MONGODB_URI=(.*)$/);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return undefined;
}

test.describe('Gestão de ativos: etiqueta, ficha e chamado', () => {
  test.beforeAll(async () => {
    const uri = carregarMongoUri();
    test.skip(!uri, 'MONGODB_URI ausente: sem banco para criar o ativo do teste.');
    await mongoose.connect(uri!);
    const db = mongoose.connection.db!;
    const agora = new Date();
    await db.collection('categoriasativo').updateOne(
      { chave: 'e2e_climatizacao' },
      {
        $setOnInsert: {
          chave: 'e2e_climatizacao',
          nome: 'Climatização E2E',
          criticidadePadrao: 'media',
          serviceSubTypeId: null,
          exigeDocumento: [],
          isActive: true,
          createdAt: agora,
          updatedAt: agora,
        },
      },
      { upsert: true },
    );
    const categoria = await db.collection('categoriasativo').findOne({ chave: 'e2e_climatizacao' });
    await db.collection('ativos').updateOne(
      { codigo: CODIGO },
      {
        $setOnInsert: {
          codigo: CODIGO,
          origemCodigo: 'patrimonio',
          tombamento: CODIGO,
          descricao: 'SPLIT E2E 12000 BTUS',
          categoriaId: categoria!._id,
          localizacaoId: null,
          criticidade: 'media',
          tierManutencao: 'A',
          status: 'em_operacao',
          statusCadastro: 'importado',
          createdAt: agora,
          updatedAt: agora,
        },
      },
      { upsert: true },
    );
    await db.collection('ativos').updateOne(
      { codigo: CODIGO_TIER_C },
      {
        $setOnInsert: {
          codigo: CODIGO_TIER_C,
          origemCodigo: 'patrimonio',
          tombamento: CODIGO_TIER_C,
          descricao: 'CADEIRA E2E TIER C',
          categoriaId: categoria!._id,
          localizacaoId: null,
          criticidade: 'baixa',
          tierManutencao: 'C',
          status: 'em_operacao',
          statusCadastro: 'importado',
          createdAt: agora,
          updatedAt: agora,
        },
      },
      { upsert: true },
    );
  });

  test.afterAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });

  test('digitar o tombamento abre a ficha, e o chamado aberto dela aparece na ficha', async ({
    page,
  }) => {
    await login(page, 'preposto');
    await page.goto('/ativos/ler');

    // Zeros à esquerda não atrapalham (AC-11).
    await page.getByLabel(/tombamento ou código/i).fill(`00${CODIGO}`);
    await page.getByRole('button', { name: /abrir ficha/i }).click();

    await expect(page).toHaveURL(/\/ativos\/[a-f0-9]{24}$/);
    await expect(page.getByRole('heading', { name: /SPLIT E2E 12000 BTUS/ })).toBeVisible();
    const fichaUrl = page.url();

    await page.getByRole('link', { name: /abrir chamado deste ativo/i }).click();
    await expect(page).toHaveURL(/\/meus-chamados$/);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(CODIGO)).toBeVisible();

    const localExato = `Sala E2E Ativo ${Date.now()}`;
    await dialog.getByRole('combobox', { name: /unidade/i }).click();
    await page.getByRole('option').first().click();
    await dialog.getByLabel(/local exato/i).fill(localExato);
    await dialog.getByText('Ar-Condicionado').click();
    await selectFirstSubtypeAndCatalogService(page, dialog);
    await dialog.getByPlaceholder(/descreva/i).fill('Split pingando água (E2E de ativos).');
    await dialog.getByText('Padrão').first().click();
    await dialog.getByRole('button', { name: /abrir chamado|enviar|criar/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    await page.goto(fichaUrl);
    const tabela = page.getByRole('table');
    await expect(tabela.getByRole('row').nth(1)).toBeVisible();
    await expect(tabela.getByRole('link', { name: /^#/ }).first()).toBeVisible();
  });

  test('código desconhecido mostra "Ativo não cadastrado" e o atalho para a gestão', async ({
    page,
  }) => {
    await login(page, 'preposto');
    await page.goto('/ativos/ler');
    await page.getByLabel(/tombamento ou código/i).fill('99999999');
    await page.getByRole('button', { name: /abrir ficha/i }).click();
    await expect(page.getByText('Ativo não cadastrado')).toBeVisible();
    await expect(page.getByRole('link', { name: /cadastrar este ativo/i })).toHaveAttribute(
      'href',
      '/ativos/novo?tombamento=99999999',
    );
  });

  test('ativo Tier C não oferece abrir chamado e explica por quê (AC-14)', async ({ page }) => {
    await login(page, 'solicitante');
    await page.goto('/ativos/ler');
    await page.getByLabel(/tombamento ou código/i).fill(CODIGO_TIER_C);
    await page.getByRole('button', { name: /abrir ficha/i }).click();
    await expect(page.getByRole('heading', { name: /CADEIRA E2E TIER C/ })).toBeVisible();
    await expect(page.getByText(/Tier C: fica só no cadastro e não recebe chamado/)).toBeVisible();
    await expect(page.getByRole('link', { name: /abrir chamado deste ativo/i })).toHaveCount(0);
  });

  test('Solicitante não chega ao cadastro (AC-17)', async ({ page }) => {
    await login(page, 'solicitante');
    await page.goto('/ativos/novo');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
