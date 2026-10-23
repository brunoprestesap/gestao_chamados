import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

const emitToRoom = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock('@/lib/realtime-emit', () => ({ emitToRoom }));
const enviarEmailCotacao = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock('@/lib/email/aviso-cotacao', () => ({ enviarEmailCotacao }));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));

/**
 * A fatia 4 da cotação de material contra o MongoDB de verdade (spec 0019):
 * CNPJ no salvar, referências da contratada e do fiscal, variação, orçamento
 * vencido com confirmação, e a urgência do pedido à pesquisa completa.
 *
 * covers: AC-15, AC-31, AC-32, AC-33, AC-34, AC-35
 */

function cru(m: {
  createIndexes(): PromiseLike<unknown>;
  collection: { deleteMany(f: object): Promise<unknown>; indexes(): Promise<unknown> };
}): ModelDeTeste {
  return {
    createIndexes: () => m.createIndexes(),
    deleteMany: (f) => m.collection.deleteMany(f),
    collection: m.collection,
  };
}

const rodar = temMongoDeTeste ? describe : describe.skip;

const DIA = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
/** Datas longe da virada de dia em Belém: o teste não depende da hora em que roda. */
const diasAtras = (n: number) => ymd(new Date(Date.now() - n * DIA));

const A = '11111111000191';
const A2 = '11111111000272';
const B = '22222222000191';
const C = '33333333000191';
const CONTRATADA = '03543374000141';

rodar('fatia 4 da cotação de material, contra o Mongo', () => {
  let t: typeof import('../transicoes');
  let leitura: typeof import('../leitura');
  let M: {
    Chamado: typeof import('@/models/Chamado').ChamadoModel;
    User: typeof import('@/models/user.model').UserModel;
    Cotacao: typeof import('@/models/CotacaoMaterial').CotacaoMaterialModel;
    Evento: typeof import('@/models/CotacaoMaterialEvento').CotacaoMaterialEventoModel;
    Arquivo: typeof import('@/models/ArquivoCotacao').ArquivoCotacaoModel;
    Empenho: typeof import('@/models/Empenho').EmpenhoModel;
    Designacao: typeof import('@/models/DesignacaoMaterial').DesignacaoMaterialModel;
    Faixa: typeof import('@/models/FaixaCompetencia').FaixaCompetenciaModel;
    PauseLog: typeof import('@/models/PauseLog').PauseLogModel;
    History: typeof import('@/models/ChamadoHistory').ChamadoHistoryModel;
    Notification: typeof import('@/models/Notification').NotificationModel;
    SinapiInsumo: typeof import('@/models/SinapiInsumo').SinapiInsumoModel;
    SinapiReferencia: typeof import('@/models/SinapiReferencia').SinapiReferenciaModel;
    PdfEmissao: typeof import('@/models/CotacaoMaterialPdfEmissao').CotacaoMaterialPdfEmissaoModel;
  };
  let todos: ModelDeTeste[];

  const ano = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Belem', year: 'numeric' }).format(
      new Date(),
    ),
  );

  const ids = {
    tecnico: String(new Types.ObjectId()),
    rt: String(new Types.ObjectId()),
    fiscal: String(new Types.ObjectId()),
    fiscal2: String(new Types.ObjectId()),
    aprovador: String(new Types.ObjectId()),
    gestor: String(new Types.ObjectId()),
    solicitante: String(new Types.ObjectId()),
  };

  beforeAll(async () => {
    t = await import('../transicoes');
    leitura = await import('../leitura');
    M = {
      Chamado: (await import('@/models/Chamado')).ChamadoModel,
      User: (await import('@/models/user.model')).UserModel,
      Cotacao: (await import('@/models/CotacaoMaterial')).CotacaoMaterialModel,
      Evento: (await import('@/models/CotacaoMaterialEvento')).CotacaoMaterialEventoModel,
      Arquivo: (await import('@/models/ArquivoCotacao')).ArquivoCotacaoModel,
      Empenho: (await import('@/models/Empenho')).EmpenhoModel,
      Designacao: (await import('@/models/DesignacaoMaterial')).DesignacaoMaterialModel,
      Faixa: (await import('@/models/FaixaCompetencia')).FaixaCompetenciaModel,
      PauseLog: (await import('@/models/PauseLog')).PauseLogModel,
      History: (await import('@/models/ChamadoHistory')).ChamadoHistoryModel,
      Notification: (await import('@/models/Notification')).NotificationModel,
      SinapiInsumo: (await import('@/models/SinapiInsumo')).SinapiInsumoModel,
      SinapiReferencia: (await import('@/models/SinapiReferencia')).SinapiReferenciaModel,
      PdfEmissao: (await import('@/models/CotacaoMaterialPdfEmissao'))
        .CotacaoMaterialPdfEmissaoModel,
    };
    todos = Object.values(M).map((m) => cru(m as never));
    await conectarMongoDeTeste(todos, 'severino_test_material_fatia4');
  });

  beforeEach(async () => {
    await limparColecoes(todos);
    vi.clearAllMocks();
    const pessoa = (id: string, username: string, role: string) => ({
      _id: new Types.ObjectId(id),
      username,
      name: username,
      role,
      isActive: true,
    });
    await M.User.collection.insertMany([
      pessoa(ids.tecnico, 'tecnico', 'Técnico'),
      pessoa(ids.rt, 'rt', 'Preposto'),
      pessoa(ids.fiscal, 'fiscal', 'Admin'),
      pessoa(ids.fiscal2, 'fiscal2', 'Admin'),
      pessoa(ids.aprovador, 'aprovador', 'Admin'),
      pessoa(ids.gestor, 'gestor', 'Admin'),
    ]);
    const faixa = await M.Faixa.create({
      nome: 'Grande',
      limiteCentavos: 1_000_000_00,
      criadoPorUserId: new Types.ObjectId(),
      em: new Date(),
    });
    const designar = (userId: string, papel: string, faixaId?: Types.ObjectId) =>
      M.Designacao.create({
        userId: new Types.ObjectId(userId),
        papel: papel as never,
        faixaId: faixaId ?? null,
        vigenciaInicio: '2000-01-01',
        ato: 'Portaria de teste',
        criadoPorUserId: new Types.ObjectId(),
        em: new Date(),
      });
    await designar(ids.rt, 'responsavel_tecnico');
    await designar(ids.fiscal, 'fiscal');
    await designar(ids.fiscal2, 'fiscal');
    await designar(ids.aprovador, 'aprovador', faixa._id);
    await designar(ids.gestor, 'gestor');
    await M.Empenho.create({
      numero: 'NE-F4',
      exercicio: ano,
      valorInicialCentavos: 1_000_000_00,
      valorLiquidoCentavos: 1_000_000_00,
      criadoPorUserId: new Types.ObjectId(),
    });
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  const usuario = (userId: string, role: string) => ({ tipo: 'usuario' as const, userId, role });
  const rt = () => usuario(ids.rt, 'Preposto');
  const fiscal = (id = ids.fiscal) => usuario(id, 'Admin');

  async function chamado(): Promise<string> {
    const _id = new Types.ObjectId();
    await M.Chamado.collection.insertOne({
      _id,
      ticket_number: `CHM-F4-${String(_id).slice(-5)}`,
      titulo: 'Quadro elétrico',
      status: 'em atendimento',
      assignedToUserId: new Types.ObjectId(ids.tecnico),
      solicitanteId: new Types.ObjectId(ids.solicitante),
      createdAt: new Date(),
    });
    return String(_id);
  }

  async function arquivo(cotacaoId: string, tipo: string, por: string): Promise<string> {
    const a = await M.Arquivo.create({
      cotacaoId: new Types.ObjectId(cotacaoId),
      tipo,
      nomeOriginal: `${tipo}.pdf`,
      mimeType: 'application/pdf',
      tamanho: 10,
      caminho: `cotacoes/${cotacaoId}/x.pdf`,
      enviadoPorUserId: new Types.ObjectId(por),
      em: new Date(),
    });
    return String(a._id);
  }

  const item = { descricao: 'Disjuntor', unidade: 'un', quantidade: 2, motivo: 'Troca' };
  const refLivre = (valor = 100_00) => ({
    id: String(new Types.ObjectId()),
    fonte: 'Painel de preços do governo',
    valorUnitarioCentavos: valor,
    data: diasAtras(3),
  });

  async function criada() {
    const r = await t.criarCotacao(
      { userId: ids.tecnico },
      { chamadoId: await chamado(), itens: [item] },
    );
    if (!r.ok) throw new Error(r.error);
    const cot = (await M.Cotacao.findById(r.id).lean())!;
    return { id: r.id, itemId: String(cot.itens[0]!._id), versao: cot.versao };
  }

  async function orcamento(
    cotacaoId: string,
    itemId: string,
    cnpj: string,
    preco = 10_00,
    extra: Record<string, unknown> = {},
  ) {
    return {
      id: String(new Types.ObjectId()),
      fornecedor: `Loja ${cnpj}`,
      cnpj,
      data: diasAtras(10),
      validade: '2099-12-31',
      arquivoId: await arquivo(cotacaoId, 'orcamento', ids.rt),
      precos: [{ itemId, valorUnitarioCentavos: preco }],
      ...extra,
    };
  }

  /** Salva o rascunho com os orçamentos e as referências dados e envia. */
  async function enviar(
    c: { id: string; itemId: string; versao: number },
    orcs: Awaited<ReturnType<typeof orcamento>>[],
    opcoes: { referencias?: ReturnType<typeof refLivre>[]; urgencia?: string } = {},
  ) {
    const s = await t.salvarRascunho(rt(), {
      id: c.id,
      versao: c.versao,
      itens: [{ id: c.itemId, ...item, referencias: opcoes.referencias ?? [refLivre()] }],
      orcamentos: orcs,
    });
    if (!s.ok) throw new Error(s.error);
    return t.transicionar({
      cotacaoId: c.id,
      acao: 'enviar',
      versao: s.versao,
      ator: rt(),
      ...(opcoes.urgencia ? { urgencia: { justificativa: opcoes.urgencia } } : {}),
    });
  }

  async function versao(id: string) {
    return (await M.Cotacao.findById(id).lean())!.versao;
  }

  async function agir(id: string, acao: Parameters<typeof t.transicionar>[0]['acao'], extra = {}) {
    const ator =
      acao === 'aprovar'
        ? usuario(ids.aprovador, 'Admin')
        : acao === 'receber_provisorio' || acao === 'receber_definitivo'
          ? usuario(ids.gestor, 'Admin')
          : acao === 'executar'
            ? usuario(ids.tecnico, 'Técnico')
            : acao === 'pesquisa_completada' || acao === 'enviar' || acao === 'alterar'
              ? rt()
              : fiscal();
    return t.transicionar({ cotacaoId: id, acao, versao: await versao(id), ator, ...extra });
  }

  async function empenhoId() {
    return String((await M.Empenho.findOne().lean())!._id);
  }

  // -------------------------------------------------------------------------

  describe('CNPJ (AC-31)', () => {
    it('o salvar recusa CNPJ inválido e o da contratada, nomeando o fornecedor', async () => {
      const c = await criada();
      const invalido = await t.salvarRascunho(rt(), {
        id: c.id,
        versao: c.versao,
        itens: [{ id: c.itemId, ...item }],
        orcamentos: [
          await orcamento(c.id, c.itemId, '11111111000192', 10_00, { fornecedor: 'Loja X' }),
        ],
      });
      expect(!invalido.ok && invalido.error).toMatch(/Loja X.*inválido/);
      const contratada = await t.salvarRascunho(rt(), {
        id: c.id,
        versao: c.versao,
        itens: [{ id: c.itemId, ...item }],
        orcamentos: [await orcamento(c.id, c.itemId, CONTRATADA, 10_00, { fornecedor: 'Própria' })],
      });
      expect(!contratada.ok && contratada.error).toMatch(/Própria.*contratada/);
    });

    it('3 orçamentos com 2 raízes não são enviados; dois da mesma raiz contam uma vez', async () => {
      const c = await criada();
      const r = await enviar(c, [
        await orcamento(c.id, c.itemId, A),
        await orcamento(c.id, c.itemId, A2),
        await orcamento(c.id, c.itemId, B),
      ]);
      expect(!r.ok && r.impedimentos).toEqual(['cnpj_mesma_raiz']);
    });

    it('orçamento sem validade não é enviado (AC-34)', async () => {
      const c = await criada();
      const r = await enviar(c, [
        await orcamento(c.id, c.itemId, A, 10_00, { validade: null }),
        await orcamento(c.id, c.itemId, B),
        await orcamento(c.id, c.itemId, C),
      ]);
      expect(!r.ok && r.impedimentos).toEqual(['validade_ausente']);
    });
  });

  describe('referências (AC-32, AC-33)', () => {
    async function comSinapi(mes: string, codigo: string, preco: number) {
      await M.SinapiInsumo.collection.insertOne({
        referencia: mes,
        codigo,
        descricao: 'Disjuntor bipolar',
        unidade: 'un',
        precoCentavos: preco,
        uf: 'AP',
        regime: 'nao_desonerado',
      });
      await M.SinapiReferencia.collection.insertOne({
        referencia: mes,
        quantidade: 1,
        importacaoId: new Types.ObjectId(),
        em: new Date(),
      });
    }

    it('a referência SINAPI leva preço, unidade e fonte da tabela; código fora do mês é recusado', async () => {
      await comSinapi('2026-08', '123', 15_00);
      const c = await criada();
      const s = await t.salvarRascunho(rt(), {
        id: c.id,
        versao: c.versao,
        itens: [
          {
            id: c.itemId,
            ...item,
            referencias: [{ id: String(new Types.ObjectId()), sinapiCodigo: '123' }],
          },
        ],
      });
      expect(s.ok).toBe(true);
      const ref = (await M.Cotacao.findById(c.id).lean())!.itens[0]!.referencias![0]!;
      expect(ref).toMatchObject({
        tipo: 'sinapi',
        valorUnitarioCentavos: 15_00,
        unidade: 'un',
        sinapiReferencia: '2026-08',
        papel: 'responsavel_tecnico',
      });
      expect(ref.fonte).toContain('SINAPI 123');

      const fora = await t.salvarRascunho(rt(), {
        id: c.id,
        versao: s.ok ? s.versao : 0,
        itens: [
          {
            id: c.itemId,
            ...item,
            referencias: [{ id: String(new Types.ObjectId()), sinapiCodigo: '999' }],
          },
        ],
      });
      expect(!fora.ok && fora.error).toMatch(/mês mais recente/);
    });

    it('a referência SINAPI que saiu do mês mais recente barra o envio', async () => {
      await comSinapi('2026-08', '123', 15_00);
      const c = await criada();
      const s = await t.salvarRascunho(rt(), {
        id: c.id,
        versao: c.versao,
        itens: [
          {
            id: c.itemId,
            ...item,
            referencias: [{ id: String(new Types.ObjectId()), sinapiCodigo: '123' }],
          },
        ],
        orcamentos: [
          await orcamento(c.id, c.itemId, A),
          await orcamento(c.id, c.itemId, B),
          await orcamento(c.id, c.itemId, C),
        ],
      });
      if (!s.ok) throw new Error(s.error);
      // Um mês mais novo sem o código 123.
      await comSinapi('2026-09', '456', 20_00);
      const e = await t.transicionar({
        cotacaoId: c.id,
        acao: 'enviar',
        versao: s.versao,
        ator: rt(),
      });
      expect(!e.ok && e.impedimentos).toEqual(['referencia_desatualizada']);
    });

    it('a referência do fiscal abaixo do preço barra o encaminhar; retirada, deixa passar; outro fiscal não retira', async () => {
      const c = await criada();
      const e = await enviar(c, [
        await orcamento(c.id, c.itemId, A, 20_00),
        await orcamento(c.id, c.itemId, B, 21_00),
        await orcamento(c.id, c.itemId, C, 22_00),
      ]);
      if (!e.ok) throw new Error(e.error);
      await agir(c.id, 'assumir');
      const refId = String(new Types.ObjectId());
      const outro = await t.transicionar({
        cotacaoId: c.id,
        acao: 'referencia_acrescentada',
        versao: await versao(c.id),
        ator: fiscal(ids.fiscal2),
        itemId: c.itemId,
        referencia: { ...refLivre(10_00), id: refId },
      });
      expect(!outro.ok && outro.error).toMatch(/fiscal que assumiu/);

      const acr = await agir(c.id, 'referencia_acrescentada', {
        itemId: c.itemId,
        referencia: { ...refLivre(10_00), id: refId },
      });
      expect(acr.ok).toBe(true);
      const barrado = await agir(c.id, 'encaminhar');
      expect(!barrado.ok && barrado.impedimentos).toEqual(['variacao_acima']);

      const ret = await agir(c.id, 'referencia_retirada', {
        itemId: c.itemId,
        referenciaId: refId,
      });
      expect(ret.ok).toBe(true);
      const cot = (await M.Cotacao.findById(c.id).lean())!;
      expect(
        cot.itens[0]!.referencias!.find((r) => String(r._id) === refId)!.retiradaEm,
      ).toBeTruthy();
      expect((await agir(c.id, 'encaminhar')).ok).toBe(true);
      const acoes = (await M.Evento.find({ cotacaoId: c.id }).lean()).map((ev) => ev.acao);
      expect(acoes).toEqual(
        expect.arrayContaining(['referencia_acrescentada', 'referencia_retirada']),
      );
    });

    it('o salvar da contratada não apaga a referência do fiscal nem a conferência', async () => {
      const c = await criada();
      const e = await enviar(c, [
        await orcamento(c.id, c.itemId, A),
        await orcamento(c.id, c.itemId, B),
        await orcamento(c.id, c.itemId, C),
      ]);
      if (!e.ok) throw new Error(e.error);
      await agir(c.id, 'assumir');
      await agir(c.id, 'referencia_acrescentada', {
        itemId: c.itemId,
        referencia: refLivre(50_00),
      });
      await agir(c.id, 'devolver', { motivo: 'Corrigir a descrição' });

      // Sem `referencias`: mantém todas.
      const sem = await t.salvarRascunho(rt(), {
        id: c.id,
        versao: await versao(c.id),
        itens: [{ id: c.itemId, ...item }],
      });
      expect(sem.ok).toBe(true);
      let refs = (await M.Cotacao.findById(c.id).lean())!.itens[0]!.referencias!;
      expect(refs.map((r) => r.papel).sort()).toEqual(['fiscal', 'responsavel_tecnico']);

      // Com lista: troca só as da contratada.
      const com = await t.salvarRascunho(rt(), {
        id: c.id,
        versao: await versao(c.id),
        itens: [{ id: c.itemId, ...item, referencias: [refLivre(70_00), refLivre(80_00)] }],
      });
      expect(com.ok).toBe(true);
      refs = (await M.Cotacao.findById(c.id).lean())!.itens[0]!.referencias!;
      expect(refs.filter((r) => r.papel === 'fiscal').map((r) => r.valorUnitarioCentavos)).toEqual([
        50_00,
      ]);
      expect(refs.filter((r) => r.papel !== 'fiscal')).toHaveLength(2);
    });
  });

  describe('orçamento vencido (AC-34)', () => {
    it('pede a marca de cada vencido; a marca vai para a advertência e a devolução limpa', async () => {
      const c = await criada();
      const vencido = await orcamento(c.id, c.itemId, A, 10_00, {
        data: diasAtras(30),
        validade: diasAtras(2),
      });
      const e = await enviar(c, [
        vencido,
        await orcamento(c.id, c.itemId, B),
        await orcamento(c.id, c.itemId, C),
      ]);
      if (!e.ok) throw new Error(e.error);
      await agir(c.id, 'assumir');
      const sem = await agir(c.id, 'encaminhar');
      expect(!sem.ok && sem.impedimentos).toEqual(['orcamento_vencido']);

      const com = await agir(c.id, 'encaminhar', { confirmacoes: [vencido.id] });
      expect(com.ok).toBe(true);
      let cot = (await M.Cotacao.findById(c.id).lean())!;
      const marca = cot.advertencias.find((a) => a.codigo === 'orcamento_vencido')!;
      expect(String(marca.orcamentoId)).toBe(vencido.id);
      expect(String(marca.confirmadaPorUserId)).toBe(ids.fiscal);
      const ev = await M.Evento.findOne({ cotacaoId: c.id, acao: 'encaminhar' }).lean();
      expect(ev!.confirmacoesNoAto!.map(String)).toEqual([vencido.id]);

      await agir(c.id, 'devolver', { motivo: 'Trocar o orçamento' });
      cot = (await M.Cotacao.findById(c.id).lean())!;
      expect(cot.advertencias.some((a) => a.codigo === 'orcamento_vencido')).toBe(false);
    });
  });

  describe('urgência (AC-35)', () => {
    it('do pedido com 1 orçamento à pesquisa completa, sem mudar preço nem reserva', async () => {
      const c = await criada();
      const um = [await orcamento(c.id, c.itemId, A, 10_00)];
      const semUrgencia = await enviar(c, um);
      expect(!semUrgencia.ok && semUrgencia.impedimentos).toEqual(['orcamentos_insuficientes']);
      const e = await t.transicionar({
        cotacaoId: c.id,
        acao: 'enviar',
        versao: await versao(c.id),
        ator: rt(),
        urgencia: { justificativa: 'Quadro geral sem energia' },
      });
      expect(e.ok).toBe(true);
      let cot = (await M.Cotacao.findById(c.id).lean())!;
      expect(cot.urgencia).toMatchObject({ pedida: true, decisao: null, pesquisaCompletaEm: null });

      await agir(c.id, 'assumir');
      const semAceite = await agir(c.id, 'encaminhar');
      expect(!semAceite.ok && semAceite.impedimentos).toEqual(['urgencia_sem_decisao']);
      expect((await agir(c.id, 'encaminhar', { aceitarUrgencia: true })).ok).toBe(true);
      cot = (await M.Cotacao.findById(c.id).lean())!;
      expect(cot.urgencia!.decisao).toBe('aceita');

      expect((await agir(c.id, 'aprovar', { empenhoId: await empenhoId() })).ok).toBe(true);
      await arquivo(c.id, 'evidencia', ids.tecnico);
      await new Promise((r) => setTimeout(r, 5));
      expect(
        (
          await agir(c.id, 'executar', {
            quantidades: [{ itemId: c.itemId, quantidadeExecutada: 2 }],
          })
        ).ok,
      ).toBe(true);
      expect((await agir(c.id, 'receber_provisorio')).ok).toBe(true);
      const def = await agir(c.id, 'receber_definitivo');
      expect(!def.ok && def.impedimentos).toEqual(['pesquisa_pendente']);

      // A pendência aparece na fila da contratada.
      const fila = await leitura.listarFila({ userId: ids.rt, role: 'Preposto' }, 'minhas');
      expect(fila!.linhas.find((l) => l.id === c.id)).toMatchObject({
        urgente: true,
        pesquisaPendente: true,
      });

      // O orçamento gravado não muda, e o da contratada é recusado.
      const repetido = await agir(c.id, 'pesquisa_completada', { orcamentosNovos: [um[0]] });
      expect(!repetido.ok && repetido.error).toMatch(/já existe/);
      const propria = await agir(c.id, 'pesquisa_completada', {
        orcamentosNovos: [await orcamento(c.id, c.itemId, CONTRATADA)],
      });
      expect(!propria.ok && propria.error).toMatch(/contratada/);

      const antes = (await M.Cotacao.findById(c.id).lean())!;
      const maisBarato = await agir(c.id, 'pesquisa_completada', {
        orcamentosNovos: [await orcamento(c.id, c.itemId, B, 8_00)],
      });
      expect(maisBarato.ok && maisBarato.pesquisaCompleta).toBe(false);
      cot = (await M.Cotacao.findById(c.id).lean())!;
      expect(cot.itens[0]!.precoAplicadoCentavos).toBe(antes.itens[0]!.precoAplicadoCentavos);
      expect(cot.valorAutorizadoCentavos).toBe(antes.valorAutorizadoCentavos);
      expect(cot.valorExecutadoCentavos).toBe(antes.valorExecutadoCentavos);
      expect(cot.orcamentos.map((o) => o.fase)).toEqual(['envio', 'complemento']);
      expect(cot.advertencias.map((a) => a.codigo)).toContain('pesquisa_posterior_divergente');
      const empenho = (await M.Empenho.findOne().lean())!;
      expect(empenho.comprometidoCentavos).toBe(antes.valorExecutadoCentavos);

      const completa = await agir(c.id, 'pesquisa_completada', {
        orcamentosNovos: [await orcamento(c.id, c.itemId, C, 12_00)],
      });
      expect(completa.ok && completa.pesquisaCompleta).toBe(true);
      cot = (await M.Cotacao.findById(c.id).lean())!;
      expect(cot.urgencia!.pesquisaCompletaEm).toBeTruthy();
      await vi.waitFor(async () => {
        const avisos = await M.Notification.find({ userId: new Types.ObjectId(ids.gestor) }).lean();
        expect(avisos.some((n) => /Pesquisa de preços completa/.test(n.title as string))).toBe(
          true,
        );
      });
      expect((await agir(c.id, 'receber_definitivo')).ok).toBe(true);
    });

    it('recusar devolve; a urgência não volta, e o reenvio pede as 3 empresas', async () => {
      const c = await criada();
      const e = await enviar(c, [await orcamento(c.id, c.itemId, A)], {
        urgencia: 'Quadro geral sem energia',
      });
      expect(e.ok).toBe(true);
      await agir(c.id, 'assumir');
      const outro = await t.transicionar({
        cotacaoId: c.id,
        acao: 'urgencia_recusada',
        versao: await versao(c.id),
        ator: fiscal(ids.fiscal2),
        motivo: 'Não é emergência de verdade',
      });
      expect(!outro.ok && outro.error).toMatch(/fiscal que assumiu/);
      const r = await agir(c.id, 'urgencia_recusada', { motivo: 'Não é emergência de verdade' });
      expect(r.ok && r.situacao).toBe('devolvida');
      const cot = (await M.Cotacao.findById(c.id).lean())!;
      expect(cot.urgencia).toMatchObject({
        pedida: true,
        decisao: 'recusada',
        motivoRecusa: 'Não é emergência de verdade',
      });

      const deNovo = await agir(c.id, 'enviar', { urgencia: { justificativa: 'Pedindo de novo' } });
      expect(!deNovo.ok && deNovo.error).toMatch(/recusada/);
      const comum = await agir(c.id, 'enviar');
      expect(!comum.ok && comum.impedimentos).toEqual(['orcamentos_insuficientes']);
    });

    it('alterar a urgência aceita limpa o aceite e a pesquisa e converte o complemento', async () => {
      const c = await criada();
      await enviar(c, [await orcamento(c.id, c.itemId, A)], {
        urgencia: 'Quadro geral sem energia',
      });
      await agir(c.id, 'assumir');
      await agir(c.id, 'encaminhar', { aceitarUrgencia: true });
      await agir(c.id, 'aprovar', { empenhoId: await empenhoId() });
      await agir(c.id, 'pesquisa_completada', {
        orcamentosNovos: [await orcamento(c.id, c.itemId, B)],
      });
      const r = await agir(c.id, 'alterar');
      expect(r.ok && r.situacao).toBe('devolvida');
      const cot = (await M.Cotacao.findById(c.id).lean())!;
      expect(cot.urgencia).toMatchObject({ pedida: true, decisao: null, pesquisaCompletaEm: null });
      expect(cot.orcamentos.map((o) => o.fase)).toEqual(['envio', 'envio']);
    });

    it('a urgência que já chega com 3 empresas não pede aceite nem avisa a pesquisa', async () => {
      const c = await criada();
      const e = await enviar(
        c,
        [
          await orcamento(c.id, c.itemId, A),
          await orcamento(c.id, c.itemId, B),
          await orcamento(c.id, c.itemId, C),
        ],
        { urgencia: 'Quadro geral sem energia' },
      );
      expect(e.ok).toBe(true);
      expect((await M.Cotacao.findById(c.id).lean())!.urgencia!.pesquisaCompletaEm).toBeTruthy();
      await agir(c.id, 'assumir');
      expect((await agir(c.id, 'encaminhar')).ok).toBe(true);
      const avisos = await M.Notification.find({ userId: new Types.ObjectId(ids.gestor) }).lean();
      expect(avisos.some((n) => /Pesquisa de preços completa/.test(n.title as string))).toBe(false);
    });
  });

  describe('PDF da cotação (AC-23)', () => {
    it('sai com referências, urgência e a confirmação do vencido', async () => {
      const pdf = await import('../pdf/gerar');
      const c = await criada();
      const vencido = await orcamento(c.id, c.itemId, A, 10_00, {
        data: diasAtras(30),
        validade: diasAtras(2),
      });
      await enviar(c, [vencido], { urgencia: 'Quadro geral sem energia' });
      await agir(c.id, 'assumir');
      await agir(c.id, 'referencia_acrescentada', {
        itemId: c.itemId,
        referencia: refLivre(90_00),
      });
      const enc = await agir(c.id, 'encaminhar', {
        aceitarUrgencia: true,
        confirmacoes: [vencido.id],
      });
      expect(enc.ok).toBe(true);
      const r = await pdf.gerarPdfCotacao({
        cotacaoId: c.id,
        sessao: { userId: ids.fiscal, role: 'Admin' },
      });
      expect(r.ok).toBe(true);
      expect(r.ok && r.bytes.byteLength).toBeGreaterThan(1000);
    });
  });

  describe('cartão do chamado por visão (spec 0021, AC-16, AC-24)', () => {
    it('o Preposto responsável técnico recebe o cartão da contratada, sem o nome do fiscal', async () => {
      const c = await criada();
      await enviar(c, [await orcamento(c.id, c.itemId, A)], {
        urgencia: 'Quadro geral sem energia',
      });
      await agir(c.id, 'assumir');
      const chamadoId = String((await M.Cotacao.findById(c.id).lean())!.chamadoId);

      const rt = await leitura.cartaoDoChamado(chamadoId, { userId: ids.rt, role: 'Preposto' });
      expect(rt!.cotacao!.visao).toBe('contratada');
      expect(rt!.cotacao!.quemAgeAgora).toEqual({ papel: 'fiscal', nome: null });
      expect(rt!.cotacao).not.toHaveProperty('fase');
      expect(rt!.cotacao).not.toHaveProperty('empenho');

      const trf1 = await leitura.cartaoDoChamado(chamadoId, { userId: ids.fiscal, role: 'Admin' });
      expect(trf1!.cotacao!.visao).toBe('trf1');
      expect(trf1!.cotacao!.quemAgeAgora).toEqual({ papel: 'fiscal', nome: 'fiscal' });

      const sol = await leitura.cartaoDoChamado(chamadoId, {
        userId: ids.solicitante,
        role: 'Solicitante',
      });
      expect(sol!.cotacao!.visao).toBe('solicitante');
      expect(sol!.cotacao!.fase).toBe('pedido');
      expect(sol!.acoes).toBeNull();
      for (const campo of ['quemAgeAgora', 'valorTotalCentavos', 'itens', 'montadoPorNome']) {
        expect(sol!.cotacao).not.toHaveProperty(campo);
      }
    });
  });

  describe('visibilidade (AC-15)', () => {
    it('a contratada vê referências sem o autor do fiscal; o solicitante não vê a urgência', async () => {
      const c = await criada();
      await enviar(c, [await orcamento(c.id, c.itemId, A)], {
        urgencia: 'Quadro geral sem energia',
      });
      await agir(c.id, 'assumir');
      await agir(c.id, 'referencia_acrescentada', {
        itemId: c.itemId,
        referencia: refLivre(90_00),
      });

      const contratada = await leitura.lerDetalhe(c.id, { userId: ids.rt, role: 'Preposto' });
      const refs = contratada!.cotacao.itens![0]!.referencias!;
      expect(refs.find((r) => r.papel === 'fiscal')).toMatchObject({ autorNome: null });
      expect(contratada!.cotacao.urgencia).toMatchObject({
        justificativa: 'Quadro geral sem energia',
      });
      expect(contratada!.cotacao.urgencia).not.toHaveProperty('decididaPorNome');

      const trf1 = await leitura.lerDetalhe(c.id, { userId: ids.fiscal, role: 'Admin' });
      expect(
        trf1!.cotacao.itens![0]!.referencias!.find((r) => r.papel === 'fiscal')!.autorNome,
      ).toBe('fiscal');
      expect(trf1!.encaminhar!.urgenciaPrecisaAceite).toBe(true);

      const cartao = await leitura.cartaoDoChamado(
        String((await M.Cotacao.findById(c.id).lean())!.chamadoId),
        { userId: ids.solicitante, role: 'Solicitante' },
      );
      expect(cartao!.cotacao).not.toHaveProperty('urgencia');
      const tecnico = await leitura.cartaoDoChamado(
        String((await M.Cotacao.findById(c.id).lean())!.chamadoId),
        { userId: ids.tecnico, role: 'Técnico' },
      );
      expect(tecnico!.cotacao!.urgencia).toEqual({ pedida: true });
    });

    it('o técnico não vê o motivo da recusa da urgência nem a pesquisa de preços na trilha', async () => {
      const c = await criada();
      await enviar(c, [await orcamento(c.id, c.itemId, A)], {
        urgencia: 'Quadro geral sem energia',
      });
      await agir(c.id, 'assumir');
      await agir(c.id, 'referencia_acrescentada', {
        itemId: c.itemId,
        referencia: refLivre(90_00),
      });
      await agir(c.id, 'urgencia_recusada', { motivo: 'Motivo interno do fiscal' });

      const chamadoId = String((await M.Cotacao.findById(c.id).lean())!.chamadoId);
      const tecnico = await leitura.cartaoDoChamado(chamadoId, {
        userId: ids.tecnico,
        role: 'Técnico',
      });
      const cot = tecnico!.cotacao!;
      expect(cot.visao).toBe('tecnico');
      expect(cot.urgencia).toEqual({ pedida: true });
      expect(cot.ultimoMotivo).toBeNull();
      const acoes = cot.trilha!.map((ev) => ev.acao);
      expect(acoes).not.toContain('urgencia_recusada');
      expect(acoes).not.toContain('referencia_acrescentada');
      expect(acoes).toContain('devolver');
      expect(JSON.stringify(cot)).not.toMatch(/Motivo interno do fiscal|Quadro geral sem energia/);
      expect(cot.itens![0]).not.toHaveProperty('referencias');
    });
  });

  describe('limites e autorização da urgência (AC-35)', () => {
    async function urgenciaAutorizada() {
      const c = await criada();
      await enviar(c, [await orcamento(c.id, c.itemId, A)], {
        urgencia: 'Quadro geral sem energia',
      });
      await agir(c.id, 'assumir');
      await agir(c.id, 'encaminhar', { aceitarUrgencia: true });
      await agir(c.id, 'aprovar', { empenhoId: await empenhoId() });
      return c;
    }

    it('a rodada diária avisa os gestores da pesquisa atrasada, uma vez por autorização', async () => {
      const { avisarPesquisasAtrasadas } = await import('../avisos');
      const atrasada = await urgenciaAutorizada();
      const recente = await urgenciaAutorizada();
      await M.Cotacao.collection.updateOne(
        { _id: new Types.ObjectId(atrasada.id) },
        { $set: { autorizadoEm: new Date(Date.now() - 6 * 86_400_000) } },
      );
      const avisos = (id: string) =>
        M.Notification.countDocuments({
          userId: new Types.ObjectId(ids.gestor),
          'data.cotacaoId': id,
          'data.aviso': 'pesquisa_atrasada',
        });
      await avisarPesquisasAtrasadas();
      await avisarPesquisasAtrasadas();
      expect(await avisos(atrasada.id)).toBe(1);
      expect(await avisos(recente.id)).toBe(0);
    });

    it('a pesquisa completa não é avisada como atrasada', async () => {
      const { avisarPesquisasAtrasadas } = await import('../avisos');
      const c = await urgenciaAutorizada();
      await agir(c.id, 'pesquisa_completada', {
        orcamentosNovos: [await orcamento(c.id, c.itemId, B), await orcamento(c.id, c.itemId, C)],
      });
      await M.Cotacao.collection.updateOne(
        { _id: new Types.ObjectId(c.id) },
        { $set: { autorizadoEm: new Date(Date.now() - 6 * 86_400_000) } },
      );
      await avisarPesquisasAtrasadas();
      expect(
        await M.Notification.countDocuments({
          'data.cotacaoId': c.id,
          'data.aviso': 'pesquisa_atrasada',
        }),
      ).toBe(0);
    });

    it('só a contratada completa a pesquisa', async () => {
      const c = await urgenciaAutorizada();
      const r = await t.transicionar({
        cotacaoId: c.id,
        acao: 'pesquisa_completada',
        versao: await versao(c.id),
        ator: fiscal(),
        orcamentosNovos: [await orcamento(c.id, c.itemId, B)],
      });
      expect(r.ok).toBe(false);
    });

    it('o complemento conta no limite de 10 orçamentos da cotação', async () => {
      const c = await urgenciaAutorizada();
      // A cotação já tem 1; dez novos passam do limite.
      const novos = [];
      for (let n = 0; n < 10; n++) novos.push(await orcamento(c.id, c.itemId, B));
      const r = await agir(c.id, 'pesquisa_completada', { orcamentosNovos: novos });
      expect(!r.ok && r.error).toMatch(/até 10 orçamentos/);
    });

    it('o arquivo de orçamento já ligado não é removido; o solto do complemento é', async () => {
      const { podeRemoverArquivo } = await import('../arquivos');
      const c = await urgenciaAutorizada();
      const cot = (await M.Cotacao.findById(c.id).lean())!;
      const ligado = cot.orcamentos[0]!.arquivoId;
      const solto = await arquivo(c.id, 'orcamento', ids.rt);
      const estado = {
        situacao: cot.situacao as 'autorizada',
        orcamentos: cot.orcamentos,
        urgencia: cot.urgencia,
      };
      expect(
        podeRemoverArquivo({ _id: ligado, tipo: 'orcamento' }, estado, {
          responsavelTecnico: true,
        }),
      ).toBe(false);
      expect(
        podeRemoverArquivo({ _id: solto, tipo: 'orcamento' }, estado, { responsavelTecnico: true }),
      ).toBe(true);
      expect(
        podeRemoverArquivo({ _id: solto, tipo: 'orcamento' }, estado, {
          responsavelTecnico: false,
        }),
      ).toBe(false);
    });

    it('só o fiscal que assumiu aceita a urgência e confirma o vencido', async () => {
      const outro = () => fiscal(ids.fiscal2);
      // Urgência pedida.
      const u = await criada();
      await enviar(u, [await orcamento(u.id, u.itemId, A)], {
        urgencia: 'Quadro geral sem energia',
      });
      await agir(u.id, 'assumir');
      const aceiteDoOutro = await t.transicionar({
        cotacaoId: u.id,
        acao: 'encaminhar',
        versao: await versao(u.id),
        ator: outro(),
        aceitarUrgencia: true,
      });
      expect(!aceiteDoOutro.ok && aceiteDoOutro.error).toMatch(/fiscal que assumiu/);
      const vistaDoOutro = await leitura.lerDetalhe(u.id, { userId: ids.fiscal2, role: 'Admin' });
      expect(vistaDoOutro!.acoes.encaminhar).toBe(false);
      const vistaDeQuemAssumiu = await leitura.lerDetalhe(u.id, {
        userId: ids.fiscal,
        role: 'Admin',
      });
      expect(vistaDeQuemAssumiu!.acoes.encaminhar).toBe(true);
      expect((await agir(u.id, 'encaminhar', { aceitarUrgencia: true })).ok).toBe(true);

      // Orçamento vencido.
      const v = await criada();
      const vencido = await orcamento(v.id, v.itemId, A, 10_00, {
        data: diasAtras(30),
        validade: diasAtras(2),
      });
      await enviar(v, [
        vencido,
        await orcamento(v.id, v.itemId, B),
        await orcamento(v.id, v.itemId, C),
      ]);
      await agir(v.id, 'assumir');
      const marcaDoOutro = await t.transicionar({
        cotacaoId: v.id,
        acao: 'encaminhar',
        versao: await versao(v.id),
        ator: outro(),
        confirmacoes: [vencido.id],
      });
      expect(!marcaDoOutro.ok && marcaDoOutro.error).toMatch(/fiscal que assumiu/);
      expect((await agir(v.id, 'encaminhar', { confirmacoes: [vencido.id] })).ok).toBe(true);
    });
  });
});
