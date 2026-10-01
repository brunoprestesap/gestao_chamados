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
const mockEmitToRoom = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/realtime-emit', () => ({
  emitToRoom: (...args: unknown[]) => mockEmitToRoom(...args),
}));
const mockSendEmail = vi.fn();
vi.mock('@/lib/email/send-notification-email', () => ({
  sendNotificationEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const mockChamadoFindOneAndUpdate = vi.fn();
const mockChamadoFindById = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    findOneAndUpdate: (...args: unknown[]) => mockChamadoFindOneAndUpdate(...args),
    findById: (...args: unknown[]) => mockChamadoFindById(...args),
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

import { submitTicketEvaluationAction } from '@/app/(dashboard)/meus-chamados/actions';

/**
 * Avaliar encerra o chamado na mesma escrita (spec 0010).
 *
 * covers: AC-2, AC-5, AC-9b
 */

const SOLICITANTE_ID = new Types.ObjectId().toHexString();
const TICKET_ID = new Types.ObjectId().toHexString();
const SESSION = { userId: SOLICITANTE_ID, role: 'Solicitante', username: 'maria' };

function input(over: Record<string, unknown> = {}) {
  return { ticketId: TICKET_ID, rating: 4, comment: 'bom', ...over };
}

function existente(over: Record<string, unknown> = {}) {
  mockChamadoFindById.mockReturnValue({
    lean: () =>
      Promise.resolve({
        _id: TICKET_ID,
        solicitanteId: new Types.ObjectId(SOLICITANTE_ID),
        status: 'concluído',
        prazoAvaliacaoAte: new Date(Date.now() + 3_600_000),
        evaluation: {},
        ...over,
      }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue(SESSION);
  mockHistoryCreate.mockResolvedValue({});
  mockEmitToRoom.mockResolvedValue(true);
  mockChamadoFindOneAndUpdate.mockResolvedValue({
    _id: TICKET_ID,
    ticket_number: 'T-042',
    titulo: 'Ar-Condicionado — Sala 205',
    solicitanteId: new Types.ObjectId(SOLICITANTE_ID),
  });
});

describe('submitTicketEvaluationAction · sucesso (AC-2)', () => {
  it('filtra pela janela aberta, dono e sem nota, e encerra na mesma escrita', async () => {
    // Act
    const result = await submitTicketEvaluationAction(input());

    // Assert
    expect(result).toEqual({ ok: true });
    const [filtro, update] = mockChamadoFindOneAndUpdate.mock.calls[0];
    expect(filtro).toMatchObject({
      _id: TICKET_ID,
      status: 'concluído',
      'evaluation.rating': { $exists: false },
    });
    expect(filtro.$or).toEqual([
      { prazoAvaliacaoAte: { $gt: expect.any(Date) } },
      { prazoAvaliacaoAte: null },
    ]);
    expect(update.$set).toMatchObject({
      status: 'encerrado',
      closedByUserId: null,
      closureNotes: '',
      evaluation: expect.objectContaining({ rating: 4, notes: 'bom' }),
    });
    expect(update.$set.closedAt).toBeInstanceOf(Date);
  });

  it('grava uma entrada só, encerramento_por_avaliacao', async () => {
    // Act
    await submitTicketEvaluationAction(input());

    // Assert
    expect(mockHistoryCreate).toHaveBeenCalledOnce();
    expect(mockHistoryCreate.mock.calls[0][0]).toMatchObject({
      action: 'encerramento_por_avaliacao',
      statusAnterior: 'concluído',
      statusNovo: 'encerrado',
      observacoes: 'Avaliação: 4/5',
    });
  });

  it('emite ticket:closed só para a sala do solicitante, sem Notification nem e-mail (AC-9b)', async () => {
    // Act
    await submitTicketEvaluationAction(input());

    // Assert
    expect(mockEmitToRoom).toHaveBeenCalledOnce();
    expect(mockEmitToRoom).toHaveBeenCalledWith(
      `user:${SOLICITANTE_ID}`,
      'ticket:closed',
      expect.objectContaining({ closedBy: null, motivo: 'avaliacao' }),
    );
    expect(mockNotificationCreate).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe('submitTicketEvaluationAction · recusas (AC-2, AC-5)', () => {
  beforeEach(() => {
    mockChamadoFindOneAndUpdate.mockResolvedValue(null);
  });

  it('encerrado devolve "Este chamado já foi encerrado."', async () => {
    // Arrange
    existente({ status: 'encerrado', prazoAvaliacaoAte: null });

    // Act / Assert
    expect(await submitTicketEvaluationAction(input())).toEqual({
      ok: false,
      error: 'Este chamado já foi encerrado.',
    });
  });

  it('prazo vencido com o cron atrasado devolve o erro de prazo', async () => {
    // Arrange
    existente({ prazoAvaliacaoAte: new Date(Date.now() - 60_000) });

    // Act / Assert
    expect(await submitTicketEvaluationAction(input())).toEqual({
      ok: false,
      error: 'O prazo para avaliar este chamado terminou.',
    });
  });

  it('quem não é dono recebe o erro de dono, sem saber que o prazo venceu', async () => {
    // Arrange
    existente({
      solicitanteId: new Types.ObjectId(),
      prazoAvaliacaoAte: new Date(Date.now() - 60_000),
    });

    // Act
    const result = await submitTicketEvaluationAction(input());

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('criador do chamado');
  });

  it('quem não é dono de um encerrado também não descobre o estado', async () => {
    // Arrange
    existente({ solicitanteId: new Types.ObjectId(), status: 'encerrado' });

    // Act
    const result = await submitTicketEvaluationAction(input());

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toContain('encerrado');
  });

  it('quem não é dono recebe o erro de dono', async () => {
    // Arrange
    existente({ solicitanteId: new Types.ObjectId() });

    // Act
    const result = await submitTicketEvaluationAction(input());

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('criador do chamado');
  });

  it('fora do concluído (em atendimento) recebe o erro de status', async () => {
    // Arrange
    existente({ status: 'em atendimento', prazoAvaliacaoAte: null });

    // Act
    const result = await submitTicketEvaluationAction(input());

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Concluído');
  });

  it('não grava histórico nem emite nada quando recusa', async () => {
    // Arrange
    existente({ status: 'encerrado' });

    // Act
    await submitTicketEvaluationAction(input());

    // Assert
    expect(mockHistoryCreate).not.toHaveBeenCalled();
    expect(mockEmitToRoom).not.toHaveBeenCalled();
  });
});

describe('submitTicketEvaluationAction · histórico (achado da revisão)', () => {
  it('falha ao gravar o histórico não vira erro: a avaliação já valeu', async () => {
    // Arrange
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockHistoryCreate.mockRejectedValue(new Error('histórico fora'));

    // Act
    const result = await submitTicketEvaluationAction(input());

    // Assert
    expect(result).toEqual({ ok: true });
    expect(mockEmitToRoom).toHaveBeenCalledOnce();
  });
});
