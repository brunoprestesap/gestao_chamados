import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const mockEmitToRoom = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/realtime-emit', () => ({
  emitToRoom: (...args: unknown[]) => mockEmitToRoom(...args),
}));

const mockNotificationCreate = vi.fn().mockResolvedValue({});
vi.mock('@/models/Notification', () => ({
  NotificationModel: { create: (...args: unknown[]) => mockNotificationCreate(...args) },
}));

import { notificarCorrecaoAoTecnico } from '../notificar-correcao';

/**
 * O aviso ao técnico quando prioridade ou serviço mudam sem trocar de técnico
 * (spec 0009, AC-14): `Notification` `ticket:corrected` mais o evento, sem
 * email e sem motivo.
 *
 * covers: AC-14
 */

const CHAMADO_ID = '6aad5286df6f201a25edd001';
const TECNICO_ID = '6aad5286df6f201a25eda333';
const PREPOSTO_ID = '6aad5286df6f201a25eda222';
const AT = new Date('2026-09-28T15:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('notificarCorrecaoAoTecnico · prioridade', () => {
  const base = {
    chamadoId: CHAMADO_ID,
    ticketNumber: 'CHM-2026-00001',
    titulo: 'Troca de lâmpada — Sala 302',
    tecnicoId: TECNICO_ID,
    campo: 'prioridade' as const,
    finalPriority: 'ALTA' as const,
    correctedBy: { id: PREPOSTO_ID, name: 'Paulo' },
    at: AT,
  };

  it('grava a Notification com o título e o payload certos, sem motivo', async () => {
    await notificarCorrecaoAoTecnico(base);

    expect(mockNotificationCreate).toHaveBeenCalledOnce();
    expect(mockNotificationCreate).toHaveBeenCalledWith({
      userId: TECNICO_ID,
      type: 'ticket:corrected',
      title: 'Prioridade do chamado #CHM-2026-00001 mudou para Alta',
      body: 'Troca de lâmpada — Sala 302',
      data: {
        ticketId: CHAMADO_ID,
        ticketNumber: 'CHM-2026-00001',
        title: 'Troca de lâmpada — Sala 302',
        campo: 'prioridade',
        finalPriority: 'ALTA',
        correctedBy: { id: PREPOSTO_ID, name: 'Paulo' },
        at: '2026-09-28T15:00:00.000Z',
      },
      readAt: null,
    });
  });

  it('emite o evento só para o técnico, com o mesmo payload gravado', async () => {
    await notificarCorrecaoAoTecnico(base);

    const payload = mockNotificationCreate.mock.calls[0][0].data;
    expect(mockEmitToRoom).toHaveBeenCalledOnce();
    expect(mockEmitToRoom).toHaveBeenCalledWith(`user:${TECNICO_ID}`, 'ticket:corrected', payload);
  });

  it('nunca leva o motivo: nem no payload, nem no título', () => {
    expect(base).not.toHaveProperty('motivo');
  });

  it('sem número do chamado, o título não deixa espaço duplo', async () => {
    await notificarCorrecaoAoTecnico({ ...base, ticketNumber: undefined });

    expect(mockNotificationCreate.mock.calls[0][0].title).toBe(
      'Prioridade do chamado mudou para Alta',
    );
  });

  it.each([undefined, null])(
    'sem título do chamado (%s), o payload não leva title e o corpo vai vazio',
    async (titulo) => {
      await notificarCorrecaoAoTecnico({ ...base, titulo });

      const gravada = mockNotificationCreate.mock.calls[0][0];
      expect(gravada.body).toBe('');
      expect(gravada.data.title).toBeUndefined();
    },
  );

  it('propaga qualquer falha: quem chama decide (log e segue, AC-21)', async () => {
    mockNotificationCreate.mockRejectedValueOnce(new Error('mongo caiu'));

    await expect(notificarCorrecaoAoTecnico(base)).rejects.toThrow('mongo caiu');
    expect(mockEmitToRoom).not.toHaveBeenCalled();
  });
});

describe('notificarCorrecaoAoTecnico · serviço', () => {
  const base = {
    chamadoId: CHAMADO_ID,
    ticketNumber: 'CHM-2026-00001',
    titulo: 'Troca de lâmpada — Sala 302',
    tecnicoId: TECNICO_ID,
    campo: 'servico' as const,
    correctedBy: { id: PREPOSTO_ID, name: 'Paulo' },
    at: AT,
  };

  it('nunca leva a prioridade no título, mesmo se vier por engano', async () => {
    await notificarCorrecaoAoTecnico(base);

    expect(mockNotificationCreate.mock.calls[0][0].title).toBe(
      'O serviço do chamado #CHM-2026-00001 mudou',
    );
  });

  it('grava o payload sem finalPriority', async () => {
    await notificarCorrecaoAoTecnico(base);

    const gravada = mockNotificationCreate.mock.calls[0][0].data;
    expect(gravada.campo).toBe('servico');
    expect(gravada.finalPriority).toBeUndefined();
  });
});
