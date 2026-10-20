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
 * Paridade da regra de visibilidade da contratada (spec 0019, AC-15): a
 * forma em memória (`visivelParaContratada`, usada por `visaoDe`) e a forma
 * em filtro Mongo (`filtroVisivelParaContratada`, usada pela fila) escolhem
 * exatamente as mesmas cotações. O mesmo para a NF pendente.
 *
 * covers: AC-15, AC-22
 */

const rodar = temMongoDeTeste ? describe : describe.skip;
const DIA = 24 * 60 * 60 * 1000;

rodar('pendência e visibilidade da contratada, memória e Mongo', () => {
  let P: typeof import('../pendencia');
  let Cotacao: typeof import('@/models/CotacaoMaterial').CotacaoMaterialModel;
  let todos: ModelDeTeste[];

  beforeAll(async () => {
    P = await import('../pendencia');
    Cotacao = (await import('@/models/CotacaoMaterial')).CotacaoMaterialModel;
    todos = [
      {
        createIndexes: () => Cotacao.createIndexes(),
        deleteMany: (f) => Cotacao.collection.deleteMany(f),
        collection: Cotacao.collection,
      },
    ];
    await conectarMongoDeTeste(todos, 'severino_test_material_pendencia');
  });

  beforeEach(async () => {
    await limparColecoes(todos);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  it('as duas formas escolhem as mesmas cotações', async () => {
    const agora = new Date();
    const nf = {
      numero: '1',
      data: agora,
      arquivoId: new Types.ObjectId(),
      porUserId: new Types.ObjectId(),
      em: agora,
    };
    const casos: Record<string, unknown>[] = [];
    for (const situacao of ['enviada', 'executada', 'atestada', 'cancelada', 'reprovada']) {
      for (const idade of [0, 89, 91, 400]) {
        for (const notaFiscal of [null, undefined, nf]) {
          casos.push({
            numero: `COT-P-${casos.length}`,
            chamadoId: new Types.ObjectId(),
            situacao,
            emTramite: situacao === 'enviada',
            updatedAt: new Date(agora.getTime() - idade * DIA),
            ...(notaFiscal === undefined ? {} : { notaFiscal }),
          });
        }
      }
    }
    await Cotacao.collection.insertMany(casos.map((c) => ({ _id: new Types.ObjectId(), ...c })));
    const docs = await Cotacao.collection.find({}).toArray();

    const naMemoria = docs
      .filter((d) =>
        P.visivelParaContratada(
          d as unknown as Parameters<typeof P.visivelParaContratada>[0],
          agora,
        ),
      )
      .map((d) => String(d._id))
      .sort();
    const noMongo = (await Cotacao.collection.find(P.filtroVisivelParaContratada(agora)).toArray())
      .map((d) => String(d._id))
      .sort();
    expect(noMongo).toEqual(naMemoria);
    expect(naMemoria.length).toBeGreaterThan(0);
    expect(naMemoria.length).toBeLessThan(docs.length);

    const pendentesMemoria = docs
      .filter((d) =>
        P.pendenciaDaContratada(d as unknown as Parameters<typeof P.pendenciaDaContratada>[0]),
      )
      .map((d) => String(d._id))
      .sort();
    const pendentesMongo = (
      await Cotacao.collection.find({ ...P.FILTRO_PENDENCIA_DA_CONTRATADA }).toArray()
    )
      .map((d) => String(d._id))
      .sort();
    expect(pendentesMongo).toEqual(pendentesMemoria);
    // atestada x 4 idades x (nula, ausente): 8 pendências.
    expect(pendentesMemoria).toHaveLength(8);
  });

  it('a pesquisa pendente da urgência (fatia 4) também casa nas duas formas', async () => {
    const agora = new Date();
    const nf = {
      numero: '1',
      data: agora,
      arquivoId: new Types.ObjectId(),
      porUserId: new Types.ObjectId(),
      em: agora,
    };
    const urg = (extra: object) => ({
      pedida: true,
      justificativa: 'Quadro sem energia',
      pedidaEm: agora,
      ...extra,
    });
    const urgencias = [
      undefined,
      null,
      urg({ decisao: 'aceita', pesquisaCompletaEm: null }),
      urg({ decisao: 'aceita' }),
      urg({ decisao: 'aceita', pesquisaCompletaEm: agora }),
      urg({ decisao: 'recusada', pesquisaCompletaEm: null }),
      urg({ decisao: null, pesquisaCompletaEm: null }),
    ];
    const casos: Record<string, unknown>[] = [];
    for (const situacao of ['autorizada', 'executada', 'atestada', 'cancelada', 'reprovada']) {
      for (const urgencia of urgencias) {
        for (const notaFiscal of [null, nf]) {
          for (const idade of [0, 400]) {
            casos.push({
              numero: `COT-U-${casos.length}`,
              chamadoId: new Types.ObjectId(),
              situacao,
              emTramite: situacao === 'autorizada',
              updatedAt: new Date(agora.getTime() - idade * DIA),
              notaFiscal,
              ...(urgencia === undefined ? {} : { urgencia }),
            });
          }
        }
      }
    }
    await Cotacao.collection.insertMany(casos.map((c) => ({ _id: new Types.ObjectId(), ...c })));
    const docs = await Cotacao.collection.find({}).toArray();
    const ids = (lista: { _id: unknown }[]) => lista.map((d) => String(d._id)).sort();

    const pendentesMemoria = ids(
      docs.filter((d) =>
        P.pendenciaDaContratada(d as unknown as Parameters<typeof P.pendenciaDaContratada>[0]),
      ),
    );
    const pendentesMongo = ids(
      await Cotacao.collection.find({ ...P.FILTRO_PENDENCIA_DA_CONTRATADA }).toArray(),
    );
    expect(pendentesMongo).toEqual(pendentesMemoria);
    // Pesquisa: (autorizada, executada) x (aceita nula, aceita ausente) x 2 NF x 2 idades = 16.
    // Nota fiscal: atestada x 7 urgências x 2 idades = 14.
    expect(pendentesMemoria).toHaveLength(30);

    const visiveisMemoria = ids(
      docs.filter((d) =>
        P.visivelParaContratada(
          d as unknown as Parameters<typeof P.visivelParaContratada>[0],
          agora,
        ),
      ),
    );
    const visiveisMongo = ids(
      await Cotacao.collection.find(P.filtroVisivelParaContratada(agora)).toArray(),
    );
    expect(visiveisMongo).toEqual(visiveisMemoria);
  });
});
