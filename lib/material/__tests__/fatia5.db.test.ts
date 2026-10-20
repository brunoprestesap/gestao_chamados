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
 * A fatia 5 da cotação de material contra o MongoDB de verdade (spec 0019):
 * as quatro advertências do ato, a projeção na aprovação, a tentativa de
 * envio recusada, os parâmetros com histórico e o relatório de material.
 *
 * covers: AC-15, AC-36, AC-37, AC-38, AC-39, AC-40, AC-41, AC-42, AC-43
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
const diasAtras = (n: number) => new Date(Date.now() - n * DIA);

rodar('fatia 5 da cotação de material, contra o Mongo', () => {
  let t: typeof import('../transicoes');
  let parametros: typeof import('../parametros');
  let relatorio: typeof import('../relatorio');
  let serializar: typeof import('../serializar');
  let leitura: typeof import('../leitura');
  let M: {
    Chamado: typeof import('@/models/Chamado').ChamadoModel;
    User: typeof import('@/models/user.model').UserModel;
    Cotacao: typeof import('@/models/CotacaoMaterial').CotacaoMaterialModel;
    Evento: typeof import('@/models/CotacaoMaterialEvento').CotacaoMaterialEventoModel;
    Tentativa: typeof import('@/models/CotacaoMaterialTentativa').CotacaoMaterialTentativaModel;
    Empenho: typeof import('@/models/Empenho').EmpenhoModel;
    Designacao: typeof import('@/models/DesignacaoMaterial').DesignacaoMaterialModel;
    Faixa: typeof import('@/models/FaixaCompetencia').FaixaCompetenciaModel;
    History: typeof import('@/models/ChamadoHistory').ChamadoHistoryModel;
    Notification: typeof import('@/models/Notification').NotificationModel;
    AnexoV: typeof import('@/models/AnexoVItem').AnexoVItemModel;
    Vigencia: typeof import('@/models/AnexoVVigencia').AnexoVVigenciaModel;
    SinapiInsumo: typeof import('@/models/SinapiInsumo').SinapiInsumoModel;
    SinapiReferencia: typeof import('@/models/SinapiReferencia').SinapiReferenciaModel;
    Config: typeof import('@/models/MaterialConfig').MaterialConfigModel;
    Contrato: typeof import('@/models/Contrato').ContratoModel;
    Ativo: typeof import('@/models/Ativo').AtivoModel;
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
    aprovador: String(new Types.ObjectId()),
    admin: String(new Types.ObjectId()),
  };
  let empenhoId: string;
  let faixaPequenaId: Types.ObjectId;

  beforeAll(async () => {
    t = await import('../transicoes');
    parametros = await import('../parametros');
    relatorio = await import('../relatorio');
    serializar = await import('../serializar');
    leitura = await import('../leitura');
    M = {
      Chamado: (await import('@/models/Chamado')).ChamadoModel,
      User: (await import('@/models/user.model')).UserModel,
      Cotacao: (await import('@/models/CotacaoMaterial')).CotacaoMaterialModel,
      Evento: (await import('@/models/CotacaoMaterialEvento')).CotacaoMaterialEventoModel,
      Tentativa: (await import('@/models/CotacaoMaterialTentativa')).CotacaoMaterialTentativaModel,
      Empenho: (await import('@/models/Empenho')).EmpenhoModel,
      Designacao: (await import('@/models/DesignacaoMaterial')).DesignacaoMaterialModel,
      Faixa: (await import('@/models/FaixaCompetencia')).FaixaCompetenciaModel,
      History: (await import('@/models/ChamadoHistory')).ChamadoHistoryModel,
      Notification: (await import('@/models/Notification')).NotificationModel,
      AnexoV: (await import('@/models/AnexoVItem')).AnexoVItemModel,
      Vigencia: (await import('@/models/AnexoVVigencia')).AnexoVVigenciaModel,
      SinapiInsumo: (await import('@/models/SinapiInsumo')).SinapiInsumoModel,
      SinapiReferencia: (await import('@/models/SinapiReferencia')).SinapiReferenciaModel,
      Config: (await import('@/models/MaterialConfig')).MaterialConfigModel,
      Contrato: (await import('@/models/Contrato')).ContratoModel,
      Ativo: (await import('@/models/Ativo')).AtivoModel,
    };
    todos = Object.values(M).map((m) => cru(m as never));
    await conectarMongoDeTeste(todos, 'severino_test_material_fatia5');
  });

  beforeEach(async () => {
    await limparColecoes(todos);
    vi.clearAllMocks();
    vi.restoreAllMocks();
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
      pessoa(ids.aprovador, 'aprovador', 'Admin'),
      pessoa(ids.admin, 'admin', 'Admin'),
    ]);
    // A faixa pequena (R$ 1.000) é a do fracionamento; a grande é a do aprovador.
    const pequena = await M.Faixa.create({
      nome: 'Pequena',
      limiteCentavos: 1000_00,
      criadoPorUserId: new Types.ObjectId(),
      em: new Date(),
    });
    faixaPequenaId = pequena._id;
    const grande = await M.Faixa.create({
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
    await designar(ids.aprovador, 'aprovador', grande._id);
    const emp = await M.Empenho.create({
      numero: 'NE-F5',
      exercicio: ano,
      valorInicialCentavos: 1000_00,
      valorLiquidoCentavos: 1000_00,
      criadoPorUserId: new Types.ObjectId(),
    });
    empenhoId = String(emp._id);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  const usuario = (userId: string, role: string) => ({ tipo: 'usuario' as const, userId, role });
  const fiscal = () => usuario(ids.fiscal, 'Admin');
  const aprovador = () => usuario(ids.aprovador, 'Admin');

  async function chamado(ativoId: Types.ObjectId | null = null): Promise<Types.ObjectId> {
    const _id = new Types.ObjectId();
    await M.Chamado.collection.insertOne({
      _id,
      ticket_number: `CHM-F5-${String(_id).slice(-5)}`,
      titulo: 'Quadro elétrico',
      status: 'em atendimento',
      tipoServico: 'manutencao_predial',
      ativoId,
      assignedToUserId: new Types.ObjectId(ids.tecnico),
      solicitanteId: new Types.ObjectId(),
      createdAt: new Date(),
    });
    return _id;
  }

  type ItemCru = {
    descricao: string;
    quantidade: number;
    precoAplicadoCentavos: number | null;
    origem?: string;
    anexoVItemId?: Types.ObjectId | null;
    sinapiCodigo?: string | null;
    quantidadeExecutada?: number | null;
  };

  /** Uma cotação gravada direto, na situação pedida, sem passar pelo fluxo. */
  async function cotacao(p: {
    situacao: string;
    ativoId?: Types.ObjectId | null;
    itens: ItemCru[];
    autorizadoEm?: Date | null;
    executadoEm?: Date | null;
    valorExecutadoCentavos?: number | null;
    urgencia?: Record<string, unknown> | null;
  }): Promise<Types.ObjectId> {
    const _id = new Types.ObjectId();
    const itens = p.itens.map((i) => ({
      _id: new Types.ObjectId(),
      unidade: 'un',
      motivo: 'Troca',
      doDiagnostico: true,
      baseAplicada: 'orcamento',
      origem: 'orcamento',
      anexoVItemId: null,
      sinapiCodigo: null,
      quantidadeExecutada: null,
      valorExecutadoCentavos: null,
      referencias: [],
      ...i,
    }));
    const total = itens.reduce(
      (s, i) => s + Math.round(i.quantidade * (i.precoAplicadoCentavos ?? 0)),
      0,
    );
    await M.Cotacao.collection.insertOne({
      _id,
      numero: `COT-${ano}-${String(_id).slice(-4)}`,
      chamadoId: await chamado(p.ativoId ?? null),
      ativoId: p.ativoId ?? null,
      localizacaoId: null,
      situacao: p.situacao,
      emTramite: [
        'rascunho',
        'enviada',
        'em_analise',
        'em_aprovacao',
        'devolvida',
        'autorizada',
      ].includes(p.situacao),
      versao: 1,
      itens,
      orcamentos: [],
      diagnosticadoPorUserId: new Types.ObjectId(ids.tecnico),
      diagnosticadoEm: new Date(),
      montadoPorUserId: new Types.ObjectId(ids.rt),
      fiscalUserId: p.situacao === 'em_analise' ? new Types.ObjectId(ids.fiscal) : null,
      valorTotalCentavos: total,
      valorAutorizadoCentavos: p.autorizadoEm ? total : null,
      autorizadoEm: p.autorizadoEm ?? null,
      executadoEm: p.executadoEm ?? null,
      valorExecutadoCentavos: p.valorExecutadoCentavos ?? null,
      empenhoId: null,
      urgencia: p.urgencia ?? null,
      advertencias: [],
      pauseLogId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return _id;
  }

  async function lida(id: Types.ObjectId) {
    return (await M.Cotacao.findById(id).lean())!;
  }

  const codigos = (c: { advertencias: { codigo: string }[] }) =>
    c.advertencias.map((a) => a.codigo);

  async function assumir(id: Types.ObjectId) {
    return t.transicionar({ cotacaoId: String(id), acao: 'assumir', versao: 1, ator: fiscal() });
  }

  const disjuntor = (preco: number): ItemCru => ({
    descricao: 'Disjuntor 40A',
    quantidade: 1,
    precoAplicadoCentavos: preco,
  });

  describe('fracionamento e reincidência (AC-36, AC-37)', () => {
    it('duas parcelas abaixo da faixa cuja soma alcança avisam no item e não travam', async () => {
      const ativo = new Types.ObjectId();
      await cotacao({
        situacao: 'executada',
        ativoId: ativo,
        itens: [{ ...disjuntor(600_00), quantidadeExecutada: 1 }],
        autorizadoEm: diasAtras(5),
      });
      const atual = await cotacao({
        situacao: 'enviada',
        ativoId: ativo,
        itens: [disjuntor(500_00)],
      });

      const r = await assumir(atual);

      expect(r.ok).toBe(true);
      const c = await lida(atual);
      expect(c.situacao).toBe('em_analise');
      const adv = c.advertencias.find((a) => a.codigo === 'fracionamento');
      expect(String(adv?.itemId)).toBe(String(c.itens[0]!._id));
      expect(codigos(c)).not.toContain('reincidencia');
      const ev = await M.Evento.findOne({ cotacaoId: atual, acao: 'assumir' }).lean();
      expect(ev?.advertenciasNoAto).toContain('fracionamento');
    });

    it('sem ativo, fora da janela, com faixa desativada ou devolvida pelo alterar não conta', async () => {
      const ativo = new Types.ObjectId();
      // Fora da janela de 90 dias.
      await cotacao({
        situacao: 'autorizada',
        ativoId: ativo,
        itens: [disjuntor(600_00)],
        autorizadoEm: diasAtras(120),
      });
      // Devolvida pelo `alterar`: sem `autorizadoEm` e fora das três situações.
      await cotacao({ situacao: 'devolvida', ativoId: ativo, itens: [disjuntor(600_00)] });
      const atual = await cotacao({
        situacao: 'enviada',
        ativoId: ativo,
        itens: [disjuntor(500_00)],
      });
      await assumir(atual);
      expect(codigos(await lida(atual))).not.toContain('fracionamento');

      // Sem ativo, mesmo com a outra cotação dentro da janela.
      await cotacao({
        situacao: 'autorizada',
        itens: [disjuntor(600_00)],
        autorizadoEm: diasAtras(3),
      });
      const semAtivo = await cotacao({ situacao: 'enviada', itens: [disjuntor(500_00)] });
      await assumir(semAtivo);
      expect(codigos(await lida(semAtivo))).toEqual([]);

      // Faixa desativada não conta.
      const ativo2 = new Types.ObjectId();
      await M.Faixa.collection.updateOne({ _id: faixaPequenaId }, { $set: { ativa: false } });
      await cotacao({
        situacao: 'autorizada',
        ativoId: ativo2,
        itens: [disjuntor(600_00)],
        autorizadoEm: diasAtras(3),
      });
      const comFaixaDesativada = await cotacao({
        situacao: 'enviada',
        ativoId: ativo2,
        itens: [disjuntor(500_00)],
      });
      await assumir(comFaixaDesativada);
      expect(codigos(await lida(comFaixaDesativada))).not.toContain('fracionamento');
    });

    it('reincidência avisa com duas outras autorizadas no ativo e não com uma', async () => {
      const ativo = new Types.ObjectId();
      const lampada = { descricao: 'Lâmpada', quantidade: 1, precoAplicadoCentavos: 10_00 };
      await cotacao({
        situacao: 'autorizada',
        ativoId: ativo,
        itens: [lampada],
        autorizadoEm: diasAtras(2),
      });
      const comUma = await cotacao({ situacao: 'enviada', ativoId: ativo, itens: [lampada] });
      await assumir(comUma);
      expect(codigos(await lida(comUma))).not.toContain('reincidencia');

      await cotacao({
        situacao: 'atestada',
        ativoId: ativo,
        itens: [lampada],
        autorizadoEm: diasAtras(20),
      });
      const comDuas = await cotacao({ situacao: 'enviada', ativoId: ativo, itens: [lampada] });
      await assumir(comDuas);
      const c = await lida(comDuas);
      expect(codigos(c)).toContain('reincidencia');
      expect(c.advertencias.find((a) => a.codigo === 'reincidencia')?.itemId).toBeNull();
    });

    it('as advertências do ato ficam na devolução e saem só num novo assumir, encaminhar ou aprovar', async () => {
      const ativo = new Types.ObjectId();
      await cotacao({
        situacao: 'autorizada',
        ativoId: ativo,
        itens: [disjuntor(600_00)],
        autorizadoEm: diasAtras(2),
      });
      const atual = await cotacao({
        situacao: 'enviada',
        ativoId: ativo,
        itens: [disjuntor(500_00)],
      });
      await assumir(atual);
      const r = await t.transicionar({
        cotacaoId: String(atual),
        acao: 'devolver',
        versao: 2,
        ator: fiscal(),
        motivo: 'Corrigir a quantidade',
      });
      expect(r.ok).toBe(true);
      expect(codigos(await lida(atual))).toContain('fracionamento');
    });
  });

  describe('consumo acima do estimado (AC-39)', () => {
    async function anexoV() {
      const contratoId = new Types.ObjectId();
      const v1 = await M.AnexoV.create({
        contratoId,
        numero: 7,
        versao: 1,
        descricao: 'Cabo flexível 2,5 mm',
        descricaoBusca: 'cabo flexivel 2,5 mm',
        unidade: 'm',
        quantidadeEstimada: 20,
        precoPactuadoCentavos: 5_00,
      });
      const v2 = await M.AnexoV.create({
        contratoId,
        numero: 7,
        versao: 2,
        descricao: 'Cabo flexível 2,5 mm',
        descricaoBusca: 'cabo flexivel 2,5 mm',
        unidade: 'm',
        quantidadeEstimada: 10,
        precoPactuadoCentavos: 5_00,
      });
      // De outro contrato, com o mesmo número: nunca casa.
      const outro = await M.AnexoV.create({
        contratoId: new Types.ObjectId(),
        numero: 7,
        versao: 1,
        descricao: 'Cabo flexível 2,5 mm',
        descricaoBusca: 'cabo flexivel 2,5 mm',
        unidade: 'm',
        quantidadeEstimada: 1000,
        precoPactuadoCentavos: 5_00,
      });
      await M.Vigencia.create({
        contratoId,
        versao: 2,
        importacaoId: new Types.ObjectId(),
        em: new Date(),
      });
      return { v1: v1._id, v2: v2._id, outro: outro._id };
    }

    const cabo = (
      anexoVItemId: Types.ObjectId,
      quantidade: number,
      extra: Partial<ItemCru> = {},
    ): ItemCru => ({
      descricao: 'Cabo flexível 2,5 mm',
      quantidade,
      precoAplicadoCentavos: 5_00,
      origem: 'anexo_v',
      anexoVItemId,
      ...extra,
    });

    it('soma executado, autorizado e a cotação atual, em qualquer versão, e avisa antes de passar', async () => {
      const a = await anexoV();
      await cotacao({
        situacao: 'executada',
        itens: [cabo(a.v1, 8, { quantidadeExecutada: 6 })],
        autorizadoEm: diasAtras(200),
      });
      await cotacao({ situacao: 'autorizada', itens: [cabo(a.v2, 3)], autorizadoEm: diasAtras(1) });
      await cotacao({
        situacao: 'autorizada',
        itens: [cabo(a.outro, 50)],
        autorizadoEm: diasAtras(1),
      });
      // Reprovada não conta.
      await cotacao({ situacao: 'reprovada', itens: [cabo(a.v2, 50)] });

      const passa = await cotacao({ situacao: 'enviada', itens: [cabo(a.v2, 2)] });
      await assumir(passa);
      expect(codigos(await lida(passa))).toContain('consumo_acima_estimado');

      // 6 + 3 + 1 = 10: chega à estimativa, não passa.
      const chega = await cotacao({ situacao: 'enviada', itens: [cabo(a.v2, 1)] });
      await assumir(chega);
      expect(codigos(await lida(chega))).not.toContain('consumo_acima_estimado');
    });
  });

  describe('item parecido (AC-40)', () => {
    it('avisa item do caminho 3 parecido com o SINAPI e nunca o do caminho 1', async () => {
      await M.SinapiInsumo.create({
        referencia: '2026-08',
        codigo: '123',
        descricao: 'DISJUNTOR TERMOMAGNETICO BIPOLAR 40A',
        unidade: 'UN',
        precoCentavos: 50_00,
        uf: 'AP',
        regime: 'nao_desonerado',
      });
      await M.SinapiReferencia.create({
        referencia: '2026-08',
        quantidade: 1,
        importacaoId: new Types.ObjectId(),
        em: new Date(),
      });
      const parecido = await cotacao({
        situacao: 'enviada',
        itens: [
          {
            descricao: 'Disjuntor termomagnético bipolar',
            quantidade: 1,
            precoAplicadoCentavos: 60_00,
          },
          {
            descricao: 'Disjuntor termomagnético bipolar',
            quantidade: 1,
            precoAplicadoCentavos: 60_00,
            origem: 'anexo_v',
          },
          { descricao: 'Serviço de pintura', quantidade: 1, precoAplicadoCentavos: 60_00 },
        ],
      });
      await assumir(parecido);
      const c = await lida(parecido);
      const marcados = c.advertencias
        .filter((a) => a.codigo === 'item_parecido')
        .map((a) => String(a.itemId));
      expect(marcados).toEqual([String(c.itens[0]!._id)]);
    });
  });

  describe('projeção na aprovação (AC-38)', () => {
    async function emAprovacao(valor: number) {
      return cotacao({
        situacao: 'em_aprovacao',
        itens: [{ descricao: 'Compressor', quantidade: 1, precoAplicadoCentavos: valor }],
      });
    }

    async function eventoDeSaldo(diasAntes: number, valor: number) {
      await M.Evento.collection.insertOne({
        cotacaoId: new Types.ObjectId(),
        de: 'autorizada',
        para: 'autorizada',
        acao: 'aprovar',
        papel: 'aprovador',
        empenhoId: new Types.ObjectId(empenhoId),
        valorCentavos: valor,
        em: diasAtras(diasAntes),
      });
    }

    async function aprovar(id: Types.ObjectId) {
      return t.transicionar({
        cotacaoId: String(id),
        acao: 'aprovar',
        versao: 1,
        ator: aprovador(),
        empenhoId,
      });
    }

    it('o detalhe em aprovação traz a projeção só dos empenhos em que a cotação pesa (AC-38)', async () => {
      await eventoDeSaldo(40, 100_00);
      const grande = await emAprovacao(300_00);
      const pequena = await emAprovacao(199_99);
      const sessao = { userId: ids.aprovador, role: 'Admin' };

      const comProjecao = await leitura.lerDetalhe(String(grande), sessao);
      const semProjecao = await leitura.lerDetalhe(String(pequena), sessao);

      expect(comProjecao?.projecoes).toEqual([
        expect.objectContaining({ empenhoId, saldoCentavos: 1000_00, situacao: 'estimada' }),
      ]);
      expect(semProjecao?.projecoes).toEqual([]);
    });

    it('a contratada não recebe projeção no detalhe nem na trilha (AC-15)', async () => {
      await eventoDeSaldo(40, 100_00);
      const id = await emAprovacao(300_00);
      await aprovar(id);

      const trf1 = await leitura.lerDetalhe(String(id), { userId: ids.aprovador, role: 'Admin' });
      const contratada = await leitura.lerDetalhe(String(id), { userId: ids.rt, role: 'Preposto' });

      expect(trf1?.cotacao.trilha?.find((e) => e.acao === 'aprovar')?.projecao).toMatchObject({
        situacao: 'estimada',
      });
      expect(contratada?.cotacao.visao).toBe('contratada');
      expect(contratada?.projecoes).toBeUndefined();
      expect(JSON.stringify(contratada)).not.toMatch(/projecao|mediaDiaria/);
    });

    it('com valor na parcela relevante do saldo de antes da reserva, grava a advertência e a projeção', async () => {
      await eventoDeSaldo(40, 100_00);
      // Reforço e anulação não são eventos: mexer no empenho não muda a média.
      await M.Empenho.collection.updateOne({ _id: new Types.ObjectId(empenhoId) }, {
        $push: {
          movimentos: { tipo: 'reforco', valorCentavos: 5000_00, ato: 'x', em: diasAtras(10) },
        },
      } as never);
      const id = await emAprovacao(300_00);

      const r = await aprovar(id);

      expect(r.ok).toBe(true);
      expect(codigos(await lida(id))).toContain('projecao_esgotamento');
      const ev = await M.Evento.findOne({ cotacaoId: id, acao: 'aprovar' }).lean();
      expect(ev?.advertenciasNoAto).toContain('projecao_esgotamento');
      expect(ev?.projecaoNoAto).toMatchObject({
        empenhoId,
        saldoCentavos: 1000_00,
        mediaDiariaCentavos: 2_50,
        situacao: 'estimada',
      });
    });

    it('com menos de 30 dias de histórico grava "histórico insuficiente"', async () => {
      await eventoDeSaldo(10, 100_00);
      const id = await emAprovacao(300_00);
      await aprovar(id);
      const ev = await M.Evento.findOne({ cotacaoId: id, acao: 'aprovar' }).lean();
      expect(ev?.projecaoNoAto).toMatchObject({
        situacao: 'historico_insuficiente',
        dataEstimada: null,
      });
    });

    it('abaixo da parcela relevante não aparece', async () => {
      await eventoDeSaldo(40, 100_00);
      const id = await emAprovacao(199_99);
      await aprovar(id);
      expect(codigos(await lida(id))).not.toContain('projecao_esgotamento');
      const ev = await M.Evento.findOne({ cotacaoId: id, acao: 'aprovar' }).lean();
      expect(ev?.projecaoNoAto ?? null).toBeNull();
    });
  });

  describe('visibilidade (AC-15)', () => {
    it('nenhuma advertência da fatia 5 chega à contratada nem ao técnico', async () => {
      const ativo = new Types.ObjectId();
      await cotacao({
        situacao: 'autorizada',
        ativoId: ativo,
        itens: [disjuntor(600_00)],
        autorizadoEm: diasAtras(2),
      });
      await cotacao({
        situacao: 'autorizada',
        ativoId: ativo,
        itens: [disjuntor(100_00)],
        autorizadoEm: diasAtras(2),
      });
      const id = await cotacao({ situacao: 'enviada', ativoId: ativo, itens: [disjuntor(500_00)] });
      await assumir(id);
      const bruta = (await M.Cotacao.findById(id).lean()) as never;
      expect(codigos(await lida(id))).toEqual(
        expect.arrayContaining(['fracionamento', 'reincidencia']),
      );

      const contratada = serializar.serializarCotacao(bruta, 'contratada', { userId: ids.rt });
      const tecnico = serializar.serializarCotacao(bruta, 'tecnico', { userId: ids.tecnico });
      const texto = JSON.stringify([contratada, tecnico]);
      for (const c of [
        'fracionamento',
        'reincidencia',
        'consumo_acima_estimado',
        'item_parecido',
      ]) {
        expect(texto).not.toContain(c);
      }
      expect(
        serializar.serializarCotacao(bruta, 'trf1', { userId: ids.fiscal }).advertencias,
      ).toEqual(expect.arrayContaining(['fracionamento', 'reincidencia']));
    });
  });

  describe('tentativa de envio recusada (AC-43)', () => {
    async function rascunhoSemOrcamento() {
      return cotacao({
        situacao: 'rascunho',
        itens: [{ descricao: 'Bomba', quantidade: 1, precoAplicadoCentavos: null }],
      });
    }
    const enviar = (id: Types.ObjectId, versao = 1) =>
      t.transicionar({
        cotacaoId: String(id),
        acao: 'enviar',
        versao,
        ator: usuario(ids.rt, 'Preposto'),
      });

    it('grava os códigos devolvidos; versão desatualizada não grava', async () => {
      const id = await rascunhoSemOrcamento();
      const r = await enviar(id);
      expect(r.ok).toBe(false);
      const tentativas = await M.Tentativa.find({ cotacaoId: id }).lean();
      expect(tentativas).toHaveLength(1);
      expect(tentativas[0]).toMatchObject({
        acao: 'enviar',
        papel: 'responsavel_tecnico',
        impedimentos: r.ok ? [] : r.impedimentos,
      });
      expect(String(tentativas[0]!.autorUserId)).toBe(ids.rt);

      await enviar(id, 99);
      expect(await M.Tentativa.countDocuments({ cotacaoId: id })).toBe(1);
    });

    it('uma falha na gravação da tentativa não muda a resposta', async () => {
      const id = await rascunhoSemOrcamento();
      const esperado = await enviar(id);
      const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(M.Tentativa, 'create').mockRejectedValueOnce(new Error('queda'));

      expect(await enviar(id)).toEqual(esperado);
      expect(erro).toHaveBeenCalled();
    });

    it('o registro recusa alteração e exclusão', async () => {
      const tentativa = await M.Tentativa.create({
        cotacaoId: new Types.ObjectId(),
        acao: 'enviar',
        impedimentos: ['sem_referencia'],
        papel: 'responsavel_tecnico',
        em: new Date(),
      });
      await expect(
        M.Tentativa.updateOne({ _id: tentativa._id }, { $set: { impedimentos: [] } }),
      ).rejects.toThrow(/só de inclusão/);
      await expect(M.Tentativa.deleteOne({ _id: tentativa._id })).rejects.toThrow(/só de inclusão/);
    });
  });

  describe('parâmetros (AC-42)', () => {
    const padrao = {
      percentualSinapi: 10,
      janelaDias: 90,
      parcelaRelevantePercentual: 20,
      raizCnpjContratada: '03543374',
    };

    it('cada campo mudado vira uma linha de histórico, e duas gravações sobre a mesma leitura deixam só a primeira', async () => {
      const novos = { ...padrao, janelaDias: 30, parcelaRelevantePercentual: 50 };
      const primeira = await parametros.salvarParametros(ids.admin, { lidos: padrao, novos });
      const segunda = await parametros.salvarParametros(ids.admin, {
        lidos: padrao,
        novos: { ...padrao, janelaDias: 60 },
      });

      expect(primeira.ok).toBe(true);
      expect(segunda.ok).toBe(false);
      const lidos = await parametros.lerParametros();
      expect(lidos).toMatchObject({ janelaDias: 30, parcelaRelevantePercentual: 50 });
      expect(lidos.historico.map((h) => [h.campo, h.de, h.para, h.porNome])).toEqual(
        expect.arrayContaining([
          ['janelaDias', 90, 30, 'admin'],
          ['parcelaRelevantePercentual', 20, 50, 'admin'],
        ]),
      );
      expect(lidos.historico).toHaveLength(2);
    });

    it('com o documento antigo sem os campos novos, o padrão casa com o campo ausente', async () => {
      await M.Config.collection.insertOne({
        chave: 'global',
        raizCnpjContratada: '03543374',
        percentualSinapi: 10,
        historico: [],
      });
      const r = await parametros.salvarParametros(ids.admin, {
        lidos: padrao,
        novos: { ...padrao, janelaDias: 45 },
      });
      expect(r.ok).toBe(true);
      expect((await parametros.lerParametros()).janelaDias).toBe(45);
    });

    it('o documento antigo com o percentual acima de 100 é corrigido pela gravação', async () => {
      await M.Config.collection.insertOne({
        chave: 'global',
        raizCnpjContratada: '03543374',
        percentualSinapi: 500,
        historico: [],
      });
      const lidos = await parametros.lerParametros();

      const r = await parametros.salvarParametros(ids.admin, {
        lidos: { ...padrao, percentualSinapi: lidos.percentualSinapi },
        novos: padrao,
      });

      expect(lidos.percentualSinapi).toBe(500);
      expect(r.ok).toBe(true);
      expect((await parametros.lerParametros()).percentualSinapi).toBe(10);
    });

    it('mudar o percentual recalcula a anomalia, e o evento seguinte copia os quatro valores', async () => {
      const contratoId = new Types.ObjectId();
      const item = await M.AnexoV.create({
        contratoId,
        numero: 1,
        versao: 1,
        descricao: 'Luminária',
        descricaoBusca: 'luminaria',
        unidade: 'un',
        quantidadeEstimada: 10,
        precoPactuadoCentavos: 120_00,
        sinapiCodigo: '55',
        anomalia: { automatica: true, referenciaSinapi: '2026-08' },
      });
      await M.Vigencia.create({
        contratoId,
        versao: 1,
        importacaoId: new Types.ObjectId(),
        em: new Date(),
      });
      await M.SinapiInsumo.create({
        referencia: '2026-08',
        codigo: '55',
        descricao: 'LUMINARIA',
        unidade: 'UN',
        precoCentavos: 100_00,
        uf: 'AP',
        regime: 'nao_desonerado',
      });
      await M.SinapiReferencia.create({
        referencia: '2026-08',
        quantidade: 1,
        importacaoId: new Types.ObjectId(),
        em: new Date(),
      });

      const r = await parametros.salvarParametros(ids.admin, {
        lidos: padrao,
        novos: { ...padrao, percentualSinapi: 30, janelaDias: 15 },
      });

      expect(r).toEqual({ ok: true });
      expect((await M.AnexoV.findById(item._id).lean())!.anomalia?.automatica).toBe(false);
      const id = await cotacao({ situacao: 'enviada', itens: [disjuntor(10_00)] });
      await assumir(id);
      const ev = await M.Evento.findOne({ cotacaoId: id, acao: 'assumir' }).lean();
      expect(ev?.parametrosNoAto).toEqual({ ...padrao, percentualSinapi: 30, janelaDias: 15 });
    });
  });

  describe('relatório de material (AC-41)', () => {
    const periodoDe = (d: Date) => {
      const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Belem' }).format(d);
      return { inicio: ymd, fim: ymd };
    };

    it('período sem cotações tem denominador zero, nunca 0%', async () => {
      const r = await relatorio.lerRelatorioMaterial({ inicio: '2001-01-01', fim: '2001-01-31' });
      expect(r.devolvidas).toEqual({ numerador: 0, denominador: 0 });
      expect(r.impedimentoPrimeiraTentativa).toEqual({ numerador: 0, denominador: 0 });
      expect(r.tempoAutorizacao.mediaDias).toBeNull();
    });

    it('cada indicador entra pela data do próprio fato', async () => {
      const autorizada = diasAtras(40);
      const executada = diasAtras(2);
      const id = await cotacao({
        situacao: 'executada',
        ativoId: new Types.ObjectId(),
        itens: [
          {
            descricao: 'Cabo',
            quantidade: 2,
            precoAplicadoCentavos: 100_00,
            origem: 'ambas',
            anexoVPrecoCentavos: 100_00,
            sinapiPrecoCentavos: 80_00,
            baseAplicada: 'sinapi',
          } as ItemCru,
          {
            descricao: 'Tomada',
            quantidade: 1,
            precoAplicadoCentavos: 30_00,
            origem: 'anexo_v',
            anexoVPrecoCentavos: 30_00,
          } as ItemCru,
        ],
        autorizadoEm: autorizada,
        executadoEm: executada,
        valorExecutadoCentavos: 200_00,
      });
      // Barrada na primeira tentativa, enviada depois.
      await M.Tentativa.create({
        cotacaoId: id,
        acao: 'enviar',
        impedimentos: ['sem_referencia'],
        papel: 'responsavel_tecnico',
        em: diasAtras(45),
      });
      await M.Evento.collection.insertOne({
        cotacaoId: id,
        de: 'rascunho',
        para: 'enviada',
        acao: 'enviar',
        papel: 'responsavel_tecnico',
        em: diasAtras(44),
      });

      // A diferença Anexo V e SINAPI entra pela autorização, inclusive com base `sinapi`.
      const pelaAutorizacao = await relatorio.lerRelatorioMaterial(periodoDe(autorizada));
      expect(pelaAutorizacao.anexoVSinapi).toEqual({
        itensComEquivalente: 1,
        diferencaCentavos: 40_00,
        itensSemEquivalente: 1,
        semEquivalenteCentavos: 30_00,
      });
      expect(pelaAutorizacao.divergencia.cotacoes).toBe(0);

      // A divergência e o custo por equipamento entram pela execução.
      const pelaExecucao = await relatorio.lerRelatorioMaterial(periodoDe(executada));
      expect(pelaExecucao.divergencia).toEqual({
        cotacoes: 1,
        comDiferenca: 1,
        diferencaCentavos: 30_00,
      });
      expect(pelaExecucao.custoPorAtivo.totalCentavos).toBe(200_00);
      expect(pelaExecucao.anexoVSinapi.itensComEquivalente).toBe(0);

      // A primeira tentativa foi barrada: conta como impedimento no dia dela.
      const pelaTentativa = await relatorio.lerRelatorioMaterial(periodoDe(diasAtras(45)));
      expect(pelaTentativa.impedimentoPrimeiraTentativa).toEqual({ numerador: 1, denominador: 1 });
      const peloEnvio = await relatorio.lerRelatorioMaterial(periodoDe(diasAtras(44)));
      expect(peloEnvio.devolvidas).toEqual({ numerador: 0, denominador: 1 });
      expect(peloEnvio.impedimentoPrimeiraTentativa.denominador).toBe(0);
    });

    it('o alterar não conta como devolvida; devolver e recusar a urgência contam', async () => {
      const envio = diasAtras(3);
      const ids3 = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
      const acoes = ['alterar', 'devolver', 'urgencia_recusada'];
      for (const [n, cotacaoId] of ids3.entries()) {
        await M.Evento.collection.insertMany([
          {
            cotacaoId,
            de: 'rascunho',
            para: 'enviada',
            acao: 'enviar',
            papel: 'responsavel_tecnico',
            em: envio,
          },
          {
            cotacaoId,
            de: 'em_analise',
            para: 'devolvida',
            acao: acoes[n],
            papel: 'fiscal',
            em: diasAtras(1),
          },
        ]);
      }
      const r = await relatorio.lerRelatorioMaterial(periodoDe(envio));
      expect(r.devolvidas).toEqual({ numerador: 2, denominador: 3 });
    });
  });
});
