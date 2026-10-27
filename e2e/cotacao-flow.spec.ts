/**
 * Testes E2E: cotação e fornecimento de material (spec 0019, Fatia 1).
 *
 * Cenários cobertos:
 * 1. Pausa: "Falta de Peça (Responsabilidade da Contratada)" continua
 *    bloqueada, e o motivo de cotação ("Aguardando Aprovação do Cliente")
 *    não aparece para ninguém: a pausa por cotação só nasce do envio da
 *    cotação de material (AC-18).
 * 2. O fio da cotação de material:
 *    - o técnico registra o material no chamado (AC-1);
 *    - o Preposto, como responsável técnico, monta com 3 orçamentos e envia,
 *      e o chamado pausa (AC-2, AC-4);
 *    - o Admin, como fiscal, assume e encaminha (AC-5, AC-6);
 *    - o Admin, como aprovador, aprova no empenho E2E, e o chamado retoma
 *      (AC-7, AC-8);
 *    - o técnico registra a execução com evidência (AC-10);
 *    - o solicitante vê só a situação, sem valor (AC-15).
 *
 * PRÉ-REQUISITOS
 * ──────────────
 * 1. Servidor rodando em localhost:3000 (ou E2E_BASE_URL), no mesmo banco do
 *    MONGODB_URI usado aqui.
 * 2. Seed executado (`scripts/seed.js`) e o global-setup (usuários E2E).
 * 3. `garantirCadastroMaterial` cria empenho, faixa e designações que faltarem.
 *
 * NÃO EXECUTAR contra o banco de desenvolvimento: o global-setup desfaz as
 * atribuições dos técnicos E2E.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import { selectFirstEligibleTechnicianAndAtribuir } from './fixtures/atribuir-dialog';
import { login } from './fixtures/auth';
import { selectFinalPriorityInClassificarDialog } from './fixtures/classificar-dialog';
import { gestaoChamadoCard, gestaoRowAtribuirButton } from './fixtures/gestao';
import { EMPENHO_E2E, garantirCadastroMaterial, pdf } from './fixtures/material';
import {
  clickChamadosAtribuidosRowOpenDetail,
  gotoChamadosAtribuidosReady,
  gotoGestaoChamadosReady,
} from './fixtures/navigation';
import { selectFirstSubtypeAndCatalogService } from './fixtures/new-ticket-dialog';
import { abrirPauseDialogNaDetalhe, selecionarMotivoPausa } from './fixtures/pause-dialog';

// ---------------------------------------------------------------------------
// Helpers locais
// ---------------------------------------------------------------------------

async function criarChamadoEmAtendimento(page: Page, sufixo: string): Promise<string> {
  const titulo = `E2E Material ${sufixo} ${Date.now()}`;

  await login(page, 'solicitante');
  await page.goto('/meus-chamados');
  await page.getByRole('button', { name: /novo chamado/i }).click();

  const novoDialog = page.getByRole('dialog');
  await expect(novoDialog).toBeVisible();
  await novoDialog.getByRole('combobox', { name: /unidade/i }).click();
  await page.getByRole('option').first().click();
  // titulo no localExato torna o título auto-gerado localizável na gestão.
  await novoDialog.getByLabel(/local exato/i).fill(titulo);
  await novoDialog.getByText('Manutenção Predial').click();
  await selectFirstSubtypeAndCatalogService(page, novoDialog);
  await novoDialog.getByPlaceholder(/descreva/i).fill(titulo);
  await novoDialog.getByText('Padrão').first().click();
  await novoDialog.getByRole('button', { name: /abrir chamado|enviar|criar/i }).click();
  await expect(novoDialog).not.toBeVisible({ timeout: 15000 });

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

/** Abre a tela do chamado como técnico e devolve o caminho dela. */
async function abrirChamadoDoTecnico(page: Page, titulo: string): Promise<string> {
  await login(page, 'tecnico');
  await gotoChamadosAtribuidosReady(page);
  await clickChamadosAtribuidosRowOpenDetail(page, titulo);
  await page.waitForURL(/\/chamados-atribuidos\/.+/, { timeout: 30000, waitUntil: 'commit' });
  return new URL(page.url()).pathname;
}

/**
 * O selo da situação no cabeçalho do detalhe (spec 0021). Não use `getByText`
 * com o nome da situação: a jornada mostra os nomes de todas as etapas desde o
 * rascunho, e a espera passaria antes da ação terminar.
 */
function seloDoDetalhe(page: Page) {
  return page
    .locator('header')
    .filter({ has: page.getByRole('heading', { level: 1 }) })
    .locator('[data-situacao]')
    .first();
}

/** O cartão de material na tela do chamado, nas quatro versões (spec 0021). */
const CARTAO_MATERIAL = '[data-cartao-material]';

function cartaoMaterial(page: Page) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: 'Material' }) });
}

/** Abre a cotação pela fila de quem está logado. */
async function abrirCotacaoNaFila(page: Page, numero: string, aba = 'todas') {
  await page.goto(`/cotacoes?aba=${aba}`);
  await page.getByRole('link', { name: numero }).click();
  await page.waitForURL(/\/cotacoes\/[a-f\d]{24}$/, { timeout: 30000 });
  await expect(page.getByRole('heading', { name: `Cotação ${numero}` })).toBeVisible({
    timeout: 15000,
  });
}

// ---------------------------------------------------------------------------
// Suite 1: o diálogo de pausa (AC-18)
// ---------------------------------------------------------------------------

test.describe.serial('Cotação de material: o diálogo de pausa', () => {
  let titulo = '';

  test('cria chamado até em atendimento', async ({ page }) => {
    test.slow();
    titulo = await criarChamadoEmAtendimento(page, 'Pausa');
  });

  test('técnico recebe alerta ao escolher a peça de responsabilidade da contratada', async ({
    page,
  }) => {
    await abrirChamadoDoTecnico(page, titulo);
    const dialog = await abrirPauseDialogNaDetalhe(page);
    await selecionarMotivoPausa(page, dialog, 'Falta de Peça (Responsabilidade da Contratada)');

    await expect(dialog.getByText(/responsabilidade da contratada/i).first()).toBeVisible();
    await expect(dialog.getByRole('button', { name: /pausar atendimento/i })).toBeDisabled();
  });

  test('o motivo de cotação não aparece no diálogo de pausa (AC-18)', async ({ page }) => {
    await abrirChamadoDoTecnico(page, titulo);
    const dialog = await abrirPauseDialogNaDetalhe(page);
    await dialog.getByRole('combobox').first().click();

    await expect(
      page.getByRole('option', { name: 'Falta de Peça (Aguardando Aprovação do Cliente)' }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
  });
});

// ---------------------------------------------------------------------------
// Suite 2: o fio da cotação de material
// ---------------------------------------------------------------------------

test.describe.serial('Cotação de material: do registro do técnico à execução', () => {
  let titulo = '';
  let caminhoDoChamado = '';
  let numero = '';

  test.beforeAll(async () => {
    await garantirCadastroMaterial();
  });

  test('cria chamado até em atendimento', async ({ page }) => {
    test.slow();
    titulo = await criarChamadoEmAtendimento(page, 'Fio');
  });

  test('técnico registra o material do diagnóstico (AC-1)', async ({ page }) => {
    test.skip(!titulo, 'setup não executado');
    caminhoDoChamado = await abrirChamadoDoTecnico(page, titulo);

    const cartao = cartaoMaterial(page);
    await cartao.getByRole('button', { name: 'Registrar material' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Descrição').fill('Disjuntor bipolar 40 A');
    await dialog.getByLabel('Quantidade').fill('2');
    await dialog.getByLabel('Para que serve').fill('Trocar o disjuntor queimado do quadro');
    await dialog.getByRole('button', { name: 'Registrar' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 15000 });

    await expect(cartao.getByText('Rascunho')).toBeVisible({ timeout: 15000 });
    numero = (await cartao.getByText(/^COT-\d{4}-\d{4}$/).innerText()).trim();
    expect(numero).toMatch(/^COT-\d{4}-\d{4}$/);
  });

  test('o rascunho não aparece na fila do fiscal (AC-1)', async ({ page }) => {
    test.skip(!numero, 'material não registrado');
    await login(page, 'admin');
    await page.goto('/cotacoes?aba=todas');
    await expect(page.getByRole('heading', { name: 'Cotações de material' })).toBeVisible();
    await expect(page.getByRole('link', { name: numero })).toHaveCount(0);
  });

  test('responsável técnico monta com 3 orçamentos e envia; o chamado pausa (AC-2, AC-4)', async ({
    page,
  }) => {
    test.slow();
    test.skip(!numero, 'material não registrado');
    await login(page, 'preposto');
    await abrirCotacaoNaFila(page, numero, 'minhas');

    // Spec 0021, fatia 5 (AC-12): o editor tem 4 passos; o item do diagnóstico
    // vai para três orçamentos, que moram no passo 3.
    const passos = page.getByRole('navigation', { name: 'Passos da montagem' });
    await expect(passos.getByRole('button', { name: /Itens/ })).toHaveAttribute(
      'aria-current',
      'step',
    );
    await semViolacaoNoAxe(page);
    await passos.getByRole('button', { name: /Orçamentos/ }).click();

    // Fatia 4: o item do caminho 3 precisa de ao menos uma referência de preço (AC-32).
    const refs = page.getByRole('region', { name: 'Referências de preço' });
    await refs.getByLabel('Outra fonte').check();
    await refs.getByLabel('Fonte da referência').fill('Painel de preços do governo');
    await refs.getByLabel('Valor unitário').fill('100,00');
    await refs
      .getByLabel('Data da referência')
      .fill(new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10));
    await refs.getByRole('button', { name: 'Acrescentar referência' }).click();
    await expect(refs.getByText(/Painel de preços do governo/)).toBeVisible();

    const precos = ['12,00', '10,00', '11,00'];
    for (const [i, preco] of precos.entries()) {
      const n = i + 1;
      await page.getByRole('button', { name: 'Acrescentar orçamento' }).click();
      const orc = page
        .locator('fieldset')
        .filter({ hasText: `Orçamento ${n}` })
        .last();
      await orc.getByLabel('Fornecedor').fill(`Loja E2E ${n}`);
      await orc.getByLabel('CNPJ').fill(`${n}${n}.${n}${n}${n}.${n}${n}${n}/0001-91`);
      await orc.getByLabel('Data', { exact: true }).fill('2026-10-10');
      // Fatia 4: a validade é obrigatória no envio (AC-34).
      await orc.getByLabel(/Validade/).fill('2099-12-31');
      await orc.locator('input[type=file]').setInputFiles(pdf(`orcamento-${n}.pdf`));
      await expect(orc.getByText(`orcamento-${n}.pdf`)).toBeVisible({ timeout: 15000 });
      // Spec 0021 (AC-14): o preço vai na grade, uma célula por fornecedor.
      await page.getByLabel(`Disjuntor bipolar 40 A, Loja E2E ${n}, preço unitário`).fill(preco);
    }
    // Spec 0021 (AC-15): a lista ao vivo e o total pelo menor preço (R$ 10,00 × 2).
    await expect(page.getByRole('region', { name: 'Total até agora' })).toContainText('R$ 20,00');
    await expect(
      page.getByRole('region', { name: 'Pronta para enviar?' }).getByText('Falta:'),
    ).toHaveCount(0);
    await semViolacaoNoAxe(page);

    // A 390 px, a grade rola dentro da própria caixa, não a página (AC-25).
    await page.setViewportSize({ width: 390, height: 844 });
    const largura = await page.evaluate(() => ({
      conteudo: document.documentElement.scrollWidth,
      janela: document.documentElement.clientWidth,
    }));
    expect(largura.conteudo).toBeLessThanOrEqual(largura.janela);
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.getByRole('button', { name: 'Continuar para revisar e enviar' }).click();
    await page.getByRole('button', { name: 'Salvar e enviar para análise' }).click();
    await expect(seloDoDetalhe(page)).toHaveAttribute('data-situacao', 'enviada', {
      timeout: 15000,
    });

    await login(page, 'tecnico');
    await page.goto(caminhoDoChamado);
    await expect(page.getByText(/aguardando terceiros/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('fiscal assume e encaminha para aprovação (AC-5, AC-6)', async ({ page }) => {
    test.slow();
    test.skip(!numero, 'material não registrado');
    await login(page, 'admin');
    await abrirCotacaoNaFila(page, numero, 'analise');

    await page.getByRole('button', { name: 'Assumir análise' }).click();
    await expect(page.getByRole('button', { name: 'Encaminhar para aprovação' })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: 'Encaminhar para aprovação' }).click();
    await expect(seloDoDetalhe(page)).toHaveAttribute('data-situacao', 'em_aprovacao', {
      timeout: 15000,
    });
  });

  test('aprovador aprova no empenho E2E, reservando o saldo; o chamado retoma (AC-7, AC-8)', async ({
    page,
  }) => {
    test.slow();
    test.skip(!numero, 'material não registrado');
    await login(page, 'admin');
    await abrirCotacaoNaFila(page, numero, 'aprovacao');

    await page.getByRole('button', { name: 'Aprovar', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: new RegExp(EMPENHO_E2E) }).check();
    await dialog.getByRole('button', { name: 'Aprovar e reservar' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 15000 });

    await expect(seloDoDetalhe(page)).toHaveAttribute('data-situacao', 'autorizada', {
      timeout: 15000,
    });
    // Spec 0021, AC-8: depois da reserva, o bloco mostra só o empenho da cotação.
    const empenho = page.getByRole('region', { name: 'Empenho' });
    await expect(empenho.getByText(EMPENHO_E2E)).toBeVisible();
    await expect(empenho.getByText('Esta cotação')).toBeVisible();
    await page.getByRole('tab', { name: 'Trilha' }).click();
    await expect(page.getByText(/limite no ato/)).toBeVisible();

    await login(page, 'tecnico');
    await page.goto(caminhoDoChamado);
    await expect(page.getByRole('button', { name: /pausar atendimento/i })).toBeVisible({
      timeout: 15000,
    });
  });

  test('técnico registra a execução com evidência, sem o diálogo fechar no upload (AC-10)', async ({
    page,
  }) => {
    test.slow();
    test.skip(!numero, 'material não registrado');
    await login(page, 'tecnico');
    await page.goto(caminhoDoChamado);

    const cartao = cartaoMaterial(page);
    await expect(cartao.getByText('Aplicar o material')).toBeVisible({ timeout: 15000 });
    await semViolacaoNoAxe(page, CARTAO_MATERIAL);
    await cartao.getByRole('button', { name: 'Registrar execução', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: /execução do material/i })).toBeVisible();

    await dialog.locator('#evid-arquivo').setInputFiles(pdf('evidencia.pdf'));
    await expect(dialog.getByRole('link', { name: 'evidencia.pdf' })).toBeVisible({
      timeout: 15000,
    });

    await dialog.getByLabel(/Aplicado/).fill('1');
    await dialog.getByRole('button', { name: 'Registrar execução' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 15000 });
    await expect(cartao.getByText('Executada')).toBeVisible({ timeout: 15000 });
  });

  test('o solicitante vê só a fase do material, sem valor (AC-15; spec 0021, AC-16)', async ({
    page,
  }) => {
    test.skip(!numero, 'material não registrado');
    await login(page, 'solicitante');
    await page.goto(caminhoDoChamado.replace('/chamados-atribuidos/', '/meus-chamados/'));

    const cartao = page.getByRole('region', { name: 'Material' });
    await expect(cartao).toHaveAttribute('data-fase', 'instalacao', { timeout: 15000 });
    await expect(cartao.getByRole('heading', { name: 'Material aplicado' })).toBeVisible();
    await expect(cartao.locator('[aria-current="step"]')).toHaveText('Instalação');
    await expect(cartao.getByText(numero)).toHaveCount(0);
    await expect(page.getByText(/R\$\s*10,00|R\$\s*20,00/)).toHaveCount(0);
    await semViolacaoNoAxe(page, CARTAO_MATERIAL);
  });

  test('a fila busca pelo número e guarda o filtro no endereço, sem violação no axe (spec 0021, AC-3, AC-26)', async ({
    page,
  }) => {
    test.skip(!numero, 'material não registrado');
    await login(page, 'admin');
    await page.goto('/cotacoes?aba=todas');
    const busca = page.getByLabel('Buscar cotação');
    await busca.fill(numero);
    await busca.press('Enter');
    await page.waitForURL(/[?&]q=COT-/);
    await expect(page.getByRole('link', { name: numero })).toBeVisible({ timeout: 15000 });

    await page.reload();
    await expect(page.getByLabel('Buscar cotação')).toHaveValue(numero);
    await expect(page.getByRole('tab', { name: /Todas/, selected: true })).toBeVisible();
    await semViolacaoNoAxe(page);
  });

  test('a fila vira cartões a 390 px, sem rolagem horizontal (spec 0021, AC-4, AC-25)', async ({
    page,
  }) => {
    test.skip(!numero, 'material não registrado');
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, 'admin');
    await page.goto('/cotacoes?aba=todas');
    await expect(page.getByRole('link', { name: numero })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('table')).toBeHidden();
    const largura = await page.evaluate(() => ({
      conteudo: document.documentElement.scrollWidth,
      janela: document.documentElement.clientWidth,
    }));
    expect(largura.conteudo).toBeLessThanOrEqual(largura.janela);
    await semViolacaoNoAxe(page);
  });

  test('o detalhe abre com a jornada e o painel, sem violação no axe, no desktop e a 390 px (spec 0021, AC-5, AC-6, AC-25, AC-26)', async ({
    page,
  }) => {
    test.skip(!numero, 'material não registrado');
    await login(page, 'admin');
    await abrirCotacaoNaFila(page, numero);
    await expect(page.getByRole('list', { name: 'Jornada da cotação' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Itens e preços', selected: true })).toBeVisible();
    // Spec 0021, fatia 3 (AC-9): executada, o ateste vem com as três etapas e o aplicado.
    await expect(page.getByRole('list', { name: 'Etapas do ateste' })).toBeVisible();
    await expect(page.getByRole('region', { name: /autorizado e do aplicado/ })).toBeVisible();
    await semViolacaoNoAxe(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole('list', { name: 'Jornada da cotação' })).toBeVisible({
      timeout: 15000,
    });
    const largura = await page.evaluate(() => ({
      conteudo: document.documentElement.scrollWidth,
      janela: document.documentElement.clientWidth,
    }));
    expect(largura.conteudo).toBeLessThanOrEqual(largura.janela);
    await semViolacaoNoAxe(page);
  });

  test('o gestor registra o recebimento provisório pelo painel "Sua vez" (spec 0021, AC-6, AC-9)', async ({
    page,
  }) => {
    test.skip(!numero, 'material não registrado');
    await login(page, 'admin');
    await abrirCotacaoNaFila(page, numero);
    const painel = page.getByRole('region', { name: 'Receber o material' });
    await painel.getByRole('button', { name: 'Registrar recebimento provisório' }).click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: 'Registrar o recebimento provisório' }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirmar' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 15000 });
    const etapas = page.getByRole('list', { name: 'Etapas do ateste' }).getByRole('listitem');
    await expect(etapas.first()).toContainText('Registrado', { timeout: 15000 });
    await expect(etapas.nth(1)).toHaveAttribute('aria-current', 'step');
  });
});

// ---------------------------------------------------------------------------
// Suite 3: o cadastro de material em seções (spec 0021, fatia 7)
// ---------------------------------------------------------------------------

const SECOES_CADASTRO_E2E = [
  ['empenhos', 'Empenhos'],
  ['designacoes', 'Designações'],
  ['faixas', 'Faixas de aprovação'],
  ['anexo-v', 'Anexo V'],
  ['sinapi', 'SINAPI'],
  ['parametros', 'Parâmetros'],
] as const;

test.describe.serial('Cotação de material: o cadastro em seções', () => {
  test('a seção vai no endereço e sobrevive ao recarregar; desativar faixa pede confirmação (spec 0021, AC-18, AC-19, AC-21)', async ({
    page,
  }) => {
    await garantirCadastroMaterial();
    await login(page, 'admin');
    await page.goto('/configuracoes/material');
    await expect(page.getByRole('region', { name: 'Para aprovar a primeira cotação' })).toBeVisible(
      { timeout: 15000 },
    );
    const nav = page.getByRole('navigation', { name: 'Seções do cadastro' });
    await expect(nav.getByRole('link', { name: /^Empenhos/ })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await nav.getByRole('link', { name: /^Faixas de aprovação/ }).click();
    await expect(page).toHaveURL(/\?secao=faixas$/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Faixas de aprovação', level: 2 })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('list', { name: 'Escada de limites' })).toBeVisible();

    await page
      .getByRole('button', { name: /^Desativar a faixa/ })
      .first()
      .click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByRole('button', { name: 'Desativar faixa' })).toBeVisible();
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialogo).not.toBeVisible();
  });

  test('as seis seções passam no axe, no desktop e a 390 px sem rolagem horizontal (spec 0021, AC-25, AC-26)', async ({
    page,
  }) => {
    test.slow();
    await login(page, 'admin');
    for (const largura of [1280, 390]) {
      await page.setViewportSize({ width: largura, height: 900 });
      for (const [secao, titulo] of SECOES_CADASTRO_E2E) {
        await page.goto(`/configuracoes/material?secao=${secao}`);
        await expect(
          page.getByRole('heading', { name: titulo, level: 2, exact: true }),
        ).toBeVisible({
          timeout: 15000,
        });
        const medida = await page.evaluate(() => ({
          conteudo: document.documentElement.scrollWidth,
          janela: document.documentElement.clientWidth,
        }));
        expect(medida.conteudo, `${secao} a ${largura} px`).toBeLessThanOrEqual(medida.janela);
        await semViolacaoNoAxe(page);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 4: o relatório de material (spec 0021, fatia 8)
// ---------------------------------------------------------------------------

test.describe.serial('Cotação de material: o relatório', () => {
  test('os atalhos trocam o período, e a tela passa no axe no desktop e a 390 px (spec 0021, AC-23, AC-25, AC-26)', async ({
    page,
  }) => {
    await login(page, 'admin');
    await page.goto('/relatorios/material');
    const periodo = page.getByRole('region', { name: 'Período do relatório' });
    await expect(periodo.getByRole('link', { name: 'Mês atual' })).toHaveAttribute(
      'aria-current',
      'true',
      { timeout: 15000 },
    );
    await expect(page.getByRole('region', { name: 'Pontos de atenção' })).toBeVisible();
    await semViolacaoNoAxe(page);

    await periodo.getByRole('link', { name: 'Ano atual' }).click();
    await expect(page).toHaveURL(/inicio=\d{4}-01-01/);
    await expect(periodo.getByRole('link', { name: 'Ano atual' })).toHaveAttribute(
      'aria-current',
      'true',
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole('region', { name: 'Custo por equipamento' })).toBeVisible({
      timeout: 15000,
    });
    const medida = await page.evaluate(() => ({
      conteudo: document.documentElement.scrollWidth,
      janela: document.documentElement.clientWidth,
    }));
    expect(medida.conteudo).toBeLessThanOrEqual(medida.janela);
    await semViolacaoNoAxe(page);
  });
});

/**
 * As telas do módulo passam no axe (AC-26): contraste e controles, só dentro do
 * `main`. Na tela do chamado, só dentro do cartão de material, que é do módulo.
 */
async function semViolacaoNoAxe(page: Page, dentroDe = 'main') {
  const resultado = await new AxeBuilder({ page })
    .include(dentroDe)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(resultado.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}
