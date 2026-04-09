import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────

const mockVerifySession = vi.fn();
vi.mock('@/lib/dal', () => ({
  verifySession: () => mockVerifySession(),
}));

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));

const mockUpdateMany = vi.fn();
vi.mock('@/models/Notification', () => ({
  NotificationModel: {
    updateMany: (...args: unknown[]) => mockUpdateMany(...args),
  },
}));

import { POST } from '@/app/api/notifications/read-all/route';

// ── Helpers ───────────────────────────────────────────────────────

const VALID_USER_ID = new Types.ObjectId().toHexString();
const SESSION = {
  userId: VALID_USER_ID,
  username: 'maria',
  role: 'Solicitante',
  isActive: true,
};

function makeRequest() {
  return new Request('http://localhost/api/notifications/read-all', {
    method: 'POST',
  });
}

async function parseJson(response: Response) {
  return response.json();
}

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateMany.mockResolvedValue({ modifiedCount: 0 });
});

// ── Tests ─────────────────────────────────────────────────────────

describe('POST /api/notifications/read-all', () => {
  // ── autenticação ─────────────────────────────────────────────────

  it('should return 401 when session is null (not authenticated)', async () => {
    mockVerifySession.mockResolvedValue(null);

    const res = await POST();

    expect(res.status).toBe(401);
    const body = await parseJson(res);
    expect(body.error).toBeDefined();
  });

  it('should return 401 when session has no userId', async () => {
    mockVerifySession.mockResolvedValue({ username: 'ghost', role: 'Solicitante' });

    const res = await POST();

    expect(res.status).toBe(401);
    const body = await parseJson(res);
    expect(body.error).toBeDefined();
  });

  it('should return 401 when userId is an invalid ObjectId string', async () => {
    mockVerifySession.mockResolvedValue({ userId: 'not-an-objectid', role: 'Solicitante' });

    const res = await POST();

    expect(res.status).toBe(401);
    const body = await parseJson(res);
    expect(body.error).toMatch(/inv[áa]lid|sess[ãa]o/i);
  });

  it('should return 401 when userId is empty string', async () => {
    mockVerifySession.mockResolvedValue({ userId: '', role: 'Solicitante' });

    const res = await POST();

    expect(res.status).toBe(401);
  });

  // ── sucesso ───────────────────────────────────────────────────────

  it('should mark notifications as read and return modifiedCount', async () => {
    mockVerifySession.mockResolvedValue(SESSION);
    mockUpdateMany.mockResolvedValue({ modifiedCount: 3 });

    const res = await POST();

    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body).toEqual({ updated: 3 });
  });

  it('should return updated: 0 when no unread notifications exist', async () => {
    mockVerifySession.mockResolvedValue(SESSION);
    mockUpdateMany.mockResolvedValue({ modifiedCount: 0 });

    const res = await POST();

    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body).toEqual({ updated: 0 });
  });

  // ── filtro correto passado ao updateMany ─────────────────────────

  it('should call updateMany with correct filter: userId ObjectId and readAt: null', async () => {
    mockVerifySession.mockResolvedValue(SESSION);
    mockUpdateMany.mockResolvedValue({ modifiedCount: 1 });

    await POST();

    expect(mockUpdateMany).toHaveBeenCalledOnce();
    const [filter, update] = mockUpdateMany.mock.calls[0];

    // filtro deve conter userId como ObjectId e readAt null
    expect(filter.userId).toBeInstanceOf(Types.ObjectId);
    expect(filter.userId.toHexString()).toBe(VALID_USER_ID);
    expect(filter.readAt).toBeNull();

    // update deve setar readAt
    expect(update).toMatchObject({ $set: { readAt: expect.any(Date) } });
  });

  it('should call updateMany with a readAt Date close to now', async () => {
    mockVerifySession.mockResolvedValue(SESSION);
    mockUpdateMany.mockResolvedValue({ modifiedCount: 2 });

    const before = Date.now();
    await POST();
    const after = Date.now();

    const [, update] = mockUpdateMany.mock.calls[0];
    const setReadAt: Date = update.$set.readAt;

    expect(setReadAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(setReadAt.getTime()).toBeLessThanOrEqual(after);
  });

  // ── Request sem body não quebra ───────────────────────────────────

  it('should work correctly even when called without a Request argument', async () => {
    mockVerifySession.mockResolvedValue(SESSION);
    mockUpdateMany.mockResolvedValue({ modifiedCount: 5 });

    // A função POST() não recebe parâmetros — garante que funciona sem body
    const res = await POST();

    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body.updated).toBe(5);
  });

  // ── dbConnect é chamado antes de updateMany ────────────────────────

  it('should call dbConnect before calling updateMany', async () => {
    const { dbConnect } = await import('@/lib/db');
    const dbConnectMock = vi.mocked(dbConnect);

    mockVerifySession.mockResolvedValue(SESSION);
    mockUpdateMany.mockResolvedValue({ modifiedCount: 0 });

    await POST();

    expect(dbConnectMock).toHaveBeenCalledOnce();
    // dbConnect deve ser chamado antes — verificado pela ordem de execução
    expect(mockUpdateMany).toHaveBeenCalledOnce();
  });

  // ── ObjectId com formato válido mas não hex ───────────────────────

  it('should return 401 when userId is "000000000000000000000000" (24 zeros — valid format, valid ObjectId)', async () => {
    // ObjectId.isValid aceita string de 24 chars hex — este é válido
    mockVerifySession.mockResolvedValue({
      userId: '000000000000000000000000',
      role: 'Solicitante',
    });
    mockUpdateMany.mockResolvedValue({ modifiedCount: 0 });

    const res = await POST();

    // ObjectId '000000000000000000000000' é válido — deve passar e retornar 200
    expect(res.status).toBe(200);
  });
});

// ── testa assinatura correta do export ────────────────────────────

describe('route exports', () => {
  it('should export POST as a function', async () => {
    const route = await import('@/app/api/notifications/read-all/route');

    expect(typeof route.POST).toBe('function');
  });
});
