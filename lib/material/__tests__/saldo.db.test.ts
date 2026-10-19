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
 * O saldo do empenho contra o MongoDB de verdade (spec 0019): duas reservas
 * ao mesmo tempo contra um saldo que só cobre uma, a reserva idempotente, a
 * liberação dupla, o ajuste na execução, a anulação acima do comprometido e
 * a conciliação da reserva órfã.
 *
 * covers: AC-6, AC-8, AC-19
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

rodar('saldo do empenho, contra o Mongo', () => {
  let saldo: typeof import('../saldo');
  let EmpenhoModel: typeof import('@/models/Empenho').EmpenhoModel;
  let CotacaoMaterialModel: typeof import('@/models/CotacaoMaterial').CotacaoMaterialModel;
  let CotacaoMaterialEventoModel: typeof import('@/models/CotacaoMaterialEvento').CotacaoMaterialEventoModel;
  let todos: ModelDeTeste[];

  const ano = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Belem', year: 'numeric' }).format(
      new Date(),
    ),
  );

  beforeAll(async () => {
    saldo = await import('../saldo');
    ({ EmpenhoModel } = await import('@/models/Empenho'));
    ({ CotacaoMaterialModel } = await import('@/models/CotacaoMaterial'));
    ({ CotacaoMaterialEventoModel } = await import('@/models/CotacaoMaterialEvento'));
    todos = [EmpenhoModel, CotacaoMaterialModel, CotacaoMaterialEventoModel].map((m) =>
      cru(m as never),
    );
    await conectarMongoDeTeste(todos, 'severino_test_material_saldo');
  });

  beforeEach(async () => {
    await limparColecoes(todos);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  async function empenho(valor: number, extra: Record<string, unknown> = {}): Promise<string> {
    const doc = await EmpenhoModel.create({
      numero: `NE${String(new Types.ObjectId()).slice(-8)}`,
      exercicio: ano,
      valorInicialCentavos: valor,
      valorLiquidoCentavos: valor,
      criadoPorUserId: new Types.ObjectId(),
      ...extra,
    });
    return String(doc._id);
  }

  async function lido(id: string) {
    return EmpenhoModel.findById(id).lean();
  }

  it('duas reservas simultâneas contra saldo para uma: só uma passa e o saldo nunca fica negativo', async () => {
    // Arrange
    const id = await empenho(100_00);
    const a = String(new Types.ObjectId());
    const b = String(new Types.ObjectId());

    // Act
    const resultados = await Promise.all([
      saldo.reservar({ empenhoId: id, cotacaoId: a, valorCentavos: 70_00 }),
      saldo.reservar({ empenhoId: id, cotacaoId: b, valorCentavos: 70_00 }),
    ]);

    // Assert
    expect(resultados.filter(Boolean)).toHaveLength(1);
    const e = await lido(id);
    expect(e?.comprometidoCentavos).toBe(70_00);
    expect(e?.reservas).toHaveLength(1);
    expect(e!.valorLiquidoCentavos - e!.comprometidoCentavos).toBeGreaterThanOrEqual(0);
  });

  it('reservar duas vezes para a mesma cotação não reserva de novo', async () => {
    const id = await empenho(100_00);
    const cot = String(new Types.ObjectId());

    expect(await saldo.reservar({ empenhoId: id, cotacaoId: cot, valorCentavos: 10_00 })).toBe(
      true,
    );
    expect(await saldo.reservar({ empenhoId: id, cotacaoId: cot, valorCentavos: 10_00 })).toBe(
      false,
    );
    expect((await lido(id))?.comprometidoCentavos).toBe(10_00);
  });

  it('empenho de outro exercício, inativo ou vencido não é elegível', async () => {
    const outroAno = await empenho(100_00, { exercicio: ano - 1 });
    const inativo = await empenho(100_00, { ativo: false });
    const vencido = await empenho(100_00, { vigenciaFim: '2000-01-01' });
    const cot = String(new Types.ObjectId());

    for (const id of [outroAno, inativo, vencido]) {
      expect(await saldo.reservar({ empenhoId: id, cotacaoId: cot, valorCentavos: 1 })).toBe(false);
    }
    expect(await saldo.haSaldoElegivel(1)).toBe(false);
  });

  it('liberar devolve o valor uma vez só', async () => {
    const id = await empenho(100_00);
    const cot = String(new Types.ObjectId());
    await saldo.reservar({ empenhoId: id, cotacaoId: cot, valorCentavos: 40_00 });

    expect(await saldo.liberar(cot, id)).toEqual({ empenhoId: id, valorCentavos: 40_00 });
    expect(await saldo.liberar(cot, id)).toBeNull();
    expect((await lido(id))?.comprometidoCentavos).toBe(0);
  });

  it('ajustar troca a reserva pelo executado e devolve a diferença', async () => {
    const id = await empenho(100_00);
    const cot = String(new Types.ObjectId());
    await saldo.reservar({ empenhoId: id, cotacaoId: cot, valorCentavos: 40_00 });

    expect(await saldo.ajustar(cot, id, 25_00)).toBe(15_00);
    const e = await lido(id);
    expect(e?.comprometidoCentavos).toBe(25_00);
    expect(e?.reservas[0]?.valorCentavos).toBe(25_00);
  });

  it('anulação que deixaria o líquido abaixo do comprometido é recusada', async () => {
    const id = await empenho(100_00);
    await saldo.reservar({
      empenhoId: id,
      cotacaoId: String(new Types.ObjectId()),
      valorCentavos: 80_00,
    });
    const porUserId = String(new Types.ObjectId());

    expect(
      await saldo.registrarMovimento({
        empenhoId: id,
        tipo: 'anulacao',
        valorCentavos: 30_00,
        ato: 'SEI 1',
        porUserId,
      }),
    ).toBe(false);
    expect(
      await saldo.registrarMovimento({
        empenhoId: id,
        tipo: 'anulacao',
        valorCentavos: 20_00,
        ato: 'SEI 2',
        porUserId,
      }),
    ).toBe(true);
    expect((await lido(id))?.valorLiquidoCentavos).toBe(80_00);
  });

  it('conciliação libera a reserva órfã (queda entre a reserva e a cotação) e mantém a autorizada', async () => {
    // Arrange: a órfã aponta uma cotação que nunca chegou a `autorizada`.
    const id = await empenho(100_00);
    const orfa = new Types.ObjectId();
    const autorizada = await CotacaoMaterialModel.create({
      numero: `COT-T-${String(new Types.ObjectId()).slice(-6)}`,
      chamadoId: new Types.ObjectId(),
      situacao: 'autorizada',
      emTramite: true,
      // Autorizada sempre tem o empenho gravado no mesmo ato.
      empenhoId: new Types.ObjectId(id),
      itens: [{ descricao: 'x', unidade: 'un', quantidade: 1, motivo: 'y' }],
      diagnosticadoPorUserId: new Types.ObjectId(),
      diagnosticadoEm: new Date(),
    });
    const antes = new Date(Date.now() - 60 * 60 * 1000);
    await saldo.reservar({
      empenhoId: id,
      cotacaoId: String(orfa),
      valorCentavos: 30_00,
      agora: antes,
    });
    await saldo.reservar({
      empenhoId: id,
      cotacaoId: String(autorizada._id),
      valorCentavos: 20_00,
      agora: antes,
    });

    // Act
    const r = await saldo.conciliarReservas();

    // Assert
    expect(r.liberadas).toBe(1);
    const e = await lido(id);
    expect(e?.comprometidoCentavos).toBe(20_00);
    expect(e?.reservas.map((x) => String(x.cotacaoId))).toEqual([String(autorizada._id)]);
    // A órfã não tem cotação, então não há trilha onde gravar o evento.
    expect(await CotacaoMaterialEventoModel.countDocuments({ cotacaoId: orfa })).toBe(0);
  });

  it('conciliação libera reserva da cotação autorizada que está no empenho errado (AC-8)', async () => {
    // Arrange: a cotação foi autorizada no E1; sobrou uma reserva dela no E2.
    const e1 = await empenho(100_00);
    const e2 = await empenho(100_00);
    const cot = await CotacaoMaterialModel.create({
      numero: `COT-T-${String(new Types.ObjectId()).slice(-6)}`,
      chamadoId: new Types.ObjectId(),
      situacao: 'autorizada',
      emTramite: true,
      empenhoId: new Types.ObjectId(e1),
      itens: [{ descricao: 'x', unidade: 'un', quantidade: 1, motivo: 'y' }],
      diagnosticadoPorUserId: new Types.ObjectId(),
      diagnosticadoEm: new Date(),
    });
    const antes = new Date(Date.now() - 60 * 60 * 1000);
    await saldo.reservar({
      empenhoId: e1,
      cotacaoId: String(cot._id),
      valorCentavos: 20_00,
      agora: antes,
    });
    await saldo.reservar({
      empenhoId: e2,
      cotacaoId: String(cot._id),
      valorCentavos: 20_00,
      agora: antes,
    });

    // Act
    const r = await saldo.conciliarReservas();

    // Assert: fica só a reserva do empenho da cotação.
    expect(r.liberadas).toBe(1);
    expect((await lido(e1))?.comprometidoCentavos).toBe(20_00);
    expect((await lido(e2))?.comprometidoCentavos).toBe(0);
  });

  it('conciliação não mexe em reserva recente (menos de 10 minutos)', async () => {
    const id = await empenho(100_00);
    await saldo.reservar({
      empenhoId: id,
      cotacaoId: String(new Types.ObjectId()),
      valorCentavos: 30_00,
    });

    expect((await saldo.conciliarReservas()).liberadas).toBe(0);
  });
});
