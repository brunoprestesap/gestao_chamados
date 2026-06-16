import { MongoServerError } from 'mongodb';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const mockVerifySession = vi.fn();
vi.mock('@/lib/dal', () => ({
  verifySession: () => mockVerifySession(),
}));

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));

const mockFindByIdAndUpdate = vi.fn();
const mockFindByIdAndDelete = vi.fn();
vi.mock('@/models/ServiceSubType', () => ({
  ServiceSubTypeModel: {
    findByIdAndUpdate: (...args: unknown[]) => mockFindByIdAndUpdate(...args),
    findByIdAndDelete: (...args: unknown[]) => mockFindByIdAndDelete(...args),
  },
}));

const mockCatalogExists = vi.fn();
vi.mock('@/models/ServiceCatalog', () => ({
  ServiceCatalogModel: { exists: (...args: unknown[]) => mockCatalogExists(...args) },
}));

const mockChamadoExists = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: { exists: (...args: unknown[]) => mockChamadoExists(...args) },
}));

import { DELETE, PATCH } from '@/app/api/catalog/subtypes/[id]/route';

// ── Helpers ──────────────────────────────────────────────────────

const ADMIN = { userId: 'u1', username: 'admin', role: 'Admin', isActive: true };
const NON_ADMIN = { userId: 'u2', username: 'joao', role: 'Solicitante', isActive: true };
const SUBTYPE_ID = new Types.ObjectId().toHexString();
const TYPE_ID = new Types.ObjectId().toHexString();

function makeParams(id: string = SUBTYPE_ID) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(body: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/catalog/subtypes/' + SUBTYPE_ID, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCatalogExists.mockResolvedValue(null);
  mockChamadoExists.mockResolvedValue(null);
});

// ── DELETE ───────────────────────────────────────────────────────

describe('DELETE /api/catalog/subtypes/[id]', () => {
  it('retorna 401 se não autenticado', async () => {
    mockVerifySession.mockResolvedValue(null);
    const res = await DELETE(new Request('http://localhost'), makeParams());
    expect(res.status).toBe(401);
    expect(mockFindByIdAndDelete).not.toHaveBeenCalled();
  });

  it('retorna 403 se não for Admin', async () => {
    mockVerifySession.mockResolvedValue(NON_ADMIN);
    const res = await DELETE(new Request('http://localhost'), makeParams());
    expect(res.status).toBe(403);
  });

  it('retorna 400 se ID inválido', async () => {
    mockVerifySession.mockResolvedValue(ADMIN);
    const res = await DELETE(new Request('http://localhost'), makeParams('invalid'));
    expect(res.status).toBe(400);
  });

  it('retorna 409 (bloqueio) se houver serviços vinculados', async () => {
    mockVerifySession.mockResolvedValue(ADMIN);
    mockCatalogExists.mockResolvedValue({ _id: 'svc1' });
    const res = await DELETE(new Request('http://localhost'), makeParams());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('vinculados');
    expect(mockFindByIdAndDelete).not.toHaveBeenCalled();
  });

  it('retorna 409 (bloqueio) se houver chamados vinculados', async () => {
    mockVerifySession.mockResolvedValue(ADMIN);
    mockChamadoExists.mockResolvedValue({ _id: 'tk1' });
    const res = await DELETE(new Request('http://localhost'), makeParams());
    expect(res.status).toBe(409);
    expect(mockFindByIdAndDelete).not.toHaveBeenCalled();
  });

  it('retorna 404 se o subtipo não existe (sem referências)', async () => {
    mockVerifySession.mockResolvedValue(ADMIN);
    mockFindByIdAndDelete.mockResolvedValue(null);
    const res = await DELETE(new Request('http://localhost'), makeParams());
    expect(res.status).toBe(404);
  });

  it('exclui com sucesso quando não há referências', async () => {
    mockVerifySession.mockResolvedValue(ADMIN);
    mockFindByIdAndDelete.mockResolvedValue({ _id: SUBTYPE_ID });
    const res = await DELETE(new Request('http://localhost'), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(mockFindByIdAndDelete).toHaveBeenCalledWith(SUBTYPE_ID);
  });
});

// ── PATCH ────────────────────────────────────────────────────────

describe('PATCH /api/catalog/subtypes/[id]', () => {
  it('retorna 403 se não for Admin', async () => {
    mockVerifySession.mockResolvedValue(NON_ADMIN);
    const res = await PATCH(makeRequest({ name: 'Novo' }), makeParams());
    expect(res.status).toBe(403);
  });

  it('retorna 400 se validação falhar (name vazio)', async () => {
    mockVerifySession.mockResolvedValue(ADMIN);
    const res = await PATCH(makeRequest({ name: '' }), makeParams());
    expect(res.status).toBe(400);
  });

  it('atualiza com sucesso', async () => {
    mockVerifySession.mockResolvedValue(ADMIN);
    mockFindByIdAndUpdate.mockResolvedValue({
      _id: SUBTYPE_ID,
      name: 'Novo',
      typeId: TYPE_ID,
      isActive: true,
    });
    const res = await PATCH(makeRequest({ name: 'Novo' }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item.name).toBe('Novo');
    expect(body.item.typeId).toBe(TYPE_ID);
  });

  it('retorna 409 em nome duplicado no tipo (MongoServerError 11000)', async () => {
    mockVerifySession.mockResolvedValue(ADMIN);
    const dupErr = new MongoServerError({ message: 'dup' });
    dupErr.code = 11000;
    mockFindByIdAndUpdate.mockRejectedValue(dupErr);
    const res = await PATCH(makeRequest({ name: 'Existente' }), makeParams());
    expect(res.status).toBe(409);
  });
});
