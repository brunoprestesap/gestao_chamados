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
vi.mock('@/models/Notification', () => ({
  NotificationModel: { create: (...args: unknown[]) => mockNotificationCreate(...args) },
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
});

// ── registerExecutionAction ──────────────────────────────────────

describe('registerExecutionAction', () => {
  it('retorna erro com dados inválidos (Zod)', async () => {
    const result = await registerExecutionAction({
      ticketId: 'invalid',
      serviceDescription: '',
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

    // 2 managers + 1 solicitante = 3 notificações
    expect(mockNotificationCreate).toHaveBeenCalledTimes(3);
  });
});
