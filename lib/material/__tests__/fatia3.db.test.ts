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
 * A fatia 3 da cotação de material contra o MongoDB de verdade (spec 0019):
 * importação e aplicação sem transação (queda, corrida, retomada), marca de
 * anomalia, classificação, envio, encaminhar com base e conferência, e o
 * painel do que falta.
 *
 * covers: AC-24, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30
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

const utf8 = (t: string) => new TextEncoder().encode(t);
const CAB_ANEXO = 'ITEM;DESCRICAO;UNIDADE;QUANTIDADE;PRECO;CODIGO_SINAPI';
const CAB_SINAPI = 'CODIGO;DESCRICAO;UNIDADE;PRECO';
const csvAnexo = (...l: string[]) => utf8([CAB_ANEXO, ...l].join('\n'));
const csvSinapi = (...l: string[]) => utf8([CAB_SINAPI, ...l].join('\n'));

/** O Anexo V e o mês SINAPI de base dos cenários. */
const ANEXO_V1 = [
  '1;Cabo flexível 2,5mm;m;100;150,00;100',
  '2;Disjuntor 20A;un;10;52,00;200',
  '3;Lâmpada fluorescente;un;10;25,00;',
  '4;Tomada A;un;10;11,00;400',
  '5;Tomada B;un;10;11,00;400',
];
const SINAPI_08 = [
  '100;Cabo flexível 2,5mm;m;100,00',
  '200;Disjuntor 20A;un;50,00',
  '300;Lâmpada LED 9W;un;20,00',
  '400;Tomada 10A;un;10,00',
];

rodar('fatia 3 da cotação de material, contra o Mongo', () => {
  let t: typeof import('../transicoes');
  let precos: typeof import('../precos');
  let pend: typeof import('../importacao/pendente');
  let apl: typeof import('../importacao/aplicar');
  let anom: typeof import('../importacao/anomalia');
  let tab: typeof import('../tabelas');
  let cad: typeof import('../cadastro');
  let M: {
    Chamado: typeof import('@/models/Chamado').ChamadoModel;
    User: typeof import('@/models/user.model').UserModel;
    Cotacao: typeof import('@/models/CotacaoMaterial').CotacaoMaterialModel;
    Evento: typeof import('@/models/CotacaoMaterialEvento').CotacaoMaterialEventoModel;
    Empenho: typeof import('@/models/Empenho').EmpenhoModel;
    Faixa: typeof import('@/models/FaixaCompetencia').FaixaCompetenciaModel;
    Designacao: typeof import('@/models/DesignacaoMaterial').DesignacaoMaterialModel;
    Contrato: typeof import('@/models/Contrato').ContratoModel;
    AnexoV: typeof import('@/models/AnexoVItem').AnexoVItemModel;
    Vigencia: typeof import('@/models/AnexoVVigencia').AnexoVVigenciaModel;
    Insumo: typeof import('@/models/SinapiInsumo').SinapiInsumoModel;
    Ref: typeof import('@/models/SinapiReferencia').SinapiReferenciaModel;
    Imp: typeof import('@/models/ImportacaoMaterial').ImportacaoMaterialModel;
    Notification: typeof import('@/models/Notification').NotificationModel;
    PauseLog: typeof import('@/models/PauseLog').PauseLogModel;
    History: typeof import('@/models/ChamadoHistory').ChamadoHistoryModel;
  };
  let todos: ModelDeTeste[];

  const ids = {
    tecnico: String(new Types.ObjectId()),
    rt: String(new Types.ObjectId()),
    fiscal: String(new Types.ObjectId()),
    outroFiscal: String(new Types.ObjectId()),
    admin: String(new Types.ObjectId()),
  };
  const rt = { userId: ids.rt, role: 'Preposto' };
  const fiscal = { tipo: 'usuario' as const, userId: ids.fiscal, role: 'Admin' };
  let contratoId = '';

  beforeAll(async () => {
    t = await import('../transicoes');
    precos = await import('../precos');
    pend = await import('../importacao/pendente');
    apl = await import('../importacao/aplicar');
    anom = await import('../importacao/anomalia');
    tab = await import('../tabelas');
    cad = await import('../cadastro');
    M = {
      Chamado: (await import('@/models/Chamado')).ChamadoModel,
      User: (await import('@/models/user.model')).UserModel,
      Cotacao: (await import('@/models/CotacaoMaterial')).CotacaoMaterialModel,
      Evento: (await import('@/models/CotacaoMaterialEvento')).CotacaoMaterialEventoModel,
      Empenho: (await import('@/models/Empenho')).EmpenhoModel,
      Faixa: (await import('@/models/FaixaCompetencia')).FaixaCompetenciaModel,
      Designacao: (await import('@/models/DesignacaoMaterial')).DesignacaoMaterialModel,
      Contrato: (await import('@/models/Contrato')).ContratoModel,
      AnexoV: (await import('@/models/AnexoVItem')).AnexoVItemModel,
      Vigencia: (await import('@/models/AnexoVVigencia')).AnexoVVigenciaModel,
      Insumo: (await import('@/models/SinapiInsumo')).SinapiInsumoModel,
      Ref: (await import('@/models/SinapiReferencia')).SinapiReferenciaModel,
      Imp: (await import('@/models/ImportacaoMaterial')).ImportacaoMaterialModel,
      Notification: (await import('@/models/Notification')).NotificationModel,
      PauseLog: (await import('@/models/PauseLog')).PauseLogModel,
      History: (await import('@/models/ChamadoHistory')).ChamadoHistoryModel,
    };
    todos = Object.values(M).map((m) => cru(m as never));
    await conectarMongoDeTeste(todos, 'severino_test_material_fatia3');
  });

  beforeEach(async () => {
    await limparColecoes(todos);
    await M.User.collection.insertMany(
      (
        [
          [ids.tecnico, 'tecnico', 'Técnico'],
          [ids.rt, 'rt', 'Preposto'],
          [ids.fiscal, 'fiscal', 'Admin'],
          [ids.outroFiscal, 'fiscal2', 'Admin'],
          [ids.admin, 'admin', 'Admin'],
        ] as const
      ).map(([id, username, role]) => ({
        _id: new Types.ObjectId(id),
        username,
        name: username,
        role,
        isActive: true,
      })),
    );
    for (const [u, papel] of [
      [ids.rt, 'responsavel_tecnico'],
      [ids.fiscal, 'fiscal'],
      [ids.outroFiscal, 'fiscal'],
    ] as const) {
      await M.Designacao.create({
        userId: new Types.ObjectId(u),
        papel,
        vigenciaInicio: '2000-01-01',
        ato: 'Portaria',
        criadoPorUserId: new Types.ObjectId(),
        em: new Date(),
      });
    }
    const ano = Number(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Belem', year: 'numeric' }).format(
        new Date(),
      ),
    );
    await M.Empenho.create({
      numero: 'NE1',
      exercicio: ano,
      valorInicialCentavos: 1_000_000_00,
      valorLiquidoCentavos: 1_000_000_00,
      criadoPorUserId: new Types.ObjectId(),
    });
    const c = await M.Contrato.collection.insertOne({
      numero: 'CT-1',
      numeroNormalizado: 'ct-1',
      empresa: 'Empresa',
      cnpj: '11222333000181',
      processoSei: '1',
      tiposServico: ['Manutenção Predial'],
      vigenciaInicio: '2000-01-01',
      vigenciaFim: '2099-12-31',
      isActive: true,
    });
    contratoId = String(c.insertedId);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  // -------------------------------------------------------------------------
  // apoio
  // -------------------------------------------------------------------------

  async function importarSinapi(referencia: string, linhas = SINAPI_08) {
    const r = await pend.enviarImportacaoSinapi({
      referencia,
      arquivoNome: 's.csv',
      bytes: csvSinapi(...linhas),
      autorId: ids.admin,
    });
    expect(r).toMatchObject({ ok: true });
    expect(await apl.aplicarImportacao((r as { id: string }).id, ids.admin)).toEqual({ ok: true });
  }

  async function enviarAnexo(linhas = ANEXO_V1) {
    const r = await pend.enviarImportacaoAnexoV({
      contratoId,
      arquivoNome: 'a.csv',
      bytes: csvAnexo(...linhas),
      autorId: ids.admin,
    });
    expect(r).toMatchObject({ ok: true });
    return (r as { id: string }).id;
  }

  async function importarAnexo(linhas = ANEXO_V1) {
    expect(await apl.aplicarImportacao(await enviarAnexo(linhas), ids.admin)).toEqual({ ok: true });
  }

  const vigentes = async () => {
    const p = await M.Vigencia.findOne({ contratoId: new Types.ObjectId(contratoId) }).lean();
    if (!p) return [];
    return M.AnexoV.find({ contratoId: p.contratoId, versao: p.versao }).sort({ numero: 1 }).lean();
  };
  const itemVigente = async (numero: number) =>
    (await vigentes()).find((i) => i.numero === numero)!;

  async function cotacao(tipoServico = 'Manutenção Predial', n = 3) {
    const chamadoId = new Types.ObjectId();
    await M.Chamado.collection.insertOne({
      _id: chamadoId,
      ticket_number: `CHM-${String(chamadoId).slice(-5)}`,
      titulo: 'Material',
      status: 'em atendimento',
      tipoServico,
      assignedToUserId: new Types.ObjectId(ids.tecnico),
      solicitanteId: new Types.ObjectId(),
      createdAt: new Date(),
    });
    const item = { descricao: 'Material', unidade: 'un', quantidade: 2, motivo: 'Troca' };
    const r = await t.criarCotacao(
      { userId: ids.tecnico },
      { chamadoId: String(chamadoId), itens: Array.from({ length: n }, () => item) },
    );
    expect(r.ok).toBe(true);
    const id = (r as { id: string }).id;
    const doc = await M.Cotacao.findById(id).lean();
    return { id, itens: doc!.itens.map((i) => String(i._id)), versao: doc!.versao };
  }

  /** Classifica em sequência, carregando a versão. */
  function classificador(c: { id: string; versao: number }) {
    let versao = c.versao;
    return async (
      itemId: string,
      escolha: Parameters<typeof precos.classificarItem>[1]['escolha'],
    ) => {
      const r = await precos.classificarItem(rt, { id: c.id, versao, itemId, escolha });
      if (r.ok) versao = r.versao;
      return r;
    };
  }
  const versaoAtual = async (id: string) => (await M.Cotacao.findById(id).lean())!.versao;
  const enviar = async (id: string) =>
    t.transicionar({
      cotacaoId: id,
      acao: 'enviar',
      versao: await versaoAtual(id),
      ator: { tipo: 'usuario', ...rt },
    });

  // -------------------------------------------------------------------------
  // importação e aplicação
  // -------------------------------------------------------------------------

  describe('importação (AC-24, AC-25)', () => {
    it('aplica o SINAPI e o Anexo V, e a marca automática compara com o mês mais recente', async () => {
      await importarSinapi('2026-08');
      await importarAnexo();
      const its = await vigentes();
      expect(its.map((i) => [i.numero, i.anomalia?.automatica])).toEqual([
        [1, true],
        [2, false],
        [3, false],
        [4, false],
        [5, false],
      ]);
      const insumo = await M.Insumo.findOne({ referencia: '2026-08', codigo: '100' }).lean();
      expect(insumo).toMatchObject({ uf: 'AP', regime: 'nao_desonerado', precoCentavos: 10000 });
    });

    it('fecha a importação enxugando linhas e revisão', async () => {
      await importarSinapi('2026-08');
      const imp = await M.Imp.findOne({ tipo: 'sinapi' }).lean();
      expect(imp).toMatchObject({ estado: 'aplicada', emAberto: false });
      expect(imp).not.toHaveProperty('linhas');
      expect(imp).not.toHaveProperty('revisao');
    });

    it('mês já guardado é recusado com 409', async () => {
      await importarSinapi('2026-08');
      expect(
        await pend.enviarImportacaoSinapi({
          referencia: '2026-08',
          arquivoNome: 's.csv',
          bytes: csvSinapi(...SINAPI_08),
          autorId: ids.admin,
        }),
      ).toEqual({ ok: false, status: 409, error: 'Este mês já foi importado.' });
    });

    it('com uma importação aberta do mesmo tipo, a segunda recebe 409', async () => {
      await enviarAnexo();
      const r = await pend.enviarImportacaoAnexoV({
        contratoId,
        arquivoNome: 'b.csv',
        bytes: csvAnexo(...ANEXO_V1),
        autorId: ids.admin,
      });
      expect(r).toMatchObject({ ok: false, status: 409 });
    });

    it('contrato inexistente é 404', async () => {
      const r = await pend.enviarImportacaoAnexoV({
        contratoId: String(new Types.ObjectId()),
        arquivoNome: 'a.csv',
        bytes: csvAnexo(...ANEXO_V1),
        autorId: ids.admin,
      });
      expect(r).toMatchObject({ ok: false, status: 404 });
    });

    it('só a pendente expira: o índice TTL é parcial em estado pendente', async () => {
      const indices = (await M.Imp.collection.indexes()) as {
        name?: string;
        expireAfterSeconds?: number;
        partialFilterExpression?: unknown;
      }[];
      expect(indices.find((i) => i.name === 'pendente_expira')).toMatchObject({
        expireAfterSeconds: 0,
        partialFilterExpression: { estado: 'pendente' },
      });
    });

    it('descartar fecha só a pendente, e a aplicada não se descarta', async () => {
      const id = await enviarAnexo();
      expect(await pend.descartarImportacao(id, ids.admin)).toEqual({ ok: true });
      expect(await pend.descartarImportacao(id, ids.admin)).toMatchObject({ ok: false });
      expect(await M.Vigencia.countDocuments()).toBe(0);
    });

    it('dois cliques em aplicar gravam uma versão só, e o segundo recebe "já está sendo aplicada"', async () => {
      await importarSinapi('2026-08');
      const id = await enviarAnexo();
      const [a, b] = await Promise.all([
        apl.aplicarImportacao(id, ids.admin),
        apl.aplicarImportacao(id, ids.admin),
      ]);
      const oks = [a, b].filter((r) => r.ok);
      expect(oks).toHaveLength(1);
      expect([a, b].find((r) => !r.ok)).toMatchObject({
        error: expect.stringMatching(/já está sendo aplicada|já foi aplicada/),
      });
      expect(await M.AnexoV.countDocuments({ versao: 1 })).toBe(5);
      expect((await M.Vigencia.findOne().lean())!.versao).toBe(1);
    });

    it('queda entre as linhas e a virada da chave: a versão anterior continua vigente e a retomada termina sem duplicar nem deixar sobras', async () => {
      await importarSinapi('2026-08');
      await importarAnexo();
      const id = await enviarAnexo([
        '1;Cabo flexível 2,5mm;m;100;160,00;100',
        '3;Lâmpada;un;10;25,00;',
      ]);
      // Simula a queda: a importação ficou `aplicando` há mais de 5 minutos, com linhas
      // da versão 2 gravadas (inclusive uma sobra que o arquivo não tem) e sem a chave virada.
      await M.Imp.collection.updateOne(
        { _id: new Types.ObjectId(id) },
        { $set: { estado: 'aplicando', aplicandoDesde: new Date(Date.now() - 10 * 60 * 1000) } },
      );
      await M.AnexoV.collection.insertMany([
        {
          contratoId: new Types.ObjectId(contratoId),
          numero: 1,
          versao: 2,
          descricao: 'parcial',
          unidade: 'm',
          quantidadeEstimada: 1,
          precoPactuadoCentavos: 1,
          descricaoBusca: 'parcial',
        },
        {
          contratoId: new Types.ObjectId(contratoId),
          numero: 9,
          versao: 2,
          descricao: 'sobra',
          unidade: 'm',
          quantidadeEstimada: 1,
          precoPactuadoCentavos: 1,
          descricaoBusca: 'sobra',
        },
      ]);
      // Enquanto a chave não vira, quem lê vê a versão 1.
      expect((await vigentes()).map((i) => i.numero)).toEqual([1, 2, 3, 4, 5]);

      expect(await apl.aplicarImportacao(id, ids.admin)).toEqual({ ok: true });
      const v2 = await vigentes();
      expect(v2.map((i) => [i.numero, i.precoPactuadoCentavos])).toEqual([
        [1, 16000],
        [3, 2500],
      ]);
      expect(await M.AnexoV.countDocuments({ versao: 2 })).toBe(2);
      expect(await M.Imp.findById(id).lean()).toMatchObject({
        estado: 'aplicada',
        emAberto: false,
      });
    });

    it('queda depois da virada da chave: a retomada só recalcula e fecha', async () => {
      await importarSinapi('2026-08');
      const id = await enviarAnexo();
      expect(await apl.aplicarImportacao(id, ids.admin)).toEqual({ ok: true });
      // Volta a importação a `aplicando` parada, como se tivesse caído no passo 4.
      await M.Imp.collection.updateOne(
        { _id: new Types.ObjectId(id) },
        { $set: { estado: 'aplicando', emAberto: true, aplicandoDesde: new Date(0) } },
      );
      expect(await apl.aplicarImportacao(id, ids.admin)).toEqual({ ok: true });
      expect((await M.Vigencia.findOne().lean())!.versao).toBe(1);
      expect(await M.AnexoV.countDocuments()).toBe(5);
    });

    it('aplicação parada há menos de 5 minutos não é retomada por outro clique', async () => {
      const id = await enviarAnexo();
      await M.Imp.collection.updateOne(
        { _id: new Types.ObjectId(id) },
        { $set: { estado: 'aplicando', aplicandoDesde: new Date() } },
      );
      expect(await apl.aplicarImportacao(id, ids.admin)).toEqual({
        ok: false,
        error: 'A importação já está sendo aplicada.',
      });
    });

    it('Anexo V que mudou depois da revisão descarta a importação', async () => {
      await importarAnexo();
      const id = await enviarAnexo(['1;Cabo;m;1;1,00;']);
      // Outro caminho mudou o ponteiro depois da revisão (versaoBase 1).
      await M.Vigencia.collection.updateOne({}, { $set: { versao: 7 } });
      expect(await apl.aplicarImportacao(id, ids.admin)).toEqual({
        ok: false,
        error: 'O Anexo V mudou depois da revisão; envie o arquivo de novo.',
      });
      expect(await M.Imp.findById(id).lean()).toMatchObject({
        estado: 'descartada',
        emAberto: false,
      });
    });

    it('reimportar herda o código (CSV vazio) e a marca manual, e grava o histórico do código', async () => {
      await importarSinapi('2026-08');
      await importarAnexo();
      const item3 = await itemVigente(3);
      expect(
        await tab.marcarAnomalia(ids.admin, {
          anexoVItemId: String(item3._id),
          marcada: true,
          motivo: 'Conferir sempre este item.',
        }),
      ).toEqual({ ok: true });
      await importarAnexo([
        '1;Cabo flexível 2,5mm;m;100;150,00;',
        '2;Disjuntor 20A;un;10;52,00;300',
        '3;Lâmpada;un;10;25,00;',
      ]);
      const v2 = await vigentes();
      expect(v2.map((i) => [i.numero, i.sinapiCodigo])).toEqual([
        [1, '100'],
        [2, '300'],
        [3, null],
      ]);
      expect(v2[1]!.sinapiCodigoHistorico.at(-1)).toMatchObject({
        de: '200',
        para: '300',
        motivo: 'importacao',
      });
      expect(v2[2]!.anomalia).toMatchObject({ manual: true, motivo: 'Conferir sempre este item.' });
    });
  });

  describe('marca de anomalia (AC-29)', () => {
    it('um mês SINAPI mais novo liga e desliga a automática e nunca toca a manual', async () => {
      await importarSinapi('2026-08');
      await importarAnexo();
      await tab.marcarAnomalia(ids.admin, {
        anexoVItemId: String((await itemVigente(2))._id),
        marcada: true,
        motivo: 'Conferir o disjuntor.',
      });
      await importarSinapi('2026-09', ['100;Cabo;m;140,00', '200;Disjuntor;un;40,00']);
      const its = await vigentes();
      expect(its.find((i) => i.numero === 1)!.anomalia).toMatchObject({
        automatica: false,
        referenciaSinapi: '2026-09',
      });
      expect(its.find((i) => i.numero === 2)!.anomalia).toMatchObject({
        automatica: true,
        manual: true,
      });
    });

    it('um mês mais antigo que o mais recente não mexe em marca nenhuma', async () => {
      await importarSinapi('2026-08');
      await importarAnexo();
      const antes = (await vigentes()).map((i) => i.anomalia);
      await importarSinapi('2026-07', ['100;Cabo;m;10,00', '200;Disjuntor;un;1,00']);
      expect((await vigentes()).map((i) => i.anomalia)).toEqual(antes);
    });

    it('recálculo e marcação manual ao mesmo tempo mantêm os dois campos', async () => {
      await importarSinapi('2026-08');
      await importarAnexo();
      const item1 = await itemVigente(1);
      await Promise.all([
        anom.recalcularAnomalia({ todos: true }),
        tab.marcarAnomalia(ids.admin, {
          anexoVItemId: String(item1._id),
          marcada: true,
          motivo: 'Conferir sempre este item.',
        }),
      ]);
      expect((await itemVigente(1)).anomalia).toMatchObject({ automatica: true, manual: true });
    });

    it('corrigir o código recalcula a marca do item e guarda o histórico', async () => {
      await importarSinapi('2026-08');
      await importarAnexo();
      const item3 = await itemVigente(3);
      expect(
        await tab.corrigirCodigoSinapi(ids.admin, {
          anexoVItemId: String(item3._id),
          codigo: '300',
          motivo: 'Código da lâmpada no SINAPI.',
        }),
      ).toEqual({ ok: true });
      const depois = await itemVigente(3);
      expect(depois.sinapiCodigo).toBe('300');
      expect(depois.anomalia?.automatica).toBe(true); // 25,00 contra 20,00
      expect(depois.sinapiCodigoHistorico.at(-1)).toMatchObject({ de: null, para: '300' });
    });

    it('marcar e corrigir recusam item fora da versão vigente', async () => {
      await importarAnexo();
      const velho = await itemVigente(1);
      await importarAnexo(['1;Cabo;m;1;1,00;']);
      expect(
        await tab.marcarAnomalia(ids.admin, {
          anexoVItemId: String(velho._id),
          marcada: true,
          motivo: 'Conferir sempre este item.',
        }),
      ).toMatchObject({ ok: false });
    });
  });

  // -------------------------------------------------------------------------
  // classificação, envio e encaminhar
  // -------------------------------------------------------------------------

  describe('classificação e envio (AC-26, AC-30)', () => {
    it('deriva ambas, sinapi e anexo_v, copia a unidade da tabela e recusa insumo de dois itens', async () => {
      await importarSinapi('2026-08');
      await importarAnexo();
      const c = await cotacao();
      const cl = classificador(c);
      const [a, b, d] = c.itens as [string, string, string];
      expect(await cl(a, { anexoVItemId: String((await itemVigente(1))._id) })).toMatchObject({
        ok: true,
      });
      expect(await cl(b, { sinapiCodigo: '300' })).toMatchObject({ ok: true });
      expect(await cl(d, { anexoVItemId: String((await itemVigente(3))._id) })).toMatchObject({
        ok: true,
      });
      expect(await cl(d, { sinapiCodigo: '400' })).toEqual({
        ok: false,
        error: 'Este insumo equivale aos itens 4 e 5 do Anexo V; escolha um deles.',
      });
      const doc = await M.Cotacao.findById(c.id).lean();
      expect(doc!.itens.map((i) => [i.origem, i.unidade])).toEqual([
        ['ambas', 'm'],
        ['sinapi', 'un'],
        ['anexo_v', 'un'],
      ]);
      // Provisório de ambas: o maior preço (150 × 2) + 20 × 2 + 25 × 2.
      expect(doc!.valorTotalCentavos).toBe(300_00 + 40_00 + 50_00);
    });

    it('só o responsável técnico classifica', async () => {
      await importarSinapi('2026-08');
      const c = await cotacao();
      const r = await precos.classificarItem(
        { userId: ids.fiscal, role: 'Admin' },
        { id: c.id, versao: c.versao, itemId: c.itens[0]!, escolha: { sinapiCodigo: '300' } },
      );
      expect(r).toEqual({ ok: false, error: 'Só o responsável técnico classifica os itens.' });
    });

    it('chamado de tipo sem contrato vigente não tem caminho 1, e a busca não mostra o Anexo V (AC-30)', async () => {
      await importarSinapi('2026-08');
      await importarAnexo();
      const c = await cotacao('Elevador');
      const r = await precos.classificarItem(rt, {
        id: c.id,
        versao: c.versao,
        itemId: c.itens[0]!,
        escolha: { anexoVItemId: String((await itemVigente(1))._id) },
      });
      expect(r).toMatchObject({
        ok: false,
        error: expect.stringContaining('Não há contrato vigente'),
      });
      const busca = await precos.buscarItensPreco(rt, { cotacaoId: c.id, texto: 'cabo' });
      expect(busca).toMatchObject({ ok: true, contrato: null, anexoV: [], mes: '2026-08' });
    });

    it('a busca acha pelo texto e pelo número, marca o equivalente e não serve a quem não é contratada nem fiscal', async () => {
      await importarSinapi('2026-08');
      await importarAnexo();
      const c = await cotacao();
      const busca = await precos.buscarItensPreco(rt, { cotacaoId: c.id, texto: 'cabo' });
      expect(busca).toMatchObject({
        ok: true,
        anexoV: [{ numero: 1, equivalenteSinapi: '100' }],
        sinapi: [{ codigo: '100', equivaleAoAnexoV: [1] }],
      });
      expect(await precos.buscarItensPreco(rt, { cotacaoId: c.id, texto: '3' })).toMatchObject({
        anexoV: [{ numero: 3 }],
      });
      expect(
        await precos.buscarItensPreco(
          { userId: ids.tecnico, role: 'Técnico' },
          { cotacaoId: c.id, texto: 'cabo' },
        ),
      ).toMatchObject({ ok: false });
    });

    it('envio sem orçamento quando todos os itens são da tabela, com o preço congelado e as advertências de preço', async () => {
      await importarSinapi('2026-08');
      await importarAnexo();
      const c = await cotacao();
      const cl = classificador(c);
      await cl(c.itens[0]!, { anexoVItemId: String((await itemVigente(1))._id) });
      await cl(c.itens[1]!, { sinapiCodigo: '300' });
      await cl(c.itens[2]!, { anexoVItemId: String((await itemVigente(3))._id) });
      expect(await enviar(c.id)).toMatchObject({ ok: true, situacao: 'enviada' });
      const doc = await M.Cotacao.findById(c.id).lean();
      expect(doc!.itens.map((i) => i.precoAplicadoCentavos)).toEqual([null, 2000, 2500]);
      expect(doc!.advertencias.map((a) => a.codigo).sort()).toEqual([
        'anexo_v_acima_sinapi',
        'sem_referencia_sinapi',
      ]);
      // Importar um mês mais novo depois do envio não muda a cotação (AC-26).
      await importarSinapi('2026-09', ['100;Cabo;m;1,00', '300;Lâmpada;un;1,00']);
      const depois = await M.Cotacao.findById(c.id).lean();
      expect(depois!.itens.map((i) => [i.sinapiReferencia, i.sinapiPrecoCentavos])).toEqual([
        ['2026-08', 10000],
        ['2026-08', 2000],
        [null, null],
      ]);
    });

    it('item que saiu da versão vigente barra o envio com classificacao_desatualizada', async () => {
      await importarSinapi('2026-08');
      await importarAnexo();
      const c = await cotacao(undefined, 1);
      await classificador(c)(c.itens[0]!, { anexoVItemId: String((await itemVigente(2))._id) });
      await importarAnexo(['1;Cabo;m;1;150,00;100']);
      expect(await enviar(c.id)).toMatchObject({
        ok: false,
        impedimentos: ['classificacao_desatualizada'],
      });
      expect((await M.Cotacao.findById(c.id).lean())!.situacao).toBe('rascunho');
    });

    it('o envio deriva de novo: o ambas cujo código saiu do mês mais recente volta para anexo_v', async () => {
      await importarSinapi('2026-08');
      await importarAnexo();
      const c = await cotacao(undefined, 1);
      await classificador(c)(c.itens[0]!, { anexoVItemId: String((await itemVigente(1))._id) });
      await importarSinapi('2026-09', ['300;Lâmpada;un;20,00']);
      expect(await enviar(c.id)).toMatchObject({ ok: true });
      expect((await M.Cotacao.findById(c.id).lean())!.itens[0]).toMatchObject({
        origem: 'anexo_v',
        sinapiCodigo: null,
        precoAplicadoCentavos: 15000,
      });
    });
  });

  describe('encaminhar (AC-27, AC-29)', () => {
    async function enviadaEAssumida() {
      await importarSinapi('2026-08');
      await importarAnexo();
      const c = await cotacao(undefined, 2);
      const cl = classificador(c);
      await cl(c.itens[0]!, { anexoVItemId: String((await itemVigente(1))._id) });
      await cl(c.itens[1]!, { anexoVItemId: String((await itemVigente(3))._id) });
      await enviar(c.id);
      const a = await t.transicionar({
        cotacaoId: c.id,
        acao: 'assumir',
        versao: await versaoAtual(c.id),
        ator: fiscal,
      });
      expect(a.ok).toBe(true);
      return c;
    }
    const just = 'SINAPI é a referência pública.';
    const conf = 'Conferido no mercado local.';

    it('sem base e sem conferência, o encaminhar mostra os dois impedimentos', async () => {
      const c = await enviadaEAssumida();
      expect(
        await t.transicionar({
          cotacaoId: c.id,
          acao: 'encaminhar',
          versao: await versaoAtual(c.id),
          ator: fiscal,
        }),
      ).toMatchObject({ ok: false, impedimentos: ['base_nao_escolhida', 'conferencia_pendente'] });
    });

    it('a marca manual feita depois do envio entra na lista, lida no ato', async () => {
      const c = await enviadaEAssumida();
      await tab.marcarAnomalia(ids.admin, {
        anexoVItemId: String((await itemVigente(3))._id),
        marcada: true,
        motivo: 'Conferir sempre este item.',
      });
      const r = await t.transicionar({
        cotacaoId: c.id,
        acao: 'encaminhar',
        versao: await versaoAtual(c.id),
        ator: fiscal,
        bases: [{ itemId: c.itens[0]!, base: 'sinapi', justificativa: just }],
        conferencias: [{ itemId: c.itens[0]!, texto: conf }],
      });
      expect(r).toMatchObject({ ok: false, impedimentos: ['conferencia_pendente'] });
    });

    it('com base e conferência, grava o preço da base, a conferência e a marca no evento', async () => {
      const c = await enviadaEAssumida();
      const r = await t.transicionar({
        cotacaoId: c.id,
        acao: 'encaminhar',
        versao: await versaoAtual(c.id),
        ator: fiscal,
        bases: [{ itemId: c.itens[0]!, base: 'sinapi', justificativa: just }],
        conferencias: [{ itemId: c.itens[0]!, texto: conf }],
      });
      expect(r).toMatchObject({ ok: true, situacao: 'em_aprovacao' });
      const doc = await M.Cotacao.findById(c.id).lean();
      expect(doc!.itens[0]).toMatchObject({
        baseAplicada: 'sinapi',
        justificativaBase: just,
        precoAplicadoCentavos: 10000,
        conferencia: { texto: conf },
      });
      expect(doc!.valorTotalCentavos).toBe(200_00 + 50_00);
      const ev = await M.Evento.findOne({ cotacaoId: doc!._id, acao: 'encaminhar' }).lean();
      expect(ev!.itensNoAto[0]).toMatchObject({
        baseAplicada: 'sinapi',
        justificativaBase: just,
        conferencia: conf,
        marcaAnomalia: { automatica: true, manual: false },
      });
      expect(ev!.parametrosNoAto).toMatchObject({ percentualSinapi: 10 });
    });

    it('outro fiscal, que não assumiu, não registra a conferência', async () => {
      const c = await enviadaEAssumida();
      const r = await t.transicionar({
        cotacaoId: c.id,
        acao: 'encaminhar',
        versao: await versaoAtual(c.id),
        ator: { tipo: 'usuario', userId: ids.outroFiscal, role: 'Admin' },
        bases: [{ itemId: c.itens[0]!, base: 'sinapi', justificativa: just }],
        conferencias: [{ itemId: c.itens[0]!, texto: conf }],
      });
      expect(r).toEqual({
        ok: false,
        error: 'Só o fiscal que assumiu a análise registra a conferência e encaminha.',
      });
    });

    it('devolver limpa a base, a justificativa e a conferência, e volta ao valor provisório', async () => {
      const c = await enviadaEAssumida();
      await t.transicionar({
        cotacaoId: c.id,
        acao: 'encaminhar',
        versao: await versaoAtual(c.id),
        ator: fiscal,
        bases: [{ itemId: c.itens[0]!, base: 'sinapi', justificativa: just }],
        conferencias: [{ itemId: c.itens[0]!, texto: conf }],
      });
      const r = await t.transicionar({
        cotacaoId: c.id,
        acao: 'devolver',
        versao: await versaoAtual(c.id),
        ator: fiscal,
        motivo: 'Rever a base.',
      });
      expect(r).toMatchObject({ ok: true, situacao: 'devolvida' });
      const doc = await M.Cotacao.findById(c.id).lean();
      expect(doc!.itens[0]).toMatchObject({
        baseAplicada: null,
        justificativaBase: null,
        precoAplicadoCentavos: null,
        conferencia: null,
      });
      expect(doc!.valorTotalCentavos).toBe(300_00 + 50_00);
    });
  });

  // -------------------------------------------------------------------------
  // painel
  // -------------------------------------------------------------------------

  describe('painel do que falta (AC-28, AC-30; spec 0021, AC-18 e AC-19)', () => {
    it('sem tabelas, aponta o contrato sem Anexo V e o SINAPI ausente', async () => {
      const p = await cad.lerPendenciasMaterial();
      expect(p.contratosSemAnexo).toEqual(['CT-1']);
      expect(p.sinapiAtrasado).toBe(true);
      expect(p.notas.sinapi).toBeNull();
    });

    it('SINAPI velho aparece como atrasado', async () => {
      await importarSinapi('2020-01');
      const p = await cad.lerPendenciasMaterial();
      expect(p.sinapiAtrasado).toBe(true);
      expect(p.notas.sinapi).toBe('2020-01');
    });

    it('lista só os itens vigentes com código vazio, não o de código fora do mês', async () => {
      await importarSinapi('2026-08', ['300;Lâmpada;un;20,00']);
      await importarAnexo();
      const p = await cad.lerPendenciasMaterial();
      expect(p.itensSemCodigo).toEqual([
        { contrato: 'CT-1', numero: 3, descricao: 'Lâmpada fluorescente' },
      ]);
      expect(p.contratosSemAnexo).toEqual([]);
      expect(p.primeiraCotacao.find((i) => i.chave === 'semCodigo')).toEqual({
        chave: 'semCodigo',
        secao: 'anexo-v',
        pronto: false,
        itens: 1,
      });
      expect(p.notas.anexoV).toEqual({ revisaoAberta: false, itens: ANEXO_V1.length });
    });

    it('a lista da primeira cotação diz o que falta, cada item com a sua seção', async () => {
      const p = await cad.lerPendenciasMaterial();
      expect(p.primeiraCotacao).toEqual([
        { chave: 'empenho', secao: 'empenhos', pronto: true, elegiveis: 1 },
        { chave: 'faixas', secao: 'faixas', pronto: false, ativas: 0 },
        {
          chave: 'designacoes',
          secao: 'designacoes',
          pronto: false,
          faltam: ['gestor', 'aprovador'],
        },
        { chave: 'semCodigo', secao: 'anexo-v', pronto: true, itens: 0 },
      ]);
      expect(p.notas).toMatchObject({ empenhos: 1, designacoes: 3, faixas: 0 });
    });

    it('a nota do Anexo V diz "revisão aberta" só com importação do Anexo V em aberto', async () => {
      const sinapi = await pend.enviarImportacaoSinapi({
        referencia: '2026-08',
        arquivoNome: 's.csv',
        bytes: csvSinapi(...SINAPI_08),
        autorId: ids.admin,
      });
      expect(sinapi).toMatchObject({ ok: true });
      expect((await cad.lerPendenciasMaterial()).notas.anexoV.revisaoAberta).toBe(false);

      await enviarAnexo();
      expect((await cad.lerPendenciasMaterial()).notas.anexoV.revisaoAberta).toBe(true);
    });

    it('gestor e aprovador vigentes fecham as designações; revogar o aprovador volta a faltar', async () => {
      expect(
        await cad.criarFaixa(ids.admin, { nome: 'Faixa I', limiteCentavos: 5_000_00 }),
      ).toEqual({ ok: true });
      const faixa = await M.Faixa.findOne().lean();
      for (const [userId, papel, faixaId] of [
        [ids.admin, 'gestor', null],
        [ids.outroFiscal, 'aprovador', String(faixa!._id)],
      ] as const) {
        expect(
          await cad.criarDesignacao(ids.admin, {
            userId,
            papel,
            faixaId,
            vigenciaInicio: '2000-01-01',
            ato: 'Portaria',
          }),
        ).toEqual({ ok: true });
      }
      const designacoes = async () =>
        (await cad.lerPendenciasMaterial()).primeiraCotacao.find((i) => i.chave === 'designacoes');
      expect(await designacoes()).toMatchObject({ pronto: true, faltam: [] });

      const aprovador = await M.Designacao.findOne({ papel: 'aprovador' }).lean();
      expect(await cad.revogarDesignacao(ids.admin, String(aprovador!._id))).toEqual({ ok: true });

      expect(await designacoes()).toMatchObject({ pronto: false, faltam: ['aprovador'] });
      const p = await cad.lerPendenciasMaterial();
      expect(p.notas.designacoes).toBe(4);
      expect(p.notas.faixas).toBe(1);
    });

    it('gestor com a vigência já encerrada não conta como designado', async () => {
      expect(
        await cad.criarDesignacao(ids.admin, {
          userId: ids.admin,
          papel: 'gestor',
          vigenciaInicio: '2000-01-01',
          vigenciaFim: '2001-12-31',
          ato: 'Portaria antiga',
        }),
      ).toEqual({ ok: true });
      const p = await cad.lerPendenciasMaterial();
      expect(p.primeiraCotacao.find((i) => i.chave === 'designacoes')).toMatchObject({
        faltam: ['gestor', 'aprovador'],
      });
      expect(p.notas.designacoes).toBe(3);
    });

    it('o painel dá projeção só ao empenho elegível e marca a designação revogada como não vigente', async () => {
      await M.Empenho.create({
        numero: 'NE-INATIVO',
        exercicio: 2000,
        valorInicialCentavos: 100_00,
        valorLiquidoCentavos: 100_00,
        ativo: false,
        criadoPorUserId: new Types.ObjectId(),
      });
      const fiscal2 = await M.Designacao.findOne({ userId: new Types.ObjectId(ids.outroFiscal) });
      await cad.revogarDesignacao(ids.admin, String(fiscal2!._id));

      const painel = await cad.lerPainelMaterial();
      const ne1 = painel.empenhos.find((e) => e.numero === 'NE1')!;
      const inativo = painel.empenhos.find((e) => e.numero === 'NE-INATIVO')!;
      expect(ne1.elegivel).toBe(true);
      expect(ne1.projecao).toMatchObject({ empenhoId: ne1.id, saldoCentavos: 1_000_000_00 });
      expect(inativo.elegivel).toBe(false);
      expect(inativo.projecao).toBeNull();
      const revogada = painel.designacoes.find((d) => d.userId === ids.outroFiscal)!;
      expect(revogada.vigente).toBe(false);
      expect(revogada.revogadaEm).not.toBeNull();
    });

    it('mesesAntes atravessa a virada do ano', () => {
      expect(cad.mesesAntes('2026-02', 2)).toBe('2025-12');
      expect(cad.mesesAntes('2026-10', 2)).toBe('2026-08');
    });
  });
});
