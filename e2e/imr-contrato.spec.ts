import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import mongoose from 'mongoose';
import { resolve } from 'path';

import { login } from './fixtures/auth';
import { garantirCadastroMaterial } from './fixtures/material';

/**
 * IMR do contrato (spec 0023), de ponta a ponta: o Admin, que no cadastro do
 * E2E é fiscal e gestor, abre a prévia do mês passado, fecha o mês com os
 * pontos dos indicadores 1 e 2, emite o PDF e vê a emissão com o hash; o
 * Preposto não chega à tela nem à rota do PDF. O axe roda na prévia e na foto.
 *
 * O contrato é fictício (número `E2E-0023`), gravado direto no banco, e sai
 * no fim com tudo o que o IMR gravou para ele. Um chamado atrasado do mês dá
 * linhas às tabelas de ocorrências, para o axe conferir a rolagem pelo
 * teclado na foto, que não tem botão dentro da tabela.
 *
 * covers: AC-1, AC-10, AC-13, AC-14, AC-16, AC-17
 */

const NUMERO = 'E2E-0023';
const CHAMADO = 'E2E-IMR-0023';
const ROTA_PDF = '/api/relatorios/imr-contrato/pdf';

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

/** O mês passado (já terminado, então pode fechar) e uma vigência que o cobre. */
function datas() {
  const hoje = new Date();
  const passado = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1));
  const mes = passado.toISOString().slice(0, 7);
  const fim = new Date(Date.UTC(passado.getUTCFullYear() + 1, passado.getUTCMonth(), 0));
  return { mes, inicio: `${mes}-01`, fim: fim.toISOString().slice(0, 10) };
}

async function limpar() {
  const db = mongoose.connection.db!;
  const contratos = await db.collection('contratos').find({ numero: NUMERO }).toArray();
  const ids = contratos.map((c) => c._id);
  const fechamentos = await db
    .collection('imr_fechamentos')
    .find({ contratoId: { $in: ids } })
    .toArray();
  await db
    .collection('imr_fechamento_pdf_emissoes')
    .deleteMany({ fechamentoId: { $in: fechamentos.map((f) => f._id) } });
  for (const c of ['imr_fechamentos', 'imr_reaberturas', 'imr_marcacoes']) {
    await db.collection(c).deleteMany({ contratoId: { $in: ids } });
  }
  await db.collection('contratos').deleteMany({ _id: { $in: ids } });
  await db.collection('chamados').deleteMany({ ticket_number: CHAMADO });
}

/**
 * Chamado do dia 10 do mês, às 09:00 de Belém, atendido 8 dias depois: o
 * prazo (fim do expediente do primeiro dia útil seguinte) vence no mês e o
 * início veio depois dele, então é um atraso do indicador 3.
 */
async function gravarChamadoAtrasado(mes: string) {
  const abertoEm = new Date(`${mes}-10T09:00:00.000-03:00`);
  const iniciadoEm = new Date(abertoEm.getTime() + 8 * 24 * 60 * 60 * 1000);
  await mongoose.connection.db!.collection('chamados').insertOne({
    ticket_number: CHAMADO,
    titulo: 'Elevador parado no térreo com descrição longa o bastante para alargar a tabela',
    descricao: 'Chamado do E2E do IMR do contrato.',
    status: 'encerrado',
    tipoServico: 'Elevador',
    sla: { responseStartedAt: iniciadoEm },
    createdAt: abertoEm,
    updatedAt: iniciadoEm,
  });
}

async function semViolacaoNoAxe(page: Page) {
  const resultado = await new AxeBuilder({ page })
    .include('main')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

test.describe('IMR do contrato', () => {
  let contratoId = '';
  const d = datas();

  test.beforeAll(async () => {
    const uri = carregarMongoUri();
    test.skip(!uri, 'MONGODB_URI ausente: sem banco para o contrato do teste.');
    await garantirCadastroMaterial();
    await mongoose.connect(uri!);
    await limpar();
    // Tipo de serviço próprio para nenhum outro E2E cair na base do mês.
    const { insertedId } = await mongoose.connection.db!.collection('contratos').insertOne({
      numero: NUMERO,
      numeroNormalizado: NUMERO.toLowerCase(),
      empresa: 'Empresa E2E IMR Ltda',
      cnpj: '11222333000181',
      processoSei: '0000023-00.2026',
      tiposServico: ['Elevador'],
      vigenciaInicio: d.inicio,
      vigenciaFim: d.fim,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    contratoId = String(insertedId);
    await gravarChamadoAtrasado(d.mes);
  });

  test.afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await limpar();
      await mongoose.disconnect();
    }
  });

  test('o fiscal fecha o mês, emite o PDF e a emissão fica registrada', async ({ page }) => {
    await login(page, 'admin');
    await page.goto(`/relatorios/imr-contrato?contratoId=${contratoId}&mes=${d.mes}`);

    await expect(page.getByText(`Contrato ${NUMERO}`)).toBeVisible();
    await expect(page.getByText('Prévia, mês aberto')).toBeVisible();
    await expect(
      page.getByText(/soma é de quatro indicadores em 100 pontos/).first(),
    ).toBeVisible();
    // Mês aberto: o PDF ainda não existe nem pela rota.
    const aberto = await page.request.post(ROTA_PDF, {
      data: { contratoId, competencia: d.mes },
    });
    expect(aberto.status()).toBe(409);
    await semViolacaoNoAxe(page);

    await page.getByRole('button', { name: 'Fechar o mês' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Pontos (0 a 40)').fill('40');
    await dialogo.getByLabel('Pontos (0 a 20)').fill('20');
    await dialogo.getByRole('button', { name: 'Fechar o mês' }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.getByText('Fechado, versão 1')).toBeVisible();
    // A foto não tem botão na tabela: a caixa que rola precisa receber o foco.
    const ocorrencias = page.getByRole('region', { name: 'Ocorrências do indicador 3' });
    await expect(ocorrencias.getByText(CHAMADO)).toBeVisible();
    await semViolacaoNoAxe(page);
    await page.setViewportSize({ width: 390, height: 844 });
    // Em 390px só a tabela rola, dentro do próprio quadro, nunca a página.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await semViolacaoNoAxe(page);
    await page.setViewportSize({ width: 1280, height: 720 });

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Emitir PDF' }).click();
    expect((await download).suggestedFilename()).toBe(`imr-contrato-${NUMERO}-${d.mes}-v1.pdf`);

    // O nome de quem emitiu muda com o seed (local ou CI); o teste confere o hash.
    await expect(page.getByText('PDFs emitidos')).toBeVisible();
    await expect(page.getByText(/^SHA-256 [a-f0-9]{64}$/)).toHaveCount(1);
    await semViolacaoNoAxe(page);
  });

  test('o Preposto não abre a tela e recebe 403 na rota do PDF', async ({ page }) => {
    await login(page, 'preposto');

    await page.goto(`/relatorios/imr-contrato?contratoId=${contratoId}&mes=${d.mes}`);
    await expect(page).toHaveURL(/\/dashboard/);
    const r = await page.request.post(ROTA_PDF, { data: { contratoId, competencia: d.mes } });
    expect(r.status()).toBe(403);
  });
});
