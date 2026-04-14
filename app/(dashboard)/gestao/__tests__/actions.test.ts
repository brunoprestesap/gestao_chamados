import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const mockRequireManager = vi.fn();
const mockRequireSession = vi.fn();
const mockCanManage = vi.fn();
vi.mock('@/lib/dal', () => ({
  requireManager: () => mockRequireManager(),
  requireSession: () => mockRequireSession(),
  canManage: (role: string) => mockCanManage(role),
}));

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/realtime-emit', () => ({ emitToRoom: vi.fn().mockResolvedValue(true) }));

vi.mock('@/lib/expediente-config', () => ({
  getBusinessCalendarConfig: vi.fn().mockResolvedValue({
    timezone: 'America/Belem',
    workdayStart: '08:00',
    workdayEnd: '18:00',
    weekdays: [1, 2, 3, 4, 5],
  }),
}));

vi.mock('@/lib/holidays', () => ({
  getActiveHolidaysForRange: vi.fn().mockResolvedValue(new Set()),
}));

const mockChamadoFindById = vi.fn();
const mockChamadoUpdateOne = vi.fn();
const mockChamadoFindOneAndUpdate = vi.fn();
const mockChamadoCountDocuments = vi.fn();
const mockChamadoAggregate = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    findById: (...args: unknown[]) => mockChamadoFindById(...args),
    updateOne: (...args: unknown[]) => mockChamadoUpdateOne(...args),
    findOneAndUpdate: (...args: unknown[]) => mockChamadoFindOneAndUpdate(...args),
    countDocuments: (...args: unknown[]) => mockChamadoCountDocuments(...args),
    aggregate: (...args: unknown[]) => mockChamadoAggregate(...args),
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

const mockSlaFindOne = vi.fn();
vi.mock('@/models/SlaConfig', () => ({
  SlaConfigModel: { findOne: (...args: unknown[]) => mockSlaFindOne(...args) },
}));

const mockUserFind = vi.fn();
const mockUserFindById = vi.fn();
vi.mock('@/models/user.model', () => ({
  UserModel: {
    find: (...args: unknown[]) => mockUserFind(...args),
    findById: (...args: unknown[]) => mockUserFindById(...args),
  },
}));

const mockServiceCatalogFindById = vi.fn();
vi.mock('@/models/ServiceCatalog', () => ({
  ServiceCatalogModel: {
    findById: (...args: unknown[]) => mockServiceCatalogFindById(...args),
  },
}));

import {
  assignTicketAction,
  classificarChamadoAction,
  closeTicketAction,
} from '@/app/(dashboard)/gestao/actions';

// ── Helpers ──────────────────────────────────────────────────────

const VALID_ID = new Types.ObjectId().toHexString();
const VALID_TECH_ID = new Types.ObjectId().toHexString();
const SESSION = { userId: new Types.ObjectId().toHexString(), role: 'Admin', username: 'admin' };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireManager.mockResolvedValue(SESSION);
  mockRequireSession.mockResolvedValue(SESSION);
  mockCanManage.mockReturnValue(true);
  mockHistoryCreate.mockResolvedValue({});
  mockNotificationCreate.mockResolvedValue({});
});

// ── classificarChamadoAction ─────────────────────────────────────

describe('classificarChamadoAction', () => {
  const validInput = {
    chamadoId: VALID_ID,
    naturezaAtendimento: 'Padrão' as const,
    finalPriority: 'NORMAL' as const,
    classificationNotes: '',
  };

  it('retorna erro com dados inválidos (Zod)', async () => {
    const result = await classificarChamadoAction({
      chamadoId: 'invalid',
      naturezaAtendimento: 'Padrão' as const,
      finalPriority: 'NORMAL' as const,
      classificationNotes: '',
    });
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('retorna erro se chamado não encontrado', async () => {
    mockChamadoFindById.mockResolvedValue(null);
    const result = await classificarChamadoAction(validInput);
    expect(result).toEqual({ ok: false, error: 'Chamado não encontrado.' });
  });

  it('retorna erro se chamado não está aberto', async () => {
    mockChamadoFindById.mockResolvedValue({ _id: VALID_ID, status: 'validado' });
    const result = await classificarChamadoAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('aberto');
  });

  it('retorna erro se não há SLA config ativa', async () => {
    mockChamadoFindById.mockResolvedValue({ _id: VALID_ID, status: 'aberto' });
    mockSlaFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });

    const result = await classificarChamadoAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('SLA');
  });

  it('classifica com sucesso e cria histórico', async () => {
    mockChamadoFindById.mockResolvedValue({ _id: VALID_ID, status: 'aberto' });
    mockSlaFindOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          responseTargetMinutes: 120,
          resolutionTargetMinutes: 480,
          businessHoursOnly: true,
          version: 'v1',
        }),
    });
    mockChamadoUpdateOne.mockResolvedValue({ modifiedCount: 1 });

    const result = await classificarChamadoAction(validInput);
    expect(result).toEqual({ ok: true });
    expect(mockChamadoUpdateOne).toHaveBeenCalledOnce();
    expect(mockHistoryCreate).toHaveBeenCalledOnce();

    // Verifica que o update inclui dados de SLA
    const updateCall = mockChamadoUpdateOne.mock.calls[0];
    const setFields = updateCall[1].$set;
    expect(setFields.status).toBe('validado');
    expect(setFields.finalPriority).toBe('NORMAL');
    expect(setFields['sla.responseDueAt']).toBeInstanceOf(Date);
    expect(setFields['sla.resolutionDueAt']).toBeInstanceOf(Date);
    expect(setFields['sla.configVersion']).toBe('v1');
  });
});

// ── closeTicketAction ────────────────────────────────────────────

describe('closeTicketAction', () => {
  const validInput = { ticketId: VALID_ID, closureNotes: '' };

  it('retorna erro se role não pode encerrar', async () => {
    mockCanManage.mockReturnValue(false);
    mockRequireSession.mockResolvedValue({ ...SESSION, role: 'Solicitante' });
    const result = await closeTicketAction(validInput);
    expect(result.ok).toBe(false);
  });

  it('retorna erro se chamado não encontrado (update retorna null)', async () => {
    mockChamadoFindOneAndUpdate.mockResolvedValue(null);
    mockChamadoFindById.mockReturnValue({ lean: () => Promise.resolve(null) });

    const result = await closeTicketAction(validInput);
    expect(result.ok).toBe(false);
  });

  it('retorna erro se chamado não está concluído', async () => {
    mockChamadoFindOneAndUpdate.mockResolvedValue(null);
    mockChamadoFindById.mockReturnValue({
      lean: () => Promise.resolve({ _id: VALID_ID, status: 'em atendimento' }),
    });

    const result = await closeTicketAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Concluído');
  });

  it('encerra com sucesso', async () => {
    const updatedDoc = {
      _id: VALID_ID,
      status: 'encerrado',
      ticket_number: 'T-001',
      titulo: 'Teste',
      solicitanteId: new Types.ObjectId(),
    };
    mockChamadoFindOneAndUpdate.mockResolvedValue(updatedDoc);
    mockUserFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ name: 'Admin' }) }),
    });

    const result = await closeTicketAction(validInput);
    expect(result).toEqual({ ok: true });
    expect(mockHistoryCreate).toHaveBeenCalledOnce();
    expect(mockNotificationCreate).toHaveBeenCalledOnce();
  });
});

// ── assignTicketAction ───────────────────────────────────────────

describe('assignTicketAction', () => {
  const validInput = { ticketId: VALID_ID, preferredTechnicianId: VALID_TECH_ID };
  const subtypeId = new Types.ObjectId();
  const chamadoDoc = {
    _id: VALID_ID,
    status: 'validado',
    assignedToUserId: null,
    catalogServiceId: new Types.ObjectId(),
    sla: { responseDueAt: new Date(Date.now() + 3600000) },
  };

  it('retorna erro se chamado não encontrado', async () => {
    mockChamadoFindById.mockResolvedValue(null);
    const result = await assignTicketAction(validInput);
    expect(result.ok).toBe(false);
  });

  it('retorna erro se chamado já atribuído', async () => {
    mockChamadoFindById.mockResolvedValue({
      ...chamadoDoc,
      assignedToUserId: new Types.ObjectId(),
    });
    const result = await assignTicketAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('já está atribuído');
  });

  it('retorna erro se chamado sem catalogServiceId', async () => {
    mockChamadoFindById.mockResolvedValue({
      ...chamadoDoc,
      catalogServiceId: null,
    });
    const result = await assignTicketAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('serviço catalogado');
  });

  it('retorna erro se status não é validado nem emvalidacao', async () => {
    mockChamadoFindById.mockResolvedValue({ ...chamadoDoc, status: 'aberto' });
    const result = await assignTicketAction(validInput);
    expect(result.ok).toBe(false);
  });

  it('retorna erro se técnico preferido não tem especialidade', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoDoc);
    mockServiceCatalogFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ subtypeId }) }),
    });
    mockUserFindById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: VALID_TECH_ID,
          name: 'Técnico A',
          role: 'Técnico',
          isActive: true,
          specialties: [new Types.ObjectId()], // diferente de subtypeId
        }),
    });

    const result = await assignTicketAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('especialidade');
  });

  it('atribui com sucesso ao técnico preferido', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoDoc);
    mockServiceCatalogFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ subtypeId }) }),
    });
    mockUserFindById
      .mockReturnValueOnce({
        lean: () =>
          Promise.resolve({
            _id: VALID_TECH_ID,
            name: 'Técnico A',
            role: 'Técnico',
            isActive: true,
            specialties: [subtypeId],
            maxAssignedTickets: 5,
          }),
      })
      // Para a busca de nome do assignedBy
      .mockReturnValueOnce({
        select: () => ({ lean: () => Promise.resolve({ name: 'Admin' }) }),
      });

    mockChamadoCountDocuments.mockResolvedValue(2); // abaixo do limite
    mockChamadoFindOneAndUpdate.mockResolvedValue({
      _id: VALID_ID,
      ticket_number: 'T-001',
      titulo: 'Teste',
      status: 'em atendimento',
    });

    const result = await assignTicketAction(validInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.strategy).toBe('MANUAL');
      expect(result.technicianName).toBe('Técnico A');
    }
    expect(mockHistoryCreate).toHaveBeenCalledOnce();
    expect(mockNotificationCreate).toHaveBeenCalledOnce();
  });

  it('faz fallback quando técnico preferido está sobrecarregado', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoDoc);
    mockServiceCatalogFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ subtypeId }) }),
    });

    // Técnico preferido sobrecarregado
    mockUserFindById
      .mockReturnValueOnce({
        lean: () =>
          Promise.resolve({
            _id: VALID_TECH_ID,
            name: 'Técnico A',
            role: 'Técnico',
            isActive: true,
            specialties: [subtypeId],
            maxAssignedTickets: 3,
          }),
      })
      // Para busca de nome do assignedBy
      .mockReturnValueOnce({
        select: () => ({ lean: () => Promise.resolve({ name: 'Admin' }) }),
      });

    mockChamadoCountDocuments.mockResolvedValue(3); // >= max

    // Fallback: findBestTechnician
    const fallbackTechId = new Types.ObjectId();
    mockUserFind.mockReturnValue({
      lean: () =>
        Promise.resolve([
          {
            _id: fallbackTechId,
            name: 'Técnico B',
            role: 'Técnico',
            isActive: true,
            specialties: [subtypeId],
            maxAssignedTickets: 5,
          },
        ]),
    });
    mockChamadoAggregate.mockResolvedValue([{ _id: fallbackTechId, count: 1 }]);

    mockChamadoFindOneAndUpdate.mockResolvedValue({
      _id: VALID_ID,
      ticket_number: 'T-001',
      titulo: 'Teste',
      status: 'em atendimento',
    });

    const result = await assignTicketAction(validInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.strategy).toBe('FALLBACK');
      expect(result.technicianName).toBe('Técnico B');
    }
  });

  it('retorna erro se update atômico falha (race condition)', async () => {
    mockChamadoFindById.mockResolvedValue(chamadoDoc);
    mockServiceCatalogFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ subtypeId }) }),
    });
    mockUserFindById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: VALID_TECH_ID,
          name: 'Técnico A',
          role: 'Técnico',
          isActive: true,
          specialties: [subtypeId],
          maxAssignedTickets: 5,
        }),
    });
    mockChamadoCountDocuments.mockResolvedValue(0);
    mockChamadoFindOneAndUpdate.mockResolvedValue(null); // race condition

    const result = await assignTicketAction(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('atribuído por outro');
  });
});
