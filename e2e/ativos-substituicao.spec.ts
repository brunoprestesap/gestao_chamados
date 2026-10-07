import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import mongoose from 'mongoose';
import { resolve } from 'path';

import { login } from './fixtures/auth';

/**
 * Candidatos à substituição (spec 0015), de ponta a ponta: o Preposto acha o
 * equipamento velho no filtro da lista, vê o selo na ficha, dispensa com
 * motivo e volta a sinalizar; o Técnico não vê o filtro nem a seção, mesmo
 * com o parâmetro na URL.
 *
 * O ativo e a categoria são fictícios e criados direto no banco.
 *
 * covers: AC-2, AC-9, AC-10, AC-11, AC-15, AC-17
 */

const CODIGO = '990150';
/** Ativo novo, que não bate critério nenhum. */
const CODIGO_NOVO = '990151';
/** Começo comum aos dois códigos, para a busca da lista trazer só eles. */
const PREFIXO = '99015';
const MOTIVO = 'Troca prevista no plano de compras (E2E).';

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

test.describe('Candidatos à substituição', () => {
  let ativoId = '';

  test.beforeAll(async () => {
    const uri = carregarMongoUri();
    test.skip(!uri, 'MONGODB_URI ausente: sem banco para criar o ativo do teste.');
    await mongoose.connect(uri!);
    const db = mongoose.connection.db!;
    const agora = new Date();
    await db.collection('categoriasativo').updateOne(
      { chave: 'e2e_substituicao' },
      {
        $setOnInsert: {
          chave: 'e2e_substituicao',
          nome: 'Substituição E2E',
          criticidadePadrao: 'media',
          serviceSubTypeId: null,
          exigeDocumento: [],
          isActive: true,
          createdAt: agora,
          updatedAt: agora,
        },
        // Vida útil curta e limites vazios: o ativo bate só pela idade.
        $set: { vidaUtilAnos: 5, limiteCorretivos12m: null, limiteReincidencia90d: null },
      },
      { upsert: true },
    );
    const categoria = await db.collection('categoriasativo').findOne({ chave: 'e2e_substituicao' });
    await db.collection('ativos').updateOne(
      { codigo: CODIGO },
      {
        $setOnInsert: {
          codigo: CODIGO,
          origemCodigo: 'patrimonio',
          tombamento: CODIGO,
          descricao: 'SPLIT VELHO E2E',
          localizacaoId: null,
          criticidade: 'media',
          statusCadastro: 'importado',
          createdAt: agora,
        },
        $set: {
          categoriaId: categoria!._id,
          tierManutencao: 'A',
          status: 'em_operacao',
          dataInstalacao: new Date(Date.UTC(agora.getUTCFullYear() - 8, 0, 15, 12)),
          updatedAt: agora,
        },
        // Cada execução começa sem dispensa.
        $unset: { dispensaSubstituicao: '' },
      },
      { upsert: true },
    );
    await db.collection('ativos').updateOne(
      { codigo: CODIGO_NOVO },
      {
        $setOnInsert: {
          codigo: CODIGO_NOVO,
          origemCodigo: 'patrimonio',
          tombamento: CODIGO_NOVO,
          descricao: 'SPLIT NOVO E2E',
          localizacaoId: null,
          criticidade: 'media',
          statusCadastro: 'importado',
          createdAt: agora,
        },
        $set: {
          categoriaId: categoria!._id,
          tierManutencao: 'A',
          status: 'em_operacao',
          dataInstalacao: agora,
          updatedAt: agora,
        },
      },
      { upsert: true },
    );
    const ativo = await db.collection('ativos').findOne({ codigo: CODIGO });
    ativoId = String(ativo!._id);
    // O ativo é fictício: cada execução começa sem o histórico das anteriores,
    // para os textos de dispensa aparecerem uma vez só na linha do tempo.
    await db.collection('ativohistorico').deleteMany({ ativoId: ativo!._id });
  });

  test.afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection
        .db!.collection('ativos')
        .updateOne({ codigo: CODIGO }, { $unset: { dispensaSubstituicao: '' } });
      await mongoose.disconnect();
    }
  });

  test('o Preposto acha o candidato, dispensa com motivo e volta a sinalizar', async ({ page }) => {
    await login(page, 'preposto');

    // A busca pelo código mantém os dois ativos do teste na página 1, por
    // mais candidatos que o banco tenha (a lista pagina de 50 em 50).
    await page.goto(`/ativos?substituicao=candidatos&q=${PREFIXO}`);
    await expect(page.getByRole('combobox', { name: 'Substituição' })).toBeVisible();
    await expect(page.getByRole('link', { name: CODIGO })).toBeVisible();
    await expect(page.getByRole('link', { name: CODIGO_NOVO })).toHaveCount(0);

    await page.getByRole('link', { name: CODIGO }).click();
    const secao = page.getByRole('region', { name: 'Substituição do equipamento' });
    await expect(secao.getByText('Candidato à substituição')).toBeVisible();
    await expect(secao.getByText(/^\d+ anos, vida útil 5$/)).toBeVisible();

    await secao.getByRole('button', { name: `Dispensar ${CODIGO}` }).click();
    const dialogo = page.getByRole('dialog', { name: `Dispensar ${CODIGO}` });
    await dialogo.getByLabel('Motivo').fill(MOTIVO);
    await dialogo.getByRole('button', { name: 'Dispensar' }).click();
    await expect(dialogo).not.toBeVisible();

    await expect(
      secao.getByText(/^Substituição dispensada até \d{2}\/\d{2}\/\d{4}$/),
    ).toBeVisible();
    await expect(secao.getByText(MOTIVO)).toBeVisible();
    // O histórico registra a dispensa sem o texto do motivo.
    await expect(page.getByText(/^Até \d{2}\/\d{2}\/\d{4} · critérios: idade$/)).toBeVisible();
    await expect(page.getByText(MOTIVO)).toHaveCount(1);

    await page.goto(`/ativos?substituicao=dispensados&q=${PREFIXO}`);
    await expect(page.getByRole('link', { name: CODIGO })).toBeVisible();

    await page.goto(`/ativos/${ativoId}`);
    await secao.getByRole('button', { name: 'Voltar a sinalizar' }).click();
    await page
      .getByRole('dialog', { name: `Voltar a sinalizar ${CODIGO}?` })
      .getByRole('button', { name: 'Voltar a sinalizar' })
      .click();
    await expect(secao.getByText('Candidato à substituição')).toBeVisible();
    await expect(page.getByText(/^Dispensa até \d{2}\/\d{2}\/\d{4} desfeita$/)).toBeVisible();
  });

  test('o Técnico não vê o filtro nem a seção, mesmo com o parâmetro na URL', async ({ page }) => {
    await login(page, 'tecnico');

    await page.goto('/ativos?substituicao=candidatos');
    await expect(page.getByRole('searchbox', { name: /Buscar ativos/ })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Substituição' })).toHaveCount(0);
    // O parâmetro é ignorado: a lista traz quem não é candidato também.
    await page.getByRole('searchbox', { name: /Buscar ativos/ }).fill(PREFIXO);
    await expect(page.getByRole('link', { name: CODIGO })).toBeVisible();
    await expect(page.getByRole('link', { name: CODIGO_NOVO })).toBeVisible();

    await page.goto(`/ativos/${ativoId}`);
    await expect(page.getByRole('heading', { name: 'SPLIT VELHO E2E' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Substituição do equipamento' })).toHaveCount(0);
    await expect(page.getByText('Candidato à substituição')).toHaveCount(0);
  });
});
