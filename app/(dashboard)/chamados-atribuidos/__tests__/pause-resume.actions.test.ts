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
vi.mock('@/lib/sla-utils', () => ({
  addElapsedMinutes: vi.fn((from: Date, minutes: number) => new Date(from.getTime() + minutes * 60_000)),
  evaluateResolutionBreach: vi.fn().mockReturnValue(null),
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

const mockPauseLogCreate = vi.fn();
const mockPauseLogFindOneAndUpdate = vi.fn();
vi.mock('@/models/PauseLog', () => ({
  PauseLogModel: {
    create: (...args: unknown[]) => mockPauseLogCreate(...args),
    findOneAndUpdate: (...args: unknown[]) => mockPauseLogFindOneAndUpdate(...args),
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

import {
  pauseForRequesterAction,
  pauseTicketAction,
  resumeFromRequesterAction,
  resumeTicketAction,
} from '@/app/(dashboard)/chamados-atribuidos/actions';

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

const SESSION_ADMIN = {
  userId: new Types.ObjectId().toHexString(),
  role: 'Admin' as const,
  username: 'admin1',
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
    sla: {
      resolutionDueAt: new Date(Date.now() + 86_400_000),
      resolvedAt: null,
      pausedMinutes: 0,
    },
    slaPausedAt: undefined,
    pauseReason: undefined,
    pauseDetails: undefined,
    totalPausedMinutes: 0,
    ...overrides,
  };
}

function setupUserMocks() {
  mockUserFindById.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve({ name: 'Usuário Teste' }) }),
  });
  mockUserFind.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve([]) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue(SESSION_TECNICO);
  mockHistoryCreate.mockResolvedValue({});
  mockNotificationCreate.mockResolvedValue({});
  mockNotificationInsertMany.mockResolvedValue([]);
  mockPauseLogCreate.mockResolvedValue({});
  mockPauseLogFindOneAndUpdate.mockResolvedValue({});
  mockChamadoUpdateOne.mockResolvedValue({ matchedCount: 1 });
  setupUserMocks();
});

// ── pauseTicketAction ────────────────────────────────────────────

describe('pauseTicketAction', () => {
  describe('validação de acesso', () => {
    it('deve retornar erro quando role é Solicitante', async () => {
      // Arrange
      mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);

      // Act
      const result = await pauseTicketAction({
        ticketId: VALID_ID,
        reason: 'aguardando_fornecedor',
      });

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('Acesso negado');
    });

    it('deve aceitar quando role é Técnico', async () => {
      // Arrange
      mockRequireSession.mockResolvedValue(SESSION_TECNICO);
      mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

      // Act
      const result = await pauseTicketAction({
        ticketId: VALID_ID,
        reason: 'aguardando_fornecedor',
      });

      // Assert
      expect(result.ok).toBe(true);
    });

    it('deve aceitar quando role é Preposto', async () => {
      // Arrange
      mockRequireSession.mockResolvedValue(SESSION_PREPOSTO);
      mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

      // Act
      const result = await pauseTicketAction({
        ticketId: VALID_ID,
        reason: 'aguardando_fornecedor',
      });

      // Assert
      expect(result.ok).toBe(true);
    });

    it('deve aceitar quando role é Admin', async () => {
      // Arrange
      mockRequireSession.mockResolvedValue(SESSION_ADMIN);
      mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

      // Act
      const result = await pauseTicketAction({
        ticketId: VALID_ID,
        reason: 'aguardando_fornecedor',
      });

      // Assert
      expect(result.ok).toBe(true);
    });
  });

  describe('validação de status', () => {
    it('deve retornar erro quando chamado não está em atendimento', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(makeChamadoDoc({ status: 'validado' }));

      // Act
      const result = await pauseTicketAction({
        ticketId: VALID_ID,
        reason: 'aguardando_fornecedor',
      });

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('em atendimento');
    });

    it('deve retornar erro quando chamado está encerrado', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(makeChamadoDoc({ status: 'encerrado' }));

      // Act
      const result = await pauseTicketAction({
        ticketId: VALID_ID,
        reason: 'aguardando_peca',
      });

      // Assert
      expect(result.ok).toBe(false);
    });

    it('deve retornar erro quando chamado já está pausado (aguardando_terceiros)', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(
        makeChamadoDoc({ status: 'aguardando_terceiros' }),
      );

      // Act
      const result = await pauseTicketAction({
        ticketId: VALID_ID,
        reason: 'aguardando_fornecedor',
      });

      // Assert
      expect(result.ok).toBe(false);
    });
  });

  describe('validação de atribuição (Técnico)', () => {
    it('deve retornar erro quando Técnico não está atribuído ao chamado', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(
        makeChamadoDoc({ assignedToUserId: new Types.ObjectId() }),
      );

      // Act
      const result = await pauseTicketAction({
        ticketId: VALID_ID,
        reason: 'aguardando_fornecedor',
      });

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('não está atribuído');
    });

    it('deve retornar erro quando assignedToUserId é null (Técnico)', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(
        makeChamadoDoc({ assignedToUserId: null }),
      );

      // Act
      const result = await pauseTicketAction({
        ticketId: VALID_ID,
        reason: 'aguardando_acesso',
      });

      // Assert
      expect(result.ok).toBe(false);
    });

    it('não deve verificar atribuição quando role é Preposto', async () => {
      // Arrange
      mockRequireSession.mockResolvedValue(SESSION_PREPOSTO);
      mockChamadoFindById.mockResolvedValue(
        makeChamadoDoc({ assignedToUserId: new Types.ObjectId() }),
      );

      // Act
      const result = await pauseTicketAction({
        ticketId: VALID_ID,
        reason: 'aguardando_aprovacao',
      });

      // Assert
      expect(result.ok).toBe(true);
    });
  });

  describe('mapeamento de status por motivo', () => {
    it('deve definir status aguardando_solicitante quando reason é aguardando_solicitante', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

      // Act
      await pauseTicketAction({ ticketId: VALID_ID, reason: 'aguardando_solicitante' });

      // Assert
      const updateCall = mockChamadoUpdateOne.mock.calls[0];
      expect(updateCall[1].$set.status).toBe('aguardando_solicitante');
    });

    it('deve definir status aguardando_terceiros quando reason é aguardando_fornecedor', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

      // Act
      await pauseTicketAction({ ticketId: VALID_ID, reason: 'aguardando_fornecedor' });

      // Assert
      const updateCall = mockChamadoUpdateOne.mock.calls[0];
      expect(updateCall[1].$set.status).toBe('aguardando_terceiros');
    });

    it('deve definir status aguardando_terceiros quando reason é aguardando_peca', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

      // Act
      await pauseTicketAction({ ticketId: VALID_ID, reason: 'aguardando_peca' });

      // Assert
      const updateCall = mockChamadoUpdateOne.mock.calls[0];
      expect(updateCall[1].$set.status).toBe('aguardando_terceiros');
    });

    it('deve definir status aguardando_terceiros quando reason é aguardando_aprovacao', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

      // Act
      await pauseTicketAction({ ticketId: VALID_ID, reason: 'aguardando_aprovacao' });

      // Assert
      const updateCall = mockChamadoUpdateOne.mock.calls[0];
      expect(updateCall[1].$set.status).toBe('aguardando_terceiros');
    });

    it('deve definir status aguardando_terceiros quando reason é aguardando_acesso', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

      // Act
      await pauseTicketAction({ ticketId: VALID_ID, reason: 'aguardando_acesso' });

      // Assert
      const updateCall = mockChamadoUpdateOne.mock.calls[0];
      expect(updateCall[1].$set.status).toBe('aguardando_terceiros');
    });

    it('deve definir status aguardando_terceiros quando reason é outro', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

      // Act
      await pauseTicketAction({
        ticketId: VALID_ID,
        reason: 'outro',
        details: 'Motivo específico aqui',
      });

      // Assert
      const updateCall = mockChamadoUpdateOne.mock.calls[0];
      expect(updateCall[1].$set.status).toBe('aguardando_terceiros');
    });
  });

  describe('mapeamento de ação no histórico', () => {
    it('deve usar action aguardando_solicitante no histórico quando reason é aguardando_solicitante', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

      // Act
      await pauseTicketAction({ ticketId: VALID_ID, reason: 'aguardando_solicitante' });

      // Assert
      const historyCall = mockHistoryCreate.mock.calls[0][0];
      expect(historyCall.action).toBe('aguardando_solicitante');
    });

    it('deve usar action pausa_terceiros no histórico quando reason é aguardando_fornecedor', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

      // Act
      await pauseTicketAction({ ticketId: VALID_ID, reason: 'aguardando_fornecedor' });

      // Assert
      const historyCall = mockHistoryCreate.mock.calls[0][0];
      expect(historyCall.action).toBe('pausa_terceiros');
    });

    it('deve registrar statusAnterior em_atendimento e statusNovo correto no histórico', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

      // Act
      await pauseTicketAction({ ticketId: VALID_ID, reason: 'aguardando_peca' });

      // Assert
      const historyCall = mockHistoryCreate.mock.calls[0][0];
      expect(historyCall.statusAnterior).toBe('em atendimento');
      expect(historyCall.statusNovo).toBe('aguardando_terceiros');
    });
  });

  describe('criação de PauseLog', () => {
    it('deve criar PauseLog com dados corretos', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(makeChamadoDoc());
      const details = 'Aguardando chegada do fornecedor';

      // Act
      await pauseTicketAction({ ticketId: VALID_ID, reason: 'aguardando_fornecedor', details });

      // Assert
      expect(mockPauseLogCreate).toHaveBeenCalledOnce();
      const pauseLogCall = mockPauseLogCreate.mock.calls[0][0];
      expect(pauseLogCall.reason).toBe('aguardando_fornecedor');
      expect(pauseLogCall.details).toBe(details);
      expect(pauseLogCall.pausedAt).toBeInstanceOf(Date);
      expect(pauseLogCall.pausedByUserId).toBeDefined();
    });

    it('deve criar PauseLog com details vazio quando não fornecido', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

      // Act
      await pauseTicketAction({ ticketId: VALID_ID, reason: 'aguardando_peca' });

      // Assert
      const pauseLogCall = mockPauseLogCreate.mock.calls[0][0];
      expect(pauseLogCall.details).toBe('');
    });
  });

  describe('notificações', () => {
    it('deve criar notificação individual para o solicitante', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

      // Act
      await pauseTicketAction({ ticketId: VALID_ID, reason: 'aguardando_fornecedor' });

      // Assert
      expect(mockNotificationCreate).toHaveBeenCalledOnce();
      const notifCall = mockNotificationCreate.mock.calls[0][0];
      expect(notifCall.type).toBe('ticket:paused');
    });

    it('deve usar insertMany para notificar managers (não loop individual)', async () => {
      // Arrange
      const managers = [{ _id: new Types.ObjectId() }, { _id: new Types.ObjectId() }];
      mockUserFind.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(managers) }),
      });
      mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

      // Act
      await pauseTicketAction({ ticketId: VALID_ID, reason: 'aguardando_fornecedor' });

      // Assert
      expect(mockNotificationInsertMany).toHaveBeenCalledOnce();
      const insertManyCall = mockNotificationInsertMany.mock.calls[0][0];
      expect(insertManyCall).toHaveLength(2);
      expect(insertManyCall[0].type).toBe('ticket:paused');
    });

    it('não deve chamar insertMany quando não há managers', async () => {
      // Arrange
      mockUserFind.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve([]) }),
      });
      mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

      // Act
      await pauseTicketAction({ ticketId: VALID_ID, reason: 'aguardando_fornecedor' });

      // Assert
      expect(mockNotificationInsertMany).not.toHaveBeenCalled();
    });
  });

  describe('erros de chamado', () => {
    it('deve retornar erro quando chamado não encontrado', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(null);

      // Act
      const result = await pauseTicketAction({
        ticketId: VALID_ID,
        reason: 'aguardando_fornecedor',
      });

      // Assert
      expect(result).toEqual({ ok: false, error: 'Chamado não encontrado.' });
    });

    it('deve retornar erro quando updateOne não encontrou (race condition)', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(makeChamadoDoc());
      mockChamadoUpdateOne.mockResolvedValue({ matchedCount: 0 });

      // Act
      const result = await pauseTicketAction({
        ticketId: VALID_ID,
        reason: 'aguardando_fornecedor',
      });

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('status já alterado');
    });
  });

  describe('validação Zod', () => {
    it('deve retornar erro quando ticketId está vazio', async () => {
      // Act
      const result = await pauseTicketAction({ ticketId: '', reason: 'aguardando_fornecedor' });

      // Assert
      expect(result.ok).toBe(false);
    });

    it('deve retornar erro quando reason é inválido', async () => {
      // Act
      const result = await pauseTicketAction({
        ticketId: VALID_ID,
        reason: 'motivo_invalido' as never,
      });

      // Assert
      expect(result.ok).toBe(false);
    });

    it('deve retornar erro quando reason é outro sem details', async () => {
      // Act
      const result = await pauseTicketAction({ ticketId: VALID_ID, reason: 'outro' });

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('Detalhes obrigatórios');
    });
  });
});

// ── resumeTicketAction ───────────────────────────────────────────

describe('resumeTicketAction', () => {
  describe('validação de acesso', () => {
    it('deve retornar erro quando role é Solicitante', async () => {
      // Arrange
      mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);

      // Act
      const result = await resumeTicketAction({ ticketId: VALID_ID });

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('Acesso negado');
    });
  });

  describe('validação de status', () => {
    it('deve retornar erro quando chamado está em atendimento (não pausado)', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(makeChamadoDoc({ status: 'em atendimento' }));

      // Act
      const result = await resumeTicketAction({ ticketId: VALID_ID });

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('não está pausado');
    });

    it('deve retornar erro quando chamado está validado', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(makeChamadoDoc({ status: 'validado' }));

      // Act
      const result = await resumeTicketAction({ ticketId: VALID_ID });

      // Assert
      expect(result.ok).toBe(false);
    });

    it('deve aceitar quando status é aguardando_solicitante', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(
        makeChamadoDoc({
          status: 'aguardando_solicitante',
          slaPausedAt: new Date(Date.now() - 30 * 60_000),
        }),
      );

      // Act
      const result = await resumeTicketAction({ ticketId: VALID_ID });

      // Assert
      expect(result.ok).toBe(true);
    });

    it('deve aceitar quando status é aguardando_terceiros', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(
        makeChamadoDoc({
          status: 'aguardando_terceiros',
          slaPausedAt: new Date(Date.now() - 60 * 60_000),
        }),
      );

      // Act
      const result = await resumeTicketAction({ ticketId: VALID_ID });

      // Assert
      expect(result.ok).toBe(true);
    });
  });

  describe('validação de slaPausedAt', () => {
    it('deve retornar erro quando slaPausedAt não existe no documento', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(
        makeChamadoDoc({
          status: 'aguardando_terceiros',
          slaPausedAt: undefined,
        }),
      );

      // Act
      const result = await resumeTicketAction({ ticketId: VALID_ID });

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('Data de pausa não encontrada');
    });

    it('deve retornar erro quando slaPausedAt é null', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(
        makeChamadoDoc({
          status: 'aguardando_solicitante',
          slaPausedAt: null,
        }),
      );

      // Act
      const result = await resumeTicketAction({ ticketId: VALID_ID });

      // Assert
      expect(result.ok).toBe(false);
    });
  });

  describe('cálculo de pausedMinutes', () => {
    it('deve calcular pausedMinutes corretamente (30 minutos)', async () => {
      // Arrange
      const pausedAt = new Date(Date.now() - 30 * 60_000);
      mockChamadoFindById.mockResolvedValue(
        makeChamadoDoc({
          status: 'aguardando_terceiros',
          slaPausedAt: pausedAt,
        }),
      );

      // Act
      await resumeTicketAction({ ticketId: VALID_ID });

      // Assert
      const updateCall = mockChamadoUpdateOne.mock.calls[0];
      const incFields = updateCall[1].$inc;
      expect(incFields.totalPausedMinutes).toBeGreaterThanOrEqual(29);
      expect(incFields.totalPausedMinutes).toBeLessThanOrEqual(31);
    });

    it('deve calcular pausedMinutes como 0 quando slaPausedAt é agora', async () => {
      // Arrange
      const pausedAt = new Date(); // agora (diferença ≈ 0ms)
      mockChamadoFindById.mockResolvedValue(
        makeChamadoDoc({
          status: 'aguardando_terceiros',
          slaPausedAt: pausedAt,
        }),
      );

      // Act
      await resumeTicketAction({ ticketId: VALID_ID });

      // Assert
      const updateCall = mockChamadoUpdateOne.mock.calls[0];
      expect(updateCall[1].$inc.totalPausedMinutes).toBeGreaterThanOrEqual(0);
    });

    it('deve ajustar resolutionDueAt somando o tempo pausado', async () => {
      // Arrange
      const pausedAt = new Date(Date.now() - 60 * 60_000); // 60 min atrás
      const dueAt = new Date(Date.now() + 24 * 3600_000);
      mockChamadoFindById.mockResolvedValue(
        makeChamadoDoc({
          status: 'aguardando_terceiros',
          slaPausedAt: pausedAt,
          sla: { resolutionDueAt: dueAt, resolvedAt: null, pausedMinutes: 0 },
        }),
      );

      // Act
      await resumeTicketAction({ ticketId: VALID_ID });

      // Assert
      const updateCall = mockChamadoUpdateOne.mock.calls[0];
      const setFields = updateCall[1].$set;
      expect(setFields['sla.resolutionDueAt']).toBeInstanceOf(Date);
      // Deve ser maior que dueAt (prazo extendido)
      expect(setFields['sla.resolutionDueAt'].getTime()).toBeGreaterThan(dueAt.getTime());
    });

    it('não deve incluir sla.resolutionDueAt quando resolutionDueAt é undefined', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(
        makeChamadoDoc({
          status: 'aguardando_terceiros',
          slaPausedAt: new Date(Date.now() - 30 * 60_000),
          sla: { resolutionDueAt: undefined, resolvedAt: null, pausedMinutes: 0 },
        }),
      );

      // Act
      await resumeTicketAction({ ticketId: VALID_ID });

      // Assert
      const updateCall = mockChamadoUpdateOne.mock.calls[0];
      expect(updateCall[1].$set['sla.resolutionDueAt']).toBeUndefined();
    });
  });

  describe('limpeza de campos de pausa via $unset', () => {
    it('deve fazer $unset de slaPausedAt, pauseReason e pauseDetails', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(
        makeChamadoDoc({
          status: 'aguardando_terceiros',
          slaPausedAt: new Date(Date.now() - 30 * 60_000),
        }),
      );

      // Act
      await resumeTicketAction({ ticketId: VALID_ID });

      // Assert
      const updateCall = mockChamadoUpdateOne.mock.calls[0];
      const unsetFields = updateCall[1].$unset;
      expect(unsetFields.slaPausedAt).toBeDefined();
      expect(unsetFields.pauseReason).toBeDefined();
      expect(unsetFields.pauseDetails).toBeDefined();
    });

    it('deve definir status para em atendimento', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(
        makeChamadoDoc({
          status: 'aguardando_terceiros',
          slaPausedAt: new Date(Date.now() - 30 * 60_000),
        }),
      );

      // Act
      await resumeTicketAction({ ticketId: VALID_ID });

      // Assert
      const updateCall = mockChamadoUpdateOne.mock.calls[0];
      expect(updateCall[1].$set.status).toBe('em atendimento');
    });
  });

  describe('atualização do PauseLog', () => {
    it('deve chamar findOneAndUpdate no PauseLog com dados de retomada', async () => {
      // Arrange
      const pausedAt = new Date(Date.now() - 45 * 60_000);
      mockChamadoFindById.mockResolvedValue(
        makeChamadoDoc({
          status: 'aguardando_terceiros',
          slaPausedAt: pausedAt,
        }),
      );

      // Act
      await resumeTicketAction({ ticketId: VALID_ID });

      // Assert
      expect(mockPauseLogFindOneAndUpdate).toHaveBeenCalledOnce();
      const [filter, update, options] = mockPauseLogFindOneAndUpdate.mock.calls[0];
      expect(filter.resumedAt).toEqual({ $exists: false });
      expect(update.$set.resumedAt).toBeInstanceOf(Date);
      expect(update.$set.pausedMinutes).toBeGreaterThanOrEqual(44);
      expect(update.$set.pausedMinutes).toBeLessThanOrEqual(46);
      expect(update.$set.resumedByUserId).toBeDefined();
      expect(options.sort).toEqual({ pausedAt: -1 });
    });
  });

  describe('ação no histórico (retomada_terceiros vs retomada_atendimento)', () => {
    it('deve usar action retomada_terceiros quando status anterior era aguardando_terceiros', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(
        makeChamadoDoc({
          status: 'aguardando_terceiros',
          slaPausedAt: new Date(Date.now() - 20 * 60_000),
        }),
      );

      // Act
      await resumeTicketAction({ ticketId: VALID_ID });

      // Assert
      const historyCall = mockHistoryCreate.mock.calls[0][0];
      expect(historyCall.action).toBe('retomada_terceiros');
      expect(historyCall.statusAnterior).toBe('aguardando_terceiros');
      expect(historyCall.statusNovo).toBe('em atendimento');
    });

    it('deve usar action retomada_atendimento quando status anterior era aguardando_solicitante', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(
        makeChamadoDoc({
          status: 'aguardando_solicitante',
          slaPausedAt: new Date(Date.now() - 20 * 60_000),
        }),
      );

      // Act
      await resumeTicketAction({ ticketId: VALID_ID });

      // Assert
      const historyCall = mockHistoryCreate.mock.calls[0][0];
      expect(historyCall.action).toBe('retomada_atendimento');
      expect(historyCall.statusAnterior).toBe('aguardando_solicitante');
    });
  });

  describe('notificações', () => {
    it('deve criar notificação individual para o solicitante', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(
        makeChamadoDoc({
          status: 'aguardando_terceiros',
          slaPausedAt: new Date(Date.now() - 30 * 60_000),
        }),
      );

      // Act
      await resumeTicketAction({ ticketId: VALID_ID });

      // Assert
      expect(mockNotificationCreate).toHaveBeenCalledOnce();
      const notifCall = mockNotificationCreate.mock.calls[0][0];
      expect(notifCall.type).toBe('ticket:resumed');
    });

    it('deve usar insertMany para notificar managers', async () => {
      // Arrange
      const managers = [{ _id: new Types.ObjectId() }, { _id: new Types.ObjectId() }];
      mockUserFind.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(managers) }),
      });
      mockChamadoFindById.mockResolvedValue(
        makeChamadoDoc({
          status: 'aguardando_terceiros',
          slaPausedAt: new Date(Date.now() - 30 * 60_000),
        }),
      );

      // Act
      await resumeTicketAction({ ticketId: VALID_ID });

      // Assert
      expect(mockNotificationInsertMany).toHaveBeenCalledOnce();
      const insertManyCall = mockNotificationInsertMany.mock.calls[0][0];
      expect(insertManyCall).toHaveLength(2);
    });
  });

  describe('erros de chamado', () => {
    it('deve retornar erro quando chamado não encontrado', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(null);

      // Act
      const result = await resumeTicketAction({ ticketId: VALID_ID });

      // Assert
      expect(result).toEqual({ ok: false, error: 'Chamado não encontrado.' });
    });

    it('deve retornar erro quando updateOne não encontrou (race condition)', async () => {
      // Arrange
      mockChamadoFindById.mockResolvedValue(
        makeChamadoDoc({
          status: 'aguardando_terceiros',
          slaPausedAt: new Date(Date.now() - 30 * 60_000),
        }),
      );
      mockChamadoUpdateOne.mockResolvedValue({ matchedCount: 0 });

      // Act
      const result = await resumeTicketAction({ ticketId: VALID_ID });

      // Assert
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('status já alterado');
    });
  });
});

// ── pauseForRequesterAction (wrapper legado) ─────────────────────

describe('pauseForRequesterAction (wrapper legado)', () => {
  it('deve delegar para pauseTicketAction com reason aguardando_solicitante', async () => {
    // Arrange
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc());
    const legacyReason = 'Solicitante está em viagem e não confirmou';

    // Act
    const result = await pauseForRequesterAction({
      ticketId: VALID_ID,
      reason: legacyReason,
    });

    // Assert
    expect(result.ok).toBe(true);
    const updateCall = mockChamadoUpdateOne.mock.calls[0];
    expect(updateCall[1].$set.status).toBe('aguardando_solicitante');
  });

  it('deve repassar o reason legado como details para pauseTicketAction', async () => {
    // Arrange
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc());
    const legacyReason = 'Motivo bem detalhado do solicitante';

    // Act
    await pauseForRequesterAction({ ticketId: VALID_ID, reason: legacyReason });

    // Assert
    const pauseLogCall = mockPauseLogCreate.mock.calls[0][0];
    expect(pauseLogCall.details).toBe(legacyReason);
  });

  it('deve retornar erro de validação quando reason tem menos de 10 chars', async () => {
    // Act
    const result = await pauseForRequesterAction({ ticketId: VALID_ID, reason: 'curto' });

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('mínimo 10 caracteres');
  });

  it('deve retornar erro quando ticketId está vazio', async () => {
    // Act
    const result = await pauseForRequesterAction({
      ticketId: '',
      reason: 'Motivo válido aqui.',
    });

    // Assert
    expect(result.ok).toBe(false);
  });

  it('deve retornar erro quando reason supera 2000 chars', async () => {
    // Act
    const result = await pauseForRequesterAction({
      ticketId: VALID_ID,
      reason: 'x'.repeat(2001),
    });

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('máximo 2000 caracteres');
  });
});

// ── resumeFromRequesterAction (wrapper legado) ───────────────────

describe('resumeFromRequesterAction (wrapper legado)', () => {
  it('deve delegar para resumeTicketAction', async () => {
    // Arrange
    mockChamadoFindById.mockResolvedValue(
      makeChamadoDoc({
        status: 'aguardando_solicitante',
        slaPausedAt: new Date(Date.now() - 15 * 60_000),
      }),
    );

    // Act
    const result = await resumeFromRequesterAction({ ticketId: VALID_ID });

    // Assert
    expect(result.ok).toBe(true);
    // Deve ter chamado updateOne (lógica real de resumeTicketAction foi executada)
    expect(mockChamadoUpdateOne).toHaveBeenCalledOnce();
  });

  it('deve retornar erro de validação quando ticketId está vazio', async () => {
    // Act
    const result = await resumeFromRequesterAction({ ticketId: '' });

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('obrigatório');
  });

  it('deve retornar erro quando ticketId está ausente', async () => {
    // Act
    const result = await resumeFromRequesterAction({} as { ticketId: string });

    // Assert
    expect(result.ok).toBe(false);
  });
});
