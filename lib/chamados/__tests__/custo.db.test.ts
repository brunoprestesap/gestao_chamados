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
 * As escritas de custo do chamado contra o MongoDB de verdade (spec 0018): o
 * teto de 50 com gravações simultâneas, o status travado, a ordem das
 * mensagens, a cópia no histórico e o valor final da cotação.
 *
 * covers: AC-1, AC-2, AC-2a, AC-3, AC-4, AC-5, AC-6
 */

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('custo do chamado, contra o Mongo', () => {
  let custo: typeof import('../custo');
  let ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  let ChamadoHistoryModel: typeof import('@/models/ChamadoHistory').ChamadoHistoryModel;
  let CotacaoModel: typeof import('@/models/Cotacao').CotacaoModel;
  let todos: ModelDeTeste[];

  const userId = String(new Types.ObjectId());

  beforeAll(async () => {
    custo = await import('../custo');
    ({ ChamadoModel } = await import('@/models/Chamado'));
    ({ ChamadoHistoryModel } = await import('@/models/ChamadoHistory'));
    ({ CotacaoModel } = await import('@/models/Cotacao'));
    todos = [ChamadoModel, ChamadoHistoryModel, CotacaoModel] as unknown as ModelDeTeste[];
    await conectarMongoDeTeste(todos, 'severino_test_custo_chamado');
  });

  beforeEach(async () => {
    await limparColecoes(todos);
  });

  afterAll(async () => {
    await desconectarMongoDeTeste();
  });

  async function chamado(status: string, materiais: object[] = []): Promise<string> {
    const _id = new Types.ObjectId();
    await ChamadoModel.collection.insertOne({
      _id,
      ticket_number: `CST-${String(_id)}`,
      status,
      ...(materiais.length > 0 && { materiaisForaCotacao: materiais }),
    });
    return String(_id);
  }

  const item = (n: number) => ({
    _id: new Types.ObjectId(),
    descricao: `Item ${n}`,
    quantidade: 1,
    valorUnitario: 1,
    criadoPorUserId: new Types.ObjectId(),
    criadoEm: new Date(),
  });

  it('lança o item e grava o histórico só da gestão (AC-1, AC-6)', async () => {
    // Arrange
    const id = await chamado('em atendimento');

    // Act
    const r = await custo.adicionarMaterial(
      { chamadoId: id, descricao: 'Cabo', quantidade: 2.5, valorUnitario: 10 },
      userId,
    );

    // Assert
    expect(r.ok).toBe(true);
    const doc = await ChamadoModel.findById(id).lean();
    expect(doc?.materiaisForaCotacao).toHaveLength(1);
    expect(doc?.materiaisForaCotacao?.[0]).toMatchObject({ descricao: 'Cabo', quantidade: 2.5 });
    const h = await ChamadoHistoryModel.find({ chamadoId: id }).lean();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ action: 'custo_material_lancado' });
    expect(h[0].observacoes.replace(/\s/g, ' ')).toBe('Cabo: 2,5 × R$ 10,00 = R$ 25,00');
    expect(h[0].statusAnterior).toBeUndefined();
  });

  it('com 49 itens e duas gravações ao mesmo tempo, só uma passa (AC-4)', async () => {
    // Arrange
    const id = await chamado(
      'concluído',
      Array.from({ length: 49 }, (_, i) => item(i)),
    );
    const novo = (d: string) => ({ chamadoId: id, descricao: d, quantidade: 1, valorUnitario: 1 });

    // Act
    const [a, b] = await Promise.all([
      custo.adicionarMaterial(novo('Primeiro'), userId),
      custo.adicionarMaterial(novo('Segundo'), userId),
    ]);

    // Assert
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const recusada = a.ok ? b : a;
    expect(recusada).toEqual({ ok: false, error: 'Este chamado já tem 50 itens de material.' });
    const doc = await ChamadoModel.findById(id).lean();
    expect(doc?.materiaisForaCotacao).toHaveLength(50);
  });

  it('chamado encerrado recusa as quatro ações sem gravar nada (AC-3)', async () => {
    // Arrange
    const existente = item(1);
    const id = await chamado('encerrado', [existente]);
    const itemId = String(existente._id);
    const cot = await CotacaoModel.collection.insertOne({
      chamadoId: new Types.ObjectId(id),
      status: 'aprovada',
      valorEstimado: 100,
    });
    const travado = { ok: false, error: 'O custo deste chamado não pode mais ser alterado.' };

    // Act + Assert
    expect(
      await custo.adicionarMaterial(
        { chamadoId: id, descricao: 'Fita', quantidade: 1, valorUnitario: 1 },
        userId,
      ),
    ).toEqual(travado);
    expect(
      await custo.editarMaterial(
        { chamadoId: id, itemId, descricao: 'Fita', quantidade: 1, valorUnitario: 1 },
        userId,
      ),
    ).toEqual(travado);
    expect(await custo.removerMaterial({ chamadoId: id, itemId }, userId)).toEqual(travado);
    expect(
      await custo.informarValorFinalCotacao(
        { cotacaoId: String(cot.insertedId), valorFinal: 50 },
        userId,
      ),
    ).toEqual(travado);
    expect(await ChamadoHistoryModel.countDocuments()).toBe(0);
  });

  it('a mensagem segue a ordem chamado, status, item (AC-2a)', async () => {
    // Arrange
    const id = await chamado('em atendimento');
    const outro = String(new Types.ObjectId());

    // Act + Assert
    expect(await custo.removerMaterial({ chamadoId: outro, itemId: outro }, userId)).toEqual({
      ok: false,
      error: 'Chamado não encontrado.',
    });
    expect(await custo.removerMaterial({ chamadoId: id, itemId: outro }, userId)).toEqual({
      ok: false,
      error: 'Este item não existe mais. Recarregue o chamado.',
    });
  });

  it('edita só os três campos e remove guardando a cópia (AC-2, AC-6)', async () => {
    // Arrange
    const existente = item(1);
    const id = await chamado('aguardando_terceiros', [existente]);
    const itemId = String(existente._id);

    // Act
    const editado = await custo.editarMaterial(
      { chamadoId: id, itemId, descricao: 'Disjuntor', quantidade: 3, valorUnitario: 45.5 },
      userId,
    );
    const removido = await custo.removerMaterial({ chamadoId: id, itemId }, userId);

    // Assert
    expect(editado.ok && removido.ok).toBe(true);
    const doc = await ChamadoModel.findById(id).lean();
    expect(doc?.materiaisForaCotacao).toEqual([]);
    const h = await ChamadoHistoryModel.find({ chamadoId: id }).sort({ createdAt: 1 }).lean();
    expect(h.map((x) => x.action)).toEqual(['custo_material_editado', 'custo_material_removido']);
    expect(h[0].observacoes.replace(/\s/g, ' ')).toBe(
      'de Item 1: 1 × R$ 1,00 = R$ 1,00 para Disjuntor: 3 × R$ 45,50 = R$ 136,50',
    );
    expect(h[1].observacoes.replace(/\s/g, ' ')).toBe('Disjuntor: 3 × R$ 45,50 = R$ 136,50');
  });

  it('a edição não muda quem lançou nem quando (AC-2)', async () => {
    // Arrange
    const existente = item(1);
    const id = await chamado('concluído', [existente]);

    // Act
    await custo.editarMaterial(
      {
        chamadoId: id,
        itemId: String(existente._id),
        descricao: 'Outro',
        quantidade: 2,
        valorUnitario: 2,
      },
      userId,
    );

    // Assert
    const doc = await ChamadoModel.findById(id).lean();
    const i = doc?.materiaisForaCotacao?.[0];
    expect(String(i?.criadoPorUserId)).toBe(String(existente.criadoPorUserId));
    expect(i?.criadoEm.getTime()).toBe(existente.criadoEm.getTime());
  });

  it('valor final: aprovada aceita zero e null; enviada recusa (AC-5, AC-6)', async () => {
    // Arrange
    const id = await chamado('em atendimento');
    const chamadoId = new Types.ObjectId(id);
    const aprovada = await CotacaoModel.collection.insertOne({
      chamadoId,
      status: 'aprovada',
      valorEstimado: 300,
    });
    const enviada = await CotacaoModel.collection.insertOne({
      chamadoId,
      status: 'enviada',
      valorEstimado: 10,
    });
    const cotacaoId = String(aprovada.insertedId);

    // Act
    const zero = await custo.informarValorFinalCotacao({ cotacaoId, valorFinal: 0 }, userId);
    const limpo = await custo.informarValorFinalCotacao({ cotacaoId, valorFinal: null }, userId);
    const naoAprovada = await custo.informarValorFinalCotacao(
      { cotacaoId: String(enviada.insertedId), valorFinal: 5 },
      userId,
    );

    // Assert
    expect(zero.ok && limpo.ok).toBe(true);
    expect(naoAprovada).toEqual({ ok: false, error: 'Só cotação aprovada tem valor final.' });
    const c = await CotacaoModel.findById(cotacaoId).lean();
    expect(c?.valorFinal).toBeNull();
    expect(String(c?.valorFinalPorUserId)).toBe(userId);
    const h = await ChamadoHistoryModel.find({ chamadoId }).sort({ createdAt: 1 }).lean();
    expect(h.map((x) => x.observacoes.replace(/\s/g, ' '))).toEqual([
      'Valor final de estimado para R$ 0,00',
      'Valor final de R$ 0,00 para estimado',
    ]);
  });

  it('sem corrida, o 51º item também recebe a mensagem do teto (AC-4)', async () => {
    // Arrange
    const id = await chamado(
      'em atendimento',
      Array.from({ length: 50 }, (_, i) => item(i)),
    );

    // Act
    const r = await custo.adicionarMaterial(
      { chamadoId: id, descricao: 'Excedente', quantidade: 1, valorUnitario: 1 },
      userId,
    );

    // Assert
    expect(r).toEqual({ ok: false, error: 'Este chamado já tem 50 itens de material.' });
    expect(await ChamadoHistoryModel.countDocuments()).toBe(0);
  });

  it('status travado vence o teto e o item na ordem das mensagens (AC-2a)', async () => {
    // Arrange: cancelado e cheio
    const id = await chamado(
      'cancelado',
      Array.from({ length: 50 }, (_, i) => item(i)),
    );

    // Act
    const lancar = await custo.adicionarMaterial(
      { chamadoId: id, descricao: 'Fita', quantidade: 1, valorUnitario: 1 },
      userId,
    );
    const editar = await custo.editarMaterial(
      {
        chamadoId: id,
        itemId: String(new Types.ObjectId()),
        descricao: 'Fita',
        quantidade: 1,
        valorUnitario: 1,
      },
      userId,
    );

    // Assert
    const travado = { ok: false, error: 'O custo deste chamado não pode mais ser alterado.' };
    expect(lancar).toEqual(travado);
    expect(editar).toEqual(travado);
  });

  it('chamado reaberto volta a aceitar lançamento (AC-3)', async () => {
    // Arrange
    const id = await chamado('encerrado');
    const novo = { chamadoId: id, descricao: 'Fita', quantidade: 1, valorUnitario: 1 };
    expect((await custo.adicionarMaterial(novo, userId)).ok).toBe(false);

    // Act
    await ChamadoModel.collection.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { status: 'em atendimento' } },
    );

    // Assert
    expect((await custo.adicionarMaterial(novo, userId)).ok).toBe(true);
  });

  it.each(['aberto', 'validado', 'recusado'])(
    'chamado %s também não aceita lançamento (AC-3)',
    async (status) => {
      const id = await chamado(status);
      expect(
        await custo.adicionarMaterial(
          { chamadoId: id, descricao: 'Fita', quantidade: 1, valorUnitario: 1 },
          userId,
        ),
      ).toEqual({ ok: false, error: 'O custo deste chamado não pode mais ser alterado.' });
    },
  );

  it('o item lançado grava quem lançou e quando (AC-1)', async () => {
    // Arrange
    const id = await chamado('aguardando_solicitante');
    const antes = Date.now();

    // Act
    const r = await custo.adicionarMaterial(
      { chamadoId: id, descricao: 'Cabo', quantidade: 1, valorUnitario: 1 },
      userId,
    );

    // Assert
    const doc = await ChamadoModel.findById(id).lean();
    const i = doc?.materiaisForaCotacao?.[0];
    expect(r).toEqual({ ok: true, itemId: String(i?._id) });
    expect(String(i?.criadoPorUserId)).toBe(userId);
    expect(i?.criadoEm.getTime()).toBeGreaterThanOrEqual(antes);
  });

  it('valor final: cotação inexistente, recusada e a troca de 280 para 250 (AC-5, AC-6)', async () => {
    // Arrange
    const id = await chamado('concluído');
    const chamadoId = new Types.ObjectId(id);
    const aprovada = await CotacaoModel.collection.insertOne({
      chamadoId,
      status: 'aprovada',
      valorEstimado: 300,
    });
    const recusada = await CotacaoModel.collection.insertOne({
      chamadoId,
      status: 'recusada',
      valorEstimado: 999,
    });
    const cotacaoId = String(aprovada.insertedId);

    // Act
    const inexistente = await custo.informarValorFinalCotacao(
      { cotacaoId: String(new Types.ObjectId()), valorFinal: 1 },
      userId,
    );
    const naRecusada = await custo.informarValorFinalCotacao(
      { cotacaoId: String(recusada.insertedId), valorFinal: 1 },
      userId,
    );
    await custo.informarValorFinalCotacao({ cotacaoId, valorFinal: 280 }, userId);
    await custo.informarValorFinalCotacao({ cotacaoId, valorFinal: 250 }, userId);

    // Assert
    expect(inexistente).toEqual({ ok: false, error: 'Cotação não encontrada.' });
    expect(naRecusada).toEqual({ ok: false, error: 'Só cotação aprovada tem valor final.' });
    const h = await ChamadoHistoryModel.find({ chamadoId }).sort({ createdAt: 1 }).lean();
    expect(h.map((x) => x.observacoes.replace(/\s/g, ' '))).toEqual([
      'Valor final de estimado para R$ 280,00',
      'Valor final de R$ 280,00 para R$ 250,00',
    ]);
    expect(h.every((x) => x.statusAnterior === undefined && x.statusNovo === undefined)).toBe(true);
  });

  it('nenhuma ação de custo muda o status do chamado (AC-6)', async () => {
    // Arrange
    const existente = item(1);
    const id = await chamado('aguardando_terceiros', [existente]);

    // Act
    await custo.adicionarMaterial(
      { chamadoId: id, descricao: 'Fita', quantidade: 1, valorUnitario: 1 },
      userId,
    );
    await custo.removerMaterial({ chamadoId: id, itemId: String(existente._id) }, userId);

    // Assert
    expect((await ChamadoModel.findById(id).lean())?.status).toBe('aguardando_terceiros');
  });
});
