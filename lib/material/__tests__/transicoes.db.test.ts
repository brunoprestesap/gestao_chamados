import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

/**
 * As regras de cada transição da cotação de material contra o MongoDB de
 * verdade (spec 0019): o rascunho, a devolução, a alteração depois de
 * autorizar, a reprovação, a versão desatualizada e quem pode cada ato.
 *
 * covers: AC-1, AC-2, AC-5, AC-7, AC-9, AC-10, AC-11, AC-12, AC-14
 */

/** Limpa pela coleção crua: o model só de inclusão recusa `deleteMany`. */
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

rodar('transições da cotação de material, contra o Mongo', () => {
  let t: typeof import('../transicoes');
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
    gestor: String(new Types.ObjectId()),
    aprovador: String(new Types.ObjectId()),
    estranho: String(new Types.ObjectId()),
  };
  const usuario = (userId: string, role: string) => ({ tipo: 'usuario' as const, userId, role });
  const rt = () => usuario(ids.rt, 'Preposto');
  const fiscal = () => usuario(ids.fiscal, 'Admin');

  beforeAll(async () => {
    t = await import('../transicoes');
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
    };
    todos = Object.values(M).map((m) => cru(m as never));
    await conectarMongoDeTeste(todos, 'severino_test_material_transicoes');
  });

  beforeEach(async () => {
    await limparColecoes(todos);
    await M.User.collection.insertMany(
      Object.entries(ids).map(([k, id]) => ({
        _id: new Types.ObjectId(id),
        username: k,
        name: k,
        role: k === 'rt' ? 'Preposto' : k === 'tecnico' ? 'Técnico' : 'Admin',
        isActive: true,
      })),
    );
    const faixa = await M.Faixa.create({
      nome: 'Grande',
      limiteCentavos: 1_000_00,
      criadoPorUserId: new Types.ObjectId(),
      em: new Date(),
    });
    for (const [userId, papel] of [
      [ids.rt, 'responsavel_tecnico'],
      [ids.fiscal, 'fiscal'],
      [ids.gestor, 'gestor'],
      [ids.aprovador, 'aprovador'],
    ] as const) {
      await M.Designacao.create({
        userId: new Types.ObjectId(userId),
        papel,
        faixaId: papel === 'aprovador' ? faixa._id : null,
        vigenciaInicio: '2000-01-01',
        ato: 'Portaria',
        criadoPorUserId: new Types.ObjectId(),
        em: new Date(),
      });
    }
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  async function chamado(status = 'em atendimento', extra: Record<string, unknown> = {}) {
    const _id = new Types.ObjectId();
    await M.Chamado.collection.insertOne({
      _id,
      ticket_number: `CHM-T-${String(_id).slice(-6)}`,
      titulo: 'Teste',
      status,
      assignedToUserId: new Types.ObjectId(ids.tecnico),
      solicitanteId: new Types.ObjectId(),
      createdAt: new Date(),
      ...extra,
    });
    return String(_id);
  }

  async function empenho(valor = 100_00) {
    const e = await M.Empenho.create({
      numero: `NE${String(new Types.ObjectId()).slice(-6)}`,
      exercicio: ano,
      valorInicialCentavos: valor,
      valorLiquidoCentavos: valor,
      criadoPorUserId: new Types.ObjectId(),
    });
    return String(e._id);
  }

  async function arquivo(cotacaoId: string, tipo: string, por: string) {
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

  const itemBase = { descricao: 'Disjuntor', unidade: 'un', quantidade: 2, motivo: 'Troca' };

  async function criada(chamadoId?: string) {
    const ch = chamadoId ?? (await chamado());
    const r = await t.criarCotacao({ userId: ids.tecnico }, { chamadoId: ch, itens: [itemBase] });
    if (!r.ok) throw new Error(r.error);
    const cot = (await M.Cotacao.findById(r.id).lean())!;
    return { id: r.id, chamadoId: ch, itemId: String(cot.itens[0]!._id), versao: cot.versao };
  }

  async function orcamentos(cotacaoId: string, itemId: string, precos = [1000, 1200, 1100]) {
    return Promise.all(
      precos.map(async (p, i) => ({
        id: String(new Types.ObjectId()),
        fornecedor: `Loja ${i}`,
        cnpj: `${i + 1}`.repeat(8) + '000191',
        data: '2026-10-01',
        arquivoId: await arquivo(cotacaoId, 'orcamento', ids.rt),
        precos: [{ itemId, valorUnitarioCentavos: p }],
      })),
    );
  }

  /** Até `enviada`, devolvendo a versão. */
  async function enviada(chamadoId?: string) {
    const c = await criada(chamadoId);
    const s = await t.salvarRascunho(rt(), {
      id: c.id,
      versao: c.versao,
      itens: [{ id: c.itemId, ...itemBase }],
      orcamentos: await orcamentos(c.id, c.itemId),
    });
    if (!s.ok) throw new Error(s.error);
    const e = await t.transicionar({
      cotacaoId: c.id,
      acao: 'enviar',
      versao: s.versao,
      ator: rt(),
    });
    if (!e.ok) throw new Error(e.error);
    return { ...c, versao: e.versao };
  }

  async function ate(acoes: ('assumir' | 'encaminhar' | 'aprovar')[], chamadoId?: string) {
    const c = await enviada(chamadoId);
    let versao = c.versao;
    const empenhoId = acoes.includes('encaminhar') ? await empenho() : undefined;
    for (const acao of acoes) {
      const ator = acao === 'aprovar' ? usuario(ids.aprovador, 'Admin') : fiscal();
      const r = await t.transicionar({ cotacaoId: c.id, acao, versao, ator, empenhoId });
      if (!r.ok) throw new Error(`${acao}: ${r.error}`);
      versao = r.versao;
    }
    return { ...c, versao, empenhoId };
  }

  // ── criar e salvar (AC-1) ──────────────────────────────────────────

  describe('criar e salvar o rascunho (AC-1)', () => {
    it('só o técnico atribuído cria', async () => {
      const ch = await chamado();
      const r = await t.criarCotacao(
        { userId: ids.estranho },
        { chamadoId: ch, itens: [itemBase] },
      );
      expect(r.ok).toBe(false);
    });

    it('não cria com o chamado fora de em atendimento', async () => {
      const ch = await chamado('aguardando_solicitante');
      const r = await t.criarCotacao({ userId: ids.tecnico }, { chamadoId: ch, itens: [itemBase] });
      expect(r.ok).toBe(false);
    });

    it('grava o diagnóstico com data, número e itens marcados do diagnóstico', async () => {
      const c = await criada();
      const cot = await M.Cotacao.findById(c.id).lean();
      expect(cot?.numero).toMatch(new RegExp(`^COT-\\d{4}-\\d{4}$`));
      expect(cot?.diagnosticadoEm).toBeInstanceOf(Date);
      expect(cot?.itens.every((i) => i.doDiagnostico)).toBe(true);
      expect(String(cot?.diagnosticadoPorUserId)).toBe(ids.tecnico);
    });

    it('o técnico edita os itens antes de o responsável técnico salvar', async () => {
      const c = await criada();
      const r = await t.salvarRascunho(usuario(ids.tecnico, 'Técnico'), {
        id: c.id,
        versao: c.versao,
        itens: [{ id: c.itemId, ...itemBase, quantidade: 3 }],
      });
      expect(r.ok).toBe(true);
    });

    it('o responsável técnico não altera quantidade de item do diagnóstico', async () => {
      const c = await criada();
      const r = await t.salvarRascunho(rt(), {
        id: c.id,
        versao: c.versao,
        itens: [{ id: c.itemId, ...itemBase, quantidade: 5 }],
      });
      expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/não mudam/) });
    });

    it('o responsável técnico não remove item do diagnóstico, mas acrescenta item novo', async () => {
      const c = await criada();
      const novo = { id: String(new Types.ObjectId()), ...itemBase, descricao: 'Cabo' };
      const sem = await t.salvarRascunho(rt(), { id: c.id, versao: c.versao, itens: [novo] });
      expect(sem.ok).toBe(false);
      const com = await t.salvarRascunho(rt(), {
        id: c.id,
        versao: c.versao,
        itens: [{ id: c.itemId, ...itemBase }, novo],
      });
      expect(com.ok).toBe(true);
      const cot = await M.Cotacao.findById(c.id).lean();
      expect(cot?.itens.map((i) => i.doDiagnostico)).toEqual([true, false]);
      expect(String(cot?.montadoPorUserId)).toBe(ids.rt);
    });

    it('versão desatualizada é recusada', async () => {
      const c = await criada();
      await t.salvarRascunho(rt(), {
        id: c.id,
        versao: c.versao,
        itens: [{ id: c.itemId, ...itemBase }],
      });
      const velha = await t.salvarRascunho(rt(), {
        id: c.id,
        versao: c.versao,
        itens: [{ id: c.itemId, ...itemBase }],
      });
      expect(velha).toMatchObject({ ok: false, error: expect.stringMatching(/mudou/) });
    });

    it('orçamento com arquivo de outra cotação é recusado', async () => {
      const a = await criada();
      const b = await criada(await chamado());
      const orcs = await orcamentos(b.id, a.itemId);
      const r = await t.salvarRascunho(rt(), {
        id: a.id,
        versao: a.versao,
        itens: [{ id: a.itemId, ...itemBase }],
        orcamentos: orcs,
      });
      expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/arquivo/) });
    });

    it('quem não é técnico atribuído nem responsável técnico não salva', async () => {
      const c = await criada();
      const r = await t.salvarRascunho(usuario(ids.fiscal, 'Admin'), {
        id: c.id,
        versao: c.versao,
        itens: [{ id: c.itemId, ...itemBase }],
      });
      expect(r.ok).toBe(false);
    });
  });

  // ── envio e papel (AC-2) ───────────────────────────────────────────

  describe('envio (AC-2)', () => {
    it('o técnico não envia, só o responsável técnico', async () => {
      const c = await criada();
      const r = await t.transicionar({
        cotacaoId: c.id,
        acao: 'enviar',
        versao: c.versao,
        ator: usuario(ids.tecnico, 'Técnico'),
      });
      expect(r.ok).toBe(false);
    });

    it('chamado já pausado por outro motivo: não abre pausa nova', async () => {
      const ch = await chamado('aguardando_terceiros', {
        slaPausedAt: new Date(),
        pauseReason: 'aguardando_fornecedor',
      });
      // A cotação nasce com o chamado em atendimento; o chamado pausa depois.
      const c = await criada(await chamado());
      await M.Cotacao.updateOne({ _id: c.id }, { $set: { chamadoId: new Types.ObjectId(ch) } });
      const s = await t.salvarRascunho(rt(), {
        id: c.id,
        versao: c.versao,
        itens: [{ id: c.itemId, ...itemBase }],
        orcamentos: await orcamentos(c.id, c.itemId),
      });
      const e = await t.transicionar({
        cotacaoId: c.id,
        acao: 'enviar',
        versao: s.ok ? s.versao : 0,
        ator: rt(),
      });
      expect(e.ok).toBe(true);
      expect(await M.PauseLog.countDocuments({ chamadoId: new Types.ObjectId(ch) })).toBe(0);
      expect((await M.Cotacao.findById(c.id).lean())?.pauseLogId).toBeNull();
      expect((await M.Chamado.findById(ch).lean())?.pauseReason).toBe('aguardando_fornecedor');
    });

    it('não envia com o chamado concluído', async () => {
      const c = await criada();
      await M.Chamado.collection.updateOne(
        { _id: new Types.ObjectId(c.chamadoId) },
        { $set: { status: 'concluído' } },
      );
      const s = await t.salvarRascunho(rt(), {
        id: c.id,
        versao: c.versao,
        itens: [{ id: c.itemId, ...itemBase }],
        orcamentos: await orcamentos(c.id, c.itemId),
      });
      const e = await t.transicionar({
        cotacaoId: c.id,
        acao: 'enviar',
        versao: s.ok ? s.versao : 0,
        ator: rt(),
      });
      expect(e.ok).toBe(false);
    });
  });

  // ── análise (AC-5) ─────────────────────────────────────────────────

  describe('revisão de 15/10, rodada 2: menores', () => {
    it('salvar sem o campo de orçamentos mantém os gravados (item 4)', async () => {
      const c = await criada();
      const s1 = await t.salvarRascunho(rt(), {
        id: c.id,
        versao: c.versao,
        itens: [{ id: c.itemId, ...itemBase }],
        orcamentos: await orcamentos(c.id, c.itemId),
      });
      const s2 = await t.salvarRascunho(rt(), {
        id: c.id,
        versao: s1.ok ? s1.versao : 0,
        itens: [{ id: c.itemId, ...itemBase, motivo: 'Troca urgente' }],
      });
      expect(s2.ok).toBe(true);
      const cot = await M.Cotacao.findById(c.id).lean();
      expect(cot?.orcamentos).toHaveLength(3);
      expect(cot?.itens[0]?.precoAplicadoCentavos).toBe(1000);
      expect(cot?.itens[0]?.motivo).toBe('Troca urgente');
    });

    it('lista de orçamentos vazia, mandada de propósito, apaga os orçamentos (item 4)', async () => {
      const c = await criada();
      const s1 = await t.salvarRascunho(rt(), {
        id: c.id,
        versao: c.versao,
        itens: [{ id: c.itemId, ...itemBase }],
        orcamentos: await orcamentos(c.id, c.itemId),
      });
      await t.salvarRascunho(rt(), {
        id: c.id,
        versao: s1.ok ? s1.versao : 0,
        itens: [{ id: c.itemId, ...itemBase }],
        orcamentos: [],
      });
      expect((await M.Cotacao.findById(c.id).lean())?.orcamentos).toHaveLength(0);
    });

    it('dois orçamentos com o mesmo arquivo são recusados (item 5)', async () => {
      const c = await criada();
      const orcs = await orcamentos(c.id, c.itemId);
      orcs[1] = { ...orcs[1]!, arquivoId: orcs[0]!.arquivoId };
      const r = await t.salvarRascunho(rt(), {
        id: c.id,
        versao: c.versao,
        itens: [{ id: c.itemId, ...itemBase }],
        orcamentos: orcs,
      });
      expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/próprio arquivo/) });
    });

    it('arquivo de orçamento removido depois de salvar barra o envio (item 5)', async () => {
      const c = await criada();
      const orcs = await orcamentos(c.id, c.itemId);
      const s = await t.salvarRascunho(rt(), {
        id: c.id,
        versao: c.versao,
        itens: [{ id: c.itemId, ...itemBase }],
        orcamentos: orcs,
      });
      await M.Arquivo.updateOne({ _id: orcs[0]!.arquivoId }, { $set: { removidoEm: new Date() } });
      const e = await t.transicionar({
        cotacaoId: c.id,
        acao: 'enviar',
        versao: s.ok ? s.versao : 0,
        ator: rt(),
      });
      expect(e).toMatchObject({ ok: false, error: expect.stringMatching(/próprio arquivo/) });
    });

    it('cancelar a cotação de chamado já cancelado fecha o registro da pausa (item 10)', async () => {
      const c = await enviada();
      const cot = await M.Cotacao.findById(c.id).lean();
      await M.Chamado.collection.updateOne(
        { _id: new Types.ObjectId(c.chamadoId) },
        { $set: { status: 'cancelado' } },
      );
      const { cancelarCotacoesDeChamadosEncerrados } = await import('../chamado');
      await cancelarCotacoesDeChamadosEncerrados();
      const log = await M.PauseLog.findById(cot?.pauseLogId).lean();
      expect(log?.resumedAt).toBeInstanceOf(Date);
      expect(typeof log?.pausedMinutes).toBe('number');
      // O chamado continua cancelado: fechar a pausa não o retoma.
      expect((await M.Chamado.findById(c.chamadoId).lean())?.status).toBe('cancelado');
    });

    it('reserva sumida no cancelamento da autorizada vai para o log (item 2)', async () => {
      const c = await ate(['assumir', 'encaminhar', 'aprovar']);
      await M.Empenho.collection.updateOne(
        { _id: new Types.ObjectId(c.empenhoId) },
        { $set: { reservas: [], comprometidoCentavos: 0 } },
      );
      const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
      const r = await t.transicionar({
        cotacaoId: c.id,
        acao: 'cancelar',
        versao: c.versao,
        ator: usuario(ids.gestor, 'Admin'),
        motivo: 'Não precisa mais',
      });
      expect(r.ok).toBe(true);
      expect(
        erro.mock.calls.some((a) => String(a[0]).includes('não encontrada ou não liberada')),
      ).toBe(true);
      erro.mockRestore();
    });
  });

  describe('revisão de 15/10: correções', () => {
    // O chamado foi cancelado, mas o cancelamento automático da cotação falhou (queda do processo).
    async function canceladoSemCancelarCotacao() {
      const c = await ate(['assumir', 'encaminhar', 'aprovar']);
      await M.Chamado.collection.updateOne(
        { _id: new Types.ObjectId(c.chamadoId) },
        { $set: { status: 'cancelado' } },
      );
      return c;
    }

    it('a rodada diária cancela a cotação de chamado encerrado e libera o saldo (AC-12)', async () => {
      const c = await canceladoSemCancelarCotacao();
      const { cancelarCotacoesDeChamadosEncerrados } = await import('../chamado');

      const r = await cancelarCotacoesDeChamadosEncerrados();

      expect(r.canceladas).toBe(1);
      const cot = await M.Cotacao.findById(c.id).lean();
      expect(cot?.situacao).toBe('cancelada');
      expect((await M.Empenho.findById(c.empenhoId).lean())?.comprometidoCentavos).toBe(0);
      const ev = await M.Evento.findOne({
        cotacaoId: new Types.ObjectId(c.id),
        acao: 'cancelar',
        de: 'autorizada',
      }).lean();
      expect(ev).toMatchObject({ papel: 'sistema', motivo: 'chamado_cancelado' });
    });

    it('não executa material de chamado cancelado (AC-10, AC-12)', async () => {
      const c = await canceladoSemCancelarCotacao();
      await arquivo(c.id, 'evidencia', ids.tecnico);
      await new Promise((r) => setTimeout(r, 5));
      const r = await t.transicionar({
        cotacaoId: c.id,
        acao: 'executar',
        versao: c.versao,
        ator: usuario(ids.tecnico, 'Técnico'),
        quantidades: [{ itemId: c.itemId, quantidadeExecutada: 2 }],
      });
      expect(r.ok).toBe(false);
      expect((await M.Cotacao.findById(c.id).lean())?.situacao).toBe('autorizada');
    });

    it('item do diagnóstico repetido na entrada não burla a trava da contratada (AC-1)', async () => {
      const c = await criada();
      const r = await t.salvarRascunho(rt(), {
        id: c.id,
        versao: c.versao,
        itens: [
          { id: c.itemId, ...itemBase, quantidade: 50 },
          { id: c.itemId, ...itemBase },
        ],
      });
      expect(r.ok).toBe(false);
      const cot = await M.Cotacao.findById(c.id).lean();
      expect(cot?.itens.map((i) => i.quantidade)).toEqual([2]);
    });

    it('duas aprovações simultâneas com empenhos diferentes deixam uma única reserva, no empenho da vencedora (AC-8)', async () => {
      const c = await ate(['assumir', 'encaminhar']);
      const outro = await empenho();
      const aprovar = (empenhoId: string) =>
        t.transicionar({
          cotacaoId: c.id,
          acao: 'aprovar',
          versao: c.versao,
          ator: usuario(ids.aprovador, 'Admin'),
          empenhoId,
        });

      const r = await Promise.all([aprovar(c.empenhoId!), aprovar(outro)]);

      expect(r.filter((x) => x.ok)).toHaveLength(1);
      const cot = await M.Cotacao.findById(c.id).lean();
      const empenhos = await M.Empenho.find({}).lean();
      const reservas = empenhos.flatMap((e) =>
        e.reservas.map((x) => ({ empenhoId: String(e._id), valor: x.valorCentavos })),
      );
      expect(reservas).toEqual([{ empenhoId: String(cot?.empenhoId), valor: 2000 }]);
      expect(empenhos.reduce((s, e) => s + e.comprometidoCentavos, 0)).toBe(2000);
    });
  });

  describe('análise (AC-5)', () => {
    it('devolver exige motivo', async () => {
      const c = await ate(['assumir']);
      const r = await t.transicionar({
        cotacaoId: c.id,
        acao: 'devolver',
        versao: c.versao,
        ator: fiscal(),
      });
      expect(r.ok).toBe(false);
    });

    it('devolver limpa o fiscal, mantém o chamado pausado e grava o motivo na trilha', async () => {
      const c = await ate(['assumir']);
      const r = await t.transicionar({
        cotacaoId: c.id,
        acao: 'devolver',
        versao: c.versao,
        ator: fiscal(),
        motivo: 'Falta especificação',
      });
      expect(r.ok && r.situacao).toBe('devolvida');
      const cot = await M.Cotacao.findById(c.id).lean();
      expect(cot?.fiscalUserId).toBeNull();
      expect(cot?.pauseLogId).toBeTruthy();
      expect((await M.Chamado.findById(c.chamadoId).lean())?.status).toBe('aguardando_terceiros');
      const ev = await M.Evento.findOne({
        cotacaoId: new Types.ObjectId(c.id),
        acao: 'devolver',
      }).lean();
      expect(ev?.motivo).toBe('Falta especificação');
      expect(ev?.papel).toBe('fiscal');
    });

    it('o reenvio da devolvida não abre segunda pausa', async () => {
      const c = await ate(['assumir']);
      const d = await t.transicionar({
        cotacaoId: c.id,
        acao: 'devolver',
        versao: c.versao,
        ator: fiscal(),
        motivo: 'Falta especificação',
      });
      const r = await t.transicionar({
        cotacaoId: c.id,
        acao: 'enviar',
        versao: d.ok ? d.versao : 0,
        ator: rt(),
      });
      expect(r.ok).toBe(true);
      expect(await M.PauseLog.countDocuments({ chamadoId: new Types.ObjectId(c.chamadoId) })).toBe(
        1,
      );
    });

    it('o fiscal não aprova', async () => {
      const c = await ate(['assumir', 'encaminhar']);
      const r = await t.transicionar({
        cotacaoId: c.id,
        acao: 'aprovar',
        versao: c.versao,
        ator: fiscal(),
        empenhoId: await empenho(),
      });
      expect(r).toMatchObject({ ok: false, impedimentos: ['designacao_vencida'] });
    });

    it('designação revogada perde o papel na hora (AC-7, CA-11)', async () => {
      const c = await ate(['assumir', 'encaminhar']);
      await M.Designacao.collection.updateMany(
        { userId: new Types.ObjectId(ids.aprovador) },
        { $set: { revogadaEm: new Date() } },
      );
      const r = await t.transicionar({
        cotacaoId: c.id,
        acao: 'aprovar',
        versao: c.versao,
        ator: usuario(ids.aprovador, 'Admin'),
        empenhoId: await empenho(),
      });
      expect(r).toMatchObject({ ok: false, impedimentos: ['designacao_vencida'] });
    });

    it('empenho escolhido sem saldo recusa a aprovação e não muda a cotação (AC-8, CA-17)', async () => {
      const c = await ate(['assumir', 'encaminhar']);
      const pequeno = await empenho(10);
      const r = await t.transicionar({
        cotacaoId: c.id,
        acao: 'aprovar',
        versao: c.versao,
        ator: usuario(ids.aprovador, 'Admin'),
        empenhoId: pequeno,
      });
      expect(r).toMatchObject({ ok: false, impedimentos: ['saldo_insuficiente'] });
      expect((await M.Cotacao.findById(c.id).lean())?.situacao).toBe('em_aprovacao');
    });
  });

  // ── reprovar, alterar, cancelar (AC-11, AC-12, AC-14) ──────────────

  describe('reprovar, alterar e cancelar', () => {
    it('reprovar retoma o chamado e libera o chamado para cotação nova (AC-14, AC-2)', async () => {
      const c = await ate(['assumir']);
      const r = await t.transicionar({
        cotacaoId: c.id,
        acao: 'reprovar',
        versao: c.versao,
        ator: fiscal(),
        motivo: 'Preço fora do mercado',
      });
      expect(r.ok && r.situacao).toBe('reprovada');
      expect((await M.Chamado.findById(c.chamadoId).lean())?.status).toBe('em atendimento');
      // Reprovada não volta a tramitar.
      const volta = await t.transicionar({
        cotacaoId: c.id,
        acao: 'enviar',
        versao: r.ok ? r.versao : 0,
        ator: rt(),
      });
      expect(volta.ok).toBe(false);
      const nova = await t.criarCotacao(
        { userId: ids.tecnico },
        { chamadoId: c.chamadoId, itens: [itemBase], cotacaoAnteriorId: c.id },
      );
      expect(nova.ok).toBe(true);
      if (nova.ok) {
        const n = await M.Cotacao.findById(nova.id).lean();
        expect(String(n?.cotacaoAnteriorId)).toBe(c.id);
      }
    });

    it('alterar a autorizada libera a reserva e volta para devolvida (AC-11)', async () => {
      const c = await ate(['assumir', 'encaminhar', 'aprovar']);
      const r = await t.transicionar({
        cotacaoId: c.id,
        acao: 'alterar',
        versao: c.versao,
        ator: rt(),
      });
      expect(r.ok && r.situacao).toBe('devolvida');
      const e = await M.Empenho.findById(c.empenhoId).lean();
      expect(e?.comprometidoCentavos).toBe(0);
      const cot = await M.Cotacao.findById(c.id).lean();
      expect(cot?.empenhoId).toBeNull();
      expect(cot?.autorizadoEm).toBeNull();
      const ev = await M.Evento.findOne({
        cotacaoId: new Types.ObjectId(c.id),
        acao: 'alterar',
        para: 'devolvida',
        valorCentavos: null,
      }).lean();
      expect(ev?.motivo).toBe('alteracao_pos_autorizacao');
    });

    it('o reenvio depois da alteração pausa o chamado de novo e passa pela análise (AC-11)', async () => {
      const c = await ate(['assumir', 'encaminhar', 'aprovar']);
      expect((await M.Chamado.findById(c.chamadoId).lean())?.status).toBe('em atendimento');
      const a = await t.transicionar({
        cotacaoId: c.id,
        acao: 'alterar',
        versao: c.versao,
        ator: rt(),
      });
      const e = await t.transicionar({
        cotacaoId: c.id,
        acao: 'enviar',
        versao: a.ok ? a.versao : 0,
        ator: rt(),
      });
      expect(e.ok && e.situacao).toBe('enviada');
      expect((await M.Chamado.findById(c.chamadoId).lean())?.status).toBe('aguardando_terceiros');
    });

    it('o gestor cancela com motivo, e o fiscal não cancela (AC-12)', async () => {
      const c = await ate(['assumir']);
      const f = await t.transicionar({
        cotacaoId: c.id,
        acao: 'cancelar',
        versao: c.versao,
        ator: fiscal(),
        motivo: 'Não precisa',
      });
      expect(f.ok).toBe(false);
      const g = await t.transicionar({
        cotacaoId: c.id,
        acao: 'cancelar',
        versao: c.versao,
        ator: usuario(ids.gestor, 'Admin'),
        motivo: 'Não precisa mais',
      });
      expect(g.ok && g.situacao).toBe('cancelada');
      expect((await M.Chamado.findById(c.chamadoId).lean())?.status).toBe('em atendimento');
    });

    it('a executada não pode mais ser cancelada', async () => {
      const c = await ate(['assumir', 'encaminhar', 'aprovar']);
      await arquivo(c.id, 'evidencia', ids.tecnico);
      await new Promise((r) => setTimeout(r, 5));
      const ex = await t.transicionar({
        cotacaoId: c.id,
        acao: 'executar',
        versao: c.versao,
        ator: usuario(ids.tecnico, 'Técnico'),
        quantidades: [{ itemId: c.itemId, quantidadeExecutada: 2 }],
      });
      expect(ex.ok).toBe(true);
      const r = await t.transicionar({
        cotacaoId: c.id,
        acao: 'cancelar',
        versao: ex.ok ? ex.versao : 0,
        ator: usuario(ids.gestor, 'Admin'),
        motivo: 'Tarde demais',
      });
      expect(r.ok).toBe(false);
    });
  });

  // ── execução (AC-10) ───────────────────────────────────────────────

  describe('execução (AC-10)', () => {
    it('executar antes de autorizar é recusado', async () => {
      const c = await ate(['assumir', 'encaminhar']);
      await arquivo(c.id, 'evidencia', ids.tecnico);
      const r = await t.transicionar({
        cotacaoId: c.id,
        acao: 'executar',
        versao: c.versao,
        ator: usuario(ids.tecnico, 'Técnico'),
        quantidades: [{ itemId: c.itemId, quantidadeExecutada: 1 }],
      });
      expect(r.ok).toBe(false);
    });

    it('evidência removida não conta', async () => {
      const c = await ate(['assumir', 'encaminhar', 'aprovar']);
      const a = await arquivo(c.id, 'evidencia', ids.tecnico);
      await M.Arquivo.updateOne({ _id: a }, { $set: { removidoEm: new Date() } });
      await new Promise((r) => setTimeout(r, 5));
      const r = await t.transicionar({
        cotacaoId: c.id,
        acao: 'executar',
        versao: c.versao,
        ator: usuario(ids.tecnico, 'Técnico'),
        quantidades: [{ itemId: c.itemId, quantidadeExecutada: 1 }],
      });
      expect(r).toMatchObject({ ok: false, impedimentos: ['evidencia_ausente'] });
    });

    it('sem a quantidade de um item, recusa', async () => {
      const c = await ate(['assumir', 'encaminhar', 'aprovar']);
      await arquivo(c.id, 'evidencia', ids.tecnico);
      await new Promise((r) => setTimeout(r, 5));
      const r = await t.transicionar({
        cotacaoId: c.id,
        acao: 'executar',
        versao: c.versao,
        ator: usuario(ids.tecnico, 'Técnico'),
        quantidades: [],
      });
      expect(r.ok).toBe(false);
    });

    it('executar tudo não gera advertência e mantém a reserva inteira', async () => {
      const c = await ate(['assumir', 'encaminhar', 'aprovar']);
      await arquivo(c.id, 'evidencia', ids.tecnico);
      await new Promise((r) => setTimeout(r, 5));
      const r = await t.transicionar({
        cotacaoId: c.id,
        acao: 'executar',
        versao: c.versao,
        ator: usuario(ids.tecnico, 'Técnico'),
        quantidades: [{ itemId: c.itemId, quantidadeExecutada: 2 }],
      });
      expect(r.ok).toBe(true);
      const cot = await M.Cotacao.findById(c.id).lean();
      expect(cot?.advertencias).toEqual([]);
      expect(cot?.valorExecutadoCentavos).toBe(2000);
      expect((await M.Empenho.findById(c.empenhoId).lean())?.comprometidoCentavos).toBe(2000);
    });
  });

  // ── trilha (AC-9) ──────────────────────────────────────────────────

  it('cada ato grava de, para, autor, papel, parâmetros e itens no ato (AC-9)', async () => {
    const c = await ate(['assumir']);
    const ev = await M.Evento.findOne({
      cotacaoId: new Types.ObjectId(c.id),
      acao: 'assumir',
    }).lean();
    expect(ev).toMatchObject({
      de: 'enviada',
      para: 'em_analise',
      papel: 'fiscal',
      autorNome: 'fiscal',
    });
    expect(String(ev?.autorUserId)).toBe(ids.fiscal);
    expect(ev?.parametrosNoAto).toMatchObject({ raizCnpjContratada: '03543374' });
    expect(ev?.itensNoAto[0]).toMatchObject({
      descricao: 'Disjuntor',
      precoAplicadoCentavos: 1000,
    });
  });
});
