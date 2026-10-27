import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

// "Hoje" fixo em Belém: a vigência das designações conta pelo dia de Belém.
vi.mock('@/lib/ativos/documentos/situacao', () => ({ hojeEmBelem: () => '2026-10-15' }));

/**
 * O cadastro do Admin e a vigência das designações contra o MongoDB de
 * verdade (spec 0019): perfil por papel, sobreposição, faixa ativa e quem
 * tem papel vigente hoje.
 *
 * covers: AC-7, AC-19
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

rodar('cadastro e designações do material, contra o Mongo', () => {
  let cadastro: typeof import('../cadastro');
  let papeis: typeof import('../papeis');
  let User: typeof import('@/models/user.model').UserModel;
  let Designacao: typeof import('@/models/DesignacaoMaterial').DesignacaoMaterialModel;
  let Faixa: typeof import('@/models/FaixaCompetencia').FaixaCompetenciaModel;
  let Empenho: typeof import('@/models/Empenho').EmpenhoModel;
  let todos: ModelDeTeste[];

  const admin = String(new Types.ObjectId());
  const u = {
    adm: String(new Types.ObjectId()),
    prep: String(new Types.ObjectId()),
    tec: String(new Types.ObjectId()),
    sol: String(new Types.ObjectId()),
    inativo: String(new Types.ObjectId()),
  };

  beforeAll(async () => {
    cadastro = await import('../cadastro');
    papeis = await import('../papeis');
    User = (await import('@/models/user.model')).UserModel;
    Designacao = (await import('@/models/DesignacaoMaterial')).DesignacaoMaterialModel;
    Faixa = (await import('@/models/FaixaCompetencia')).FaixaCompetenciaModel;
    Empenho = (await import('@/models/Empenho')).EmpenhoModel;
    todos = [User, Designacao, Faixa, Empenho].map((m) => cru(m as never));
    await conectarMongoDeTeste(todos, 'severino_test_material_cadastro');
  });

  beforeEach(async () => {
    await limparColecoes(todos);
    await User.collection.insertMany([
      {
        _id: new Types.ObjectId(u.adm),
        username: 'adm',
        name: 'Ana',
        role: 'Admin',
        isActive: true,
      },
      {
        _id: new Types.ObjectId(u.prep),
        username: 'prep',
        name: 'Paulo',
        role: 'Preposto',
        isActive: true,
      },
      {
        _id: new Types.ObjectId(u.tec),
        username: 'tec',
        name: 'Tiago',
        role: 'Técnico',
        isActive: true,
      },
      {
        _id: new Types.ObjectId(u.sol),
        username: 'sol',
        name: 'Sara',
        role: 'Solicitante',
        isActive: true,
      },
      {
        _id: new Types.ObjectId(u.inativo),
        username: 'ina',
        name: 'Ines',
        role: 'Admin',
        isActive: false,
      },
    ]);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  async function faixa(limite: number, ativa = true) {
    const f = await Faixa.create({
      nome: `F${limite}`,
      limiteCentavos: limite,
      ativa,
      criadoPorUserId: new Types.ObjectId(),
      em: new Date(),
    });
    return String(f._id);
  }

  const designar = (userId: string, papel: string, extra: Record<string, unknown> = {}) =>
    cadastro.criarDesignacao(admin, {
      userId,
      papel: papel as never,
      vigenciaInicio: '2026-01-01',
      ato: 'Portaria 1',
      ...extra,
    });

  describe('criarDesignacao (AC-19)', () => {
    it.each([
      ['fiscal', 'prep'],
      ['gestor', 'tec'],
      ['aprovador', 'sol'],
      ['responsavel_tecnico', 'adm'],
      ['responsavel_tecnico', 'sol'],
    ] as const)('recusa %s para o perfil errado (%s)', async (papel, quem) => {
      const r = await designar(
        u[quem],
        papel,
        papel === 'aprovador' ? { faixaId: await faixa(1000) } : {},
      );
      expect(r.ok).toBe(false);
    });

    it('aceita fiscal Admin e responsável técnico Preposto ou Técnico', async () => {
      expect((await designar(u.adm, 'fiscal')).ok).toBe(true);
      expect((await designar(u.prep, 'responsavel_tecnico')).ok).toBe(true);
      expect((await designar(u.tec, 'responsavel_tecnico')).ok).toBe(true);
    });

    it('recusa usuário inativo', async () => {
      expect((await designar(u.inativo, 'fiscal')).ok).toBe(false);
    });

    it('aprovador só aponta faixa ativa', async () => {
      expect((await designar(u.adm, 'aprovador', { faixaId: await faixa(1000, false) })).ok).toBe(
        false,
      );
    });

    it('recusa período que se sobrepõe para a mesma pessoa e papel', async () => {
      expect((await designar(u.adm, 'fiscal', { vigenciaFim: '2026-06-30' })).ok).toBe(true);
      expect((await designar(u.adm, 'fiscal', { vigenciaInicio: '2026-06-30' })).ok).toBe(false);
    });

    it('aceita período seguinte sem sobreposição, e outro papel na mesma época', async () => {
      expect((await designar(u.adm, 'fiscal', { vigenciaFim: '2026-06-30' })).ok).toBe(true);
      expect((await designar(u.adm, 'fiscal', { vigenciaInicio: '2026-07-01' })).ok).toBe(true);
      expect((await designar(u.adm, 'gestor')).ok).toBe(true);
    });

    it('dois cadastros simultâneos que se sobrepõem deixam uma só vigente', async () => {
      const r = await Promise.all([
        designar(u.adm, 'fiscal', { ato: 'Portaria A' }),
        designar(u.adm, 'fiscal', { ato: 'Portaria B' }),
        designar(u.adm, 'fiscal', { ato: 'Portaria C' }),
      ]);

      expect(r.filter((x) => x.ok)).toHaveLength(1);
      expect(
        await Designacao.countDocuments({ userId: new Types.ObjectId(u.adm), revogadaEm: null }),
      ).toBe(1);
    });

    it('designação revogada não bloqueia uma nova no mesmo período', async () => {
      await designar(u.adm, 'fiscal');
      const d = await Designacao.findOne({ userId: new Types.ObjectId(u.adm) }).lean();
      await cadastro.revogarDesignacao(admin, String(d!._id), 'Motivo de teste do cadastro');
      expect((await designar(u.adm, 'fiscal')).ok).toBe(true);
    });
  });

  describe('papeisDe e designadosVigentes', () => {
    it('vale a designação dentro da vigência; futura, vencida e revogada não valem', async () => {
      await designar(u.adm, 'fiscal'); // desde 2026-01-01, sem fim
      await designar(u.adm, 'gestor', { vigenciaInicio: '2026-10-16' }); // amanhã
      await designar(u.prep, 'responsavel_tecnico', { vigenciaFim: '2026-10-14' }); // ontem
      await designar(u.tec, 'responsavel_tecnico');
      const tec = await Designacao.findOne({ userId: new Types.ObjectId(u.tec) }).lean();
      await cadastro.revogarDesignacao(admin, String(tec!._id), 'Motivo de teste do cadastro');

      const p = await papeis.papeisDe(u.adm, 'Admin');
      expect(p.tem('fiscal')).toBe(true);
      expect(p.tem('gestor')).toBe(false);
      expect(p.ladoTrf1).toBe(true);
      expect((await papeis.papeisDe(u.prep, 'Preposto')).contratada).toBe(false);
      expect((await papeis.papeisDe(u.tec, 'Técnico')).contratada).toBe(false);
      expect(await papeis.designadosVigentes('responsavel_tecnico')).toEqual([]);
    });

    it('designação que termina hoje ainda vale', async () => {
      await designar(u.adm, 'fiscal', { vigenciaFim: '2026-10-15' });
      expect((await papeis.papeisDe(u.adm, 'Admin')).tem('fiscal')).toBe(true);
    });

    it('Admin sem designação é só leitor', async () => {
      const p = await papeis.papeisDe(u.adm, 'Admin');
      expect(p).toMatchObject({ ladoTrf1: false, leitorAdmin: true, contratada: false });
    });

    it('aprovadoresQueCobrem lista só quem tem faixa ativa suficiente (AC-7, CA-10)', async () => {
      const grande = await faixa(1_000_00);
      const pequena = await faixa(15_00);
      const extra = String(new Types.ObjectId());
      await User.collection.insertOne({
        _id: new Types.ObjectId(extra),
        username: 'x',
        name: 'Xavier',
        role: 'Admin',
        isActive: true,
      });
      await designar(u.adm, 'aprovador', { faixaId: grande });
      await designar(extra, 'aprovador', { faixaId: pequena });

      expect((await papeis.aprovadoresQueCobrem(20_00)).map((d) => d.nome)).toEqual(['Ana']);
      expect((await papeis.aprovadoresQueCobrem(10_00)).map((d) => d.nome)).toEqual([
        'Ana',
        'Xavier',
      ]);

      await cadastro.desativarFaixa(admin, grande, 'Motivo de teste do cadastro');
      expect(await papeis.aprovadoresQueCobrem(20_00)).toEqual([]);
      expect(papeis.limiteDoAprovador(await papeis.papeisDe(u.adm, 'Admin'))).toBeNull();
    });
  });

  describe('empenhos (AC-19)', () => {
    it('número repetido é recusado e o líquido nasce igual ao inicial', async () => {
      const e = { numero: '2026ne000001', exercicio: 2026, valorInicialCentavos: 50_00 };
      expect(await cadastro.criarEmpenho(admin, e)).toEqual({ ok: true });
      expect((await cadastro.criarEmpenho(admin, { ...e, numero: '2026NE000001' })).ok).toBe(false);
      const lido = await Empenho.findOne({}).lean();
      expect(lido).toMatchObject({
        numero: '2026NE000001',
        valorLiquidoCentavos: 50_00,
        comprometidoCentavos: 0,
      });
    });

    it('reforço soma ao líquido e grava o movimento', async () => {
      await cadastro.criarEmpenho(admin, {
        numero: 'NE1',
        exercicio: 2026,
        valorInicialCentavos: 50_00,
      });
      const id = String((await Empenho.findOne({}).lean())!._id);
      expect(
        await cadastro.movimentarEmpenho(admin, {
          empenhoId: id,
          tipo: 'reforco',
          valorCentavos: 25_00,
          ato: 'SEI 2',
        }),
      ).toEqual({ ok: true });
      const lido = await Empenho.findById(id).lean();
      expect(lido?.valorLiquidoCentavos).toBe(75_00);
      expect(lido?.movimentos).toHaveLength(1);
    });
  });
});
