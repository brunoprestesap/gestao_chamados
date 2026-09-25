import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const mockSendEmail = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/email/send-notification-email', () => ({
  sendNotificationEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const mockEmitToRoom = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/realtime-emit', () => ({
  emitToRoom: (...args: unknown[]) => mockEmitToRoom(...args),
}));

const mockNotificationCreate = vi.fn().mockResolvedValue({});
vi.mock('@/models/Notification', () => ({
  NotificationModel: { create: (...args: unknown[]) => mockNotificationCreate(...args) },
}));

import { notificarAtribuicao } from '../notificar-atribuicao';

/**
 * A notificação de atribuição, extraída de `assignTicketAction` para a manual e
 * a automática avisarem do mesmo jeito (spec 0008, AC-11 e AC-18).
 *
 * covers: AC-11 (variante automática), AC-18 (mesmo payload da manual)
 */

const CHAMADO_ID = '6aad5286df6f201a25edd001';
const TECNICO_ID = '6aad5286df6f201a25eda333';
const SOLICITANTE_ID = '6aad5286df6f201a25eda111';
const PREPOSTO_ID = '6aad5286df6f201a25eda222';
const AT = new Date('2026-09-25T15:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('notificarAtribuicao · atribuição manual', () => {
  const base = {
    chamadoId: CHAMADO_ID,
    ticketNumber: 'CHM-2026-00001',
    titulo: 'Troca de lâmpada — Sala 302',
    solicitanteId: SOLICITANTE_ID,
    tecnico: { id: TECNICO_ID, name: 'Carla' },
    assignedBy: { id: PREPOSTO_ID, name: 'Paulo' },
    at: AT,
  };

  it('grava a Notification de sempre, com o payload de sempre', async () => {
    // Act
    await notificarAtribuicao(base);

    // Assert
    expect(mockNotificationCreate).toHaveBeenCalledOnce();
    expect(mockNotificationCreate).toHaveBeenCalledWith({
      userId: TECNICO_ID,
      type: 'ticket:assigned',
      title: 'Chamado #CHM-2026-00001 atribuído a você',
      body: 'Troca de lâmpada — Sala 302',
      data: {
        ticketId: CHAMADO_ID,
        ticketNumber: 'CHM-2026-00001',
        title: 'Troca de lâmpada — Sala 302',
        assignedBy: { id: PREPOSTO_ID, name: 'Paulo' },
        assignedTo: { id: TECNICO_ID, name: 'Carla' },
        at: '2026-09-25T15:00:00.000Z',
      },
      readAt: null,
    });
  });

  it('manda o mesmo payload por email, para o técnico e para o solicitante, nessa ordem', async () => {
    // Act
    await notificarAtribuicao(base);

    // Assert
    const payload = mockNotificationCreate.mock.calls[0][0].data;
    expect(mockSendEmail).toHaveBeenCalledWith(TECNICO_ID, 'ticket:assigned', payload);
    expect(mockEmitToRoom.mock.calls).toEqual([
      [`user:${TECNICO_ID}`, 'ticket:assigned', payload],
      [`user:${SOLICITANTE_ID}`, 'ticket:assigned', payload],
    ]);
  });

  it('sem número do chamado, usa o título genérico de sempre', async () => {
    // Act
    await notificarAtribuicao({ ...base, ticketNumber: undefined });

    // Assert
    expect(mockNotificationCreate.mock.calls[0][0].title).toBe('Chamado atribuído a você');
  });

  it.each([undefined, null])(
    'sem título (%s), o payload não leva title e o corpo da Notification vai vazio',
    async (titulo) => {
      // Act
      await notificarAtribuicao({ ...base, titulo });

      // Assert
      const gravada = mockNotificationCreate.mock.calls[0][0];
      expect(gravada.body).toBe('');
      expect(gravada.data.title).toBeUndefined();
      expect(mockEmitToRoom.mock.calls[0][2].title).toBeUndefined();
    },
  );

  it('o email não é aguardado: a falha dele nunca quebra o aviso', async () => {
    // Arrange
    mockSendEmail.mockRejectedValueOnce(new Error('smtp caiu'));

    // Act & Assert
    await expect(notificarAtribuicao(base)).resolves.toBeUndefined();
    expect(mockEmitToRoom).toHaveBeenCalledTimes(2);
  });

  it('falha ao gravar a Notification propaga, como sempre propagou na atribuição manual', async () => {
    // Arrange
    mockNotificationCreate.mockRejectedValueOnce(new Error('mongo caiu'));

    // Act & Assert
    await expect(notificarAtribuicao(base)).rejects.toThrow('mongo caiu');
  });

  it('falha ao gravar a Notification interrompe o resto, como sempre: nem email nem eventos', async () => {
    // Arrange
    mockNotificationCreate.mockRejectedValueOnce(new Error('mongo caiu'));

    // Act
    await expect(notificarAtribuicao(base)).rejects.toThrow('mongo caiu');

    // Assert
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockEmitToRoom).not.toHaveBeenCalled();
  });

  it('os dois eventos partem juntos: o do solicitante não espera o do técnico terminar', async () => {
    // Arrange: o 1º evento só termina depois de o 2º ter sido pedido. Em sequência,
    // isso nunca acontece e a espera estoura.
    mockEmitToRoom.mockImplementationOnce(async () => {
      await vi.waitFor(() => expect(mockEmitToRoom).toHaveBeenCalledTimes(2), { timeout: 300 });
      return true;
    });

    // Act & Assert
    await expect(notificarAtribuicao(base)).resolves.toBeUndefined();
    expect(mockEmitToRoom).toHaveBeenCalledTimes(2);
  });
});

describe('notificarAtribuicao · atribuição automática', () => {
  const automatica = {
    chamadoId: CHAMADO_ID,
    ticketNumber: 'CHM-2026-00001',
    titulo: 'Troca de lâmpada — Sala 302',
    solicitanteId: SOLICITANTE_ID,
    tecnico: { id: TECNICO_ID, name: 'Carla' },
    assignedBy: { id: 'sistema', name: 'Atribuição automática' },
    at: AT,
  };

  it('avisa que foi atribuído a você automaticamente e leva o autor sistema no payload', async () => {
    // Act
    await notificarAtribuicao(automatica);

    // Assert
    const gravada = mockNotificationCreate.mock.calls[0][0];
    expect(gravada.title).toBe('Chamado #CHM-2026-00001 atribuído a você automaticamente');
    expect(gravada.data.assignedBy).toEqual({ id: 'sistema', name: 'Atribuição automática' });
    expect(mockEmitToRoom).toHaveBeenCalledWith(
      `user:${TECNICO_ID}`,
      'ticket:assigned',
      expect.objectContaining({ assignedBy: { id: 'sistema', name: 'Atribuição automática' } }),
    );
  });

  // A automática não pode perder um aviso por falha de outro (spec 0008, Key invariants):
  // cada aviso tem o seu try, e o primeiro erro sobe no fim para quem chamou registrar.

  it('falha ao gravar a Notification não impede o email nem os dois eventos, e o erro sobe no fim', async () => {
    // Arrange
    mockNotificationCreate.mockRejectedValueOnce(new Error('mongo caiu'));

    // Act
    await expect(notificarAtribuicao(automatica)).rejects.toThrow('mongo caiu');

    // Assert
    expect(mockSendEmail).toHaveBeenCalledOnce();
    expect(mockEmitToRoom).toHaveBeenCalledTimes(2);
  });

  it('falha no evento do técnico não impede o do solicitante, e o erro sobe no fim', async () => {
    // Arrange
    mockEmitToRoom.mockRejectedValueOnce(new Error('socket caiu'));

    // Act
    await expect(notificarAtribuicao(automatica)).rejects.toThrow('socket caiu');

    // Assert
    expect(mockEmitToRoom).toHaveBeenCalledTimes(2);
    expect(mockEmitToRoom.mock.calls[1][0]).toBe(`user:${SOLICITANTE_ID}`);
  });

  it('sem falha nenhuma, resolve sem erro', async () => {
    await expect(notificarAtribuicao(automatica)).resolves.toBeUndefined();
  });
});
