import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));

/**
 * Motivo e histórico no cadastro de material (spec 0022) contra o MongoDB de
 * verdade: os quatro atos gravam motivo, autor e data na mesma escrita; a
 * corrida do empenho grava uma troca só; o histórico do empenho só cresce; a
 * leitura do painel traz os nomes e os atos antigos; e nada disso chega à
 * leitura da cotação.
 *
 * covers: AC-1, AC-2, AC-3, AC-4, AC-6, AC-7, AC-8
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

const MOTIVO = 'Motivo secreto do cadastro 0022';
const ANO = Number(
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Belem', year: 'numeric' }).format(
    new Date(),
  ),
);

rodar('motivo e histórico no cadastro de material, contra o Mongo', () => {
  let cadastro: typeof import('../cadastro');
  let leitura: typeof import('../leitura');
  let EscritaProibidaError: typeof import('@/models/_somente-inclusao').EscritaProibidaError;
  let MOTIVO_REVOGACAO_AUTOMATICA: string;
  let M: {
    Chamado: typeof import('@/models/Chamado').ChamadoModel;
    User: typeof import('@/models/user.model').UserModel;
    Cotacao: typeof import('@/models/CotacaoMaterial').CotacaoMaterialModel;
    Evento: typeof import('@/models/CotacaoMaterialEvento').CotacaoMaterialEventoModel;
    Designacao: typeof import('@/models/DesignacaoMaterial').DesignacaoMaterialModel;
    Empenho: typeof import('@/models/Empenho').EmpenhoModel;
    Faixa: typeof import('@/models/FaixaCompetencia').FaixaCompetenciaModel;
  };
  let todos: ModelDeTeste[];

  const ids = {
    admin: String(new Types.ObjectId()),
    fiscal: String(new Types.ObjectId()),
    rt: String(new Types.ObjectId()),
    tecnico: String(new Types.ObjectId()),
    removido: String(new Types.ObjectId()),
  };

  const designar = (userId: string, papel: string, extra: Record<string, unknown> = {}) =>
    M.Designacao.create({
      userId: new Types.ObjectId(userId),
      papel: papel as never,
      vigenciaInicio: '2000-01-01',
      ato: 'Portaria de teste',
      criadoPorUserId: new Types.ObjectId(ids.admin),
      em: new Date(),
      ...extra,
    });

  const faixa = (nome = 'Faixa I') =>
    M.Faixa.create({
      nome,
      limiteCentavos: 10_000_00,
      criadoPorUserId: new Types.ObjectId(ids.admin),
      em: new Date(),
    });

  const empenho = (numero = 'NE-1', extra: Record<string, unknown> = {}) =>
    M.Empenho.create({
      numero,
      exercicio: ANO,
      valorInicialCentavos: 1000_00,
      valorLiquidoCentavos: 1000_00,
      criadoPorUserId: new Types.ObjectId(ids.admin),
      ...extra,
    });

  beforeAll(async () => {
    cadastro = await import('../cadastro');
    leitura = await import('../leitura');
    EscritaProibidaError = (await import('@/models/_somente-inclusao')).EscritaProibidaError;
    MOTIVO_REVOGACAO_AUTOMATICA = (await import('@/shared/material/mensagens'))
      .MOTIVO_REVOGACAO_AUTOMATICA;
    M = {
      Chamado: (await import('@/models/Chamado')).ChamadoModel,
      User: (await import('@/models/user.model')).UserModel,
      Cotacao: (await import('@/models/CotacaoMaterial')).CotacaoMaterialModel,
      Evento: (await import('@/models/CotacaoMaterialEvento')).CotacaoMaterialEventoModel,
      Designacao: (await import('@/models/DesignacaoMaterial')).DesignacaoMaterialModel,
      Empenho: (await import('@/models/Empenho')).EmpenhoModel,
      Faixa: (await import('@/models/FaixaCompetencia')).FaixaCompetenciaModel,
    };
    todos = Object.values(M).map((m) => cru(m as never));
    await conectarMongoDeTeste(todos, 'severino_test_material_motivo');
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await limparColecoes(todos);
    const usuario = (
      id: string,
      username: string,
      name: string,
      role: string,
      isActive = true,
    ) => ({
      _id: new Types.ObjectId(id),
      username,
      name,
      role,
      isActive,
    });
    await M.User.collection.insertMany([
      // O autor desligado continua aparecendo pelo nome (AC-6).
      usuario(ids.admin, 'adm', 'Carla Admin', 'Admin', false),
      usuario(ids.fiscal, 'fiscal', 'Marina Fiscal', 'Admin'),
      usuario(ids.rt, 'rt', 'Carlos RT', 'Preposto'),
      usuario(ids.tecnico, 'tec', 'José Técnico', 'Técnico'),
    ]);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  describe('os atos gravam motivo, autor e data (AC-1, AC-2, AC-3)', () => {
    it('revogar grava o motivo junto da data, e não revoga duas vezes', async () => {
      const d = await designar(ids.fiscal, 'fiscal');
      expect(await cadastro.revogarDesignacao(ids.admin, String(d._id), MOTIVO)).toEqual({
        ok: true,
      });
      const lida = await M.Designacao.findById(d._id).lean();
      expect(lida).toMatchObject({ revogadaMotivo: MOTIVO });
      expect(String(lida?.revogadaPorUserId)).toBe(ids.admin);
      expect(lida?.revogadaEm).toBeInstanceOf(Date);

      const de_novo = await cadastro.revogarDesignacao(
        ids.admin,
        String(d._id),
        'Outro motivo aqui',
      );
      expect(de_novo.ok).toBe(false);
      expect((await M.Designacao.findById(d._id).lean())?.revogadaMotivo).toBe(MOTIVO);
    });

    it('a revogação automática do cadastro simultâneo grava o motivo fixo', async () => {
      await designar(ids.fiscal, 'fiscal');
      // Simula o cadastro simultâneo: a conferência de antes não vê a outra.
      const find = M.Designacao.find.bind(M.Designacao);
      vi.spyOn(M.Designacao, 'find').mockImplementationOnce((() => ({
        select: () => ({ lean: async () => [] }),
      })) as never);
      vi.spyOn(M.Designacao, 'find').mockImplementation(find as never);

      const r = await cadastro.criarDesignacao(ids.admin, {
        userId: ids.fiscal,
        papel: 'fiscal',
        vigenciaInicio: '2001-01-01',
        ato: 'Portaria 2',
      });
      expect(r.ok).toBe(false);
      const revogada = await M.Designacao.findOne({ revogadaEm: { $ne: null } }).lean();
      expect(revogada?.revogadaMotivo).toBe(MOTIVO_REVOGACAO_AUTOMATICA);
    });

    it('desativar a faixa grava ativa, data, autor e motivo numa escrita só', async () => {
      const f = await faixa();
      expect(await cadastro.desativarFaixa(ids.admin, String(f._id), MOTIVO)).toEqual({ ok: true });
      const lida = await M.Faixa.findById(f._id).lean();
      expect(lida).toMatchObject({ ativa: false, desativadaMotivo: MOTIVO });
      expect(lida?.desativadaEm).toBeInstanceOf(Date);
      expect(String(lida?.desativadaPorUserId)).toBe(ids.admin);

      expect(await cadastro.desativarFaixa(ids.admin, String(f._id), 'Outro motivo aqui')).toEqual({
        ok: false,
        error: 'Faixa não encontrada ou já desativada.',
      });
    });

    it('inativar e reativar empurram um item cada no histórico', async () => {
      const e = await empenho();
      const id = String(e._id);
      expect(await cadastro.alterarSituacaoEmpenho(ids.admin, id, false, MOTIVO)).toEqual({
        ok: true,
      });
      expect(
        await cadastro.alterarSituacaoEmpenho(ids.admin, id, true, 'Saldo liberado de novo'),
      ).toEqual({ ok: true });
      const lido = await M.Empenho.findById(e._id).lean();
      expect(lido?.ativo).toBe(true);
      expect(lido?.historicoSituacao.map((s) => [s.ativo, s.motivo])).toEqual([
        [false, MOTIVO],
        [true, 'Saldo liberado de novo'],
      ]);
    });

    it('pedir a situação em que o empenho já está não grava nada', async () => {
      const e = await empenho();
      expect(await cadastro.alterarSituacaoEmpenho(ids.admin, String(e._id), true, MOTIVO)).toEqual(
        {
          ok: false,
          error: 'O empenho já está ativo. Recarregue.',
        },
      );
      expect((await M.Empenho.findById(e._id).lean())?.historicoSituacao).toEqual([]);
      expect(
        await cadastro.alterarSituacaoEmpenho(
          ids.admin,
          String(new Types.ObjectId()),
          false,
          MOTIVO,
        ),
      ).toEqual({ ok: false, error: 'Empenho não encontrado.' });
    });

    it('na corrida de duas inativações, uma passa e o histórico tem um item só', async () => {
      const e = await empenho();
      const id = String(e._id);
      const rs = await Promise.all([
        cadastro.alterarSituacaoEmpenho(ids.admin, id, false, MOTIVO),
        cadastro.alterarSituacaoEmpenho(ids.fiscal, id, false, 'Outro Admin chegou junto'),
      ]);
      expect(rs.filter((r) => r.ok)).toHaveLength(1);
      expect(rs.find((r) => !r.ok)).toEqual({
        ok: false,
        error: 'O empenho já está inativo. Recarregue.',
      });
      expect((await M.Empenho.findById(e._id).lean())?.historicoSituacao).toHaveLength(1);
    });
  });

  describe('o motivo é definitivo (AC-4)', () => {
    it('designação e faixa recusam escrita direta nos campos novos', async () => {
      const d = await designar(ids.fiscal, 'fiscal');
      const f = await faixa();
      await expect(
        M.Designacao.updateOne({ _id: d._id }, { $set: { revogadaMotivo: 'trocado' } }),
      ).rejects.toThrow(EscritaProibidaError);
      await expect(
        M.Faixa.updateOne({ _id: f._id }, { $set: { desativadaMotivo: 'trocado' } }),
      ).rejects.toThrow(EscritaProibidaError);
    });

    it('o histórico do empenho só recebe $push; reservar, liberar e movimentar seguem', async () => {
      const e = await empenho();
      await cadastro.alterarSituacaoEmpenho(ids.admin, String(e._id), false, MOTIVO);
      const _id = e._id;

      for (const update of [
        { $set: { 'historicoSituacao.0.motivo': 'trocado' } },
        { $set: { historicoSituacao: [] } },
        { $unset: { historicoSituacao: 1 } },
        { $pull: { historicoSituacao: { ativo: false } } },
        { $pop: { historicoSituacao: 1 } },
        { $rename: { historicoSituacao: 'outro' } },
        { $push: { historicoSituacao: { $each: [], $slice: -1 } } },
      ]) {
        await expect(M.Empenho.updateOne({ _id }, update as never)).rejects.toThrow(
          EscritaProibidaError,
        );
      }
      await expect(M.Empenho.updateMany({}, { $pop: { historicoSituacao: -1 } })).rejects.toThrow(
        EscritaProibidaError,
      );
      await expect(
        M.Empenho.findOneAndUpdate({ _id }, { $pullAll: { historicoSituacao: [] } }),
      ).rejects.toThrow(EscritaProibidaError);
      await expect(M.Empenho.replaceOne({ _id }, { numero: 'X' })).rejects.toThrow(
        EscritaProibidaError,
      );

      // As escritas do saldo e dos movimentos continuam.
      const cotacaoId = new Types.ObjectId();
      await M.Empenho.updateOne(
        { _id },
        {
          $push: { reservas: { cotacaoId, valorCentavos: 10_00, em: new Date() } },
          $inc: { comprometidoCentavos: 10_00 },
        },
      );
      await M.Empenho.updateOne(
        { _id },
        { $pull: { reservas: { cotacaoId } }, $inc: { comprometidoCentavos: -10_00 } },
      );
      expect(
        await cadastro.movimentarEmpenho(ids.admin, {
          empenhoId: String(_id),
          tipo: 'reforco',
          valorCentavos: 5_00,
          ato: 'SEI 123',
        }),
      ).toEqual({ ok: true });
      expect((await M.Empenho.findById(_id).lean())?.historicoSituacao).toHaveLength(1);
    });

    it('o hook pega também a chave solta, o $rename para o histórico e a troca do documento', async () => {
      const e = await empenho();
      await cadastro.alterarSituacaoEmpenho(ids.admin, String(e._id), false, MOTIVO);
      const _id = e._id;

      // Chave sem operador vira `$set` no Mongoose.
      await expect(
        M.Empenho.updateOne({ _id }, { historicoSituacao: [] } as never),
      ).rejects.toThrow(EscritaProibidaError);
      await expect(
        M.Empenho.updateOne({ _id }, { $rename: { numero: 'historicoSituacao' } } as never),
      ).rejects.toThrow(EscritaProibidaError);
      await expect(M.Empenho.findOneAndReplace({ _id }, { numero: 'X' })).rejects.toThrow(
        EscritaProibidaError,
      );

      // `$push` sem `$slice` é o caminho do próprio ato e continua passando.
      await M.Empenho.updateOne({ _id }, {
        $push: {
          historicoSituacao: {
            $each: [{ ativo: true, motivo: MOTIVO, porUserId: ids.admin, em: new Date() }],
          },
        },
      } as never);
      const lido = await M.Empenho.findById(_id).lean();
      expect(lido?.historicoSituacao.map((s) => s.motivo)).toEqual([MOTIVO, MOTIVO]);
    });
  });

  describe('a leitura do painel (AC-6, AC-7)', () => {
    it('traz os nomes dos autores, inclusive o desligado e o removido', async () => {
      const d = await designar(ids.rt, 'responsavel_tecnico');
      await cadastro.revogarDesignacao(ids.admin, String(d._id), MOTIVO);
      const f = await faixa();
      await cadastro.desativarFaixa(ids.removido, String(f._id), MOTIVO);
      const e = await empenho();
      await cadastro.movimentarEmpenho(ids.fiscal, {
        empenhoId: String(e._id),
        tipo: 'reforco',
        valorCentavos: 1_00,
        ato: 'SEI 1',
      });
      await cadastro.alterarSituacaoEmpenho(ids.admin, String(e._id), false, MOTIVO);

      const p = await cadastro.lerPainelMaterial();
      expect(p.designacoes[0]).toMatchObject({
        revogadaPorNome: 'Carla Admin',
        revogadaMotivo: MOTIVO,
      });
      expect(p.faixas[0]).toMatchObject({
        desativadaPorNome: 'Usuário removido',
        desativadaMotivo: MOTIVO,
      });
      expect(p.faixas[0]?.desativadaEm).toEqual(expect.any(String));
      expect(p.empenhos[0]?.movimentos[0]?.porNome).toBe('Marina Fiscal');
      expect(p.empenhos[0]?.situacoes).toEqual([
        { ativo: false, motivo: MOTIVO, porNome: 'Carla Admin', em: expect.any(String) },
      ]);
    });

    it('os atos de antes da spec aparecem sem motivo, sem migração', async () => {
      const agora = new Date();
      const admin = new Types.ObjectId(ids.admin);
      await M.Designacao.collection.insertMany([
        {
          userId: admin,
          papel: 'fiscal',
          vigenciaInicio: '2000-01-01',
          ato: 'P1',
          criadoPorUserId: admin,
          em: agora,
          revogadaEm: agora,
          revogadaPorUserId: admin,
        },
        {
          userId: admin,
          papel: 'gestor',
          vigenciaInicio: '2000-01-01',
          ato: 'P2',
          criadoPorUserId: admin,
          em: agora,
          revogadaEm: agora,
          revogadaPorUserId: admin,
          revogadaMotivo: '',
        },
      ]);
      await M.Faixa.collection.insertOne({
        nome: 'Antiga',
        limiteCentavos: 1_00,
        ativa: false,
        criadoPorUserId: admin,
        em: agora,
      });
      await M.Empenho.collection.insertOne({
        numero: 'NE-VELHO',
        exercicio: ANO,
        valorInicialCentavos: 1_00,
        valorLiquidoCentavos: 1_00,
        comprometidoCentavos: 0,
        movimentos: [],
        reservas: [],
        ativo: false,
        criadoPorUserId: admin,
      });

      const p = await cadastro.lerPainelMaterial();
      for (const d of p.designacoes) {
        expect(d).toMatchObject({ revogadaMotivo: null, revogadaPorNome: 'Carla Admin' });
      }
      expect(p.faixas[0]).toMatchObject({
        ativa: false,
        desativadaEm: null,
        desativadaPorNome: null,
        desativadaMotivo: null,
      });
      expect(p.empenhos[0]).toMatchObject({ ativo: false, situacoes: [] });
    });
  });

  it('nada dos quatro atos chega à leitura da cotação (AC-8)', async () => {
    await designar(ids.rt, 'responsavel_tecnico');
    await designar(ids.fiscal, 'fiscal');
    const revogada = await designar(ids.fiscal, 'gestor');
    await cadastro.revogarDesignacao(ids.admin, String(revogada._id), MOTIVO);
    const f = await faixa('Faixa II');
    await cadastro.desativarFaixa(ids.admin, String(f._id), MOTIVO);
    const e = await empenho('NE-COT', { comprometidoCentavos: 300_00 });
    await cadastro.alterarSituacaoEmpenho(ids.admin, String(e._id), false, MOTIVO);
    await cadastro.alterarSituacaoEmpenho(ids.admin, String(e._id), true, MOTIVO);

    const chamadoId = new Types.ObjectId();
    await M.Chamado.collection.insertOne({
      _id: chamadoId,
      ticket_number: '2274',
      titulo: 'Troca do disjuntor',
      status: 'em atendimento',
      assignedToUserId: new Types.ObjectId(ids.tecnico),
      solicitanteId: new Types.ObjectId(),
    });
    const cotacaoId = new Types.ObjectId();
    await M.Cotacao.collection.insertOne({
      _id: cotacaoId,
      numero: 'COT-2026-0145',
      chamadoId,
      situacao: 'autorizada',
      emTramite: true,
      versao: 1,
      itens: [
        {
          _id: new Types.ObjectId(),
          descricao: 'Disjuntor bipolar 40 A',
          unidade: 'un',
          quantidade: 1,
          motivo: 'Troca',
          doDiagnostico: true,
          origem: 'orcamento',
          precoAplicadoCentavos: 300_00,
          quantidadeExecutada: null,
          valorExecutadoCentavos: null,
          referencias: [],
        },
      ],
      orcamentos: [],
      advertencias: [],
      montadoPorUserId: new Types.ObjectId(ids.rt),
      fiscalUserId: new Types.ObjectId(ids.fiscal),
      diagnosticadoPorUserId: new Types.ObjectId(ids.tecnico),
      diagnosticadoEm: new Date(),
      valorTotalCentavos: 300_00,
      empenhoId: e._id,
      valorAutorizadoCentavos: 300_00,
      autorizadoEm: new Date(),
      executadoEm: null,
      valorExecutadoCentavos: null,
      urgencia: null,
      notaFiscal: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await M.Evento.collection.insertOne({
      cotacaoId,
      de: 'em_aprovacao',
      para: 'autorizada',
      acao: 'aprovar',
      papel: 'aprovador',
      autorNome: 'Marina Fiscal',
      advertenciasNoAto: [],
      empenhoId: e._id,
      valorCentavos: 300_00,
      em: new Date(),
    });

    const fiscal = { userId: ids.fiscal, role: 'Admin' };
    // O detalhe do TRF1 é também o que vai para o PDF (`gerarPdfCotacao`).
    const detalheTrf1 = await leitura.lerDetalhe(String(cotacaoId), fiscal);
    expect(detalheTrf1?.cotacao.visao).toBe('trf1');
    const leituras = [
      detalheTrf1,
      await leitura.lerDetalhe(String(cotacaoId), { userId: ids.rt, role: 'Preposto' }),
      await leitura.lerDetalhe(String(cotacaoId), { userId: ids.tecnico, role: 'Técnico' }),
      await leitura.cartaoDoChamado(String(chamadoId), fiscal),
      await leitura.listarFila(fiscal, 'todas'),
    ];
    for (const l of leituras) {
      expect(l).not.toBeNull();
      const texto = JSON.stringify(l);
      expect(texto).not.toContain(MOTIVO);
      expect(texto).not.toMatch(/revogadaMotivo|desativadaMotivo|historicoSituacao/);
    }
  });
});
