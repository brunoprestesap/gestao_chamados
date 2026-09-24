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
 * `updateTicketPriorityAction` contra o Mongo de verdade (spec 0007, AC-11,
 * AC-12): a corrida entre a correção e uma atribuição concorrente só se prova
 * com o banco de verdade, não com mock.
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/realtime-emit', () => ({ emitToRoom: vi.fn().mockResolvedValue(undefined) }));

const rodar = temMongoDeTeste ? describe : describe.skip;

rodar('updateTicketPriorityAction, contra o Mongo', () => {
  let updateTicketPriorityAction: typeof import('../actions').updateTicketPriorityAction;
  let ChamadoModel: typeof import('@/models/Chamado').ChamadoModel;
  let ChamadoHistoryModel: typeof import('@/models/ChamadoHistory').ChamadoHistoryModel;
  let SlaConfigModel: typeof import('@/models/SlaConfig').SlaConfigModel;
  let SlaEscalationModel: typeof import('@/models/SlaEscalation').SlaEscalationModel;
  let UserModel: typeof import('@/models/user.model').UserModel;
  let UnitModel: typeof import('@/models/unit').UnitModel;
  let todos: ModelDeTeste[];

  const prepostoId = new Types.ObjectId();
  const tecnicoId = new Types.ObjectId();
  const solicitanteId = new Types.ObjectId();
  const unitId = new Types.ObjectId();

  // Roda entre a leitura do `classifiedAt` e a gravação atômica: é a janela
  // onde uma implementação em dois passos (ler o status, depois gravar)
  // deixaria uma atribuição concorrente passar.
  let antesDoSnapshot: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    vi.doMock('@/lib/dal', () => ({
      requireManager: async () => ({ userId: String(prepostoId), role: 'Preposto' }),
    }));
    vi.doMock('@/lib/sla-snapshot', async () => {
      const real = await vi.importActual<typeof import('@/lib/sla-snapshot')>('@/lib/sla-snapshot');
      return {
        ...real,
        montarSnapshotSla: async (...args: Parameters<typeof real.montarSnapshotSla>) => {
          if (antesDoSnapshot) await antesDoSnapshot();
          return real.montarSnapshotSla(...args);
        },
      };
    });
    ({ updateTicketPriorityAction } = await import('../actions'));
    ({ ChamadoModel } = await import('@/models/Chamado'));
    ({ ChamadoHistoryModel } = await import('@/models/ChamadoHistory'));
    ({ SlaConfigModel } = await import('@/models/SlaConfig'));
    ({ SlaEscalationModel } = await import('@/models/SlaEscalation'));
    ({ UserModel } = await import('@/models/user.model'));
    ({ UnitModel } = await import('@/models/unit'));

    todos = [
      ChamadoModel,
      ChamadoHistoryModel,
      SlaConfigModel,
      SlaEscalationModel,
      UserModel,
      UnitModel,
    ] as never;
    await conectarMongoDeTeste(todos, 'severino_test_update_ticket_priority');
  }, 60_000);

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await UnitModel.create({ _id: unitId, name: 'Fórum' } as never);
    await UserModel.create([
      { _id: prepostoId, name: 'Ana', username: 'ana', role: 'Preposto' },
      { _id: tecnicoId, name: 'João', username: 'joao', role: 'Técnico' },
      { _id: solicitanteId, name: 'Maria', username: 'maria', role: 'Solicitante' },
    ] as never);
    await SlaConfigModel.create([
      { priority: 'NORMAL', responseTargetMinutes: 120, resolutionTargetMinutes: 480 },
      { priority: 'ALTA', responseTargetMinutes: 30, resolutionTargetMinutes: 120 },
      { priority: 'EMERGENCIAL', responseTargetMinutes: 15, resolutionTargetMinutes: 60 },
    ] as never);
  });

  afterEach(async () => {
    antesDoSnapshot = null;
    vi.restoreAllMocks();
    await limparColecoes(todos);
  });

  afterAll(async () => {
    vi.doUnmock('@/lib/dal');
    vi.doUnmock('@/lib/sla-snapshot');
    await desconectarMongoDeTeste();
  });

  async function chamadoValidado() {
    return ChamadoModel.create({
      ticket_number: `CHM-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      titulo: 'Ar-condicionado com defeito',
      status: 'validado',
      solicitanteId,
      unitId,
      localExato: 'Sala 10',
      tipoServico: 'Ar-Condicionado',
      naturezaAtendimento: 'Padrão',
      subtypeId: new Types.ObjectId(),
      catalogServiceId: new Types.ObjectId(),
      finalPriority: 'NORMAL',
      classifiedAt: new Date(),
      classificationNotes: 'Classificação original.',
    } as never);
  }

  it('corrige a prioridade e recalcula o SLA a partir do classifiedAt original', async () => {
    const chamado = await chamadoValidado();

    const result = await updateTicketPriorityAction({
      chamadoId: String(chamado._id),
      finalPriority: 'ALTA',
      classificationNotes: 'É mais grave.',
    });

    expect(result).toEqual({ ok: true });
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(depois?.finalPriority).toBe('ALTA');
    expect(depois?.sla?.responseTargetMinutes).toBe(30);
    expect(depois?.classificationNotes).toContain('Classificação original.');
    expect(depois?.classificationNotes).toContain('É mais grave.');

    const historico = await ChamadoHistoryModel.find({ chamadoId: chamado._id }).lean();
    expect(historico.some((h) => h.action === 'classificacao')).toBe(true);
  });

  it('zera os marcadores de breach e apaga as escalações dos prazos antigos', async () => {
    const chamado = await chamadoValidado();
    const antes = new Date(Date.now() - 60_000);
    await ChamadoModel.updateOne(
      { _id: chamado._id },
      { $set: { 'sla.responseBreachedAt': antes, 'sla.resolutionBreachedAt': antes } },
    );
    await SlaEscalationModel.create([
      { chamadoId: chamado._id, type: 'warning_80', level: 'manager', notifiedAt: antes },
      { chamadoId: chamado._id, type: 'breach_response', level: 'admin', notifiedAt: antes },
    ] as never);
    const outroChamado = new Types.ObjectId();
    await SlaEscalationModel.create({
      chamadoId: outroChamado,
      type: 'warning_80',
      level: 'manager',
      notifiedAt: antes,
    } as never);

    const result = await updateTicketPriorityAction({
      chamadoId: String(chamado._id),
      finalPriority: 'ALTA',
      classificationNotes: '',
    });

    expect(result).toEqual({ ok: true });
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(depois?.sla?.responseBreachedAt ?? null).toBeNull();
    expect(depois?.sla?.resolutionBreachedAt ?? null).toBeNull();
    await expect(SlaEscalationModel.countDocuments({ chamadoId: chamado._id })).resolves.toBe(0);
    await expect(SlaEscalationModel.countDocuments({ chamadoId: outroChamado })).resolves.toBe(1);
  });

  it('correção recusada não mexe no breach nem nas escalações', async () => {
    const chamado = await chamadoValidado();
    const antes = new Date(Date.now() - 60_000);
    await ChamadoModel.updateOne(
      { _id: chamado._id },
      { $set: { assignedToUserId: tecnicoId, 'sla.responseBreachedAt': antes } },
    );
    await SlaEscalationModel.create({
      chamadoId: chamado._id,
      type: 'breach_response',
      level: 'admin',
      notifiedAt: antes,
    } as never);

    const result = await updateTicketPriorityAction({
      chamadoId: String(chamado._id),
      finalPriority: 'ALTA',
      classificationNotes: '',
    });

    expect(result.ok).toBe(false);
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(depois?.sla?.responseBreachedAt).toEqual(antes);
    await expect(SlaEscalationModel.countDocuments({ chamadoId: chamado._id })).resolves.toBe(1);
  });

  it('duas correções intercaladas: as duas aplicam e nenhuma observação se perde (AC-11)', async () => {
    const chamado = await chamadoValidado();

    // A segunda correção roda inteira enquanto a primeira está entre a leitura
    // e a gravação: é o pior caso para quem montasse as notas a partir da
    // leitura feita antes.
    antesDoSnapshot = async () => {
      antesDoSnapshot = null;
      const segunda = await updateTicketPriorityAction({
        chamadoId: String(chamado._id),
        finalPriority: 'EMERGENCIAL',
        classificationNotes: 'Segunda correção.',
      });
      expect(segunda).toEqual({ ok: true });
    };

    const primeira = await updateTicketPriorityAction({
      chamadoId: String(chamado._id),
      finalPriority: 'ALTA',
      classificationNotes: 'Primeira correção.',
    });

    expect(primeira).toEqual({ ok: true });
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(depois?.finalPriority).toBe('ALTA');
    expect(depois?.classificationNotes).toContain('Classificação original.');
    expect(depois?.classificationNotes).toContain('Correção: Segunda correção.');
    expect(depois?.classificationNotes).toContain('Correção: Primeira correção.');
  });

  it('observação começando com $ é gravada como texto, nunca lida como campo', async () => {
    const chamado = await chamadoValidado();

    const result = await updateTicketPriorityAction({
      chamadoId: String(chamado._id),
      finalPriority: 'ALTA',
      classificationNotes: '$titulo',
    });

    expect(result).toEqual({ ok: true });
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(depois?.classificationNotes).toContain('Correção: $titulo');
  });

  it('atribuição que chega entre a leitura e a gravação: a correção é recusada (AC-12)', async () => {
    const chamado = await chamadoValidado();

    antesDoSnapshot = async () => {
      await ChamadoModel.updateOne(
        { _id: chamado._id },
        { $set: { assignedToUserId: tecnicoId, assignedAt: new Date() } },
      );
    };

    const correcao = await updateTicketPriorityAction({
      chamadoId: String(chamado._id),
      finalPriority: 'ALTA',
      classificationNotes: '',
    });

    expect(correcao.ok).toBe(false);
    if (!correcao.ok) expect(correcao.error).toContain('técnico');
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(depois?.finalPriority).toBe('NORMAL');
    expect(depois?.sla?.priority ?? null).toBeNull();
    expect(String(depois?.assignedToUserId)).toBe(String(tecnicoId));
  });

  it('recusa corrigir um chamado já com técnico atribuído', async () => {
    const chamado = await chamadoValidado();
    await ChamadoModel.updateOne(
      { _id: chamado._id },
      { $set: { assignedToUserId: tecnicoId, assignedAt: new Date() } },
    );

    const result = await updateTicketPriorityAction({
      chamadoId: String(chamado._id),
      finalPriority: 'ALTA',
      classificationNotes: '',
    });

    expect(result.ok).toBe(false);
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(depois?.finalPriority).toBe('NORMAL');
  });
});
