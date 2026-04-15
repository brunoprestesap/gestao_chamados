import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────
// vi.mock é hoisted: factories NÃO podem referenciar variáveis externas.
// Usar vi.fn() diretamente nos factories e acessar via import após o hoisting.

vi.mock('@/lib/db', () => ({
  dbConnect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/chamado-utils', () => ({
  generateTicketNumber: vi.fn().mockResolvedValue('CHM-2024-00001'),
}));

vi.mock('@/lib/expediente-config', () => ({
  getBusinessCalendarConfig: vi.fn().mockResolvedValue({
    timezone: 'America/Belem',
    workdayStart: '08:00',
    workdayEnd: '18:00',
    weekdays: [1, 2, 3, 4, 5],
  }),
}));

vi.mock('@/lib/realtime-emit', () => ({
  emitToRoom: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/recurring-utils', () => ({
  calculateNextRunAt: vi.fn().mockReturnValue(new Date('2024-04-25T11:00:00Z')),
}));

vi.mock('@/models/RecurringTicket', () => ({
  RecurringTicketModel: {
    find: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock('@/models/user.model', () => ({
  UserModel: {
    find: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    create: vi.fn(),
  },
}));

vi.mock('@/models/ChamadoHistory', () => ({
  ChamadoHistoryModel: {
    create: vi.fn(),
  },
}));

vi.mock('@/models/Notification', () => ({
  NotificationModel: {
    insertMany: vi.fn(),
  },
}));

// Importações após os mocks
import { emitToRoom } from '@/lib/realtime-emit';
import { processRecurringTickets } from '@/lib/recurring-job';
import { ChamadoModel } from '@/models/Chamado';
import { ChamadoHistoryModel } from '@/models/ChamadoHistory';
import { NotificationModel } from '@/models/Notification';
import { RecurringTicketModel } from '@/models/RecurringTicket';
import { UserModel } from '@/models/user.model';

// ── Fixtures ─────────────────────────────────────────────────────

const MANAGER_ID_1 = 'a'.repeat(24);
const MANAGER_ID_2 = 'b'.repeat(24);
const SOLICITANTE_ID = 'c'.repeat(24);
const TEMPLATE_ID = 'd'.repeat(24);
const UNIT_ID = 'e'.repeat(24);
const CREATED_BY_ID = 'f'.repeat(24);
const CHAMADO_DOC_ID = '0'.repeat(24);

function makeTemplate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: TEMPLATE_ID,
    name: 'Inspeção Semanal',
    titulo: 'Verificação do ar-condicionado',
    descricao: 'Inspeção periódica',
    unitId: UNIT_ID,
    tipoServico: 'Ar-Condicionado',
    naturezaAtendimento: 'Padrão',
    grauUrgencia: 'Normal',
    solicitanteId: SOLICITANTE_ID,
    recurrenceType: 'weekly',
    dayOfWeek: 1,
    dayOfMonth: null,
    intervalDays: null,
    subtypeId: UNIT_ID,
    catalogServiceId: UNIT_ID,
    createdByUserId: CREATED_BY_ID,
    nextRunAt: new Date('2024-03-18T11:00:00Z'),
    isActive: true,
    ...overrides,
  };
}

function makeManagers() {
  return [{ _id: MANAGER_ID_1 }, { _id: MANAGER_ID_2 }];
}

function makeSolicitante(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: SOLICITANTE_ID,
    name: 'João Silva',
    isActive: true,
    ...overrides,
  };
}

// Helpers para encadear .lean() e .select().lean()
function withLean<T>(value: T) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

function withSelectLean<T>(value: T) {
  return {
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(value),
    }),
  };
}

// ── beforeEach ───────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(RecurringTicketModel.find).mockReturnValue(withLean([makeTemplate()]) as never);
  vi.mocked(UserModel.find).mockReturnValue(withSelectLean(makeManagers()) as never);
  vi.mocked(UserModel.findById).mockReturnValue(withSelectLean(makeSolicitante()) as never);
  vi.mocked(ChamadoModel.create).mockResolvedValue({ _id: CHAMADO_DOC_ID } as never);
  vi.mocked(ChamadoHistoryModel.create).mockResolvedValue({} as never);
  vi.mocked(NotificationModel.insertMany).mockResolvedValue([] as never);
  vi.mocked(RecurringTicketModel.updateOne).mockResolvedValue({ modifiedCount: 1 } as never);
});

// ── Testes ───────────────────────────────────────────────────────

describe('processRecurringTickets — sem templates pendentes', () => {
  it('should return report with zero processed when no templates are due', async () => {
    vi.mocked(RecurringTicketModel.find).mockReturnValue(withLean([]) as never);

    const report = await processRecurringTickets();

    expect(report.processed).toBe(0);
    expect(report.created).toBe(0);
    expect(report.errors).toBe(0);
    expect(report.details).toContain('Nenhum agendamento pendente.');
  });
});

describe('processRecurringTickets — fluxo principal', () => {
  it('should create one chamado and return report with created=1', async () => {
    const report = await processRecurringTickets();

    expect(report.processed).toBe(1);
    expect(report.created).toBe(1);
    expect(report.errors).toBe(0);
  });

  it('should call ChamadoModel.create with correct data', async () => {
    await processRecurringTickets();

    expect(ChamadoModel.create).toHaveBeenCalledOnce();
    const [arg] = vi.mocked(ChamadoModel.create).mock.calls[0];
    expect(arg.titulo).toBe('Verificação do ar-condicionado');
    expect(arg.status).toBe('aberto');
    expect(arg.tipoServico).toBe('Ar-Condicionado');
    expect(arg.grauUrgencia).toBe('Normal');
    expect(arg.ticket_number).toBe('CHM-2024-00001');
    expect(arg.localExato).toBe('Conforme agendamento');
  });

  it('should call ChamadoHistoryModel.create with abertura action', async () => {
    await processRecurringTickets();

    expect(ChamadoHistoryModel.create).toHaveBeenCalledOnce();
    const [arg] = vi.mocked(ChamadoHistoryModel.create).mock.calls[0];
    expect(arg.action).toBe('abertura');
    expect(arg.statusNovo).toBe('aberto');
    expect(arg.statusAnterior).toBeNull();
    expect(arg.observacoes).toContain('Inspeção Semanal');
  });

  it('should call NotificationModel.insertMany for each manager', async () => {
    await processRecurringTickets();

    expect(NotificationModel.insertMany).toHaveBeenCalledOnce();
    const [notifications] = vi.mocked(NotificationModel.insertMany).mock.calls[0] as [
      Array<{ type: string; title: string; readAt: unknown }>,
    ];
    expect(notifications).toHaveLength(2); // dois managers
    expect(notifications[0].type).toBe('ticket:new');
    expect(notifications[0].title).toContain('CHM-2024-00001');
    expect(notifications[0].readAt).toBeNull();
  });

  it('should call emitToRoom for managers room', async () => {
    await processRecurringTickets();

    expect(emitToRoom).toHaveBeenCalledOnce();
    expect(emitToRoom).toHaveBeenCalledWith(
      'managers',
      'ticket:new',
      expect.objectContaining({
        ticketNumber: 'CHM-2024-00001',
      }),
    );
  });

  it('should call RecurringTicketModel.updateOne with new nextRunAt', async () => {
    await processRecurringTickets();

    expect(RecurringTicketModel.updateOne).toHaveBeenCalledOnce();
    const [filter, update] = vi.mocked(RecurringTicketModel.updateOne).mock
      .calls[0] as unknown as [
      { _id: string },
      { $set: { nextRunAt: unknown; lastRunAt: unknown }; $inc: { totalGenerated: number } },
    ];
    expect(filter._id).toBe(TEMPLATE_ID);
    expect(update.$set.nextRunAt).toBeInstanceOf(Date);
    expect(update.$set.lastRunAt).toBeInstanceOf(Date);
    expect(update.$inc.totalGenerated).toBe(1);
  });

  it('should include OK detail in report', async () => {
    const report = await processRecurringTickets();

    expect(report.details.some((d) => d.startsWith('OK:'))).toBe(true);
    expect(report.details.some((d) => d.includes('CHM-2024-00001'))).toBe(true);
  });
});

describe('processRecurringTickets — solicitante inativo ou inexistente', () => {
  it('should skip chamado creation and increment errors when solicitante is inactive', async () => {
    vi.mocked(UserModel.findById).mockReturnValue(
      withSelectLean({ _id: SOLICITANTE_ID, name: 'João', isActive: false }) as never,
    );

    const report = await processRecurringTickets();

    expect(report.processed).toBe(1);
    expect(report.created).toBe(0);
    expect(report.errors).toBe(1);
    expect(ChamadoModel.create).not.toHaveBeenCalled();
  });

  it('should skip chamado creation and increment errors when solicitante is null', async () => {
    vi.mocked(UserModel.findById).mockReturnValue(withSelectLean(null) as never);

    const report = await processRecurringTickets();

    expect(report.processed).toBe(1);
    expect(report.created).toBe(0);
    expect(report.errors).toBe(1);
    expect(ChamadoModel.create).not.toHaveBeenCalled();
  });

  it('should include ERRO detail in report when solicitante is missing', async () => {
    vi.mocked(UserModel.findById).mockReturnValue(withSelectLean(null) as never);

    const report = await processRecurringTickets();

    expect(report.details.some((d) => d.startsWith('ERRO:'))).toBe(true);
  });
});

describe('processRecurringTickets — múltiplos templates', () => {
  it('should process all templates and accumulate report', async () => {
    const templates = [
      makeTemplate({ _id: 'd'.repeat(24), name: 'Template A' }),
      makeTemplate({ _id: '1'.repeat(24), name: 'Template B' }),
      makeTemplate({ _id: '2'.repeat(24), name: 'Template C' }),
    ];
    vi.mocked(RecurringTicketModel.find).mockReturnValue(withLean(templates) as never);

    const report = await processRecurringTickets();

    expect(report.processed).toBe(3);
    expect(report.created).toBe(3);
    expect(report.errors).toBe(0);
  });

  it('should continue processing remaining templates when one fails', async () => {
    const templates = [
      makeTemplate({ _id: 'd'.repeat(24), name: 'Template A' }),
      makeTemplate({ _id: '1'.repeat(24), name: 'Template B' }),
    ];
    vi.mocked(RecurringTicketModel.find).mockReturnValue(withLean(templates) as never);

    // Primeiro solicitante inativo, segundo ativo
    vi.mocked(UserModel.findById)
      .mockReturnValueOnce(
        withSelectLean({ _id: SOLICITANTE_ID, isActive: false }) as never,
      )
      .mockReturnValueOnce(withSelectLean(makeSolicitante()) as never);

    const report = await processRecurringTickets();

    expect(report.processed).toBe(2);
    expect(report.created).toBe(1);
    expect(report.errors).toBe(1);
  });
});

describe('processRecurringTickets — sem managers', () => {
  it('should skip NotificationModel.insertMany when no managers exist', async () => {
    vi.mocked(UserModel.find).mockReturnValue(withSelectLean([]) as never);

    const report = await processRecurringTickets();

    expect(report.created).toBe(1); // chamado criado mesmo sem managers
    expect(NotificationModel.insertMany).not.toHaveBeenCalled();
  });

  it('should still emit socket event even when no managers for notifications', async () => {
    vi.mocked(UserModel.find).mockReturnValue(withSelectLean([]) as never);

    await processRecurringTickets();

    expect(emitToRoom).toHaveBeenCalledOnce();
  });
});

describe('processRecurringTickets — template com subtypeId e catalogServiceId', () => {
  it('should set subtypeId and catalogServiceId as ObjectId', async () => {
    const subtypeId = '9'.repeat(24);
    const catalogServiceId = '8'.repeat(24);
    vi.mocked(RecurringTicketModel.find).mockReturnValue(
      withLean([makeTemplate({ subtypeId, catalogServiceId })]) as never,
    );

    await processRecurringTickets();

    const [arg] = vi.mocked(ChamadoModel.create).mock.calls[0];
    expect(arg.subtypeId).toBeDefined();
    expect(arg.catalogServiceId).toBeDefined();
    expect(String(arg.subtypeId)).toBe(subtypeId);
    expect(String(arg.catalogServiceId)).toBe(catalogServiceId);
  });
});

describe('processRecurringTickets — erros inesperados', () => {
  it('should increment errors and continue when ChamadoModel.create throws', async () => {
    vi.mocked(ChamadoModel.create).mockRejectedValue(new Error('DB write failed'));

    const report = await processRecurringTickets();

    expect(report.errors).toBe(1);
    expect(report.created).toBe(0);
    expect(report.details.some((d) => d.includes('DB write failed'))).toBe(true);
  });

  it('should use "Erro desconhecido" when non-Error is thrown', async () => {
    vi.mocked(ChamadoModel.create).mockRejectedValue('string error');

    const report = await processRecurringTickets();

    expect(report.details.some((d) => d.includes('Erro desconhecido'))).toBe(true);
  });

  it('should still update RecurringTicketModel.updateOne on successful creation even if emitToRoom fails', async () => {
    vi.mocked(emitToRoom).mockResolvedValue(false);

    const report = await processRecurringTickets();

    // Falha no socket não quebra o fluxo
    expect(report.created).toBe(1);
    expect(RecurringTicketModel.updateOne).toHaveBeenCalled();
  });
});

describe('processRecurringTickets — payload de notificação', () => {
  it('should include ticketNumber and title in socket payload', async () => {
    await processRecurringTickets();

    const [, , payload] = vi.mocked(emitToRoom).mock.calls[0];
    expect(payload).toMatchObject({
      ticketId: expect.any(String),
      ticketNumber: 'CHM-2024-00001',
      title: 'Verificação do ar-condicionado',
      openedBy: {
        id: SOLICITANTE_ID,
        name: 'João Silva',
      },
      at: expect.any(String),
    });
  });

  it('should include openedBy.name as undefined when solicitante.name is null', async () => {
    vi.mocked(UserModel.findById).mockReturnValue(
      withSelectLean({ _id: SOLICITANTE_ID, name: null, isActive: true }) as never,
    );

    await processRecurringTickets();

    const [, , payload] = vi.mocked(emitToRoom).mock.calls[0];
    expect((payload as { openedBy: { name?: string } }).openedBy.name).toBeUndefined();
  });
});
