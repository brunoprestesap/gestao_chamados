import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────
// vi.mock é hoisted: factories NÃO podem referenciar variáveis externas.

vi.mock('@/lib/db', () => ({
  dbConnect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/realtime-emit', () => ({
  emitToRoom: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    find: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock('@/models/Notification', () => ({
  NotificationModel: {
    insertMany: vi.fn(),
  },
}));

vi.mock('@/models/SlaEscalation', () => ({
  SlaEscalationModel: {
    find: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('@/models/user.model', () => ({
  UserModel: {
    find: vi.fn(),
  },
}));

// Importações após os mocks
import { emitToRoom } from '@/lib/realtime-emit';
import { checkSlaEscalations } from '@/lib/sla-monitor';
import { ChamadoModel } from '@/models/Chamado';
import { NotificationModel } from '@/models/Notification';
import { SlaEscalationModel } from '@/models/SlaEscalation';
import { UserModel } from '@/models/user.model';

// ── Fixtures ─────────────────────────────────────────────────────

const CHAMADO_ID = new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');
const MANAGER_ID_1 = new Types.ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb');
const ADMIN_ID_1 = new Types.ObjectId('cccccccccccccccccccccccc');

/**
 * Retorna um chamado base com SLA configurado.
 *
 * Datas de referência:
 *   computedAt      = 2026-04-10T08:00:00Z
 *   responseDueAt   = 2026-04-10T10:00:00Z  (2 h após computedAt)
 *   resolutionDueAt = 2026-04-10T18:00:00Z  (10 h após computedAt)
 *
 * "now" para testes é controlado via vi.useFakeTimers().
 */
function makeBaseChamado(overrides: Record<string, unknown> = {}) {
  return {
    _id: CHAMADO_ID,
    ticket_number: 'CHM-2026-00001',
    titulo: 'Teste SLA Monitor',
    status: 'em atendimento',
    totalPausedMinutes: 0,
    slaPausedAt: null,
    sla: {
      priority: 'NORMAL',
      computedAt: new Date('2026-04-10T08:00:00Z'),
      responseDueAt: new Date('2026-04-10T10:00:00Z'),
      resolutionDueAt: new Date('2026-04-10T18:00:00Z'),
      responseStartedAt: null,
      resolvedAt: null,
      responseBreachedAt: null,
      resolutionBreachedAt: null,
      pausedMinutes: 0,
    },
    ...overrides,
  };
}

function makeManagers() {
  return [
    { _id: MANAGER_ID_1, role: 'Preposto' },
    { _id: ADMIN_ID_1, role: 'Admin' },
  ];
}

/** Helper para encadear .lean() em ChamadoModel.find e SlaEscalationModel.find */
function withLean<T>(value: T) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

// ── beforeEach ───────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();

  // Defaults: sem escalações existentes, dois managers
  vi.mocked(SlaEscalationModel.find).mockReturnValue(withLean([]) as never);
  vi.mocked(UserModel.find).mockReturnValue(withLean(makeManagers()) as never);
  vi.mocked(SlaEscalationModel.create).mockResolvedValue({} as never);
  vi.mocked(NotificationModel.insertMany).mockResolvedValue([] as never);
  vi.mocked(ChamadoModel.updateOne).mockResolvedValue({ modifiedCount: 1 } as never);
  vi.mocked(emitToRoom).mockResolvedValue(true);
});

// ── Testes ───────────────────────────────────────────────────────

describe('checkSlaEscalations — sem chamados ativos', () => {
  it('should return zeros when no active chamados exist', async () => {
    // Arrange
    vi.mocked(ChamadoModel.find).mockReturnValue(withLean([]) as never);

    // Act
    const report = await checkSlaEscalations();

    // Assert
    expect(report).toEqual({ checked: 0, warnings: 0, breaches: 0 });
    expect(SlaEscalationModel.find).not.toHaveBeenCalled();
  });
});

describe('checkSlaEscalations — warning 80%', () => {
  it('should fire warning when remainingPercent is between 0 and 20', async () => {
    // Arrange
    // computedAt=08:00, resolutionDueAt=18:00 → total=10h
    // now = 17:00 → elapsed = 9h → remaining = 1h / 10h = 10% ≤ 20
    // responseDueAt=10:00 já passou (17:00 > 10:00) → breach_response também dispara;
    // para isolar só o warning, marcamos responseBreachedAt como já registrado.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T17:00:00Z'));

    const chamado = makeBaseChamado({
      sla: {
        priority: 'NORMAL',
        computedAt: new Date('2026-04-10T08:00:00Z'),
        responseDueAt: new Date('2026-04-10T10:00:00Z'),
        resolutionDueAt: new Date('2026-04-10T18:00:00Z'),
        responseStartedAt: null,
        resolvedAt: null,
        responseBreachedAt: new Date('2026-04-10T10:30:00Z'), // já marcado → sem breach_response
        resolutionBreachedAt: null,
        pausedMinutes: 0,
      },
    });
    vi.mocked(ChamadoModel.find).mockReturnValue(withLean([chamado]) as never);

    // Act
    const report = await checkSlaEscalations();

    // Assert
    expect(report.warnings).toBe(1);
    expect(report.breaches).toBe(0);
    expect(SlaEscalationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'warning_80', chamadoId: CHAMADO_ID }),
    );
  });

  it('should NOT fire warning when remainingPercent is above 20', async () => {
    // Arrange
    // now = 10:00 → elapsed = 2h / 10h = 20% → remaining = 80% > 20
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T10:00:00Z'));

    vi.mocked(ChamadoModel.find).mockReturnValue(withLean([makeBaseChamado()]) as never);

    // Act
    const report = await checkSlaEscalations();

    // Assert
    expect(report.warnings).toBe(0);
    expect(SlaEscalationModel.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'warning_80' }),
    );
  });

  it('should NOT fire warning when remainingPercent is exactly 0 (already in breach)', async () => {
    // Arrange
    // now = 18:00 (exatamente no due) → remaining = 0
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T18:00:00Z'));

    vi.mocked(ChamadoModel.find).mockReturnValue(withLean([makeBaseChamado()]) as never);

    // Act
    const report = await checkSlaEscalations();

    // Assert
    // remainingPercent = 0 → condição > 0 não satisfeita → sem warning
    expect(report.warnings).toBe(0);
  });

  it('should NOT fire warning when warning_80 escalation already exists for the chamado', async () => {
    // Arrange
    // now=17:00 → remaining ~10% (warning zone) e responseDueAt=10:00 já passou
    // Simulamos que warning_80 e breach_response já existem → nenhuma escalação nova
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T17:00:00Z'));

    vi.mocked(ChamadoModel.find).mockReturnValue(withLean([makeBaseChamado()]) as never);
    vi.mocked(SlaEscalationModel.find).mockReturnValue(
      withLean([
        { chamadoId: CHAMADO_ID, type: 'warning_80' },
        { chamadoId: CHAMADO_ID, type: 'breach_response' },
      ]) as never,
    );

    // Act
    const report = await checkSlaEscalations();

    // Assert — warning_80 já existe: nenhum warning_80 deve ser criado
    expect(report.warnings).toBe(0);
    const createCalls = vi.mocked(SlaEscalationModel.create).mock.calls;
    const warningCall = createCalls.find(
      ([arg]) => (arg as { type?: string }).type === 'warning_80',
    );
    expect(warningCall).toBeUndefined();
  });
});

describe('checkSlaEscalations — breach de resposta', () => {
  it('should fire response breach when now > responseDueAt and responseBreachedAt is null', async () => {
    // Arrange
    // responseDueAt = 10:00, now = 11:00 → breach
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T11:00:00Z'));

    vi.mocked(ChamadoModel.find).mockReturnValue(withLean([makeBaseChamado()]) as never);

    // Act
    const report = await checkSlaEscalations();

    // Assert
    expect(report.breaches).toBeGreaterThanOrEqual(1);
    expect(SlaEscalationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'breach_response', chamadoId: CHAMADO_ID }),
    );
    expect(ChamadoModel.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: CHAMADO_ID, 'sla.responseBreachedAt': null }),
      expect.objectContaining({ $set: expect.objectContaining({ 'sla.responseBreachedAt': expect.any(Date) }) }),
    );
  });

  it('should NOT fire response breach when responseBreachedAt is already set', async () => {
    // Arrange
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T11:00:00Z'));

    const chamado = makeBaseChamado({
      sla: {
        priority: 'NORMAL',
        computedAt: new Date('2026-04-10T08:00:00Z'),
        responseDueAt: new Date('2026-04-10T10:00:00Z'),
        resolutionDueAt: new Date('2026-04-10T18:00:00Z'),
        responseStartedAt: null,
        resolvedAt: null,
        responseBreachedAt: new Date('2026-04-10T10:30:00Z'), // já marcado
        resolutionBreachedAt: null,
        pausedMinutes: 0,
      },
    });
    vi.mocked(ChamadoModel.find).mockReturnValue(withLean([chamado]) as never);

    // Act
    await checkSlaEscalations();

    // Assert — resposta já marcada como breach, não deve criar escalação de resposta
    const createCalls = vi.mocked(SlaEscalationModel.create).mock.calls;
    const responseBreachCall = createCalls.find(
      ([arg]) => (arg as { type?: string }).type === 'breach_response',
    );
    expect(responseBreachCall).toBeUndefined();
  });

  it('should NOT fire response breach when breach_response escalation already exists', async () => {
    // Arrange
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T11:00:00Z'));

    vi.mocked(ChamadoModel.find).mockReturnValue(withLean([makeBaseChamado()]) as never);
    vi.mocked(SlaEscalationModel.find).mockReturnValue(
      withLean([{ chamadoId: CHAMADO_ID, type: 'breach_response' }]) as never,
    );

    // Act
    await checkSlaEscalations();

    // Assert
    const createCalls = vi.mocked(SlaEscalationModel.create).mock.calls;
    const responseBreachCall = createCalls.find(
      ([arg]) => (arg as { type?: string }).type === 'breach_response',
    );
    expect(responseBreachCall).toBeUndefined();
  });
});

describe('checkSlaEscalations — breach de resolução', () => {
  it('should fire resolution breach when now > resolutionDueAt and resolutionBreachedAt is null', async () => {
    // Arrange
    // resolutionDueAt = 18:00, now = 19:00 → breach
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T19:00:00Z'));

    vi.mocked(ChamadoModel.find).mockReturnValue(withLean([makeBaseChamado()]) as never);

    // Act
    const report = await checkSlaEscalations();

    // Assert
    expect(report.breaches).toBeGreaterThanOrEqual(1);
    expect(SlaEscalationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'breach_resolution', chamadoId: CHAMADO_ID }),
    );
    expect(ChamadoModel.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: CHAMADO_ID, 'sla.resolutionBreachedAt': null }),
      expect.objectContaining({ $set: expect.objectContaining({ 'sla.resolutionBreachedAt': expect.any(Date) }) }),
    );
  });

  it('should NOT fire resolution breach when breach_resolution escalation already exists', async () => {
    // Arrange
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T19:00:00Z'));

    vi.mocked(ChamadoModel.find).mockReturnValue(withLean([makeBaseChamado()]) as never);
    vi.mocked(SlaEscalationModel.find).mockReturnValue(
      withLean([{ chamadoId: CHAMADO_ID, type: 'breach_resolution' }]) as never,
    );

    // Act
    await checkSlaEscalations();

    // Assert
    const createCalls = vi.mocked(SlaEscalationModel.create).mock.calls;
    const resolutionBreachCall = createCalls.find(
      ([arg]) => (arg as { type?: string }).type === 'breach_resolution',
    );
    expect(resolutionBreachCall).toBeUndefined();
  });

  it('should mark sla.resolutionBreachedAt on chamado via updateOne', async () => {
    // Arrange
    vi.useFakeTimers();
    const nowDate = new Date('2026-04-10T19:00:00Z');
    vi.setSystemTime(nowDate);

    vi.mocked(ChamadoModel.find).mockReturnValue(withLean([makeBaseChamado()]) as never);

    // Act
    await checkSlaEscalations();

    // Assert
    expect(ChamadoModel.updateOne).toHaveBeenCalledWith(
      { _id: CHAMADO_ID, 'sla.resolutionBreachedAt': null },
      { $set: { 'sla.resolutionBreachedAt': nowDate } },
    );
  });
});

describe('checkSlaEscalations — desconto de pausas', () => {
  it('should use totalPausedMinutes to reduce elapsed time and avoid spurious breach', async () => {
    // Arrange
    // now = 19:00, resolutionDueAt = 18:00 → sem pausa seria breach
    // totalPausedMinutes = 90 → desconta 90 min → elapsed efetivo = 10h - 1.5h = 8.5h < 10h → no breach
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T19:00:00Z'));

    // Com 90 min de pausa:
    // elapsed = (19:00 - 08:00) - 90min = 11h - 1.5h = 9.5h
    // total = 10h → remaining = 0.5h / 10h = 5% → warning_80 (não breach por tempo)
    // Mas resolutionDueAt é um timestamp absoluto (18:00), e now (19:00) > 18:00
    // Logo o breach de resolução dispara igualmente (o desconto de pausas afeta apenas o cálculo
    // de remainingPercent para o warning, não a comparação now > resolutionDueAt).
    // Este teste verifica que totalPausedMinutes afeta o remainingPercent corretamente.

    // Para testar a pausa sem breach: now = 17:30, pausa = 90min
    // elapsed = (17:30 - 08:00) - 90min = 9.5h - 1.5h = 8h → remaining = 2h / 10h = 20%
    // remainingPercent = 20 → condição > 0 E <= 20 → warning deve disparar
    vi.setSystemTime(new Date('2026-04-10T17:30:00Z'));

    const chamadoComPausa = makeBaseChamado({ totalPausedMinutes: 90 });
    vi.mocked(ChamadoModel.find).mockReturnValue(withLean([chamadoComPausa]) as never);

    // Act
    const report = await checkSlaEscalations();

    // Assert — elapsed efetivo = 8h, remaining = 20% → warning dispara
    expect(report.warnings).toBe(1);
  });

  it('should discount active pause time when slaPausedAt is set', async () => {
    // Arrange
    // computedAt = 08:00, resolutionDueAt = 18:00
    // slaPausedAt = 16:00 (pausa iniciou há 30 min do "now" = 16:30)
    // totalPausedMinutes = 0 (sem pausas anteriores concluídas)
    // activePauseMs = (16:30 - 16:00) = 30 min
    // elapsed = (16:30 - 08:00) - 30min = 8.5h - 0.5h = 8h → remaining = 2h / 10h = 20%
    // remainingPercent = 20 → warning dispara (condição <= 20 e > 0)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T16:30:00Z'));

    const chamadoPausado = makeBaseChamado({
      totalPausedMinutes: 0,
      slaPausedAt: new Date('2026-04-10T16:00:00Z'),
    });
    vi.mocked(ChamadoModel.find).mockReturnValue(withLean([chamadoPausado]) as never);

    // Act
    const report = await checkSlaEscalations();

    // Assert — com pausa ativa descontada, remaining = 20% → warning
    expect(report.warnings).toBe(1);
  });
});

describe('checkSlaEscalations — tryCreateEscalation com duplicate key', () => {
  it('should return false and NOT send notifications when SlaEscalationModel.create throws 11000', async () => {
    // Arrange
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T17:00:00Z'));

    vi.mocked(ChamadoModel.find).mockReturnValue(withLean([makeBaseChamado()]) as never);

    const duplicateKeyError = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    vi.mocked(SlaEscalationModel.create).mockRejectedValue(duplicateKeyError);

    // Act
    const report = await checkSlaEscalations();

    // Assert — escalation não foi criada (duplicate), portanto sem notificações e sem emit
    expect(report.warnings).toBe(0);
    expect(NotificationModel.insertMany).not.toHaveBeenCalled();
    expect(emitToRoom).not.toHaveBeenCalled();
  });
});

describe('checkSlaEscalations — notificações persistentes e socket', () => {
  it('should create persistent notifications for managers when warning is fired', async () => {
    // Arrange
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T17:00:00Z'));

    vi.mocked(ChamadoModel.find).mockReturnValue(withLean([makeBaseChamado()]) as never);

    // Act
    await checkSlaEscalations();

    // Assert
    expect(NotificationModel.insertMany).toHaveBeenCalled();
    const [notifications] = vi.mocked(NotificationModel.insertMany).mock.calls[0];
    expect(notifications).toHaveLength(2); // MANAGER_ID_1 (Preposto) e ADMIN_ID_1 (Admin)
    expect((notifications as Array<{ type: string }>)[0].type).toBe('sla:warning');
  });

  it('should emit sla:warning socket event when warning escalation is created', async () => {
    // Arrange
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T17:00:00Z'));

    vi.mocked(ChamadoModel.find).mockReturnValue(withLean([makeBaseChamado()]) as never);

    // Act
    await checkSlaEscalations();

    // Assert
    expect(emitToRoom).toHaveBeenCalledWith(
      'managers',
      'sla:warning',
      expect.objectContaining({
        ticketId: String(CHAMADO_ID),
        type: 'resolution',
        priority: 'NORMAL',
      }),
    );
  });

  it('should create persistent notifications for admins when resolution breach is fired', async () => {
    // Arrange
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T19:00:00Z'));

    vi.mocked(ChamadoModel.find).mockReturnValue(withLean([makeBaseChamado()]) as never);

    // Act
    await checkSlaEscalations();

    // Assert — breach de resolução cria notificações para adminIds
    expect(NotificationModel.insertMany).toHaveBeenCalled();
    const allCalls = vi.mocked(NotificationModel.insertMany).mock.calls;
    const breachCall = allCalls.find(([notifs]) =>
      (notifs as Array<{ type: string }>).some((n) => n.type === 'sla:breach'),
    );
    expect(breachCall).toBeDefined();
  });

  it('should emit sla:breach socket event when resolution breach escalation is created', async () => {
    // Arrange
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T19:00:00Z'));

    vi.mocked(ChamadoModel.find).mockReturnValue(withLean([makeBaseChamado()]) as never);

    // Act
    await checkSlaEscalations();

    // Assert
    expect(emitToRoom).toHaveBeenCalledWith(
      'managers',
      'sla:breach',
      expect.objectContaining({
        ticketId: String(CHAMADO_ID),
        type: 'resolution',
        priority: 'NORMAL',
      }),
    );
  });

  it('should NOT call NotificationModel.insertMany when escalation creation fails with duplicate key', async () => {
    // Arrange
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T19:00:00Z'));

    vi.mocked(ChamadoModel.find).mockReturnValue(withLean([makeBaseChamado()]) as never);

    const duplicateKeyError = Object.assign(new Error('E11000'), { code: 11000 });
    vi.mocked(SlaEscalationModel.create).mockRejectedValue(duplicateKeyError);

    // Act
    await checkSlaEscalations();

    // Assert
    expect(NotificationModel.insertMany).not.toHaveBeenCalled();
    expect(emitToRoom).not.toHaveBeenCalled();
  });
});

describe('checkSlaEscalations — múltiplos chamados', () => {
  it('should check all chamados and accumulate report counters correctly', async () => {
    // Arrange
    // Chamado 1: warning (17:00, remaining ~10%)
    // Chamado 2: no prazo (10:00, remaining 80%)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T17:00:00Z'));

    const chamado1 = makeBaseChamado();
    const chamado2 = {
      ...makeBaseChamado(),
      _id: new Types.ObjectId('dddddddddddddddddddddddd'),
      ticket_number: 'CHM-2026-00002',
      sla: {
        priority: 'NORMAL',
        computedAt: new Date('2026-04-10T08:00:00Z'),
        responseDueAt: new Date('2026-04-10T10:00:00Z'),
        resolutionDueAt: new Date('2026-04-10T18:00:00Z'),
        responseStartedAt: null,
        resolvedAt: null,
        responseBreachedAt: null,
        resolutionBreachedAt: null,
        pausedMinutes: 0,
      },
      totalPausedMinutes: 480, // 8h de pausa → elapsed = 1h → remaining = 90% → sem warning
      slaPausedAt: null,
    };

    vi.mocked(ChamadoModel.find).mockReturnValue(withLean([chamado1, chamado2]) as never);

    // Act
    const report = await checkSlaEscalations();

    // Assert
    expect(report.checked).toBe(2);
    // chamado1 dispara warning; chamado2 com 8h de pausa não dispara (remaining alto)
    expect(report.warnings).toBe(1);
  });
});

describe('checkSlaEscalations — chamado com response breach e resolution breach simultâneos', () => {
  it('should count both response and resolution breach when both thresholds are crossed', async () => {
    // Arrange
    // now = 19:00 → responseDueAt=10:00 (breach) + resolutionDueAt=18:00 (breach)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T19:00:00Z'));

    vi.mocked(ChamadoModel.find).mockReturnValue(withLean([makeBaseChamado()]) as never);

    // Act
    const report = await checkSlaEscalations();

    // Assert
    expect(report.breaches).toBe(2);
    expect(SlaEscalationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'breach_response' }),
    );
    expect(SlaEscalationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'breach_resolution' }),
    );
  });
});
