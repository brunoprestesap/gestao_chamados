import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const mockRequireSession = vi.fn();
vi.mock('@/lib/dal', () => ({
  requireSession: () => mockRequireSession(),
  canManage: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/realtime-emit', () => ({ emitToRoom: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/email/send-notification-email', () => ({
  sendNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

const mockChamadoFindOneAndUpdate = vi.fn();
const mockChamadoFindById = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    findOneAndUpdate: (...args: unknown[]) => mockChamadoFindOneAndUpdate(...args),
    findById: (...args: unknown[]) => mockChamadoFindById(...args),
    create: vi.fn(),
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

const mockUserFind = vi.fn();
const mockUserFindById = vi.fn();
vi.mock('@/models/user.model', () => ({
  UserModel: {
    find: (...args: unknown[]) => mockUserFind(...args),
    findById: (...args: unknown[]) => mockUserFindById(...args),
  },
}));

// ── Import after mocks ──────────────────────────────────────────

import { refuseServiceAction } from '@/app/(dashboard)/meus-chamados/actions';
import { emitToRoom } from '@/lib/realtime-emit';

// ── Helpers ─────────────────────────────────────────────────────

const SOLICITANTE_ID = new Types.ObjectId().toHexString();
const TECH_ID = new Types.ObjectId();
const MANAGER_ID = new Types.ObjectId();
const TICKET_ID = new Types.ObjectId().toHexString();

const SESSION = { userId: SOLICITANTE_ID, role: 'Solicitante', username: 'joao' };

function validInput() {
  return {
    ticketId: TICKET_ID,
    reason: 'O problema do ar-condicionado voltou após o atendimento realizado',
  };
}

function makeUpdatedDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: TICKET_ID,
    status: 'em atendimento',
    ticket_number: 'T-042',
    titulo: 'Ar-Condicionado — Sala 205',
    solicitanteId: new Types.ObjectId(SOLICITANTE_ID),
    assignedToUserId: TECH_ID,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue(SESSION);
  mockHistoryCreate.mockResolvedValue({});
  mockNotificationCreate.mockResolvedValue({});

  // Default: findOneAndUpdate succeeds
  mockChamadoFindOneAndUpdate.mockResolvedValue(makeUpdatedDoc());

  // UserModel.findById(...).select(...).lean() chain for solicitante name
  mockUserFindById.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve({ name: 'João Silva' }) }),
  });

  // UserModel.find(...).select(...).lean() chain for managers
  mockUserFind.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve([{ _id: MANAGER_ID }]) }),
  });
});

// ── Validação Zod ───────────────────────────────────────────────

describe('refuseServiceAction — validação', () => {
  it('retorna erro com ticketId inválido', async () => {
    const result = await refuseServiceAction({ ticketId: 'invalid', reason: 'Motivo válido com mais de 10 chars' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('ID inválido');
  });

  it('retorna erro com reason curto demais', async () => {
    const result = await refuseServiceAction({ ticketId: TICKET_ID, reason: 'curto' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('10 caracteres');
  });
});

// ── Diagnóstico quando findOneAndUpdate retorna null ────────────

describe('refuseServiceAction — diagnóstico de falha', () => {
  beforeEach(() => {
    mockChamadoFindOneAndUpdate.mockResolvedValue(null);
  });

  it('retorna erro se chamado não encontrado', async () => {
    mockChamadoFindById.mockReturnValue({ lean: () => Promise.resolve(null) });

    const result = await refuseServiceAction(validInput());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Chamado não encontrado.');
  });

  it('retorna erro se usuário não é o criador', async () => {
    mockChamadoFindById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: TICKET_ID,
          solicitanteId: new Types.ObjectId(), // outro userId
          status: 'encerrado',
          evaluation: {},
        }),
    });

    const result = await refuseServiceAction(validInput());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('criador do chamado');
  });

  it('retorna erro se chamado não está encerrado', async () => {
    mockChamadoFindById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: TICKET_ID,
          solicitanteId: new Types.ObjectId(SOLICITANTE_ID),
          status: 'em atendimento',
          evaluation: {},
        }),
    });

    const result = await refuseServiceAction(validInput());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Encerrado');
  });

  it('retorna erro se chamado já foi avaliado', async () => {
    mockChamadoFindById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: TICKET_ID,
          solicitanteId: new Types.ObjectId(SOLICITANTE_ID),
          status: 'encerrado',
          evaluation: { rating: 4 },
        }),
    });

    const result = await refuseServiceAction(validInput());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('já foi avaliado');
  });
});

// ── Fluxo de sucesso ────────────────────────────────────────────

describe('refuseServiceAction — sucesso', () => {
  it('retorna ok:true', async () => {
    const result = await refuseServiceAction(validInput());
    expect(result).toEqual({ ok: true });
  });

  it('chama findOneAndUpdate com filtro e update corretos', async () => {
    await refuseServiceAction(validInput());

    expect(mockChamadoFindOneAndUpdate).toHaveBeenCalledOnce();
    const [filter, update, options] = mockChamadoFindOneAndUpdate.mock.calls[0];

    // Filtro
    expect(filter._id).toBe(TICKET_ID);
    expect(filter.status).toBe('encerrado');
    expect(filter['evaluation.rating']).toEqual({ $exists: false });

    // Update $set
    expect(update.$set.status).toBe('em atendimento');
    expect(update.$set.closedAt).toBeNull();
    expect(update.$set.concludedAt).toBeNull();
    expect(update.$set['sla.resolvedAt']).toBeNull();

    // Update $push
    expect(update.$push.serviceRefusals.reason).toBe(validInput().reason);

    // Options
    expect(options).toEqual({ new: true });
  });

  it('cria registro de histórico com action recusa_servico', async () => {
    await refuseServiceAction(validInput());

    expect(mockHistoryCreate).toHaveBeenCalledOnce();
    const [arg] = mockHistoryCreate.mock.calls[0];
    expect(arg.action).toBe('recusa_servico');
    expect(arg.statusAnterior).toBe('encerrado');
    expect(arg.statusNovo).toBe('em atendimento');
    expect(arg.observacoes).toContain('Serviço recusado');
  });

  it('emite evento ticket:service_refused para técnico e managers', async () => {
    await refuseServiceAction(validInput());

    const calls = vi.mocked(emitToRoom).mock.calls;
    const techCall = calls.find((c) => c[0] === `user:${String(TECH_ID)}`);
    const managersCall = calls.find((c) => c[0] === 'managers');

    expect(techCall).toBeDefined();
    expect(techCall![1]).toBe('ticket:service_refused');

    expect(managersCall).toBeDefined();
    expect(managersCall![1]).toBe('ticket:service_refused');
  });

  it('persiste notificações no MongoDB para técnico e managers', async () => {
    await refuseServiceAction(validInput());

    // Técnico + 1 manager = 2 notificações
    expect(mockNotificationCreate).toHaveBeenCalledTimes(2);

    const types = mockNotificationCreate.mock.calls.map(
      (c: unknown[]) => (c[0] as Record<string, unknown>).type,
    );
    expect(types.every((t: unknown) => t === 'ticket:service_refused')).toBe(true);
  });

  it('notifica apenas managers quando não há técnico atribuído', async () => {
    mockChamadoFindOneAndUpdate.mockResolvedValue(
      makeUpdatedDoc({ assignedToUserId: null }),
    );

    await refuseServiceAction(validInput());

    // Apenas 1 manager notificado (sem técnico)
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
  });
});

// ── Erro de banco ───────────────────────────────────────────────

describe('refuseServiceAction — erro de banco', () => {
  it('retorna ok:false quando findOneAndUpdate lança exceção', async () => {
    mockChamadoFindOneAndUpdate.mockRejectedValue(new Error('DB connection lost'));

    const result = await refuseServiceAction(validInput());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('DB connection lost');
  });
});
