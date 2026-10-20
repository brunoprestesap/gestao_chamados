import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

/**
 * O fio da fatia 1 da cotação de material contra o MongoDB de verdade (spec
 * 0019): o técnico cria, o responsável técnico monta e envia com 3
 * orçamentos, o fiscal encaminha, o aprovador aprova com empenho, o técnico
 * executa com evidência; o chamado pausa e retoma, a reserva aparece e é
 * ajustada, e o custo do chamado sobe.
 *
 * covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-7, AC-8, AC-9, AC-10, AC-12, AC-13, AC-17
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

/** A referência livre que o item do caminho 3 precisa para enviar (fatia 4, AC-32). */
const REFS = [
  {
    id: String(new Types.ObjectId()),
    fonte: 'Painel de preços do governo',
    valorUnitarioCentavos: 1_000_00,
    data: new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10),
  },
];

rodar('fio da cotação de material, contra o Mongo', () => {
  let t: typeof import('../transicoes');
  let chamadoLib: typeof import('../chamado');
  let custo: typeof import('@/lib/ativos/custo');
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
    aprovadorPequeno: String(new Types.ObjectId()),
    aprovador: String(new Types.ObjectId()),
    solicitante: String(new Types.ObjectId()),
  };

  beforeAll(async () => {
    t = await import('../transicoes');
    chamadoLib = await import('../chamado');
    custo = await import('@/lib/ativos/custo');
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
    await conectarMongoDeTeste(todos, 'severino_test_material_fio');
  });

  beforeEach(async () => {
    await limparColecoes(todos);
    await M.User.collection.insertMany([
      {
        _id: new Types.ObjectId(ids.tecnico),
        username: 'tecnico',
        name: 'Técnico',
        role: 'Técnico',
        isActive: true,
      },
      {
        _id: new Types.ObjectId(ids.rt),
        username: 'rt',
        name: 'Resp. Técnico',
        role: 'Preposto',
        isActive: true,
      },
      {
        _id: new Types.ObjectId(ids.fiscal),
        username: 'fiscal',
        name: 'Fiscal',
        role: 'Admin',
        isActive: true,
      },
      {
        _id: new Types.ObjectId(ids.aprovadorPequeno),
        username: 'aprovadorpequeno',
        name: 'Aprov. Pequeno',
        role: 'Admin',
        isActive: true,
      },
      {
        _id: new Types.ObjectId(ids.aprovador),
        username: 'aprovador',
        name: 'Aprovador',
        role: 'Admin',
        isActive: true,
      },
    ]);
    const faixaPequena = await M.Faixa.create({
      nome: 'Pequena',
      limiteCentavos: 15_00,
      criadoPorUserId: new Types.ObjectId(),
      em: new Date(),
    });
    const faixaGrande = await M.Faixa.create({
      nome: 'Grande',
      limiteCentavos: 1_000_00,
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
    await designar(ids.aprovadorPequeno, 'aprovador', faixaPequena._id);
    await designar(ids.aprovador, 'aprovador', faixaGrande._id);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  const usuario = (userId: string, role: string) => ({ tipo: 'usuario' as const, userId, role });

  async function chamado(status = 'em atendimento'): Promise<string> {
    const _id = new Types.ObjectId();
    await M.Chamado.collection.insertOne({
      _id,
      ticket_number: `CHM-T-${String(_id).slice(-5)}`,
      titulo: 'Quadro elétrico',
      status,
      assignedToUserId: new Types.ObjectId(ids.tecnico),
      solicitanteId: new Types.ObjectId(ids.solicitante),
      createdAt: new Date(),
    });
    return String(_id);
  }

  async function empenho(valor: number): Promise<string> {
    const e = await M.Empenho.create({
      numero: `NE${String(new Types.ObjectId()).slice(-6)}`,
      exercicio: ano,
      valorInicialCentavos: valor,
      valorLiquidoCentavos: valor,
      criadoPorUserId: new Types.ObjectId(),
    });
    return String(e._id);
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

  /** Cria e deixa a cotação `enviada`, com 1 item de 2 un a R$ 10,00 (menor de 3 orçamentos). */
  async function ateEnviada(chamadoId: string) {
    const criada = await t.criarCotacao(
      { userId: ids.tecnico },
      {
        chamadoId,
        itens: [
          {
            descricao: 'Disjuntor 40 A',
            unidade: 'un',
            quantidade: 2,
            motivo: 'Trocar o queimado',
          },
        ],
      },
    );
    if (!criada.ok) throw new Error(criada.error);
    const cot = (await M.Cotacao.findById(criada.id).lean())!;
    const itemId = String(cot.itens[0]!._id);
    const orc = async (preco: number, cnpj: string) => ({
      id: String(new Types.ObjectId()),
      fornecedor: `Loja ${cnpj}`,
      cnpj,
      data: '2026-10-01',
      validade: '2099-12-31',
      arquivoId: await arquivo(criada.id, 'orcamento', ids.rt),
      precos: [{ itemId, valorUnitarioCentavos: preco }],
    });
    const salvo = await t.salvarRascunho(usuario(ids.rt, 'Preposto'), {
      id: criada.id,
      versao: cot.versao,
      itens: [
        {
          id: itemId,
          descricao: 'Disjuntor 40 A',
          unidade: 'un',
          quantidade: 2,
          motivo: 'Trocar o queimado',
          referencias: REFS,
        },
      ],
      orcamentos: [
        await orc(12_00, '11111111000191'),
        await orc(10_00, '22222222000191'),
        await orc(11_00, '33333333000191'),
      ],
    });
    if (!salvo.ok) throw new Error(salvo.error);
    const enviada = await t.transicionar({
      cotacaoId: criada.id,
      acao: 'enviar',
      versao: salvo.versao,
      ator: usuario(ids.rt, 'Preposto'),
    });
    if (!enviada.ok) throw new Error(enviada.error);
    return { id: criada.id, itemId, versao: enviada.versao };
  }

  it('percorre o fio: pausa, reserva, retoma, executa, ajusta e entra no custo', async () => {
    const chamadoId = await chamado();
    const empenhoId = await empenho(100_00);

    // Envio pausa o chamado e grava o PauseLog da cotação (AC-2).
    const { id, versao: v1 } = await ateEnviada(chamadoId);
    let ch = await M.Chamado.findById(chamadoId).lean();
    expect(ch?.status).toBe('aguardando_terceiros');
    let cot = (await M.Cotacao.findById(id).lean())!;
    expect(cot.valorTotalCentavos).toBe(20_00);
    expect(cot.itens[0]?.precoAplicadoCentavos).toBe(10_00);
    expect(cot.pauseLogId).toBeTruthy();
    expect(await chamadoLib.impedimentoDeRetomada(chamadoId)).toMatch(/cotação de material/);

    // O técnico não edita mais depois que o responsável técnico salvou (AC-1).
    const tecnicoEdita = await t.salvarRascunho(usuario(ids.tecnico, 'Técnico'), {
      id,
      versao: v1,
      itens: [
        {
          id: String(cot.itens[0]!._id),
          descricao: 'x',
          unidade: 'un',
          quantidade: 1,
          motivo: 'y',
        },
      ],
    });
    expect(tecnicoEdita.ok).toBe(false);

    // Fiscal assume e encaminha (AC-5, AC-6).
    const a = await t.transicionar({
      cotacaoId: id,
      acao: 'assumir',
      versao: v1,
      ator: usuario(ids.fiscal, 'Admin'),
    });
    expect(a.ok).toBe(true);
    const e = await t.transicionar({
      cotacaoId: id,
      acao: 'encaminhar',
      versao: a.ok ? a.versao : 0,
      ator: usuario(ids.fiscal, 'Admin'),
    });
    expect(e.ok).toBe(true);
    const vAprov = e.ok ? e.versao : 0;

    // Faixa menor que o valor: recusado no servidor (AC-7).
    const pequeno = await t.transicionar({
      cotacaoId: id,
      acao: 'aprovar',
      versao: vAprov,
      empenhoId,
      ator: usuario(ids.aprovadorPequeno, 'Admin'),
    });
    expect(pequeno.ok).toBe(false);
    expect(!pequeno.ok && pequeno.impedimentos).toEqual(['competencia_insuficiente']);

    // Aprovar reserva, autoriza e retoma o chamado (AC-8, AC-2).
    const ap = await t.transicionar({
      cotacaoId: id,
      acao: 'aprovar',
      versao: vAprov,
      empenhoId,
      ator: usuario(ids.aprovador, 'Admin'),
    });
    expect(ap.ok).toBe(true);
    expect((await M.Empenho.findById(empenhoId).lean())?.comprometidoCentavos).toBe(20_00);
    ch = await M.Chamado.findById(chamadoId).lean();
    expect(ch?.status).toBe('em atendimento');
    expect(await chamadoLib.impedimentoDeRetomada(chamadoId)).toBeNull();
    const eventoAprov = await M.Evento.findOne({
      cotacaoId: new Types.ObjectId(id),
      acao: 'aprovar',
    }).lean();
    expect(eventoAprov?.limiteCentavosNoAto).toBe(1_000_00);
    expect(eventoAprov?.papel).toBe('aprovador');

    // Autorizada ainda segura a conclusão do chamado (AC-13).
    expect(await chamadoLib.impedimentoDeConclusao(chamadoId)).toMatch(/cotação de material/);

    // Execução sem evidência é recusada (AC-10).
    await new Promise((r) => setTimeout(r, 5));
    const vExec = ap.ok ? ap.versao : 0;
    const semEvid = await t.transicionar({
      cotacaoId: id,
      acao: 'executar',
      versao: vExec,
      quantidades: [{ itemId: String(cot.itens[0]!._id), quantidadeExecutada: 1 }],
      ator: usuario(ids.tecnico, 'Técnico'),
    });
    expect(!semEvid.ok && semEvid.impedimentos).toEqual(['evidencia_ausente']);

    // Acima do autorizado também (AC-10).
    await arquivo(id, 'evidencia', ids.tecnico);
    const acima = await t.transicionar({
      cotacaoId: id,
      acao: 'executar',
      versao: vExec,
      quantidades: [{ itemId: String(cot.itens[0]!._id), quantidadeExecutada: 3 }],
      ator: usuario(ids.tecnico, 'Técnico'),
    });
    expect(!acima.ok && acima.impedimentos).toEqual(['execucao_acima_autorizado']);

    // Executar a menos gera advertência e devolve a diferença ao saldo.
    const ex = await t.transicionar({
      cotacaoId: id,
      acao: 'executar',
      versao: vExec,
      quantidades: [{ itemId: String(cot.itens[0]!._id), quantidadeExecutada: 1 }],
      ator: usuario(ids.tecnico, 'Técnico'),
    });
    expect(ex.ok).toBe(true);
    cot = (await M.Cotacao.findById(id).lean())!;
    expect(cot.situacao).toBe('executada');
    expect(cot.emTramite).toBe(false);
    expect(cot.valorExecutadoCentavos).toBe(10_00);
    expect(cot.advertencias.map((x) => x.codigo)).toEqual(['divergencia_execucao']);
    expect((await M.Empenho.findById(empenhoId).lean())?.comprometidoCentavos).toBe(10_00);
    expect(await chamadoLib.impedimentoDeConclusao(chamadoId)).toBeNull();

    // O custo do chamado soma o executado (AC-17).
    const [c] = await custo.lerCustosDosChamados([
      { _id: new Types.ObjectId(chamadoId), createdAt: new Date() },
    ]);
    expect(c?.totalCentavos).toBe(10_00);

    // A trilha tem uma linha por ato, e a linha do tempo do chamado não leva valor (AC-9).
    const acoes = (
      await M.Evento.find({ cotacaoId: new Types.ObjectId(id) })
        .sort({ em: 1, _id: 1 })
        .lean()
    ).map((x) => x.acao);
    expect(acoes).toEqual(
      expect.arrayContaining(['criar', 'enviar', 'assumir', 'encaminhar', 'aprovar', 'executar']),
    );
    const hist = await M.History.find({ chamadoId: new Types.ObjectId(chamadoId) }).lean();
    expect(hist.map((h) => h.action)).toEqual([
      'cotacao_material_enviada',
      'cotacao_material_autorizada',
    ]);
    expect(hist.every((h) => !/R\$/.test(h.observacoes ?? ''))).toBe(true);

    // `executada` libera o chamado para uma cotação nova (AC-3).
    const nova = await t.criarCotacao(
      { userId: ids.tecnico },
      { chamadoId, itens: [{ descricao: 'Fio', unidade: 'm', quantidade: 5, motivo: 'Ligação' }] },
    );
    expect(nova.ok).toBe(true);
  });

  it('o rascunho não aparece na fila do fiscal, só na da contratada (AC-1)', async () => {
    const { listarFila } = await import('../leitura');
    const chamadoId = await chamado();
    const criada = await t.criarCotacao(
      { userId: ids.tecnico },
      { chamadoId, itens: [{ descricao: 'Fio', unidade: 'm', quantidade: 1, motivo: 'Ligação' }] },
    );
    expect(criada.ok).toBe(true);

    const fiscal = await listarFila({ userId: ids.fiscal, role: 'Admin' }, 'todas');
    const rt = await listarFila({ userId: ids.rt, role: 'Preposto' }, 'todas');

    expect(fiscal?.linhas).toHaveLength(0);
    expect(rt?.linhas.map((l) => l.situacao)).toEqual(['rascunho']);
  });

  it('uma cotação em trâmite por chamado (AC-3)', async () => {
    const chamadoId = await chamado();
    const item = { descricao: 'Fio', unidade: 'm', quantidade: 5, motivo: 'Ligação' };
    const [a, b] = await Promise.all([
      t.criarCotacao({ userId: ids.tecnico }, { chamadoId, itens: [item] }),
      t.criarCotacao({ userId: ids.tecnico }, { chamadoId, itens: [item] }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
  });

  it('duplo clique no enviar: só um pausa o chamado (AC-2, AC-9)', async () => {
    const chamadoId = await chamado();
    const criada = await t.criarCotacao(
      { userId: ids.tecnico },
      { chamadoId, itens: [{ descricao: 'Fio', unidade: 'm', quantidade: 1, motivo: 'Ligação' }] },
    );
    if (!criada.ok) throw new Error(criada.error);
    const cot = (await M.Cotacao.findById(criada.id).lean())!;
    const itemId = String(cot.itens[0]!._id);
    const orcamentos = await Promise.all(
      ['11111111000191', '22222222000191', '33333333000191'].map(async (cnpj) => ({
        id: String(new Types.ObjectId()),
        fornecedor: cnpj,
        cnpj,
        data: '2026-10-01',
        validade: '2099-12-31',
        arquivoId: await arquivo(criada.id, 'orcamento', ids.rt),
        precos: [{ itemId, valorUnitarioCentavos: 5_00 }],
      })),
    );
    const salvo = await t.salvarRascunho(usuario(ids.rt, 'Preposto'), {
      id: criada.id,
      versao: cot.versao,
      itens: [
        {
          id: itemId,
          descricao: 'Fio',
          unidade: 'm',
          quantidade: 1,
          motivo: 'Ligação',
          referencias: REFS,
        },
      ],
      orcamentos,
    });
    if (!salvo.ok) throw new Error(salvo.error);

    const envio = () =>
      t.transicionar({
        cotacaoId: criada.id,
        acao: 'enviar',
        versao: salvo.versao,
        ator: usuario(ids.rt, 'Preposto'),
      });
    const r = await Promise.all([envio(), envio()]);

    expect(r.filter((x) => x.ok)).toHaveLength(1);
    expect(await M.PauseLog.countDocuments({ chamadoId: new Types.ObjectId(chamadoId) })).toBe(1);
  });

  it('item com menos de 3 orçamentos não é enviado (AC-4)', async () => {
    const chamadoId = await chamado();
    const criada = await t.criarCotacao(
      { userId: ids.tecnico },
      { chamadoId, itens: [{ descricao: 'Fio', unidade: 'm', quantidade: 1, motivo: 'Ligação' }] },
    );
    if (!criada.ok) throw new Error(criada.error);
    const r = await t.transicionar({
      cotacaoId: criada.id,
      acao: 'enviar',
      versao: 1,
      ator: usuario(ids.rt, 'Preposto'),
    });
    // Desde a fatia 4, o item do caminho 3 também precisa de referência (AC-32).
    expect(!r.ok && r.impedimentos).toEqual(['orcamentos_insuficientes', 'sem_referencia']);
  });

  it('cancelar o chamado cancela a cotação autorizada e libera o saldo (AC-12)', async () => {
    const chamadoId = await chamado();
    const empenhoId = await empenho(100_00);
    const { id, versao } = await ateEnviada(chamadoId);
    const a = await t.transicionar({
      cotacaoId: id,
      acao: 'assumir',
      versao,
      ator: usuario(ids.fiscal, 'Admin'),
    });
    const e = await t.transicionar({
      cotacaoId: id,
      acao: 'encaminhar',
      versao: a.ok ? a.versao : 0,
      ator: usuario(ids.fiscal, 'Admin'),
    });
    const ap = await t.transicionar({
      cotacaoId: id,
      acao: 'aprovar',
      versao: e.ok ? e.versao : 0,
      empenhoId,
      ator: usuario(ids.aprovador, 'Admin'),
    });
    expect(ap.ok).toBe(true);

    await chamadoLib.cancelarCotacaoPeloChamado({
      chamadoId,
      userId: ids.solicitante,
      motivo: 'chamado_cancelado',
    });

    const cot = await M.Cotacao.findById(id).lean();
    expect(cot?.situacao).toBe('cancelada');
    expect((await M.Empenho.findById(empenhoId).lean())?.comprometidoCentavos).toBe(0);
    const ev = await M.Evento.findOne({
      cotacaoId: new Types.ObjectId(id),
      acao: 'cancelar',
      para: 'cancelada',
      de: 'autorizada',
    }).lean();
    expect(ev?.papel).toBe('sistema');
    expect(ev?.motivo).toBe('chamado_cancelado');
    expect(String(ev?.autorUserId)).toBe(ids.solicitante);
  });

  it('quem montou não aprova (AC-7)', async () => {
    // Quem montou como responsável técnico depois vira Admin e aprovador: o
    // perfil não deixa ter os dois papéis ao mesmo tempo (AC-19), mas a trava
    // de quem montou vale mesmo assim.
    const faixa = await M.Faixa.create({
      nome: 'RT',
      limiteCentavos: 1_000_00,
      criadoPorUserId: new Types.ObjectId(),
      em: new Date(),
    });
    await M.Designacao.create({
      userId: new Types.ObjectId(ids.rt),
      papel: 'aprovador',
      faixaId: faixa._id,
      vigenciaInicio: '2000-01-01',
      ato: 'x',
      criadoPorUserId: new Types.ObjectId(),
      em: new Date(),
    });
    const chamadoId = await chamado();
    const empenhoId = await empenho(100_00);
    const { id, versao } = await ateEnviada(chamadoId);
    const a = await t.transicionar({
      cotacaoId: id,
      acao: 'assumir',
      versao,
      ator: usuario(ids.fiscal, 'Admin'),
    });
    const e = await t.transicionar({
      cotacaoId: id,
      acao: 'encaminhar',
      versao: a.ok ? a.versao : 0,
      ator: usuario(ids.fiscal, 'Admin'),
    });
    await M.User.collection.updateOne(
      { _id: new Types.ObjectId(ids.rt) },
      { $set: { role: 'Admin' } },
    );

    const r = await t.transicionar({
      cotacaoId: id,
      acao: 'aprovar',
      versao: e.ok ? e.versao : 0,
      empenhoId,
      ator: usuario(ids.rt, 'Admin'),
    });
    expect(!r.ok && r.impedimentos).toEqual(['autor_nao_aprova']);
  });
});
