import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const mockSendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/email/send-notification-email', () => ({
  sendNotificationEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const mockEmitToRoom = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/realtime-emit', () => ({
  emitToRoom: (...args: unknown[]) => mockEmitToRoom(...args),
}));

const mockInsertMany = vi.fn().mockResolvedValue([]);
vi.mock('@/models/Notification', () => ({
  NotificationModel: { insertMany: (...args: unknown[]) => mockInsertMany(...args) },
}));

const mockUserFind = vi.fn();
const mockUserFindById = vi.fn();
vi.mock('@/models/user.model', () => ({
  UserModel: {
    find: (...args: unknown[]) => mockUserFind(...args),
    findById: (...args: unknown[]) => mockUserFindById(...args),
  },
}));

import { notificarNovoChamado } from '../novo-chamado';

/**
 * Notificação de novo chamado para a gestão (spec 0004, AC-11), com o texto
 * variando quando o chamado já nasce `validado` sozinho pela IA (spec 0007,
 * AC-13).
 */

const CHAMADO_ID = '6aad5286df6f201a25edd001';
const SOLICITANTE_ID = '6aad5286df6f201a25eda111';
const PREPOSTO_ID = '6aad5286df6f201a25eda222';

beforeEach(() => {
  vi.clearAllMocks();
  mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });
  mockUserFind.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve([{ _id: PREPOSTO_ID }]) }),
  });
});

describe('notificarNovoChamado', () => {
  it('sem jaValidado (padrão), usa o texto de abertura de sempre', async () => {
    await notificarNovoChamado({
      chamadoId: CHAMADO_ID,
      ticketNumber: 'CHM-2026-00001',
      titulo: 'Troca de lâmpada — Sala 302',
      solicitanteId: SOLICITANTE_ID,
    });

    expect(mockInsertMany).toHaveBeenCalledOnce();
    const doc = mockInsertMany.mock.calls[0][0][0];
    expect(doc.title).toBe('Novo chamado #CHM-2026-00001 aberto');
  });

  it('com jaValidado: true, avisa que já foi validado automaticamente (AC-13)', async () => {
    await notificarNovoChamado({
      chamadoId: CHAMADO_ID,
      ticketNumber: 'CHM-2026-00001',
      titulo: 'Troca de lâmpada — Sala 302',
      solicitanteId: SOLICITANTE_ID,
      jaValidado: true,
    });

    expect(mockInsertMany).toHaveBeenCalledOnce();
    const doc = mockInsertMany.mock.calls[0][0][0];
    expect(doc.title).toBe('Chamado #CHM-2026-00001 validado automaticamente');
    expect(doc.title).not.toContain('aberto');
    // O aviso ao vivo e o e-mail levam a mesma marca, para variarem o texto também.
    expect(mockEmitToRoom).toHaveBeenCalledWith(
      'managers',
      'ticket:new',
      expect.objectContaining({ jaValidado: true }),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      PREPOSTO_ID,
      'ticket:new',
      expect.objectContaining({ jaValidado: true }),
    );
  });

  it('sem ticketNumber, usa o texto genérico correspondente', async () => {
    await notificarNovoChamado({
      chamadoId: CHAMADO_ID,
      ticketNumber: '',
      titulo: 'Troca de lâmpada — Sala 302',
      solicitanteId: SOLICITANTE_ID,
      jaValidado: true,
    });

    const doc = mockInsertMany.mock.calls[0][0][0];
    expect(doc.title).toBe('Chamado validado automaticamente');
  });
});
