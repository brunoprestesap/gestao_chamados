import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';
import {
  comOrgaoDeTeste,
  criarDoisOrgaos,
  ORGAO_A_ID,
  ORGAO_B_ID,
  usarModo,
} from '@/tests/orgao-test-env';

/**
 * Spec 0025, AC-15 (fatia 1): dois órgãos no MongoDB de verdade, com
 * `Chamado` e `User`, provando operação por operação que nada cruza.
 *
 * O `auth()` é trocado por um falso que devolve a sessão do teste, para
 * provar também o caminho do JWT (AC-2) sem um servidor Next.
 */
const sessao = vi.hoisted(() => ({
  atual: null as null | { user: { orgaoId?: string } },
  aoChamar: null as null | (() => Promise<void>),
}));
vi.mock('@/auth', () => ({
  auth: vi.fn(async () => {
    if (sessao.aoChamar) await sessao.aoChamar();
    if (!sessao.atual) throw new Error('fora da requisição');
    return sessao.atual;
  }),
}));

import { OrgaoAusenteError, semOrgao } from '@/lib/orgaos/contexto';
import { OrgaoRecusaError } from '@/lib/orgaos/plugin';
import { esquecerOrgaosLembradosParaTeste, orgaoDoTokenAntigo } from '@/lib/orgaos/sessao';
import { OPCAO_ESCRITA_PROPRIA } from '@/models/_somente-inclusao';
import { ChamadoModel } from '@/models/Chamado';
import { FaixaCompetenciaModel } from '@/models/FaixaCompetencia';
import { OrgaoModel } from '@/models/Orgao';
import { UnitModel } from '@/models/unit';
import { UserModel } from '@/models/user.model';
import { ORGAO_1_ID } from '@/shared/orgaos/orgao.constants';

const A = ORGAO_A_ID;
const B = ORGAO_B_ID;
const naoTemMongo = !temMongoDeTeste;

function dadosChamado(campos: Record<string, unknown> = {}) {
  return {
    ticket_number: 'CHM-2026-00001',
    titulo: 'Teste',
    descricao: 'Descrição sigilosa',
    unitId: new Types.ObjectId(),
    localExato: 'Sala 1',
    tipoServico: 'Ar-Condicionado',
    subtypeId: new Types.ObjectId(),
    catalogServiceId: new Types.ObjectId(),
    status: 'aberto',
    solicitanteId: new Types.ObjectId(),
    ...campos,
  };
}

/** Lê a coleção sem passar pelo plugin, para conferir o que foi gravado. */
const cru = (filtro: Record<string, unknown> = {}) =>
  semOrgao('teste: conferir a gravação', () => ChamadoModel.find(filtro).lean());

describe.skipIf(naoTemMongo)('isolamento por órgão no MongoDB (spec 0025)', () => {
  let userA: Types.ObjectId;
  let userB: Types.ObjectId;
  let chamadoA: Types.ObjectId;
  let chamadoB: Types.ObjectId;

  beforeAll(async () => {
    await conectarMongoDeTeste(
      [ChamadoModel, UserModel, OrgaoModel, UnitModel, FaixaCompetenciaModel],
      'orgao_isolamento',
    );
    await criarDoisOrgaos();
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  beforeEach(async () => {
    usarModo('estrito');
    sessao.atual = null;
    sessao.aoChamar = null;
    esquecerOrgaosLembradosParaTeste();
    await semOrgao('teste: limpar', async () => {
      await ChamadoModel.deleteMany({});
      await UserModel.deleteMany({});
      await UnitModel.deleteMany({});
      // Só de inclusão: a limpeza vai pela coleção crua.
      await FaixaCompetenciaModel.collection.deleteMany({});
    });
    userA = (await comOrgaoDeTeste(A, () => UserModel.create({ username: 'ana', name: 'Ana' })))
      ._id;
    userB = (await comOrgaoDeTeste(B, () => UserModel.create({ username: 'bia', name: 'Bia' })))
      ._id;
    // Números diferentes de propósito: o mesmo número em dois órgãos é provado em orgao-unicidade.db.test.ts.
    chamadoA = (
      await comOrgaoDeTeste(A, () => ChamadoModel.create(dadosChamado({ solicitanteId: userA })))
    )._id;
    chamadoB = (
      await comOrgaoDeTeste(B, () =>
        ChamadoModel.create(
          dadosChamado({ ticket_number: 'CHM-2026-90001', solicitanteId: userB, titulo: 'De B' }),
        ),
      )
    )._id;
  });

  describe('leitura no estrito (AC-4)', () => {
    it('find, findOne, findById, exists, countDocuments e distinct só veem o próprio órgão', async () => {
      await comOrgaoDeTeste(A, async () => {
        const todos = await ChamadoModel.find({}).lean();
        expect(todos.map((c) => String(c._id))).toEqual([String(chamadoA)]);
        expect(
          await ChamadoModel.findOne({ ticket_number: 'CHM-2026-00001' }).lean(),
        ).toMatchObject({ titulo: 'Teste' });
        expect(await ChamadoModel.findById(chamadoB).lean()).toBeNull();
        expect(await ChamadoModel.exists({ _id: chamadoB })).toBeNull();
        expect(await ChamadoModel.countDocuments({})).toBe(1);
        expect(await ChamadoModel.distinct('titulo')).toEqual(['Teste']);
        expect(await UserModel.find({}).lean()).toHaveLength(1);
      });
    });

    it('filtro do chamador com orgaoId de outro órgão devolve vazio', async () => {
      const r = await comOrgaoDeTeste(A, () =>
        ChamadoModel.find({ orgaoId: new Types.ObjectId(B) }).lean(),
      );
      expect(r).toEqual([]);
    });

    it('populate de referência de outro órgão vem null', async () => {
      const cruzado = await comOrgaoDeTeste(A, () =>
        ChamadoModel.create(
          dadosChamado({ ticket_number: 'CHM-2026-00002', solicitanteId: userB }),
        ),
      );
      const lido = await comOrgaoDeTeste(A, () =>
        ChamadoModel.findById(cruzado._id).populate('solicitanteId').lean(),
      );
      expect(lido?.solicitanteId).toBeNull();
      const proprio = await comOrgaoDeTeste(A, () =>
        ChamadoModel.findById(chamadoA).populate('solicitanteId').lean(),
      );
      expect((proprio?.solicitanteId as unknown as { name: string }).name).toBe('Ana');
    });

    it('o órgão vem do JWT quando não há comOrgao (AC-2)', async () => {
      sessao.atual = { user: { orgaoId: B } };
      const r = await ChamadoModel.find({}).lean();
      expect(r.map((c) => String(c._id))).toEqual([String(chamadoB)]);
    });

    it('o plugin não entra em laço com o auth() (AC-2, AC-15)', async () => {
      // O callback `jwt` lê o `User` dentro de `semOrgao`, de dentro do `auth()`.
      sessao.atual = { user: { orgaoId: A } };
      let leituras = 0;
      sessao.aoChamar = async () => {
        leituras += 1;
        await semOrgao('teste: o jwt lendo o User', () => UserModel.findById(userA).lean());
      };
      const r = await ChamadoModel.find({}).lean();
      expect(r).toHaveLength(1);
      expect(leituras).toBe(1);
    });
  });

  describe('gravação no estrito (AC-5)', () => {
    it('create e save de documento novo carimbam o órgão do contexto', async () => {
      const [a] = await cru({ _id: chamadoA });
      expect(String(a.orgaoId)).toBe(A);
      const doc = new ChamadoModel(dadosChamado({ ticket_number: 'CHM-2026-00009' }));
      await comOrgaoDeTeste(B, () => doc.save());
      expect(String((await cru({ _id: doc._id }))[0].orgaoId)).toBe(B);
    });

    it('informar outro orgaoId no create lança', async () => {
      await expect(
        comOrgaoDeTeste(A, () =>
          ChamadoModel.create(dadosChamado({ orgaoId: new Types.ObjectId(B) })),
        ),
      ).rejects.toBeInstanceOf(OrgaoRecusaError);
    });

    it('insertMany carimba cada documento', async () => {
      await comOrgaoDeTeste(A, () =>
        ChamadoModel.insertMany([
          dadosChamado({ ticket_number: 'CHM-2026-00010' }),
          dadosChamado({ ticket_number: 'CHM-2026-00011' }),
        ]),
      );
      const gravados = await cru({ ticket_number: { $in: ['CHM-2026-00010', 'CHM-2026-00011'] } });
      expect(gravados.map((c) => String(c.orgaoId))).toEqual([A, A]);
    });

    it('updateOne e updateMany só alcançam o próprio órgão', async () => {
      await comOrgaoDeTeste(A, async () => {
        await ChamadoModel.updateMany({}, { $set: { titulo: 'Mudado' } });
        await ChamadoModel.updateOne({ _id: chamadoB }, { $set: { titulo: 'Invadido' } });
      });
      const [b] = await cru({ _id: chamadoB });
      const [a] = await cru({ _id: chamadoA });
      expect(b.titulo).toBe('De B');
      expect(a.titulo).toBe('Mudado');
    });

    it('findOneAndUpdate de outro órgão não acha nada', async () => {
      const r = await comOrgaoDeTeste(A, () =>
        ChamadoModel.findOneAndUpdate({ _id: chamadoB }, { $set: { titulo: 'X' } }, { new: true }),
      );
      expect(r).toBeNull();
    });

    it('mudar ou remover orgaoId por atualização lança', async () => {
      const outro = new Types.ObjectId(B);
      await comOrgaoDeTeste(A, async () => {
        await expect(
          ChamadoModel.updateOne({ _id: chamadoA }, { $set: { orgaoId: outro } }),
        ).rejects.toBeInstanceOf(OrgaoRecusaError);
        await expect(
          ChamadoModel.updateOne({ _id: chamadoA }, { $unset: { orgaoId: 1 } }),
        ).rejects.toBeInstanceOf(OrgaoRecusaError);
        await expect(
          ChamadoModel.findOneAndUpdate({ _id: chamadoA }, { orgaoId: outro }),
        ).rejects.toBeInstanceOf(OrgaoRecusaError);
        await expect(
          ChamadoModel.updateOne({ _id: chamadoA }, [{ $set: { orgaoId: outro } }], {
            updatePipeline: true,
          }),
        ).rejects.toBeInstanceOf(OrgaoRecusaError);
      });
    });

    it('save de documento existente que troca o órgão lança', async () => {
      await comOrgaoDeTeste(A, async () => {
        const doc = await ChamadoModel.findById(chamadoA);
        doc!.set('orgaoId', new Types.ObjectId(B));
        await expect(doc!.save()).rejects.toBeInstanceOf(OrgaoRecusaError);
      });
    });

    it('save e deleteOne de documento de outro órgão lido fora do filtro lançam', async () => {
      const deB = await semOrgao('teste: ler o de B', () => ChamadoModel.findById(chamadoB));
      await comOrgaoDeTeste(A, async () => {
        deB!.titulo = 'Invadido';
        await expect(deB!.save()).rejects.toBeInstanceOf(OrgaoRecusaError);
        await expect(deB!.deleteOne()).rejects.toBeInstanceOf(OrgaoRecusaError);
      });
      expect((await cru({ _id: chamadoB }))[0].titulo).toBe('De B');
    });

    it('doc.updateOne passa pelo filtro do órgão', async () => {
      const deB = await semOrgao('teste: ler o de B', () => ChamadoModel.findById(chamadoB));
      await comOrgaoDeTeste(A, () => deB!.updateOne({ $set: { titulo: 'Invadido' } }));
      expect((await cru({ _id: chamadoB }))[0].titulo).toBe('De B');
    });

    it('deleteOne, deleteMany e findOneAndDelete só alcançam o próprio órgão', async () => {
      await comOrgaoDeTeste(A, async () => {
        await ChamadoModel.deleteOne({ _id: chamadoB });
        await ChamadoModel.findOneAndDelete({ _id: chamadoB });
        await ChamadoModel.deleteMany({});
      });
      expect(await cru({ _id: chamadoB })).toHaveLength(1);
      expect(await cru({ _id: chamadoA })).toHaveLength(0);
    });

    it('upsert grava o órgão do contexto', async () => {
      await comOrgaoDeTeste(B, () =>
        ChamadoModel.findOneAndUpdate(
          { ticket_number: 'CHM-2026-00050' },
          { $setOnInsert: dadosChamado({ ticket_number: 'CHM-2026-00050' }) },
          { upsert: true },
        ),
      );
      await comOrgaoDeTeste(A, () =>
        ChamadoModel.updateOne(
          { ticket_number: 'CHM-2026-00051' },
          { $set: dadosChamado({ ticket_number: 'CHM-2026-00051' }) },
          { upsert: true },
        ),
      );
      expect(String((await cru({ ticket_number: 'CHM-2026-00050' }))[0].orgaoId)).toBe(B);
      expect(String((await cru({ ticket_number: 'CHM-2026-00051' }))[0].orgaoId)).toBe(A);
    });

    it('replaceOne mantém o órgão do contexto e não alcança outro órgão', async () => {
      await comOrgaoDeTeste(A, async () => {
        await ChamadoModel.replaceOne({ _id: chamadoA }, dadosChamado({ titulo: 'Trocado' }));
        await ChamadoModel.replaceOne({ _id: chamadoB }, dadosChamado({ titulo: 'Invadido' }));
      });
      const [a] = await cru({ _id: chamadoA });
      expect(a.titulo).toBe('Trocado');
      expect(String(a.orgaoId)).toBe(A);
      expect((await cru({ _id: chamadoB }))[0].titulo).toBe('De B');
    });

    it('bulkWrite carimba as inserções e filtra as atualizações e remoções', async () => {
      await comOrgaoDeTeste(A, () =>
        ChamadoModel.bulkWrite([
          { insertOne: { document: dadosChamado({ ticket_number: 'CHM-2026-00060' }) } },
          { updateOne: { filter: { _id: chamadoB }, update: { $set: { titulo: 'Invadido' } } } },
          { deleteOne: { filter: { _id: chamadoB } } },
          {
            updateOne: {
              filter: { ticket_number: 'CHM-2026-00061' },
              update: { $set: dadosChamado({ ticket_number: 'CHM-2026-00061' }) },
              upsert: true,
            },
          },
        ]),
      );
      expect(String((await cru({ ticket_number: 'CHM-2026-00060' }))[0].orgaoId)).toBe(A);
      expect(String((await cru({ ticket_number: 'CHM-2026-00061' }))[0].orgaoId)).toBe(A);
      expect((await cru({ _id: chamadoB }))[0].titulo).toBe('De B');
    });
  });

  describe('falha fechada e estágios proibidos (AC-6)', () => {
    it('sem órgão conhecido lança OrgaoAusenteError e nada chega ao banco', async () => {
      const comandos: string[] = [];
      mongoose.set('debug', (colecao: string, metodo: string) => {
        comandos.push(`${colecao}.${metodo}`);
      });
      try {
        await expect(ChamadoModel.find({}).lean()).rejects.toBeInstanceOf(OrgaoAusenteError);
        await expect(ChamadoModel.updateMany({}, { $set: { titulo: 'X' } })).rejects.toBeInstanceOf(
          OrgaoAusenteError,
        );
        await expect(ChamadoModel.aggregate([{ $match: {} }])).rejects.toBeInstanceOf(
          OrgaoAusenteError,
        );
        await expect(ChamadoModel.create(dadosChamado())).rejects.toBeInstanceOf(OrgaoAusenteError);
      } finally {
        mongoose.set('debug', false);
      }
      expect(comandos.filter((c) => c.startsWith('chamados.'))).toEqual([]);
    });

    it('aggregate filtra pelo órgão e o $lookup simples por _id não cruza', async () => {
      const r = await comOrgaoDeTeste(A, () =>
        ChamadoModel.aggregate([
          {
            $lookup: {
              from: 'users',
              localField: 'solicitanteId',
              foreignField: '_id',
              as: 'solicitante',
            },
          },
        ]),
      );
      expect(r).toHaveLength(1);
      expect(r[0].solicitante.map((u: { name: string }) => u.name)).toEqual(['Ana']);
    });

    it.each([
      ['$unionWith', [{ $unionWith: 'users' }]],
      ['$out', [{ $out: 'copia' }]],
      ['$merge', [{ $merge: { into: 'copia' } }]],
      ['$graphLookup', [{ $graphLookup: { from: 'users' } }]],
      [
        '$lookup por outro campo',
        [{ $lookup: { from: 'users', localField: 'x', foreignField: 'username', as: 'u' } }],
      ],
      [
        '$lookup com pipeline sem $match de órgão',
        [{ $lookup: { from: 'users', pipeline: [{ $match: {} }], as: 'u' } }],
      ],
      [
        '$lookup dentro de $facet',
        [
          {
            $facet: {
              x: [{ $lookup: { from: 'users', localField: 'a', foreignField: 'b', as: 'u' } }],
            },
          },
        ],
      ],
    ])('aggregate com %s é recusado', async (_nome, pipeline) => {
      await expect(
        comOrgaoDeTeste(A, () => ChamadoModel.aggregate(pipeline as never[])),
      ).rejects.toBeInstanceOf(OrgaoRecusaError);
    });

    it('$lookup com pipeline que começa por $match com orgaoId é aceito', async () => {
      const r = await comOrgaoDeTeste(A, () =>
        ChamadoModel.aggregate([
          {
            $lookup: {
              from: 'users',
              pipeline: [{ $match: { orgaoId: new Types.ObjectId(A) } }],
              as: 'u',
            },
          },
        ]),
      );
      expect(r[0].u).toHaveLength(1);
    });
  });

  describe('observação (AC-8)', () => {
    it('não filtra, lê o legado sem orgaoId e carimba a gravação sem contexto com o órgão 1', async () => {
      // Documento de antes da troca, gravado sem o plugin.
      await ChamadoModel.collection.insertOne(
        dadosChamado({ ticket_number: 'CHM-2025-00001', titulo: 'Legado' }),
      );
      usarModo('observacao');
      const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const todos = await ChamadoModel.find({}).lean();
      expect(todos.map((c) => c.titulo).sort()).toEqual(['De B', 'Legado', 'Teste']);

      const novo = await ChamadoModel.create(dadosChamado({ ticket_number: 'CHM-2026-00070' }));
      expect(String((await cru({ _id: novo._id }))[0].orgaoId)).toBe(ORGAO_1_ID);

      await ChamadoModel.find({}).lean();
      const avisosDoFind = aviso.mock.calls.filter((c) =>
        String(c[0]).includes('[Orgao:observacao] operação sem órgão: Chamado.find'),
      );
      expect(avisosDoFind).toHaveLength(1);
      aviso.mockRestore();
    });

    it('as recusas de troca de órgão e de estágio proibido valem também aqui', async () => {
      usarModo('observacao');
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      await expect(
        ChamadoModel.updateOne({ _id: chamadoA }, { $set: { orgaoId: new Types.ObjectId(B) } }),
      ).rejects.toBeInstanceOf(OrgaoRecusaError);
      await expect(ChamadoModel.aggregate([{ $unionWith: 'users' }])).rejects.toBeInstanceOf(
        OrgaoRecusaError,
      );
      vi.restoreAllMocks();
    });
  });

  describe('o plugin nos outros modelos (fatia 2)', () => {
    it('populate de uma unidade de outro órgão vem null', async () => {
      const unidadeB = await comOrgaoDeTeste(B, () => UnitModel.create({ name: 'Unidade B' }));
      const unidadeA = await comOrgaoDeTeste(A, () => UnitModel.create({ name: 'Unidade A' }));
      // Referência cruzada gravada à força, só para provar que o populate não a segue.
      await semOrgao('teste: referência cruzada', () =>
        ChamadoModel.updateOne({ _id: chamadoA }, { $set: { unitId: unidadeB._id } }),
      );

      const lido = await comOrgaoDeTeste(A, () =>
        ChamadoModel.findById(chamadoA).populate('unitId').lean(),
      );
      expect(lido?.unitId).toBeNull();
      expect(await comOrgaoDeTeste(A, () => UnitModel.countDocuments({}))).toBe(1);
      expect(
        String((await comOrgaoDeTeste(A, () => UnitModel.findById(unidadeA._id).lean()))?._id),
      ).toBe(String(unidadeA._id));
    });

    it('estimatedDocumentCount é recusado em qualquer modelo de órgão', async () => {
      await expect(
        comOrgaoDeTeste(A, () => UnitModel.estimatedDocumentCount()),
      ).rejects.toBeInstanceOf(OrgaoRecusaError);
    });

    it('modelo só de inclusão: carimba, filtra a escrita própria e segue recusando o resto', async () => {
      const faixa = (orgao: string) =>
        comOrgaoDeTeste(orgao, () =>
          FaixaCompetenciaModel.create({
            nome: `Faixa ${orgao.slice(-1)}`,
            limiteCentavos: 100,
            criadoPorUserId: new Types.ObjectId(),
            em: new Date(),
          }),
        );
      const faixaA = await faixa(A);
      const faixaB = await faixa(B);
      expect(String(faixaA.get('orgaoId'))).toBe(A);

      // A escrita própria (desativar) do órgão A não alcança a faixa do B.
      const r = await comOrgaoDeTeste(A, () =>
        FaixaCompetenciaModel.updateOne(
          { _id: faixaB._id },
          { $set: { ativa: false } },
          OPCAO_ESCRITA_PROPRIA,
        ),
      );
      expect(r.matchedCount).toBe(0);

      // O gancho do só de inclusão continua valendo junto com o do órgão.
      await expect(
        comOrgaoDeTeste(A, () => FaixaCompetenciaModel.deleteOne({ _id: faixaA._id })),
      ).rejects.toThrow(/só de inclusão/);
    });
  });

  describe('sessão antiga sem orgaoId no JWT (AC-10)', () => {
    it('completa pelo User', async () => {
      expect(await orgaoDoTokenAntigo(String(userB))).toBe(B);
    });

    it('User sem orgaoId: no estrito vale deslogado, na observação vale o órgão 1', async () => {
      const { insertedId } = await UserModel.collection.insertOne({
        username: 'antigo',
        name: 'Antigo',
      });
      expect(await orgaoDoTokenAntigo(String(insertedId))).toBeNull();
      usarModo('observacao');
      expect(await orgaoDoTokenAntigo(String(insertedId))).toBe(ORGAO_1_ID);
    });
  });
});
