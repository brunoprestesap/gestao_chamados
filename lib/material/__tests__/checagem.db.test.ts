import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MaterialSicam } from '@/lib/material/sicam';
import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

/**
 * A checagem do almoxarifado contra o MongoDB de verdade, com o serviço falso
 * (spec 0024): os cenários críticos da spec, do `criar` ao custo.
 *
 * covers: AC-1, AC-3, AC-4, AC-6, AC-7, AC-9, AC-10, AC-11, AC-12, AC-13, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-23, AC-28
 */

const sicam = vi.hoisted(() => ({
  buscarCandidatos: vi.fn(),
  relerMateriais: vi.fn(),
  buscarMateriais: vi.fn(),
}));
vi.mock('../sicam', () => sicam);

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

const material = (extra: Partial<MaterialSicam> = {}): MaterialSicam => ({
  coMat: '302400',
  descricao: 'TORNEIRA DE LAVATÓRIO',
  unidade: 'UN',
  saldo: 10,
  reservado: 2,
  disponivel: 8,
  valorTotal: 250,
  ...extra,
});

const sicamFora = { ok: false, motivo: 'indisponivel' } as const;

function respondeCandidatos(comCandidato: (descricaoId: string) => boolean = () => true) {
  sicam.buscarCandidatos.mockImplementation(async (itens: { itemId: string }[]) => ({
    ok: true,
    consultadoEm: new Date(),
    porItem: new Map(itens.map((i) => [i.itemId, comCandidato(i.itemId) ? [material()] : []])),
  }));
}

function respondeReleitura(lista: MaterialSicam[] = [material()]) {
  sicam.relerMateriais.mockResolvedValue({
    ok: true,
    consultadoEm: new Date(),
    porCoMat: new Map(lista.map((m) => [m.coMat, m])),
  });
}

rodar('checagem do almoxarifado, contra o Mongo', () => {
  let t: typeof import('../transicoes');
  let chamadoLib: typeof import('../chamado');
  let custo: typeof import('@/lib/ativos/custo');
  let avisos: typeof import('../avisos');
  let relatorio: typeof import('../relatorio');
  let parametros: typeof import('../parametros');
  let M: {
    Chamado: typeof import('@/models/Chamado').ChamadoModel;
    User: typeof import('@/models/user.model').UserModel;
    Cotacao: typeof import('@/models/CotacaoMaterial').CotacaoMaterialModel;
    Evento: typeof import('@/models/CotacaoMaterialEvento').CotacaoMaterialEventoModel;
    Designacao: typeof import('@/models/DesignacaoMaterial').DesignacaoMaterialModel;
    PauseLog: typeof import('@/models/PauseLog').PauseLogModel;
    History: typeof import('@/models/ChamadoHistory').ChamadoHistoryModel;
    Notification: typeof import('@/models/Notification').NotificationModel;
    Config: typeof import('@/models/MaterialConfig').MaterialConfigModel;
    Tentativa: typeof import('@/models/CotacaoMaterialTentativa').CotacaoMaterialTentativaModel;
  };
  let todos: ModelDeTeste[];

  const ids = {
    tecnico: String(new Types.ObjectId()),
    rt: String(new Types.ObjectId()),
    fiscal: String(new Types.ObjectId()),
    gestor: String(new Types.ObjectId()),
    almox: String(new Types.ObjectId()),
    solicitante: String(new Types.ObjectId()),
  };
  const usuario = (nome: keyof typeof ids, role: string) => ({
    tipo: 'usuario' as const,
    userId: ids[nome],
    role,
  });
  const almox = usuario('almox', 'Solicitante');
  const fiscal = usuario('fiscal', 'Admin');
  const rt = usuario('rt', 'Preposto');
  const tecnico = usuario('tecnico', 'Técnico');

  beforeAll(async () => {
    t = await import('../transicoes');
    chamadoLib = await import('../chamado');
    custo = await import('@/lib/ativos/custo');
    avisos = await import('../avisos');
    relatorio = await import('../relatorio');
    parametros = await import('../parametros');
    M = {
      Chamado: (await import('@/models/Chamado')).ChamadoModel,
      User: (await import('@/models/user.model')).UserModel,
      Cotacao: (await import('@/models/CotacaoMaterial')).CotacaoMaterialModel,
      Evento: (await import('@/models/CotacaoMaterialEvento')).CotacaoMaterialEventoModel,
      Designacao: (await import('@/models/DesignacaoMaterial')).DesignacaoMaterialModel,
      PauseLog: (await import('@/models/PauseLog')).PauseLogModel,
      History: (await import('@/models/ChamadoHistory')).ChamadoHistoryModel,
      Notification: (await import('@/models/Notification')).NotificationModel,
      Config: (await import('@/models/MaterialConfig')).MaterialConfigModel,
      Tentativa: (await import('@/models/CotacaoMaterialTentativa')).CotacaoMaterialTentativaModel,
    };
    todos = Object.values(M).map((m) => cru(m as never));
    await conectarMongoDeTeste(todos, 'severino_test_material_checagem');
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  const designar = async (nome: keyof typeof ids, papel: string) =>
    M.Designacao.collection.insertOne({
      userId: new Types.ObjectId(ids[nome]),
      papel,
      faixaId: null,
      vigenciaInicio: '2020-01-01',
      vigenciaFim: null,
      revogadaEm: null,
      criadaPorUserId: new Types.ObjectId(ids.fiscal),
      em: new Date(),
    });

  beforeEach(async () => {
    vi.clearAllMocks();
    await limparColecoes(todos);
    await M.User.collection.insertMany(
      (
        [
          ['tecnico', 'Técnico'],
          ['rt', 'Preposto'],
          ['fiscal', 'Admin'],
          ['gestor', 'Admin'],
          ['almox', 'Solicitante'],
          ['solicitante', 'Solicitante'],
        ] as const
      ).map(([n, role]) => ({
        _id: new Types.ObjectId(ids[n]),
        username: n,
        name: `Nome ${n}`,
        role,
        isActive: true,
      })),
    );
    await designar('rt', 'responsavel_tecnico');
    await designar('fiscal', 'fiscal');
    await designar('gestor', 'gestor');
    await designar('almox', 'almoxarifado');
    await M.Config.collection.insertOne({
      chave: 'global',
      checagemAlmoxarifadoAtiva: true,
      prazoChecagemDiasUteis: 1,
    });
    respondeCandidatos();
    respondeReleitura();
  });

  async function novoChamado(extra: Record<string, unknown> = {}) {
    const _id = new Types.ObjectId();
    await M.Chamado.collection.insertOne({
      _id,
      ticket_number: `CHM-${String(_id).slice(-5)}`,
      titulo: 'Vazamento',
      status: 'em atendimento',
      tipoServico: 'Manutenção Predial',
      solicitanteId: new Types.ObjectId(ids.solicitante),
      assignedToUserId: new Types.ObjectId(ids.tecnico),
      createdAt: new Date(),
      ...extra,
    });
    return _id;
  }

  const ITEM = { descricao: 'Torneira lavatório', unidade: 'UN', quantidade: 10, motivo: 'Trocar' };

  async function criar(itens = [ITEM]) {
    const chamadoId = await novoChamado();
    const r = await t.criarCotacao(
      { userId: ids.tecnico },
      { chamadoId: String(chamadoId), itens },
    );
    if (!r.ok) throw new Error(r.error);
    const cot = (await M.Cotacao.findById(r.id).lean())!;
    return { id: r.id, chamadoId, cot };
  }

  const concluir = (
    id: string,
    versao: number,
    decisoes: import('@/shared/material/cotacao.schemas').DecisaoChecagemInput[],
    ator: typeof almox = almox,
  ) => t.transicionar({ cotacaoId: id, acao: 'concluir_checagem', versao, ator, decisoes });

  describe('entrada (AC-1 a AC-4)', () => {
    it('com o interruptor desligado, nada muda e o SICAM nem é chamado', async () => {
      await M.Config.collection.updateOne(
        { chave: 'global' },
        { $set: { checagemAlmoxarifadoAtiva: false } },
      );
      const { cot } = await criar();
      expect(cot.situacao).toBe('rascunho');
      expect(cot.checagem).toBeNull();
      expect(sicam.buscarCandidatos).not.toHaveBeenCalled();
    });

    it('sem candidato: nasce rascunho, sem pausa, com a busca registrada na trilha', async () => {
      respondeCandidatos(() => false);
      const { id, chamadoId, cot } = await criar();
      expect(cot.situacao).toBe('rascunho');
      expect(cot.checagem?.voltarPara).toBeNull();
      expect(cot.checagem?.itens[0]).toMatchObject({
        resultado: 'sem_candidato',
        automatico: true,
        papel: 'sistema',
        quantidadeLiberada: 10,
      });
      expect(cot.checagem?.itens[0]?.palavrasBuscadas).toEqual(['torneira', 'lavatorio']);
      const ch = await M.Chamado.findById(chamadoId).lean();
      expect(ch?.status).toBe('em atendimento');
      const ev = await M.Evento.findOne({ cotacaoId: id, acao: 'criar' }).lean();
      expect(ev?.para).toBe('rascunho');
      expect(ev?.checagemNoAto).toHaveLength(1);
    });

    it('com candidato: nasce em checagem, pausa o chamado e avisa o almoxarifado', async () => {
      const { id, chamadoId, cot } = await criar();
      expect(cot.situacao).toBe('em_checagem');
      expect(cot.checagem).toMatchObject({ voltarPara: 'rascunho', abriuPausa: true, itens: [] });
      expect(cot.checagem?.prazoAte).toBeInstanceOf(Date);
      expect(cot.pauseLogId).toBeTruthy();
      expect((await M.Chamado.findById(chamadoId).lean())?.status).toBe('aguardando_terceiros');
      await vi.waitFor(async () => {
        const avisos = await M.Notification.find({ 'data.cotacaoId': id }).lean();
        expect(avisos.map((a) => String(a.userId))).toEqual([ids.almox]);
      });
      const h = await M.History.findOne({
        chamadoId,
        action: 'cotacao_material_em_checagem',
      }).lean();
      expect(h?.statusNovo).toBe('aguardando_terceiros');
    });

    it('com o SICAM fora: em checagem, e nenhum item é liberado sozinho', async () => {
      sicam.buscarCandidatos.mockResolvedValue(sicamFora);
      const { cot } = await criar();
      expect(cot.situacao).toBe('em_checagem');
      expect(cot.checagem?.itens).toEqual([]);
    });

    it('um item com candidato e outro sem: o sem candidato já fica resolvido', async () => {
      let n = 0;
      respondeCandidatos(() => n++ === 0);
      const { cot } = await criar([
        ITEM,
        { descricao: 'Parafuso', unidade: 'UN', quantidade: 3, motivo: 'Fixar' },
      ]);
      expect(cot.situacao).toBe('em_checagem');
      expect(cot.checagem?.itens.map((e) => e.descricao)).toEqual(['Parafuso']);
    });

    it('sem almoxarifado vigente, o aviso vai para os fiscais (AC-15)', async () => {
      await M.Designacao.collection.deleteMany({ papel: 'almoxarifado' });
      const { id } = await criar();
      await vi.waitFor(async () => {
        const lista = await M.Notification.find({ 'data.cotacaoId': id }).lean();
        expect(lista.map((a) => String(a.userId))).toEqual([ids.fiscal]);
      });
    });
  });

  describe('decisão (AC-6 a AC-11)', () => {
    it('usar parte: a contratada recebe o resto e o preço médio congela (AC-7, AC-23)', async () => {
      const { id, chamadoId, cot } = await criar();
      const r = await concluir(id, cot.versao, [
        {
          itemId: String(cot.itens[0]!._id),
          resultado: 'usar',
          coMat: '302400',
          quantidadeAtendida: 4,
        },
      ]);
      expect(r).toMatchObject({ ok: true, situacao: 'rascunho' });
      const depois = (await M.Cotacao.findById(id).lean())!;
      expect(depois.itens[0]?.quantidade).toBe(6);
      expect(depois.checagem?.voltarPara).toBeNull();
      expect(depois.checagem?.itens[0]).toMatchObject({
        resultado: 'usar',
        origem: 'sicam',
        saldoVisto: 10,
        reservadoVisto: 2,
        quantidadeAtendida: 4,
        quantidadeSaida: 4,
        quantidadeLiberada: 6,
        precoUnitarioCentavos: 2500,
        valorCentavos: 10000,
        precoOrigem: 'sicam',
        papel: 'almoxarifado',
        porNome: 'Nome almox',
      });
      const ev = await M.Evento.findOne({ cotacaoId: id, acao: 'concluir_checagem' }).lean();
      expect(ev?.checagemNoAto).toHaveLength(1);
      expect(ev?.papel).toBe('almoxarifado');
      // A pausa que a checagem abriu é retomada.
      expect((await M.Chamado.findById(chamadoId).lean())?.status).toBe('em atendimento');
      expect(depois.pauseLogId).toBeNull();
      const log = await M.PauseLog.findOne({ chamadoId }).lean();
      expect(log?.resumedAt).toBeInstanceOf(Date);
    });

    it('avisa o técnico do que retirar, sem valor (AC-20)', async () => {
      const { id, cot } = await criar();
      await concluir(id, cot.versao, [
        {
          itemId: String(cot.itens[0]!._id),
          resultado: 'usar',
          coMat: '302400',
          quantidadeAtendida: 4,
        },
      ]);
      await vi.waitFor(async () => {
        const aviso = await M.Notification.findOne({
          'data.aviso': 'retirar_almoxarifado',
        }).lean();
        expect(String(aviso?.userId)).toBe(ids.tecnico);
        expect(aviso?.body).toContain('Torneira lavatório');
        expect(JSON.stringify(aviso)).not.toMatch(/2500|10000|valor|preco/i);
      });
    });

    it('tudo do estoque: atendida, final, sem itens, e pode abrir outra cotação (AC-11, AC-18)', async () => {
      const { id, chamadoId, cot } = await criar();
      const r = await concluir(id, cot.versao, [
        {
          itemId: String(cot.itens[0]!._id),
          resultado: 'usar',
          coMat: '302400',
          quantidadeAtendida: 8,
          // A unidade é a mesma: a saída informada não vale, ela é a atendida (AC-8).
          quantidadeSaida: 100,
        },
      ]);
      // 8 de 10 é parcial; a seguir, atende o resto com outro material.
      expect(r).toMatchObject({ ok: true, situacao: 'rascunho' });
      const parcial = (await M.Cotacao.findById(id).lean())!;
      expect(parcial.checagem?.itens[0]?.quantidadeSaida).toBe(8);

      const outro = await criar([{ ...ITEM, quantidade: 2 }]);
      const fim = await concluir(outro.id, outro.cot.versao, [
        {
          itemId: String(outro.cot.itens[0]!._id),
          resultado: 'usar',
          coMat: '302400',
          quantidadeAtendida: 2,
        },
      ]);
      expect(fim).toMatchObject({ ok: true, situacao: 'atendida_almoxarifado' });
      const atendida = (await M.Cotacao.findById(outro.id).lean())!;
      expect(atendida.itens).toEqual([]);
      expect(atendida.emTramite).toBe(false);
      expect(atendida.pauseLogId).toBeNull();
      const ch = await M.Chamado.findById(outro.chamadoId).lean();
      expect(ch?.status).toBe('em atendimento');
      expect(
        await M.History.exists({
          chamadoId: outro.chamadoId,
          action: 'cotacao_material_atendida_almoxarifado',
        }),
      ).toBeTruthy();
      // O chamado segue e pode abrir outra cotação.
      expect(
        await t.criarCotacao(
          { userId: ids.tecnico },
          { chamadoId: String(outro.chamadoId), itens: [ITEM] },
        ),
      ).toMatchObject({ ok: true });
      expect(chamadoId).toBeTruthy();
    });

    it('saldo caiu entre abrir e concluir: recusa com o saldo novo e nada é gravado (AC-9)', async () => {
      const { id, cot } = await criar();
      respondeReleitura([material({ saldo: 3, reservado: 1, disponivel: 2 })]);
      const r = await concluir(id, cot.versao, [
        {
          itemId: String(cot.itens[0]!._id),
          resultado: 'usar',
          coMat: '302400',
          quantidadeAtendida: 4,
        },
      ]);
      expect(r).toMatchObject({ ok: false });
      expect((r as { error: string }).error).toContain('2');
      const depois = (await M.Cotacao.findById(id).lean())!;
      expect(depois.situacao).toBe('em_checagem');
      expect(depois.versao).toBe(cot.versao);
      expect(depois.checagem?.itens).toEqual([]);
    });

    it('dois itens no mesmo material somam contra o disponível (AC-9)', async () => {
      const { id, cot } = await criar([
        { ...ITEM, quantidade: 5 },
        { descricao: 'Torneira jardim', unidade: 'UN', quantidade: 5, motivo: 'Trocar' },
      ]);
      const r = await concluir(
        id,
        cot.versao,
        cot.itens.map((i) => ({
          itemId: String(i._id),
          resultado: 'usar' as const,
          coMat: '302400',
          quantidadeAtendida: 5,
        })),
      );
      expect(r.ok).toBe(false);
      expect((await M.Cotacao.findById(id).lean())?.situacao).toBe('em_checagem');
    });

    it('vale por inteiro: um item sem decisão recusa tudo (AC-6)', async () => {
      const { id, cot } = await criar([
        ITEM,
        { descricao: 'Torneira jardim', unidade: 'UN', quantidade: 5, motivo: 'Trocar' },
      ]);
      const r = await concluir(id, cot.versao, [
        { itemId: String(cot.itens[0]!._id), resultado: 'sem_correspondente' },
      ]);
      expect(r).toMatchObject({ ok: false });
      expect((await M.Cotacao.findById(id).lean())?.versao).toBe(cot.versao);
    });

    it('cotar mesmo assim guarda o material e o motivo, e libera a quantidade inteira (AC-6)', async () => {
      const { id, cot } = await criar();
      const itemId = String(cot.itens[0]!._id);
      expect(
        await concluir(id, cot.versao, [
          { itemId, resultado: 'cotar_mesmo_assim', coMat: '302400' },
        ]),
      ).toMatchObject({ ok: false });
      const r = await concluir(id, cot.versao, [
        {
          itemId,
          resultado: 'cotar_mesmo_assim',
          coMat: '302400',
          motivo: 'O modelo do estoque não serve neste ponto.',
        },
      ]);
      expect(r).toMatchObject({ ok: true, situacao: 'rascunho' });
      const depois = (await M.Cotacao.findById(id).lean())!;
      expect(depois.itens[0]?.quantidade).toBe(10);
      expect(depois.checagem?.itens[0]).toMatchObject({
        resultado: 'cotar_mesmo_assim',
        quantidadeLiberada: 10,
        coMat: '302400',
        valorCentavos: null,
      });
    });

    it('unidades diferentes pedem as duas quantidades, e o valor sai da saída (AC-8)', async () => {
      respondeReleitura([
        material({ unidade: 'RL', saldo: 5, reservado: 0, disponivel: 5, valorTotal: 100 }),
      ]);
      const { id, cot } = await criar([
        { descricao: 'Cabo flexivel', unidade: 'm', quantidade: 100, motivo: 'Trocar' },
      ]);
      const itemId = String(cot.itens[0]!._id);
      expect(
        await concluir(id, cot.versao, [
          { itemId, resultado: 'usar', coMat: '302400', quantidadeAtendida: 50 },
        ]),
      ).toMatchObject({ ok: false });
      const r = await concluir(id, cot.versao, [
        { itemId, resultado: 'usar', coMat: '302400', quantidadeAtendida: 50, quantidadeSaida: 2 },
      ]);
      expect(r.ok).toBe(true);
      const e = (await M.Cotacao.findById(id).lean())!.checagem!.itens[0]!;
      expect(e).toMatchObject({
        quantidadeAtendida: 50,
        quantidadeSaida: 2,
        precoUnitarioCentavos: 2000,
        valorCentavos: 4000,
      });
    });

    it('corrida: dois concluir com a mesma versão, só um grava (AC-6)', async () => {
      const { id, cot } = await criar();
      const decisoes = [
        { itemId: String(cot.itens[0]!._id), resultado: 'sem_correspondente' as const },
      ];
      const [a, b] = await Promise.all([
        concluir(id, cot.versao, decisoes),
        concluir(id, cot.versao, decisoes),
      ]);
      expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
      expect((await M.Cotacao.findById(id).lean())!.checagem?.itens).toHaveLength(1);
      expect(await M.Evento.countDocuments({ cotacaoId: id, acao: 'concluir_checagem' })).toBe(1);
    });

    it('o fiscal conclui com o papel dele; o técnico e a contratada, não (AC-15)', async () => {
      const { id, cot } = await criar();
      const decisoes = [
        { itemId: String(cot.itens[0]!._id), resultado: 'sem_correspondente' as const },
      ];
      expect((await concluir(id, cot.versao, decisoes, tecnico)).ok).toBe(false);
      expect((await concluir(id, cot.versao, decisoes, rt)).ok).toBe(false);
      expect((await concluir(id, cot.versao, decisoes, fiscal)).ok).toBe(true);
      const ev = await M.Evento.findOne({ cotacaoId: id, acao: 'concluir_checagem' }).lean();
      expect(ev?.papel).toBe('fiscal');
    });

    it('devolvida com orçamento, item atendido por inteiro: tira o preço, recalcula, e a pausa do envio continua (AC-7, AC-18)', async () => {
      const chamadoId = await novoChamado({
        status: 'aguardando_terceiros',
        slaPausedAt: new Date(),
      });
      const atendido = new Types.ObjectId();
      const fica = new Types.ObjectId();
      const pauseLog = await M.PauseLog.create({
        chamadoId,
        reason: 'falta_peca_aprovacao_cliente',
        pausedAt: new Date(),
        pausedByUserId: new Types.ObjectId(ids.rt),
      });
      const item = (id: Types.ObjectId, descricao: string) => ({
        _id: id,
        descricao,
        unidade: 'UN',
        quantidade: 2,
        motivo: 'Trocar',
        doDiagnostico: true,
        origem: 'orcamento',
        baseAplicada: 'orcamento',
        precoAplicadoCentavos: 1000,
      });
      const criada = await M.Cotacao.create({
        numero: `COT-T-${String(atendido).slice(-5)}`,
        chamadoId,
        situacao: 'em_checagem',
        emTramite: true,
        versao: 3,
        itens: [item(atendido, 'Atendido'), item(fica, 'Fica')],
        orcamentos: [
          {
            fornecedor: 'Forn',
            cnpj: '11222333000181',
            data: new Date(),
            arquivoId: new Types.ObjectId(),
            precos: [
              { itemId: atendido, valorUnitarioCentavos: 1000 },
              { itemId: fica, valorUnitarioCentavos: 1000 },
            ],
          },
        ],
        montadoPorUserId: new Types.ObjectId(ids.rt),
        diagnosticadoPorUserId: new Types.ObjectId(ids.tecnico),
        diagnosticadoEm: new Date(),
        valorTotalCentavos: 4000,
        pauseLogId: pauseLog._id,
        checagem: {
          voltarPara: 'devolvida',
          abriuPausa: false,
          prazoAte: null,
          itens: [
            {
              itemId: fica,
              descricao: 'Fica',
              unidade: 'UN',
              quantidadePedida: 2,
              resultado: 'sem_candidato',
              automatico: true,
              origem: 'sicam',
              consultadoEm: new Date(),
              quantidadeLiberada: 2,
              papel: 'sistema',
              em: new Date(),
            },
          ],
        },
      });
      const r = await concluir(String(criada._id), 3, [
        {
          itemId: String(atendido),
          resultado: 'usar',
          coMat: '302400',
          quantidadeAtendida: 2,
        },
      ]);
      expect(r).toMatchObject({ ok: true, situacao: 'devolvida' });
      const depois = (await M.Cotacao.findById(criada._id).lean())!;
      expect(depois.itens.map((i) => i.descricao)).toEqual(['Fica']);
      expect(depois.orcamentos[0]?.precos.map((p) => String(p.itemId))).toEqual([String(fica)]);
      expect(depois.valorTotalCentavos).toBe(2000);
      expect(String(depois.pauseLogId)).toBe(String(pauseLog._id));
      expect((await M.Chamado.findById(chamadoId).lean())?.status).toBe('aguardando_terceiros');
      // O responsável técnico consegue salvar sem esbarrar no item que saiu.
      const salvar = await t.salvarRascunho(
        { userId: ids.rt, role: 'Preposto' },
        {
          id: String(criada._id),
          versao: depois.versao,
          itens: [
            { id: String(fica), descricao: 'Fica', unidade: 'UN', quantidade: 2, motivo: 'Trocar' },
          ],
        },
      );
      expect(salvar.ok).toBe(true);
    });

    it('chamado já pausado por outro motivo: a checagem não abre nem retoma (AC-18)', async () => {
      await M.Config.collection.updateOne(
        { chave: 'global' },
        { $set: { checagemAlmoxarifadoAtiva: false } },
      );
      const { id, cot, chamadoId } = await criar();
      await M.Chamado.collection.updateOne(
        { _id: chamadoId },
        { $set: { status: 'aguardando_terceiros', slaPausedAt: new Date() } },
      );
      await M.Cotacao.collection.updateOne(
        { _id: new Types.ObjectId(id) },
        {
          $set: {
            checagem: { prazoAte: null, voltarPara: null, abriuPausa: false, itens: [] },
            itens: [
              { ...cot.itens[0], _id: new Types.ObjectId() },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ] as any,
          },
        },
      );
      const r = await t.transicionar({
        cotacaoId: id,
        acao: 'reenviar_checagem',
        versao: cot.versao,
        ator: tecnico,
      });
      expect(r).toMatchObject({ ok: true, situacao: 'em_checagem' });
      const depois = (await M.Cotacao.findById(id).lean())!;
      expect(depois.checagem?.abriuPausa).toBe(false);
      expect(depois.pauseLogId).toBeNull();
      const fim = await concluir(id, depois.versao, [
        { itemId: String(depois.itens[0]!._id), resultado: 'sem_correspondente' },
      ]);
      expect(fim.ok).toBe(true);
      expect((await M.Chamado.findById(chamadoId).lean())?.status).toBe('aguardando_terceiros');
    });
  });

  describe('SICAM fora (AC-12, AC-13)', () => {
    it('registro manual: saldo, motivo e preço digitados, com origem manual', async () => {
      sicam.buscarCandidatos.mockResolvedValue(sicamFora);
      sicam.relerMateriais.mockResolvedValue(sicamFora);
      const { id, cot } = await criar();
      const itemId = String(cot.itens[0]!._id);
      // Sem motivo, sem saldo ou sem preço, recusa.
      expect(
        await concluir(id, cot.versao, [
          {
            itemId,
            resultado: 'usar',
            manual: true,
            quantidadeAtendida: 4,
            saldoManual: 10,
            precoUnitarioCentavos: 100,
          },
        ]),
      ).toMatchObject({ ok: false });
      expect(
        await concluir(id, cot.versao, [
          {
            itemId,
            resultado: 'usar',
            manual: true,
            quantidadeAtendida: 4,
            saldoManual: 10,
            motivo: 'SICAM fora do ar hoje',
          },
        ]),
      ).toMatchObject({ ok: false });
      // Sem marcar manual, com o SICAM fora, recusa.
      expect(
        await concluir(id, cot.versao, [{ itemId, resultado: 'sem_correspondente' }]),
      ).toMatchObject({ ok: false });
      const r = await concluir(id, cot.versao, [
        {
          itemId,
          resultado: 'usar',
          manual: true,
          quantidadeAtendida: 4,
          saldoManual: 10,
          precoUnitarioCentavos: 300,
          motivo: 'SICAM fora do ar hoje',
        },
      ]);
      expect(r.ok).toBe(true);
      expect((await M.Cotacao.findById(id).lean())!.checagem?.itens[0]).toMatchObject({
        origem: 'manual',
        coMat: null,
        saldoVisto: 10,
        precoOrigem: 'manual',
        valorCentavos: 1200,
      });
    });

    it('o SICAM voltou entre abrir e concluir: a decisão manual é recusada', async () => {
      sicam.buscarCandidatos.mockResolvedValue(sicamFora);
      const { id, cot } = await criar();
      respondeReleitura([]);
      const r = await concluir(id, cot.versao, [
        {
          itemId: String(cot.itens[0]!._id),
          resultado: 'usar',
          manual: true,
          quantidadeAtendida: 4,
          saldoManual: 10,
          precoUnitarioCentavos: 300,
          motivo: 'SICAM fora do ar hoje',
        },
      ]);
      expect(r).toMatchObject({ ok: false });
      expect((await M.Cotacao.findById(id).lean())?.situacao).toBe('em_checagem');
    });

    it('`VL_ATU` vazio com saldo: usar exige preço digitado, e marca a origem (AC-13)', async () => {
      respondeReleitura([material({ valorTotal: null })]);
      const { id, cot } = await criar();
      const itemId = String(cot.itens[0]!._id);
      const base = { itemId, resultado: 'usar' as const, coMat: '302400', quantidadeAtendida: 1 };
      expect(await concluir(id, cot.versao, [base])).toMatchObject({ ok: false });
      expect(
        await concluir(id, cot.versao, [{ ...base, precoUnitarioCentavos: 500 }]),
      ).toMatchObject({ ok: true });
      expect((await M.Cotacao.findById(id).lean())!.checagem?.itens[0]).toMatchObject({
        origem: 'sicam',
        precoOrigem: 'manual',
        precoUnitarioCentavos: 500,
      });
    });

    it('com `VL_ATU` presente, o preço da tela é ignorado', async () => {
      const { id, cot } = await criar();
      await concluir(id, cot.versao, [
        {
          itemId: String(cot.itens[0]!._id),
          resultado: 'usar',
          coMat: '302400',
          quantidadeAtendida: 1,
          precoUnitarioCentavos: 1,
        },
      ]);
      expect((await M.Cotacao.findById(id).lean())!.checagem?.itens[0]).toMatchObject({
        precoUnitarioCentavos: 2500,
        precoOrigem: 'sicam',
      });
    });
  });

  describe('item novo (AC-17)', () => {
    async function comRascunho() {
      respondeCandidatos(() => false);
      return criar();
    }

    it('item a mais: enviar recusa, reenviar busca só nele e mantém a situação sem candidato', async () => {
      const { id, cot } = await comRascunho();
      const novo = String(new Types.ObjectId());
      const salvo = await t.salvarRascunho(
        { userId: ids.rt, role: 'Preposto' },
        {
          id,
          versao: cot.versao,
          itens: [
            {
              id: String(cot.itens[0]!._id),
              descricao: ITEM.descricao,
              unidade: 'UN',
              quantidade: 10,
              motivo: 'Trocar',
            },
            { id: novo, descricao: 'Vedante novo', unidade: 'UN', quantidade: 1, motivo: 'Vedar' },
          ],
        },
      );
      expect(salvo.ok).toBe(true);
      const versao = (salvo as { versao: number }).versao;
      const envio = await t.transicionar({ cotacaoId: id, acao: 'enviar', versao, ator: rt });
      expect(envio).toMatchObject({ ok: false });
      expect((envio as { impedimentos?: string[] }).impedimentos).toContain('item_sem_checagem');
      expect(await M.Tentativa.countDocuments({ cotacaoId: id })).toBe(1);

      const r = await t.transicionar({
        cotacaoId: id,
        acao: 'reenviar_checagem',
        versao,
        ator: rt,
      });
      expect(r).toMatchObject({ ok: true, situacao: 'rascunho' });
      const depois = (await M.Cotacao.findById(id).lean())!;
      expect(depois.checagem?.itens.map((e) => e.descricao)).toEqual([
        ITEM.descricao,
        'Vedante novo',
      ]);
      const pedido = sicam.buscarCandidatos.mock.lastCall?.[0] as { itemId: string }[];
      expect(pedido.map((i) => i.itemId)).toEqual([novo]);
    });

    it('com candidato vai a em_checagem e volta à situação de origem', async () => {
      const { id, cot } = await comRascunho();
      const novo = String(new Types.ObjectId());
      const salvo = await t.salvarRascunho(
        { userId: ids.rt, role: 'Preposto' },
        {
          id,
          versao: cot.versao,
          itens: [
            {
              id: String(cot.itens[0]!._id),
              descricao: ITEM.descricao,
              unidade: 'UN',
              quantidade: 10,
              motivo: 'Trocar',
            },
            {
              id: novo,
              descricao: 'Torneira nova',
              unidade: 'UN',
              quantidade: 1,
              motivo: 'Trocar',
            },
          ],
        },
      );
      respondeCandidatos(() => true);
      const r = await t.transicionar({
        cotacaoId: id,
        acao: 'reenviar_checagem',
        versao: (salvo as { versao: number }).versao,
        ator: rt,
      });
      expect(r).toMatchObject({ ok: true, situacao: 'em_checagem' });
      const emChecagem = (await M.Cotacao.findById(id).lean())!;
      expect(emChecagem.checagem?.voltarPara).toBe('rascunho');
      expect(emChecagem.checagem?.abriuPausa).toBe(true);
      const fim = await concluir(id, emChecagem.versao, [
        { itemId: novo, resultado: 'sem_correspondente' },
      ]);
      expect(fim).toMatchObject({ ok: true, situacao: 'rascunho' });
    });

    it('trocar só a descrição não reabre; cotação sem checagem não tem o impedimento', async () => {
      const { id, cot } = await comRascunho();
      const itemId = String(cot.itens[0]!._id);
      await t.salvarRascunho(
        { userId: ids.tecnico, role: 'Técnico' },
        {
          id,
          versao: cot.versao,
          itens: [
            {
              id: itemId,
              descricao: 'Outra descrição',
              unidade: 'UN',
              quantidade: 10,
              motivo: 'Trocar',
            },
          ],
        },
      );
      const r = await t.transicionar({
        cotacaoId: id,
        acao: 'reenviar_checagem',
        versao: cot.versao + 1,
        ator: tecnico,
      });
      expect(r).toMatchObject({ ok: false });
    });
  });

  describe('ganchos do chamado (AC-19)', () => {
    it('a conclusão é recusada em checagem; cancelar o chamado cancela a cotação', async () => {
      const { id, chamadoId } = await criar();
      expect(await chamadoLib.impedimentoDeConclusao(String(chamadoId))).not.toBeNull();
      expect(await chamadoLib.impedimentoDeRetomada(String(chamadoId))).not.toBeNull();
      await M.Chamado.collection.updateOne({ _id: chamadoId }, { $set: { status: 'cancelado' } });
      expect(
        await chamadoLib.cancelarCotacaoPeloChamado({
          chamadoId: String(chamadoId),
          userId: null,
          motivo: 'chamado_cancelado',
        }),
      ).toBe(true);
      expect((await M.Cotacao.findById(id).lean())?.situacao).toBe('cancelada');
    });

    it('o técnico cancela em checagem só sem montagem, e não edita', async () => {
      const a = await criar();
      expect(
        await t.salvarRascunho(
          { userId: ids.tecnico, role: 'Técnico' },
          {
            id: a.id,
            versao: a.cot.versao,
            itens: [
              {
                id: String(a.cot.itens[0]!._id),
                descricao: 'X y',
                unidade: 'UN',
                quantidade: 1,
                motivo: 'Trocar',
              },
            ],
          },
        ),
      ).toMatchObject({ ok: false });
      const cancelou = await t.transicionar({
        cotacaoId: a.id,
        acao: 'cancelar',
        versao: a.cot.versao,
        ator: tecnico,
        motivo: 'Pedi errado',
      });
      expect(cancelou).toMatchObject({ ok: true, situacao: 'cancelada' });
      expect((await M.Chamado.findById(a.chamadoId).lean())?.status).toBe('em atendimento');

      const b = await criar();
      expect(
        await t.transicionar({
          cotacaoId: b.id,
          acao: 'cancelar',
          versao: b.cot.versao,
          ator: almox,
          motivo: 'Não é meu',
        }),
      ).toMatchObject({ ok: false });
    });
  });

  describe('custo (AC-21 a AC-23, AC-28)', () => {
    async function usado(status: string) {
      const { id, chamadoId, cot } = await criar();
      await concluir(id, cot.versao, [
        {
          itemId: String(cot.itens[0]!._id),
          resultado: 'usar',
          coMat: '302400',
          quantidadeAtendida: 2,
        },
      ]);
      await M.Chamado.collection.updateOne({ _id: chamadoId }, { $set: { status } });
      return chamadoId;
    }
    const ler = async (chamadoId: Types.ObjectId) => {
      const doc = await M.Chamado.findById(chamadoId).select(custo.PROJECAO_CUSTO).lean();
      return (await custo.lerCustosDosChamados([doc as never]))[0]!;
    };

    it('só conta com o chamado concluído ou encerrado, e reabrir tira a parte', async () => {
      const chamadoId = await usado('em atendimento');
      expect((await ler(chamadoId)).almoxarifadoCentavos).toBe(0);

      await M.Chamado.collection.updateOne({ _id: chamadoId }, { $set: { status: 'concluído' } });
      expect(await ler(chamadoId)).toMatchObject({
        almoxarifadoCentavos: 5000,
        totalCentavos: 5000,
      });

      await M.Chamado.collection.updateOne({ _id: chamadoId }, { $set: { status: 'encerrado' } });
      expect((await ler(chamadoId)).almoxarifadoCentavos).toBe(5000);

      for (const status of ['em atendimento', 'cancelado', 'recusado']) {
        await M.Chamado.collection.updateOne({ _id: chamadoId }, { $set: { status } });
        expect((await ler(chamadoId)).almoxarifadoCentavos).toBe(0);
      }
    });

    it('mudança posterior no SICAM não altera o custo (AC-23)', async () => {
      const chamadoId = await usado('concluído');
      respondeReleitura([material({ valorTotal: 99999 })]);
      expect((await ler(chamadoId)).almoxarifadoCentavos).toBe(5000);
    });

    it('o relatório mostra atendidas e valor, sem somar chamado fora da regra (AC-28)', async () => {
      await usado('concluído');
      await usado('cancelado');
      const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Belem' }).format(
        new Date(),
      );
      const r = await relatorio.lerRelatorioMaterial({ inicio: hoje, fim: hoje });
      expect(r.almoxarifado.valorCentavos).toBe(5000);
    });
  });

  describe('prazo e interruptor (AC-1, AC-16)', () => {
    it('a rodada avisa os gestores uma vez por entrada vencida', async () => {
      const { id } = await criar();
      await M.Cotacao.collection.updateOne(
        { _id: new Types.ObjectId(id) },
        { $set: { 'checagem.prazoAte': new Date(Date.now() - 1000) } },
      );
      expect((await avisos.avisarChecagensAtrasadas()).avisadas).toBe(1);
      expect((await avisos.avisarChecagensAtrasadas()).avisadas).toBe(0);
      const lista = await M.Notification.find({ 'data.aviso': 'checagem_atrasada' }).lean();
      expect(lista.map((a) => String(a.userId))).toEqual([ids.gestor]);
    });

    it('prazo nulo não gera aviso, e nada é liberado sozinho', async () => {
      const { id } = await criar();
      await M.Cotacao.collection.updateOne(
        { _id: new Types.ObjectId(id) },
        { $set: { 'checagem.prazoAte': null } },
      );
      expect((await avisos.avisarChecagensAtrasadas()).avisadas).toBe(0);
      expect((await M.Cotacao.findById(id).lean())?.situacao).toBe('em_checagem');
    });

    it('desligar não trava quem já está em checagem; a gravação é condicional ao lido', async () => {
      const { id, cot } = await criar();
      expect(await parametros.salvarChecagemAtiva(ids.fiscal, { lido: true, novo: false })).toEqual(
        {
          ok: true,
        },
      );
      expect(
        await parametros.salvarChecagemAtiva(ids.fiscal, { lido: true, novo: false }),
      ).toMatchObject({ ok: false });
      const r = await concluir(id, cot.versao, [
        { itemId: String(cot.itens[0]!._id), resultado: 'sem_correspondente' },
      ]);
      expect(r.ok).toBe(true);
      const { historico } = await parametros.lerParametros();
      expect(historico[0]).toMatchObject({
        campo: 'checagemAlmoxarifadoAtiva',
        de: true,
        para: false,
      });
    });
  });
});
