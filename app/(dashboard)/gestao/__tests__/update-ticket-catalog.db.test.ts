import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  conectarMongoDeTeste,
  desconectarMongoDeTeste,
  limparColecoes,
  type ModelDeTeste,
  temMongoDeTeste,
} from '@/tests/mongo-test-env';

/**
 * `updateTicketCatalogAction` com o MongoDB de verdade (scope, feature 29): o
 * histórico `catalogo_atualizado` passa no enum, e se gravar o histórico falhar
 * o chamado volta ao estado de antes, sem mudança sem registro.
 *
 * Roda só com `MONGO_TEST_URI` (ver `tests/mongo-test-env.ts`).
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('updateTicketCatalogAction, contra o Mongo', () => {
  let updateTicketCatalogAction: typeof import('../actions').updateTicketCatalogAction;
  let ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  let ChamadoHistoryModel: typeof import('@/models/ChamadoHistory').ChamadoHistoryModel;
  let todos: ModelDeTeste[];

  const prepostoId = new Types.ObjectId();
  const subtypeId = new Types.ObjectId();
  const catalogServiceId = new Types.ObjectId();

  beforeAll(async () => {
    vi.doMock('@/lib/dal', () => ({
      requireManager: async () => ({ userId: String(prepostoId), role: 'Preposto' }),
    }));
    ({ updateTicketCatalogAction } = await import('../actions'));
    ({ ChamadoModel } = await import('@/models/Chamado'));
    ({ ChamadoHistoryModel } = await import('@/models/ChamadoHistory'));
    todos = [
      ChamadoModel as unknown as ModelDeTeste,
      ChamadoHistoryModel as unknown as ModelDeTeste,
    ];
    await conectarMongoDeTeste(todos, 'severino_test_update_catalogo');
  });

  beforeEach(async () => {
    await limparColecoes(todos);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  /** Chamado do chat, validado e sem serviço do catálogo (o caso legado). */
  async function chamadoSemServico(): Promise<Types.ObjectId> {
    const _id = new Types.ObjectId();
    await ChamadoModel.collection.insertOne({
      _id,
      ticket_number: `CAT-${String(_id)}`,
      status: 'validado',
      canalAbertura: 'chat',
    });
    return _id;
  }

  const entrada = (ticketId: Types.ObjectId) => ({
    ticketId: String(ticketId),
    subtypeId: String(subtypeId),
    catalogServiceId: String(catalogServiceId),
  });

  it('grava o serviço e o histórico catalogo_atualizado', async () => {
    // Arrange
    const id = await chamadoSemServico();

    // Act
    const r = await updateTicketCatalogAction(entrada(id));

    // Assert
    expect(r).toEqual({ ok: true });
    const chamado = await ChamadoModel.collection.findOne({ _id: id });
    expect(String(chamado?.catalogServiceId)).toBe(String(catalogServiceId));
    expect(String(chamado?.subtypeId)).toBe(String(subtypeId));
    const historico = await ChamadoHistoryModel.find({ chamadoId: id }).lean();
    expect(historico).toHaveLength(1);
    expect(historico[0].action).toBe('catalogo_atualizado');
    expect(String(historico[0].userId)).toBe(String(prepostoId));
    // Sem status: a linha do tempo não pode dizer "de Validado para Validado"
    expect(historico[0].statusAnterior ?? null).toBeNull();
    expect(historico[0].statusNovo ?? null).toBeNull();
  });

  it('desfaz a mudança quando o histórico falha', async () => {
    // Arrange
    const id = await chamadoSemServico();
    vi.spyOn(ChamadoHistoryModel, 'create').mockRejectedValueOnce(new Error('banco caiu'));

    // Act
    const r = await updateTicketCatalogAction(entrada(id));

    // Assert: erro fixo para a tela, e o chamado como estava
    expect(r).toEqual({ ok: false, error: 'Erro ao atualizar catálogo. Tente novamente.' });
    const chamado = await ChamadoModel.collection.findOne({ _id: id });
    expect(chamado).not.toHaveProperty('catalogServiceId');
    expect(chamado).not.toHaveProperty('subtypeId');
    expect(await ChamadoHistoryModel.countDocuments({ chamadoId: id })).toBe(0);
  });

  it('a nova tentativa depois da falha funciona', async () => {
    // Arrange
    const id = await chamadoSemServico();
    vi.spyOn(ChamadoHistoryModel, 'create').mockRejectedValueOnce(new Error('banco caiu'));
    await updateTicketCatalogAction(entrada(id));

    // Act
    const r = await updateTicketCatalogAction(entrada(id));

    // Assert
    expect(r).toEqual({ ok: true });
    expect(await ChamadoHistoryModel.countDocuments({ chamadoId: id })).toBe(1);
  });

  it('desfaz devolvendo o subtipo que o chamado já tinha', async () => {
    // Arrange: chamado do chat que nasceu com subtipo, mas sem serviço
    const id = await chamadoSemServico();
    const subtipoOriginal = new Types.ObjectId();
    await ChamadoModel.collection.updateOne({ _id: id }, { $set: { subtypeId: subtipoOriginal } });
    vi.spyOn(ChamadoHistoryModel, 'create').mockRejectedValueOnce(new Error('banco caiu'));

    // Act
    const r = await updateTicketCatalogAction(entrada(id));

    // Assert
    expect(r.ok).toBe(false);
    const chamado = await ChamadoModel.collection.findOne({ _id: id });
    expect(String(chamado?.subtypeId)).toBe(String(subtipoOriginal));
    expect(chamado).not.toHaveProperty('catalogServiceId');
  });

  it('recusa entrada com id inválido sem tocar no banco', async () => {
    // Arrange
    const id = await chamadoSemServico();

    // Act
    const r = await updateTicketCatalogAction({ ...entrada(id), catalogServiceId: 'nao-e-id' });

    // Assert
    expect(r.ok).toBe(false);
    expect(await ChamadoModel.collection.findOne({ _id: id })).not.toHaveProperty(
      'catalogServiceId',
    );
  });

  it('responde chamado não encontrado', async () => {
    // Act
    const r = await updateTicketCatalogAction(entrada(new Types.ObjectId()));

    // Assert
    expect(r).toEqual({ ok: false, error: 'Chamado não encontrado.' });
  });

  it('recusa chamado que não está validado', async () => {
    // Arrange
    const id = await chamadoSemServico();
    await ChamadoModel.collection.updateOne({ _id: id }, { $set: { status: 'em atendimento' } });

    // Act
    const r = await updateTicketCatalogAction(entrada(id));

    // Assert
    expect(r.ok).toBe(false);
    expect(await ChamadoHistoryModel.countDocuments({ chamadoId: id })).toBe(0);
  });

  it('recusa chamado que já tem serviço do catálogo', async () => {
    // Arrange
    const id = await chamadoSemServico();
    const servicoAtual = new Types.ObjectId();
    await ChamadoModel.collection.updateOne(
      { _id: id },
      { $set: { catalogServiceId: servicoAtual } },
    );

    // Act
    const r = await updateTicketCatalogAction(entrada(id));

    // Assert
    expect(r).toEqual({ ok: false, error: 'Chamado já possui serviço catalogado.' });
    const chamado = await ChamadoModel.collection.findOne({ _id: id });
    expect(String(chamado?.catalogServiceId)).toBe(String(servicoAtual));
  });

  it('não sobrescreve um serviço gravado por outra gestão no meio do caminho', async () => {
    // Arrange: a leitura vê o chamado sem serviço, mas outro Preposto grava antes
    const id = await chamadoSemServico();
    const outroServico = new Types.ObjectId();
    const findById = ChamadoModel.findById.bind(ChamadoModel);
    vi.spyOn(ChamadoModel, 'findById').mockImplementationOnce(((...args: unknown[]) => {
      const consulta = (findById as (...a: unknown[]) => unknown)(...args) as {
        then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise<unknown>;
      };
      return {
        then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
          consulta
            .then(async (doc: unknown) => {
              await ChamadoModel.collection.updateOne(
                { _id: id },
                { $set: { catalogServiceId: outroServico } },
              );
              return doc;
            })
            .then(ok, erro),
      };
    }) as unknown as typeof ChamadoModel.findById);

    // Act
    const r = await updateTicketCatalogAction(entrada(id));

    // Assert
    expect(r.ok).toBe(false);
    const chamado = await ChamadoModel.collection.findOne({ _id: id });
    expect(String(chamado?.catalogServiceId)).toBe(String(outroServico));
    expect(await ChamadoHistoryModel.countDocuments({ chamadoId: id })).toBe(0);
  });
});
