import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Spec 0017: os interessados ficam fora deste teste.
vi.mock('@/lib/chamados/interessados', () => ({
  notificarFimAosInteressados: vi.fn().mockResolvedValue(undefined),
  zerarAvisoDeFim: vi.fn().mockResolvedValue(undefined),
  interessadosDosChamados: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const mockRequireManager = vi.fn();
vi.mock('@/lib/dal', () => ({
  requireManager: () => mockRequireManager(),
  requireSession: vi.fn(),
  canManage: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
const mockEmitToRoom = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/realtime-emit', () => ({
  emitToRoom: (...args: unknown[]) => mockEmitToRoom(...args),
}));
vi.mock('@/lib/email/send-notification-email', () => ({
  sendNotificationEmail: vi.fn().mockResolvedValue(true),
}));

const mockFindOneAndUpdate = vi.fn();
const mockFindById = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
    findById: (...args: unknown[]) => ({ lean: () => mockFindById(...args) }),
  },
}));
const mockHistoryCreate = vi.fn();
vi.mock('@/models/ChamadoHistory', () => ({
  ChamadoHistoryModel: { create: (...args: unknown[]) => mockHistoryCreate(...args) },
}));
vi.mock('@/models/Notification', () => ({
  NotificationModel: { create: vi.fn().mockResolvedValue({}) },
}));
vi.mock('@/models/user.model', () => ({
  UserModel: {
    findById: () => ({ select: () => ({ lean: () => Promise.resolve({ name: 'Preposto' }) }) }),
  },
}));

import { reopenTicketAction } from '@/app/(dashboard)/gestao/actions';
import { notificarFimAosInteressados, zerarAvisoDeFim } from '@/lib/chamados/interessados';

/**
 * Reabrir só o concluído dentro do prazo para avaliar; o encerrado é
 * definitivo (spec 0010).
 *
 * covers: AC-4, AC-5
 */

const TICKET_ID = new Types.ObjectId().toHexString();
const MANAGER_ID = new Types.ObjectId().toHexString();
const INPUT = { ticketId: TICKET_ID, reason: 'O técnico concluiu sem trocar o reator.' };

function anterior(over: Record<string, unknown> = {}) {
  return {
    _id: TICKET_ID,
    ticket_number: 'T-7',
    titulo: 'Lâmpada',
    status: 'concluído',
    solicitanteId: new Types.ObjectId(),
    assignedToUserId: new Types.ObjectId(),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireManager.mockResolvedValue({ userId: MANAGER_ID, role: 'Preposto' });
  mockHistoryCreate.mockResolvedValue({});
  mockFindOneAndUpdate.mockResolvedValue(anterior());
});

describe('reopenTicketAction · janela aberta (AC-4)', () => {
  it('filtra pela janela aberta dentro da escrita e limpa o prazo', async () => {
    // Act
    const r = await reopenTicketAction(INPUT);

    // Assert
    expect(r).toEqual({ ok: true });
    const [filtro, update] = mockFindOneAndUpdate.mock.calls[0];
    expect(filtro).toMatchObject({ _id: TICKET_ID, status: 'concluído' });
    expect(filtro.$or).toEqual([
      { prazoAvaliacaoAte: { $gt: expect.any(Date) } },
      { prazoAvaliacaoAte: null },
    ]);
    expect(update.$set).toMatchObject({
      status: 'em atendimento',
      prazoAvaliacaoAte: null,
      concludedAt: null,
      closedAt: null,
      'sla.resolvedAt': null,
    });
  });

  it('registra a reabertura saindo do concluído e avisa com fromStatus concluído', async () => {
    // Act
    await reopenTicketAction(INPUT);

    // Assert
    expect(mockHistoryCreate.mock.calls[0][0]).toMatchObject({
      action: 'reabertura',
      statusAnterior: 'concluído',
      statusNovo: 'em atendimento',
    });
    const paraGestao = mockEmitToRoom.mock.calls.find((c) => c[0] === 'managers');
    expect(paraGestao?.[2]).toMatchObject({ fromStatus: 'concluído' });
  });

  it('zera o aviso de fim dos interessados, para o próximo fim avisar de novo (spec 0017, AC-18)', async () => {
    await reopenTicketAction(INPUT);
    expect(vi.mocked(zerarAvisoDeFim)).toHaveBeenCalledOnce();
    expect(vi.mocked(notificarFimAosInteressados)).not.toHaveBeenCalled();
  });
});

describe('reopenTicketAction · recusas (AC-4, AC-5)', () => {
  beforeEach(() => {
    mockFindOneAndUpdate.mockResolvedValue(null);
  });

  it('encerrado é definitivo', async () => {
    // Arrange
    mockFindById.mockResolvedValue(anterior({ status: 'encerrado' }));

    // Act / Assert
    expect(await reopenTicketAction(INPUT)).toEqual({
      ok: false,
      error: 'Chamado encerrado definitivamente. Abra um novo chamado.',
    });
  });

  it('prazo vencido com o cron atrasado devolve o erro de prazo', async () => {
    // Arrange
    mockFindById.mockResolvedValue(anterior({ prazoAvaliacaoAte: new Date(Date.now() - 60_000) }));

    // Act / Assert
    expect(await reopenTicketAction(INPUT)).toEqual({
      ok: false,
      error: 'O prazo para avaliar este chamado terminou.',
    });
  });

  it('outro status recebe o erro de status, sem gravar histórico', async () => {
    // Arrange
    mockFindById.mockResolvedValue(anterior({ status: 'em atendimento' }));

    // Act
    const r = await reopenTicketAction(INPUT);

    // Assert
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Status atual: em atendimento');
    expect(mockHistoryCreate).not.toHaveBeenCalled();
    expect(mockEmitToRoom).not.toHaveBeenCalled();
  });

  it('chamado inexistente', async () => {
    // Arrange
    mockFindById.mockResolvedValue(null);

    // Act / Assert
    expect(await reopenTicketAction(INPUT)).toEqual({
      ok: false,
      error: 'Chamado não encontrado.',
    });
  });
});

describe('reopenTicketAction · entrada', () => {
  it('motivo curto é barrado antes de tocar o banco', async () => {
    // Act
    const r = await reopenTicketAction({ ticketId: TICKET_ID, reason: 'curto' });

    // Assert
    expect(r.ok).toBe(false);
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });
});
