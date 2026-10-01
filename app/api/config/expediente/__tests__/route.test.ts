import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireAdmin = vi.fn();
vi.mock('@/lib/dal', () => ({
  requireAdmin: () => mockRequireAdmin(),
  requireSession: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/expediente-config', () => ({ getBusinessCalendarConfig: vi.fn() }));

const mockFindOneAndUpdate = vi.fn();
vi.mock('@/models/BusinessCalendar', () => ({
  BusinessCalendarModel: {
    findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
  },
}));

import { PUT } from '../route';

/**
 * Salvar o prazo para avaliar na tela de expediente (spec 0010, AC-13).
 *
 * covers: AC-13
 */

const ADMIN_ID = '6abe63d8382aa3b920271253';
const BASE = {
  timezone: 'America/Belem',
  workdayStart: '08:00',
  workdayEnd: '18:00',
  weekdays: [1, 2, 3, 4, 5],
};

function put(body: unknown) {
  return PUT(
    new Request('http://localhost/api/config/expediente', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({ userId: ADMIN_ID, role: 'Admin' });
  mockFindOneAndUpdate.mockResolvedValue({});
});

describe('PUT /api/config/expediente · prazoAvaliacaoHoras', () => {
  it('grava o prazo junto do expediente', async () => {
    // Act
    const res = await put({ ...BASE, prazoAvaliacaoHoras: 24 });

    // Assert
    expect(res.status).toBe(200);
    const [, update] = mockFindOneAndUpdate.mock.calls[0];
    expect(update.$set).toMatchObject({ ...BASE, prazoAvaliacaoHoras: 24 });
  });

  it('sem o campo, não mexe no prazo gravado', async () => {
    // Act
    const res = await put(BASE);

    // Assert
    expect(res.status).toBe(200);
    const [, update] = mockFindOneAndUpdate.mock.calls[0];
    expect(update.$set).not.toHaveProperty('prazoAvaliacaoHoras');
  });

  it('fora da faixa responde 400 com a mensagem do campo e não grava', async () => {
    // Act
    const res = await put({ ...BASE, prazoAvaliacaoHoras: 721 });

    // Assert
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'O prazo para avaliar deve ter no máximo 720 horas',
    });
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('só o Admin chega à gravação: quem não é Admin é barrado antes', async () => {
    // Arrange: `requireAdmin` redireciona (lança) quem não é Admin
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT'));

    // Act
    const res = await put({ ...BASE, prazoAvaliacaoHoras: 24 });

    // Assert
    expect(res.status).toBe(500);
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });
});
