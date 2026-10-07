import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import mongoose from 'mongoose';
import { resolve } from 'path';

import { login } from './fixtures/auth';

/**
 * Relatório mensal por contrato (spec 0016), de ponta a ponta: o Admin
 * cadastra o contrato pela tela, abre o relatório do mês passado, baixa o PDF
 * e vê a emissão na lista; o Preposto não chega à tela nem à rota do PDF.
 *
 * O contrato é fictício (número `E2E-0016`) e sai do banco no fim.
 *
 * covers: AC-1, AC-2, AC-5, AC-16, AC-19, AC-20
 */

const NUMERO = 'E2E-0016';

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

/** O mês passado e uma vigência que o cobre, sempre relativos a hoje. */
function datas() {
  const hoje = new Date();
  const passado = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1));
  const mes = passado.toISOString().slice(0, 7);
  const fim = new Date(Date.UTC(passado.getUTCFullYear() + 1, passado.getUTCMonth(), 0));
  return {
    mes,
    mesTela: `${mes.slice(5, 7)}/${mes.slice(0, 4)}`,
    inicio: `${mes}-01`,
    fim: fim.toISOString().slice(0, 10),
  };
}

async function limpar() {
  const db = mongoose.connection.db!;
  const contratos = await db
    .collection('contratos')
    .find({ numeroNormalizado: NUMERO.toLowerCase() })
    .toArray();
  const ids = contratos.map((c) => c._id);
  await db.collection('relatoriocontratoemissoes').deleteMany({ contratoId: { $in: ids } });
  await db.collection('contratos').deleteMany({ _id: { $in: ids } });
}

test.describe('Relatório por contrato', () => {
  test.beforeAll(async () => {
    const uri = carregarMongoUri();
    test.skip(!uri, 'MONGODB_URI ausente: sem banco para limpar o contrato do teste.');
    await mongoose.connect(uri!);
    await limpar();
  });

  test.afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await limpar();
      await mongoose.disconnect();
    }
  });

  test('o Admin cadastra o contrato, abre o mês e baixa o PDF com a emissão registrada', async ({
    page,
  }) => {
    const d = datas();
    await login(page, 'admin');

    await page.goto('/configuracoes/contratos');
    await page.getByRole('button', { name: 'Novo contrato' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Número').fill(NUMERO);
    await dialogo.getByLabel('Processo SEI').fill('0000016-00.2026');
    await dialogo.getByLabel('Empresa contratada').fill('Empresa E2E Ltda');
    await dialogo.getByLabel('CNPJ').fill('11.222.333/0001-82');
    await dialogo.getByLabel('Início da vigência').fill(d.inicio);
    await dialogo.getByLabel('Fim da vigência').fill(d.fim);
    await dialogo.getByRole('checkbox', { name: 'Elevador' }).click();
    await dialogo.getByRole('button', { name: 'Salvar' }).click();
    await expect(dialogo.getByRole('alert')).toHaveText('CNPJ inválido.');

    await dialogo.getByLabel('CNPJ').fill('11.222.333/0001-81');
    await dialogo.getByRole('button', { name: 'Salvar' }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.getByRole('cell', { name: `${NUMERO} Empresa E2E Ltda` })).toBeVisible();

    await page.goto('/relatorios/contrato');
    await page.getByLabel('Contrato').selectOption({ label: `${NUMERO} · Empresa E2E Ltda` });
    await page.getByLabel('Mês').selectOption({ label: d.mesTela });
    await page.getByRole('button', { name: 'Ver relatório' }).click();
    await expect(page).toHaveURL(new RegExp(`mes=${d.mes}`));
    await expect(page.getByText(`Contrato ${NUMERO}`)).toBeVisible();
    await expect(page.getByText('Nenhum PDF emitido para este mês.')).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Gerar PDF' }).click();
    expect((await download).suggestedFilename()).toBe(`relatorio-contrato-${NUMERO}-${d.mes}.pdf`);

    await expect(page.getByText('Nenhum PDF emitido para este mês.')).toBeHidden();
    await expect(page.getByRole('cell', { name: 'Administrador E2E' })).toBeVisible();
  });

  test('o Preposto não abre a tela e recebe 403 na rota do PDF', async ({ page }) => {
    await login(page, 'preposto');

    await page.goto('/relatorios/contrato');
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/configuracoes/contratos');
    await expect(page).toHaveURL(/\/dashboard/);

    const resposta = await page.request.post('/api/relatorios/contrato/pdf', {
      data: { contratoId: 'a'.repeat(24), mes: datas().mes },
    });
    expect(resposta.status()).toBe(403);
  });
});
