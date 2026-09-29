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
 * `updateTicketPriorityAction` contra o Mongo de verdade (spec 0007, AC-11;
 * spec 0009, AC-7 a AC-10, AC-16, AC-21): a atomicidade do filtro (status,
 * prioridade, técnico e prazo lidos), a regra assimétrica de SLA através da
 * ação de verdade e a corrida entre duas correções só se provam com o banco
 * de verdade, não com mock. A regra de SLA em si (a tabela AC-8/AC-9, horário
 * comercial, feriado) já tem cobertura unitária própria em
 * `lib/__tests__/sla-snapshot.test.ts`; aqui o foco é o que a ação faz com o
 * resultado dela: janela, papel, atomicidade e a ordem dos passos.
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
  const adminId = new Types.ObjectId();
  const tecnicoId = new Types.ObjectId();
  const solicitanteId = new Types.ObjectId();
  const unitId = new Types.ObjectId();

  // Papel da sessão simulada — trocado por teste via `sessao`.
  let sessaoAtual = { userId: String(prepostoId), role: 'Preposto' };
  function sessao(papel: 'Preposto' | 'Admin') {
    sessaoAtual = { userId: papel === 'Admin' ? String(adminId) : String(prepostoId), role: papel };
  }

  // Roda entre a leitura do chamado e a gravação atômica: é a janela onde uma
  // implementação em dois passos deixaria uma corrida passar despercebida.
  let antesDoSnapshot: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    vi.doMock('@/lib/dal', () => ({
      requireManager: async () => sessaoAtual,
      isAdmin: (role?: string) => role === 'Admin',
    }));
    vi.doMock('@/lib/sla-snapshot', async () => {
      const real =
        await vi.importActual<typeof import('@/lib/sla-snapshot')>('@/lib/sla-snapshot');
      return {
        ...real,
        montarSnapshotCorrecao: async (
          ...args: Parameters<typeof real.montarSnapshotCorrecao>
        ) => {
          if (antesDoSnapshot) await antesDoSnapshot();
          return real.montarSnapshotCorrecao(...args);
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
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    sessao('Preposto');
    await UnitModel.create({ _id: unitId, name: 'Fórum' } as never);
    await UserModel.create([
      { _id: prepostoId, name: 'Ana', username: 'ana', role: 'Preposto' },
      { _id: adminId, name: 'Beto', username: 'beto', role: 'Admin' },
      { _id: tecnicoId, name: 'João', username: 'joao', role: 'Técnico' },
      { _id: solicitanteId, name: 'Maria', username: 'maria', role: 'Solicitante' },
    ] as never);
    // 24x7 explícito, pra aritmética ficar simples de conferir (o default do
    // model é `businessHoursOnly: true`).
    await SlaConfigModel.create([
      {
        priority: 'BAIXA',
        responseTargetMinutes: 240,
        resolutionTargetMinutes: 2880,
        businessHoursOnly: false,
      },
      {
        priority: 'NORMAL',
        responseTargetMinutes: 120,
        resolutionTargetMinutes: 1440,
        businessHoursOnly: false,
      },
      {
        priority: 'ALTA',
        responseTargetMinutes: 60,
        resolutionTargetMinutes: 480,
        businessHoursOnly: false,
      },
      {
        priority: 'EMERGENCIAL',
        responseTargetMinutes: 15,
        resolutionTargetMinutes: 120,
        businessHoursOnly: false,
      },
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

  const MOTIVO = 'Motivo com mais de dez caracteres para a correção.';

  async function chamadoValidado(overrides: Record<string, unknown> = {}) {
    const classifiedAt = new Date();
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
      classifiedAt,
      sla: {
        priority: 'NORMAL',
        responseTargetMinutes: 120,
        resolutionTargetMinutes: 1440,
        businessHoursOnly: false,
        responseDueAt: new Date(classifiedAt.getTime() + 120 * 60_000),
        resolutionDueAt: new Date(classifiedAt.getTime() + 1440 * 60_000),
        computedAt: classifiedAt,
        configVersion: 'v1',
      },
      ...overrides,
    } as never);
  }

  // ── janela ──────────────────────────────────────────────────────

  it.each(['aberto', 'aguardando_solicitante', 'aguardando_terceiros', 'encerrado', 'concluído'])(
    'recusa fora da janela: status %s, sem gravar nada',
    async (status) => {
      const chamado = await chamadoValidado({ status });

      const result = await updateTicketPriorityAction({
        chamadoId: String(chamado._id),
        finalPriority: 'ALTA',
        motivo: MOTIVO,
      });

      expect(result.ok).toBe(false);
      const depois = await ChamadoModel.findById(chamado._id).lean();
      expect(depois?.finalPriority).toBe('NORMAL');
      expect(depois?.sla?.resolutionTargetMinutes).toBe(1440);
    },
  );

  it('aceita a janela em atendimento', async () => {
    const chamado = await chamadoValidado({ status: 'em atendimento' });

    const result = await updateTicketPriorityAction({
      chamadoId: String(chamado._id),
      finalPriority: 'ALTA',
      motivo: MOTIVO,
    });

    expect(result).toEqual({ ok: true });
  });

  it('recusa trocar para a mesma prioridade, sem gravar nada', async () => {
    const chamado = await chamadoValidado();

    const result = await updateTicketPriorityAction({
      chamadoId: String(chamado._id),
      finalPriority: 'NORMAL',
      motivo: MOTIVO,
    });

    expect(result.ok).toBe(false);
  });

  it('recusa motivo curto (schema), sem gravar nada', async () => {
    const chamado = await chamadoValidado();

    const result = await updateTicketPriorityAction({
      chamadoId: String(chamado._id),
      finalPriority: 'ALTA',
      motivo: 'curto',
    });

    expect(result.ok).toBe(false);
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(depois?.finalPriority).toBe('NORMAL');
  });

  it('sem SlaConfig ativa para a prioridade nova: recusa sem gravar nada', async () => {
    const chamado = await chamadoValidado();
    await SlaConfigModel.deleteMany({ priority: 'ALTA' });

    const result = await updateTicketPriorityAction({
      chamadoId: String(chamado._id),
      finalPriority: 'ALTA',
      motivo: MOTIVO,
    });

    expect(result.ok).toBe(false);
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(depois?.finalPriority).toBe('NORMAL');
  });

  // ── papel (AC-10) ───────────────────────────────────────────────

  it('Preposto não pode baixar a prioridade de um chamado com técnico: nada é gravado', async () => {
    const chamado = await chamadoValidado({
      finalPriority: 'EMERGENCIAL',
      assignedToUserId: tecnicoId,
      sla: {
        priority: 'EMERGENCIAL',
        responseTargetMinutes: 15,
        resolutionTargetMinutes: 120,
        businessHoursOnly: false,
        responseDueAt: new Date(Date.now() + 15 * 60_000),
        resolutionDueAt: new Date(Date.now() + 120 * 60_000),
        computedAt: new Date(),
        configVersion: 'v1',
      },
    });

    const result = await updateTicketPriorityAction({
      chamadoId: String(chamado._id),
      finalPriority: 'ALTA',
      motivo: MOTIVO,
    });

    expect(result).toEqual({
      ok: false,
      error: 'Só o Admin pode baixar a prioridade de um chamado que já tem técnico atribuído.',
    });
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(depois?.finalPriority).toBe('EMERGENCIAL');
    const historico = await ChamadoHistoryModel.find({ chamadoId: chamado._id }).lean();
    expect(historico).toHaveLength(0);
  });

  it('Admin pode baixar a prioridade de um chamado com técnico', async () => {
    sessao('Admin');
    const classifiedAt = new Date();
    const chamado = await chamadoValidado({
      finalPriority: 'EMERGENCIAL',
      assignedToUserId: tecnicoId,
      classifiedAt,
      sla: {
        priority: 'EMERGENCIAL',
        responseTargetMinutes: 15,
        resolutionTargetMinutes: 120,
        businessHoursOnly: false,
        responseDueAt: new Date(classifiedAt.getTime() + 15 * 60_000),
        resolutionDueAt: new Date(classifiedAt.getTime() + 120 * 60_000),
        computedAt: classifiedAt,
        configVersion: 'v1',
      },
    });

    const result = await updateTicketPriorityAction({
      chamadoId: String(chamado._id),
      finalPriority: 'ALTA',
      motivo: MOTIVO,
    });

    expect(result).toEqual({ ok: true });
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(depois?.finalPriority).toBe('ALTA');
    // Desce com técnico: soma só a diferença de alvos (480 - 120 = 360min) ao Dc.
    expect(depois?.sla?.resolutionDueAt?.getTime()).toBe(
      new Date(classifiedAt.getTime() + 120 * 60_000).getTime() + 360 * 60_000,
    );
  });

  it('Preposto pode baixar a prioridade sem técnico atribuído', async () => {
    const classifiedAt = new Date();
    const chamado = await chamadoValidado({
      finalPriority: 'EMERGENCIAL',
      classifiedAt,
      sla: {
        priority: 'EMERGENCIAL',
        responseTargetMinutes: 15,
        resolutionTargetMinutes: 120,
        businessHoursOnly: false,
        responseDueAt: new Date(classifiedAt.getTime() + 15 * 60_000),
        resolutionDueAt: new Date(classifiedAt.getTime() + 120 * 60_000),
        computedAt: classifiedAt,
        configVersion: 'v1',
      },
    });

    const result = await updateTicketPriorityAction({
      chamadoId: String(chamado._id),
      finalPriority: 'NORMAL',
      motivo: MOTIVO,
    });

    expect(result).toEqual({ ok: true });
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(depois?.finalPriority).toBe('NORMAL');
    // Sem técnico: prazo novo desde classifiedAt (regra da 0007).
    expect(depois?.sla?.resolutionDueAt?.getTime()).toBe(classifiedAt.getTime() + 1440 * 60_000);
  });

  // ── regra assimétrica através da ação de verdade (a tabela em si é testada em sla-snapshot.test.ts) ──

  it('subir mantém o prazo quando o atual ainda é mais apertado (nunca estende)', async () => {
    const classifiedAt = new Date(Date.now() - 6 * 3600_000); // classificado há 6h
    const resolutionDueAt = new Date(classifiedAt.getTime() + 8 * 3600_000); // 2h restantes
    const chamado = await chamadoValidado({
      finalPriority: 'NORMAL',
      classifiedAt,
      sla: {
        priority: 'NORMAL',
        responseTargetMinutes: 120,
        resolutionTargetMinutes: 480,
        businessHoursOnly: false,
        responseDueAt: new Date(classifiedAt.getTime() + 60 * 60_000),
        resolutionDueAt,
        computedAt: classifiedAt,
        configVersion: 'v1',
      },
    });

    const result = await updateTicketPriorityAction({
      chamadoId: String(chamado._id),
      finalPriority: 'ALTA',
      motivo: MOTIVO,
    });

    expect(result).toEqual({ ok: true });
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(depois?.sla?.resolutionDueAt).toEqual(resolutionDueAt);
    // O alvo gravado não muda: o prazo não se moveu.
    expect(depois?.sla?.resolutionTargetMinutes).toBe(480);
  });

  it('computedAt, classifiedAt e responseStartedAt não mudam numa correção', async () => {
    const classifiedAt = new Date(Date.now() - 60_000);
    const responseStartedAt = new Date(Date.now() - 30_000);
    const chamado = await chamadoValidado({
      classifiedAt,
      sla: {
        priority: 'NORMAL',
        responseTargetMinutes: 120,
        resolutionTargetMinutes: 1440,
        businessHoursOnly: false,
        responseDueAt: new Date(classifiedAt.getTime() + 120 * 60_000),
        resolutionDueAt: new Date(classifiedAt.getTime() + 1440 * 60_000),
        responseStartedAt,
        computedAt: classifiedAt,
        configVersion: 'v1',
      },
    });

    const result = await updateTicketPriorityAction({
      chamadoId: String(chamado._id),
      finalPriority: 'ALTA',
      motivo: MOTIVO,
    });

    expect(result).toEqual({ ok: true });
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(depois?.sla?.computedAt).toEqual(classifiedAt);
    expect(depois?.classifiedAt).toEqual(classifiedAt);
    expect(depois?.sla?.responseStartedAt).toEqual(responseStartedAt);
  });

  it('zera só a warning_80 quando o prazo se move, mantém breach_resolution já registrado', async () => {
    const chamado = await chamadoValidado();
    const antes = new Date(Date.now() - 60_000);
    await ChamadoModel.updateOne(
      { _id: chamado._id },
      { $set: { 'sla.resolutionBreachedAt': antes } },
    );
    await SlaEscalationModel.create([
      { chamadoId: chamado._id, type: 'warning_80', level: 'manager', notifiedAt: antes },
      { chamadoId: chamado._id, type: 'breach_resolution', level: 'admin', notifiedAt: antes },
    ] as never);

    // BAIXA (2880min) é bem mais folgado: o prazo encolhe, então "moveu".
    const result = await updateTicketPriorityAction({
      chamadoId: String(chamado._id),
      finalPriority: 'BAIXA',
      motivo: MOTIVO,
    });

    expect(result).toEqual({ ok: true });
    // NORMAL → BAIXA é uma descida (BAIXA é menos rígida): o prazo novo (desde
    // classifiedAt) ainda não venceu, então a violação de resolução é zerada.
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(depois?.sla?.resolutionBreachedAt ?? null).toBeNull();
    await expect(
      SlaEscalationModel.exists({ chamadoId: chamado._id, type: 'warning_80' }),
    ).resolves.toBeNull();
    await expect(
      SlaEscalationModel.exists({ chamadoId: chamado._id, type: 'breach_resolution' }),
    ).resolves.toBeNull();
  });

  // ── trilha (AC-13, AC-12) ───────────────────────────────────────

  it('grava correcao_gestao com o motivo e a entrada neutra sem motivo', async () => {
    const chamado = await chamadoValidado();

    await updateTicketPriorityAction({
      chamadoId: String(chamado._id),
      finalPriority: 'ALTA',
      motivo: MOTIVO,
    });

    const historico = await ChamadoHistoryModel.find({ chamadoId: chamado._id }).lean();
    const correcaoGestao = historico.find((h) => h.action === 'correcao_gestao');
    const neutra = historico.find((h) => h.action === 'classificacao');
    expect(correcaoGestao?.observacoes).toContain(MOTIVO);
    expect(neutra?.observacoes).not.toContain(MOTIVO);
    expect(neutra?.observacoes).toContain('Alta');
  });

  // ── atomicidade e corrida ───────────────────────────────────────

  it('duas correções concorrentes: só a primeira aplica, a segunda é recusada (AC-7)', async () => {
    const chamado = await chamadoValidado();

    // A segunda correção roda inteira enquanto a primeira está entre a
    // leitura e a gravação, com os MESMOS valores lidos (prioridade "NORMAL"
    // ainda). O filtro atômico da primeira já terá mudado `finalPriority`
    // quando a segunda tentar gravar, então ela não pode aplicar também.
    antesDoSnapshot = async () => {
      antesDoSnapshot = null;
      const segunda = await updateTicketPriorityAction({
        chamadoId: String(chamado._id),
        finalPriority: 'EMERGENCIAL',
        motivo: 'Segunda correção concorrente.',
      });
      expect(segunda.ok).toBe(true);
    };

    const primeira = await updateTicketPriorityAction({
      chamadoId: String(chamado._id),
      finalPriority: 'ALTA',
      motivo: 'Primeira correção concorrente.',
    });

    // A que roda por último "ganha" o findOneAndUpdate porque lê antes de a
    // outra gravar; a de fora (que iniciou primeiro mas grava depois) perde.
    expect(primeira.ok).toBe(false);
    if (!primeira.ok) expect(primeira.error).toContain('tente de novo');
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(depois?.finalPriority).toBe('EMERGENCIAL');
  });

  it('atribuição que chega entre a leitura e a gravação: a correção é recusada (AC-7)', async () => {
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
      motivo: MOTIVO,
    });

    expect(correcao.ok).toBe(false);
    if (!correcao.ok) expect(correcao.error).toContain('tente de novo');
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(depois?.finalPriority).toBe('NORMAL');
    expect(String(depois?.assignedToUserId)).toBe(String(tecnicoId));
  });

  it('pausa que chega entre a leitura e a gravação: a correção é recusada, nunca aplica sobre um chamado pausado', async () => {
    const chamado = await chamadoValidado();

    antesDoSnapshot = async () => {
      await ChamadoModel.updateOne(
        { _id: chamado._id },
        { $set: { status: 'aguardando_solicitante', slaPausedAt: new Date() } },
      );
    };

    const correcao = await updateTicketPriorityAction({
      chamadoId: String(chamado._id),
      finalPriority: 'ALTA',
      motivo: MOTIVO,
    });

    expect(correcao.ok).toBe(false);
    const depois = await ChamadoModel.findById(chamado._id).lean();
    expect(depois?.finalPriority).toBe('NORMAL');
    expect(depois?.status).toBe('aguardando_solicitante');
  });
});
