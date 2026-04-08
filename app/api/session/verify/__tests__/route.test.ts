import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

import { GET } from '@/app/api/session/verify/route';

async function parseJson(response: Response) {
  return response.json();
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────

describe('GET /api/session/verify', () => {
  it('retorna 401 se sessão é null', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await parseJson(res);
    expect(body.error).toBeDefined();
  });

  it('retorna 401 se user.id é undefined', async () => {
    mockAuth.mockResolvedValue({
      user: { username: 'joao', role: 'Admin', isActive: true },
    });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('retorna 401 se isActive é false', async () => {
    mockAuth.mockResolvedValue({
      user: { id: '123', username: 'joao', role: 'Admin', isActive: false },
    });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('retorna 200 com dados da sessão válida', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: '123',
        username: 'joao',
        role: 'Admin',
        unitId: 'unit1',
        isActive: true,
      },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body).toEqual({
      userId: '123',
      username: 'joao',
      role: 'Admin',
      unitId: 'unit1',
      isActive: true,
    });
  });

  it('retorna username vazio quando ausente na sessão', async () => {
    mockAuth.mockResolvedValue({
      user: { id: '123', role: 'Solicitante', isActive: true },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.username).toBe('');
  });

  it('retorna unitId null quando ausente na sessão', async () => {
    mockAuth.mockResolvedValue({
      user: { id: '123', username: 'tec', role: 'Técnico', isActive: true },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.unitId).toBeNull();
  });
});
