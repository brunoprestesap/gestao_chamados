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
 * Trilha, designações e faixas só de inclusão (spec 0019): o schema recusa
 * alteração e exclusão; só `revogarDesignacao` e `desativarFaixa` mudam algo,
 * e só os próprios campos.
 *
 * covers: AC-9, AC-19
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

rodar('registros só de inclusão, contra o Mongo', () => {
  let Evento: typeof import('@/models/CotacaoMaterialEvento').CotacaoMaterialEventoModel;
  let Designacao: typeof import('@/models/DesignacaoMaterial').DesignacaoMaterialModel;
  let Faixa: typeof import('@/models/FaixaCompetencia').FaixaCompetenciaModel;
  let cadastro: typeof import('../cadastro');
  let ESCRITA_PROPRIA: string;
  let todos: ModelDeTeste[];

  beforeAll(async () => {
    ({ CotacaoMaterialEventoModel: Evento } = await import('@/models/CotacaoMaterialEvento'));
    ({ DesignacaoMaterialModel: Designacao } = await import('@/models/DesignacaoMaterial'));
    ({ FaixaCompetenciaModel: Faixa } = await import('@/models/FaixaCompetencia'));
    ({ ESCRITA_PROPRIA } = await import('@/models/_somente-inclusao'));
    cadastro = await import('../cadastro');
    todos = [Evento, Designacao, Faixa].map((m) => cru(m as never));
    await conectarMongoDeTeste(todos, 'severino_test_material_inclusao');
  });

  beforeEach(async () => {
    await limparColecoes(todos);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  async function evento() {
    return Evento.create({
      cotacaoId: new Types.ObjectId(),
      para: 'rascunho',
      acao: 'criar',
      papel: 'tecnico',
      em: new Date(),
    });
  }

  it('a trilha recusa update, replace e delete por qualquer caminho', async () => {
    const ev = await evento();
    const filtro = { _id: ev._id };

    await expect(Evento.updateOne(filtro, { $set: { motivo: 'x' } })).rejects.toThrow(
      /só de inclusão/,
    );
    await expect(Evento.updateMany({}, { $set: { motivo: 'x' } })).rejects.toThrow(
      /só de inclusão/,
    );
    await expect(Evento.findOneAndUpdate(filtro, { $set: { motivo: 'x' } })).rejects.toThrow(
      /só de inclusão/,
    );
    await expect(Evento.replaceOne(filtro, { para: 'enviada' })).rejects.toThrow(/só de inclusão/);
    await expect(Evento.deleteOne(filtro)).rejects.toThrow(/só de inclusão/);
    await expect(Evento.deleteMany({})).rejects.toThrow(/só de inclusão/);
    await expect(Evento.findOneAndDelete(filtro)).rejects.toThrow(/só de inclusão/);
    await expect(
      Evento.bulkWrite([{ updateOne: { filter: filtro, update: { $set: { motivo: 'x' } } } }]),
    ).rejects.toThrow(/só de inclusão/);
    ev.motivo = 'alterado';
    await expect(ev.save()).rejects.toThrow(/só de inclusão/);
    // A opção própria não abre a trilha: ela não tem campos permitidos.
    await expect(
      Evento.updateOne(filtro, { $set: { motivo: 'x' } }, { [ESCRITA_PROPRIA]: true } as never),
    ).rejects.toThrow(/só de inclusão/);

    expect((await Evento.findById(ev._id).lean())?.motivo).toBeNull();
  });

  it('revogar a designação só grava a data, uma vez', async () => {
    const d = await Designacao.create({
      userId: new Types.ObjectId(),
      papel: 'fiscal',
      vigenciaInicio: '2026-01-01',
      ato: 'Portaria 1',
      criadoPorUserId: new Types.ObjectId(),
      em: new Date(),
    });
    const admin = String(new Types.ObjectId());

    expect(
      await cadastro.revogarDesignacao(admin, String(d._id), 'Motivo de teste do cadastro'),
    ).toEqual({ ok: true });
    expect(
      (await cadastro.revogarDesignacao(admin, String(d._id), 'Motivo de teste do cadastro')).ok,
    ).toBe(false);
    const lida = await Designacao.findById(d._id).lean();
    expect(lida?.revogadaEm).toBeInstanceOf(Date);
    // Fora da função própria, nem o campo de revogação muda.
    await expect(
      Designacao.updateOne({ _id: d._id }, { $set: { revogadaEm: null } }),
    ).rejects.toThrow(/só de inclusão/);
    // Com a opção, mas tocando outro campo, também não.
    await expect(
      Designacao.updateOne({ _id: d._id }, { $set: { papel: 'gestor' } }, {
        [ESCRITA_PROPRIA]: true,
      } as never),
    ).rejects.toThrow(/só de inclusão/);
  });

  it('a faixa não se edita: só desativa', async () => {
    const f = await Faixa.create({
      nome: 'Diretor',
      limiteCentavos: 17_600_00,
      criadoPorUserId: new Types.ObjectId(),
      em: new Date(),
    });

    await expect(Faixa.updateOne({ _id: f._id }, { $set: { limiteCentavos: 1 } })).rejects.toThrow(
      /só de inclusão/,
    );
    expect(
      await cadastro.desativarFaixa(
        String(new Types.ObjectId()),
        String(f._id),
        'Motivo de teste do cadastro',
      ),
    ).toEqual({ ok: true });
    const lida = await Faixa.findById(f._id).lean();
    expect(lida?.ativa).toBe(false);
    expect(lida?.limiteCentavos).toBe(17_600_00);
  });
});
