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
vi.mock('@/lib/realtime-emit', () => ({ emitToRoom: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/email/send-notification-email', () => ({
  sendNotificationEmail: vi.fn().mockResolvedValue(true),
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

vi.mock('@/models/PauseLog', () => ({
  PauseLogModel: { create: vi.fn(), findOneAndUpdate: vi.fn() },
}));

const mockUserFindById = vi.fn();
const mockUserFind = vi.fn();
vi.mock('@/models/user.model', () => ({
  UserModel: {
    findById: (...args: unknown[]) => mockUserFindById(...args),
    find: (...args: unknown[]) => mockUserFind(...args),
  },
}));

vi.mock('@/lib/sla-utils', () => ({
  addElapsedMinutes: vi.fn(),
  evaluateResolutionBreach: vi.fn().mockReturnValue(null),
}));

import { addMaterialObservationAction } from '@/app/(dashboard)/chamados-atribuidos/actions';

// ── Helpers ──────────────────────────────────────────────────────

const VALID_ID = new Types.ObjectId().toHexString();

const SESSION_TECNICO = {
  userId: TECH_USER_ID,
  role: 'Técnico' as const,
  username: 'tecnico1',
  isActive: true,
};

const SESSION_PREPOSTO = {
  userId: new Types.ObjectId().toHexString(),
  role: 'Preposto' as const,
  username: 'preposto1',
  isActive: true,
};

const SESSION_SOLICITANTE = {
  userId: new Types.ObjectId().toHexString(),
  role: 'Solicitante' as const,
  username: 'solicitante1',
  isActive: true,
};

function makeChamadoDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(VALID_ID),
    status: 'em atendimento',
    assignedToUserId: new Types.ObjectId(TECH_USER_ID),
    solicitanteId: new Types.ObjectId(),
    ticket_number: 'CHM-2024-00001',
    titulo: 'Problema na iluminação',
    ...overrides,
  };
}

function setupUserMocks() {
  mockUserFindById.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve({ name: 'Técnico Silva' }) }),
  });
  mockUserFind.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve([]) }),
  });
}

const VALID_INPUT = {
  ticketId: VALID_ID,
  description: 'Necessário 5 lâmpadas T8 para corredor 3º andar',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue(SESSION_TECNICO);
  mockHistoryCreate.mockResolvedValue({});
  mockNotificationCreate.mockResolvedValue({});
  mockNotificationInsertMany.mockResolvedValue([]);
  mockChamadoUpdateOne.mockResolvedValue({ matchedCount: 1 });
  setupUserMocks();
});

// ── Validação de acesso ──────────────────────────────────────────

describe('addMaterialObservationAction — acesso', () => {
  it('deve retornar erro quando role é Solicitante', async () => {
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);

    const result = await addMaterialObservationAction(VALID_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Acesso negado');
  });

  it('deve aceitar quando role é Técnico', async () => {
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

    const result = await addMaterialObservationAction(VALID_INPUT);

    expect(result.ok).toBe(true);
  });

  it('deve aceitar quando role é Preposto', async () => {
    mockRequireSession.mockResolvedValue(SESSION_PREPOSTO);
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

    const result = await addMaterialObservationAction(VALID_INPUT);

    expect(result.ok).toBe(true);
  });
});

// ── Validação de input ───────────────────────────────────────────

describe('addMaterialObservationAction — validação', () => {
  it('deve retornar erro quando descrição é curta demais', async () => {
    const result = await addMaterialObservationAction({
      ticketId: VALID_ID,
      description: 'curto',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('mínimo');
  });

  it('deve retornar erro quando ticketId é inválido', async () => {
    const result = await addMaterialObservationAction({
      ticketId: 'invalid',
      description: 'Material necessário para a troca de lâmpadas',
    });

    expect(result.ok).toBe(false);
  });
});

// ── Validação de estado do chamado ───────────────────────────────

describe('addMaterialObservationAction — estado do chamado', () => {
  it('deve retornar erro quando chamado não existe', async () => {
    mockChamadoFindById.mockResolvedValue(null);

    const result = await addMaterialObservationAction(VALID_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('não encontrado');
  });

  it('deve retornar erro quando chamado não está em atendimento', async () => {
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc({ status: 'validado' }));

    const result = await addMaterialObservationAction(VALID_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('em atendimento');
  });

  it('deve retornar erro quando técnico não está atribuído', async () => {
    mockChamadoFindById.mockResolvedValue(
      makeChamadoDoc({ assignedToUserId: new Types.ObjectId() }),
    );

    const result = await addMaterialObservationAction(VALID_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('não está atribuído');
  });

  it('deve retornar erro quando updateOne não faz match (race condition)', async () => {
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc());
    mockChamadoUpdateOne.mockResolvedValue({ matchedCount: 0 });

    const result = await addMaterialObservationAction(VALID_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Atualize a página');
  });
});

// ── Fluxo de sucesso ─────────────────────────────────────────────

describe('addMaterialObservationAction — sucesso', () => {
  it('deve fazer push no array materialObservations com createdByName', async () => {
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

    await addMaterialObservationAction(VALID_INPUT);

    expect(mockChamadoUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = mockChamadoUpdateOne.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];

    // Filtro atômico inclui assignedToUserId para técnico
    expect(filter).toHaveProperty('assignedToUserId');
    expect(filter).toHaveProperty('status', 'em atendimento');

    // Push no array com nome desnormalizado
    const pushOp = update.$push as { materialObservations: Record<string, unknown> };
    expect(pushOp.materialObservations).toBeDefined();
    expect(pushOp.materialObservations.description).toBe(VALID_INPUT.description);
    expect(pushOp.materialObservations.createdByName).toBe('Técnico Silva');
  });

  it('deve criar registro no ChamadoHistory com action observacao_material', async () => {
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

    await addMaterialObservationAction(VALID_INPUT);

    expect(mockHistoryCreate).toHaveBeenCalledTimes(1);
    const historyArgs = mockHistoryCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(historyArgs.action).toBe('observacao_material');
    expect(historyArgs.statusAnterior).toBe('em atendimento');
    expect(historyArgs.statusNovo).toBe('em atendimento');
    expect(historyArgs.observacoes).toContain('Material necessário');
  });

  it('NÃO deve alterar o status do chamado (sem $set.status no updateOne)', async () => {
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

    await addMaterialObservationAction(VALID_INPUT);

    const [, update] = mockChamadoUpdateOne.mock.calls[0] as [unknown, Record<string, unknown>];
    // Verifica que não há $set (o chamado continua em atendimento)
    expect(update.$set).toBeUndefined();
  });

  it('deve criar notificação para o solicitante', async () => {
    const solicitanteId = new Types.ObjectId();
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc({ solicitanteId }));

    await addMaterialObservationAction(VALID_INPUT);

    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    const notifArgs = mockNotificationCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(String(notifArgs.userId)).toBe(String(solicitanteId));
    expect(notifArgs.type).toBe('ticket:material_observation');
  });

  it('Preposto pode registrar sem estar atribuído (filtro atômico sem assignedToUserId)', async () => {
    mockRequireSession.mockResolvedValue(SESSION_PREPOSTO);
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

    await addMaterialObservationAction(VALID_INPUT);

    const [filter] = mockChamadoUpdateOne.mock.calls[0] as [Record<string, unknown>];
    expect(filter).not.toHaveProperty('assignedToUserId');
  });
});
