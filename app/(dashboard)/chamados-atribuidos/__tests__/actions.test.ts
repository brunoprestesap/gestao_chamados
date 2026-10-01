import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const TECH_USER_ID = new Types.ObjectId().toHexString();
const mockRequireSession = vi.fn();
vi.mock('@/lib/dal', () => ({
  requireSession: () => mockRequireSession(),
  isTechnician: (role?: string) => role === 'Técnico',
  canManage: (role?: string) => role === 'Admin' || role === 'Preposto',
}));

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
const mockEmitToRoom = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/realtime-emit', () => ({
  emitToRoom: (...args: unknown[]) => mockEmitToRoom(...args),
}));
const mockSendEmail = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/email/send-notification-email', () => ({
  sendNotificationEmail: (...args: unknown[]) => mockSendEmail(...args),
}));
const mockGetBusinessCalendarConfig = vi.fn();
vi.mock('@/lib/expediente-config', () => ({
  getBusinessCalendarConfig: () => mockGetBusinessCalendarConfig(),
}));

const mockChamadoFindById = vi.fn();
const mockChamadoUpdateOne = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    findById: (...args: unknown[]) => mockChamadoFindById(...args),
    updateOne: (...args: unknown[]) => mockChamadoUpdateOne(...args),
  },
}));

const mockHistoryCreate = vi.fn();
vi.mock('@/models/ChamadoHistory', () => ({
  ChamadoHistoryModel: { create: (...args: unknown[]) => mockHistoryCreate(...args) },
}));

const mockNotificationCreate = vi.fn();
const mockNotificationInsertMany = vi.fn();
vi.mock('@/models/Notification', () => ({
  NotificationModel: {
    create: (...args: unknown[]) => mockNotificationCreate(...args),
    insertMany: (...args: unknown[]) => mockNotificationInsertMany(...args),
  },
}));

const mockUserFindById = vi.fn();
const mockUserFind = vi.fn();
vi.mock('@/models/user.model', () => ({
  UserModel: {
    findById: (...args: unknown[]) => mockUserFindById(...args),
    find: (...args: unknown[]) => mockUserFind(...args),
  },
}));

import { registerExecutionAction } from '@/app/(dashboard)/chamados-atribuidos/actions';

// ── Helpers ──────────────────────────────────────────────────────

const VALID_ID = new Types.ObjectId().toHexString();
const SESSION = {
  userId: TECH_USER_ID,
  role: 'Técnico' as const,
  username: 'tecnico1',
  isActive: true,
};

const validInput = {
  ticketId: VALID_ID,
  serviceDescription: 'Troca de lâmpada realizada',
  materialsUsed: 'Lâmpada LED 10W',
  notes: '',
  evidencePhotos: [],
};

function makeChamadoDoc(overrides = {}) {
  return {
    _id: VALID_ID,
    status: 'em atendimento',
    assignedToUserId: new Types.ObjectId(TECH_USER_ID),
    solicitanteId: new Types.ObjectId(),
    ticket_number: 'T-001',
    titulo: 'Lâmpada queimada',
    sla: {
      resolutionDueAt: new Date(Date.now() + 86_400_000), // 24h no futuro
      resolvedAt: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue(SESSION);
  mockHistoryCreate.mockResolvedValue({});
  mockNotificationCreate.mockResolvedValue({});
  mockNotificationInsertMany.mockResolvedValue([]);
  mockEmitToRoom.mockResolvedValue(true);
  mockSendEmail.mockResolvedValue(true);
  mockGetBusinessCalendarConfig.mockResolvedValue({
    timezone: 'America/Belem',
    workdayStart: '08:00',
    workdayEnd: '18:00',
    weekdays: [1, 2, 3, 4, 5],
    prazoAvaliacaoHoras: 48,
  });
});

// ── registerExecutionAction ──────────────────────────────────────

describe('registerExecutionAction', () => {
  it('retorna erro com dados inválidos (Zod)', async () => {
    const result = await registerExecutionAction({
      ticketId: 'invalid',
      serviceDescription: '',
      materialsUsed: undefined,
      notes: undefined,
      evidencePhotos: [],
    });
    expect(result.ok).toBe(false);
  });

  it('retorna erro se chamado não encontrado', async () => {
    mockChamadoFindById.mockResolvedValue(null);
    const result = await registerExecutionAction(validInput);
    expect(result).toEqual({ ok: false, error: 'Chamado não encontrado.' });
  });

  it('retorna erro se técnico não está atribuído ao chamado', async () => {
    mockChamadoFindById.mockResolvedValue(
      makeChamadoDoc({ assignedToUserId: new Types.ObjectId() }), // outro técnico
    );
    const result = await registerExecutionAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('não está atribuído');
  });

  it('retorna erro se chamado não está em atendimento', async () => {
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc({ status: 'validado' }));
    const result = await registerExecutionAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('em atendimento');
  });

  it('retorna erro se chamado está pausado aguardando terceiros', async () => {
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc({ status: 'aguardando_terceiros' }));
    const result = await registerExecutionAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Retome o atendimento');
  });

  it('registra execução com sucesso (dentro do SLA)', async () => {
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc());
    mockChamadoUpdateOne.mockResolvedValue({ matchedCount: 1 });
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ name: 'Técnico 1' }) }),
    });
    mockUserFind.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve([]) }),
    });

    const result = await registerExecutionAction(validInput);
    expect(result).toEqual({ ok: true });

    // Verifica update no chamado
    const updateCall = mockChamadoUpdateOne.mock.calls[0];
    const setFields = updateCall[1].$set;
    expect(setFields.status).toBe('concluído');
    expect(setFields['sla.resolvedAt']).toBeInstanceOf(Date);
    // Dentro do SLA, não deve ter resolutionBreachedAt
    expect(setFields['sla.resolutionBreachedAt']).toBeUndefined();

    // Verifica push de execution
    expect(updateCall[1].$push.executions).toBeDefined();
    expect(updateCall[1].$push.executions.serviceDescription).toBe('Troca de lâmpada realizada');
    expect(updateCall[1].$push.executions.materialsUsed).toBe('Lâmpada LED 10W');
    expect(updateCall[1].$push.executions.notes).toBe('');

    // Verifica histórico
    expect(mockHistoryCreate).toHaveBeenCalledOnce();
  });

  it('registra breach quando execução é após prazo de resolução', async () => {
    const pastDue = new Date(Date.now() - 3_600_000); // 1h atrás
    mockChamadoFindById.mockResolvedValue(
      makeChamadoDoc({
        sla: { resolutionDueAt: pastDue, resolvedAt: null },
      }),
    );
    mockChamadoUpdateOne.mockResolvedValue({ matchedCount: 1 });
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ name: 'Técnico 1' }) }),
    });
    mockUserFind.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve([]) }),
    });

    const result = await registerExecutionAction(validInput);
    expect(result).toEqual({ ok: true });

    // Deve ter resolutionBreachedAt
    const setFields = mockChamadoUpdateOne.mock.calls[0][1].$set;
    expect(setFields['sla.resolutionBreachedAt']).toBeInstanceOf(Date);
  });

  it('retorna erro se matchedCount = 0 (race condition)', async () => {
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc());
    mockChamadoUpdateOne.mockResolvedValue({ matchedCount: 0 });

    const result = await registerExecutionAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('já foi concluído');
  });

  it('envia notificações para managers e solicitante', async () => {
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc());
    mockChamadoUpdateOne.mockResolvedValue({ matchedCount: 1 });
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ name: 'Técnico 1' }) }),
    });

    const managers = [{ _id: new Types.ObjectId() }, { _id: new Types.ObjectId() }];
    mockUserFind.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve(managers) }),
    });

    await registerExecutionAction(validInput);

    // 2 managers em lote (insertMany) + 1 solicitante (create) = 3 notificações
    expect(mockNotificationInsertMany).toHaveBeenCalledTimes(1);
    expect(mockNotificationInsertMany.mock.calls[0][0]).toHaveLength(2);
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
  });
});

// ── prazo para avaliar · spec 0010, AC-1 e AC-9 ──────────────────

describe('registerExecutionAction · prazo para avaliar', () => {
  function prepararSucesso(managers: { _id: Types.ObjectId }[] = []) {
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc());
    mockChamadoUpdateOne.mockResolvedValue({ matchedCount: 1 });
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ name: 'Técnico 1' }) }),
    });
    mockUserFind.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve(managers) }),
    });
  }

  it('grava prazoAvaliacaoAte = conclusão + horas da configuração, no mesmo $set', async () => {
    // Arrange
    prepararSucesso();
    mockGetBusinessCalendarConfig.mockResolvedValue({
      timezone: 'America/Belem',
      workdayStart: '08:00',
      workdayEnd: '18:00',
      weekdays: [1, 2, 3, 4, 5],
      prazoAvaliacaoHoras: 24,
    });

    // Act
    await registerExecutionAction(validInput);

    // Assert
    const set = mockChamadoUpdateOne.mock.calls[0][1].$set;
    expect(set.status).toBe('concluído');
    expect(set.prazoAvaliacaoAte).toBeInstanceOf(Date);
    expect(set.prazoAvaliacaoAte.getTime() - set.concludedAt.getTime()).toBe(24 * 3_600_000);
  });

  it('usa 48 horas e não bloqueia a execução quando a configuração falha', async () => {
    // Arrange
    prepararSucesso();
    mockGetBusinessCalendarConfig.mockRejectedValue(new Error('banco fora'));

    // Act
    const result = await registerExecutionAction(validInput);

    // Assert
    expect(result).toEqual({ ok: true });
    const set = mockChamadoUpdateOne.mock.calls[0][1].$set;
    expect(set.prazoAvaliacaoAte.getTime() - set.concludedAt.getTime()).toBe(48 * 3_600_000);
  });

  it('o solicitante recebe o prazo no payload e a frase na notificação; os gestores não', async () => {
    // Arrange
    const managers = [{ _id: new Types.ObjectId() }];
    prepararSucesso(managers);

    // Act
    await registerExecutionAction(validInput);

    // Assert
    const doSolicitante = mockNotificationCreate.mock.calls[0][0];
    expect(doSolicitante.data.prazoAvaliacaoAte).toEqual(expect.any(String));
    expect(doSolicitante.body).toMatch(
      /Avalie ou recuse o serviço até \d{2}\/\d{2} às \d{2}:\d{2}/,
    );

    const dosGestores = mockNotificationInsertMany.mock.calls[0][0][0];
    expect(dosGestores.data.prazoAvaliacaoAte).toBeUndefined();
    expect(dosGestores.body).toBe('Lâmpada queimada');

    const salaGestores = mockEmitToRoom.mock.calls.find((c) => c[0] === 'managers');
    expect(salaGestores?.[2].prazoAvaliacaoAte).toBeUndefined();
    const salaSolicitante = mockEmitToRoom.mock.calls.find((c) => String(c[0]).startsWith('user:'));
    expect(salaSolicitante?.[2].prazoAvaliacaoTexto).toMatch(/^Avalie ou recuse o serviço até/);
  });
});
