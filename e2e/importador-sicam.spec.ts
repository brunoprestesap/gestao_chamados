import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import mongoose from 'mongoose';
import { resolve } from 'path';

import { CABECALHO_SICAM, linhaSicam } from '../lib/ativos/importacao/__tests__/sicam-fixture';
import { login } from './fixtures/auth';

/**
 * O fio feliz do importador do SICAM (spec 0012, parte 2): o Admin sobe um
 * export fictício em cp1252 com um novo, um alterado e um sumido, revisa,
 * marca o sumido, aplica, e vê o ativo novo em `/ativos` e a marca de ausente
 * na ficha. Cobre AC-17, AC-20, AC-22, AC-23 e AC-26.
 *
 * Os ativos são fictícios e criados direto no banco: o export real tem nome e
 * matrícula (LGPD) e fica fora do git.
 */

const NOVO = '990101';
const ALTERADO = '990102';
const SUMIDO = '990103';
const CODIGOS = [NOVO, ALTERADO, SUMIDO];

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

function csvCp1252(): Buffer {
  const linhas = [
    linhaSicam({ 'Número Tombo': NOVO, 'Descrição Material': 'SPLIT E2E IMPORTADO 9000 BTUS' }),
    linhaSicam({ 'Número Tombo': ALTERADO, 'Nome Setor': 'SETOR E2E NOVO' }),
  ];
  const texto = [CABECALHO_SICAM.join(';'), ...linhas].join('\r\n') + '\r\n';
  return Buffer.from(texto, 'latin1');
}

test.describe('Importador do SICAM: revisar e aplicar', () => {
  test.beforeAll(async () => {
    const uri = carregarMongoUri();
    test.skip(!uri, 'MONGODB_URI ausente: sem banco para preparar os ativos do teste.');
    await mongoose.connect(uri!);
    const db = mongoose.connection.db!;
    const agora = new Date();

    // Repetível: some com os ativos do teste e fecha a pendente que tenha sobrado.
    const antigos = await db
      .collection('ativos')
      .find({ codigo: { $in: CODIGOS } })
      .project({ _id: 1 })
      .toArray();
    await db
      .collection('ativohistorico')
      .deleteMany({ ativoId: { $in: antigos.map((a) => a._id) } });
    await db.collection('ativos').deleteMany({ codigo: { $in: CODIGOS } });
    await db
      .collection('importacoespatrimoniais')
      .updateMany(
        { emAberto: true },
        { $set: { status: 'descartada', descartadaEm: agora }, $unset: { emAberto: 1 } },
      );

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
    const patrimoniado = (codigo: string, setor: string) => ({
      codigo,
      origemCodigo: 'patrimonio',
      tombamento: codigo,
      descricao: `SPLIT E2E ${codigo}`,
      categoriaId: categoria!._id,
      localizacaoId: null,
      criticidade: 'media',
      tierManutencao: 'A',
      status: 'em_operacao',
      statusCadastro: 'importado',
      camposPatrimoniais: { setor, importadoEm: agora },
      createdAt: agora,
      updatedAt: agora,
    });
    await db
      .collection('ativos')
      .insertMany([patrimoniado(ALTERADO, 'SETOR E2E VELHO'), patrimoniado(SUMIDO, 'SETOR E2E')]);
  });

  test.afterAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });

  test('Admin sobe o CSV, revisa os três grupos, aplica e vê o resultado', async ({ page }) => {
    test.setTimeout(60000);
    await login(page, 'admin');
    await page.goto('/ativos/importar');

    await page.getByLabel(/arquivo do sicam/i).setInputFiles({
      name: 'SICAM-E2E.CSV',
      mimeType: 'text/csv',
      buffer: csvCp1252(),
    });
    await page.getByRole('button', { name: /enviar e revisar/i }).click();
    await expect(page).toHaveURL(/\/ativos\/importar\/[a-f0-9]{24}$/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: /revisar importação/i })).toBeVisible();

    // Novo: escolhe a categoria (marca sozinho).
    await page.getByLabel(`Categoria do ativo ${NOVO}`).selectOption({ label: 'Climatização E2E' });
    await expect(page.getByRole('checkbox', { name: `Marcar ${NOVO}` })).toBeChecked();

    // Alterado: começa marcado e mostra antes e depois.
    await expect(page.getByRole('checkbox', { name: `Marcar ${ALTERADO}` })).toBeChecked();
    await expect(page.getByText('SETOR E2E NOVO')).toBeVisible();

    // Sumido: começa desmarcado (AC-22); o teste marca só o seu.
    const sumido = page.getByRole('checkbox', { name: `Marcar ${SUMIDO}` });
    await expect(sumido).not.toBeChecked();
    await sumido.click();

    await page.getByRole('button', { name: /^aplicar$/i }).click();
    // Num banco com outros patrimoniados, o arquivo de teste deixa muitos de fora.
    const confirmar = page.getByRole('button', { name: /conferi, aplicar/i });
    if (await confirmar.isVisible({ timeout: 2000 }).catch(() => false)) await confirmar.click();

    await expect(page.getByRole('heading', { name: /resultado da importação/i })).toBeVisible({
      timeout: 15000,
    });

    // O novo aparece em /ativos.
    await page.goto(`/ativos?q=${NOVO}`);
    await expect(page.getByRole('link', { name: NOVO })).toBeVisible();

    // A ficha do sumido mostra a marca de ausente para o Admin (AC-26).
    await page.goto(`/ativos?q=${SUMIDO}`);
    await page.getByRole('link', { name: SUMIDO }).click();
    await expect(page.getByText(/Ausente do SICAM desde/)).toBeVisible();
  });

  test('Preposto não chega ao importador (AC-27)', async ({ page }) => {
    await login(page, 'preposto');
    await page.goto('/ativos/importar');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
