import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const mockRequireManager = vi.fn();
vi.mock('@/lib/dal', () => ({
  requireManager: () => mockRequireManager(),
}));

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));

const mockChamadoFindById = vi.fn();
const mockChamadoAggregate = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    findById: (...args: unknown[]) => mockChamadoFindById(...args),
    aggregate: (...args: unknown[]) => mockChamadoAggregate(...args),
  },
}));

const mockServiceCatalogFindById = vi.fn();
vi.mock('@/models/ServiceCatalog', () => ({
  ServiceCatalogModel: {
    findById: (...args: unknown[]) => mockServiceCatalogFindById(...args),
  },
}));

const mockUserFind = vi.fn();
vi.mock('@/models/user.model', () => ({
  UserModel: { find: (...args: unknown[]) => mockUserFind(...args) },
}));

import { GET } from '@/app/api/gestao/chamados/[id]/eligible-technicians-reassign/route';

// ── Helpers ──────────────────────────────────────────────────────

const CHAMADO_ID = '507f1f77bcf86cd799439011';
const CURRENT_TECH_ID = '507f1f77bcf86cd799439012';
const OLD_SERVICE_ID = '507f1f77bcf86cd799439013';
const NEW_SERVICE_ID = '507f1f77bcf86cd799439014';
const OLD_SUBTYPE_ID = '507f1f77bcf86cd799439015';
const NEW_SUBTYPE_ID = '507f1f77bcf86cd799439016';

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function chamadoLean(overrides: Record<string, unknown> = {}) {
  return {
    _id: CHAMADO_ID,
    status: 'em atendimento',
    catalogServiceId: OLD_SERVICE_ID,
    assignedToUserId: CURRENT_TECH_ID,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireManager.mockResolvedValue({ userId: 'u1', role: 'Preposto' });
  mockChamadoFindById.mockReturnValue({ lean: () => Promise.resolve(chamadoLean()) });
  mockServiceCatalogFindById.mockImplementation((id: unknown) => ({
    select: () => ({
      lean: () =>
        Promise.resolve(
          String(id) === NEW_SERVICE_ID
            ? { subtypeId: NEW_SUBTYPE_ID }
            : { subtypeId: OLD_SUBTYPE_ID },
        ),
    }),
  }));
  mockUserFind.mockReturnValue({ lean: () => Promise.resolve([]) });
  mockChamadoAggregate.mockResolvedValue([]);
});

describe('GET .../eligible-technicians-reassign', () => {
  it('responde 400 com ID de chamado inválido', async () => {
    const req = new Request('http://localhost/api/gestao/chamados/x/eligible-technicians-reassign');
    const res = await GET(req, makeParams('nao-e-objectid'));
    expect(res.status).toBe(400);
  });

  it('sem catalogServiceId: usa o subtypeId do serviço atual do chamado (comportamento de sempre)', async () => {
    const req = new Request(
      `http://localhost/api/gestao/chamados/${CHAMADO_ID}/eligible-technicians-reassign`,
    );

    const res = await GET(req, makeParams(CHAMADO_ID));

    expect(res.status).toBe(200);
    expect(mockServiceCatalogFindById).toHaveBeenCalledWith(OLD_SERVICE_ID);
    const filtro = mockUserFind.mock.calls[0][0];
    expect(String(filtro.specialties.$in[0])).toBe(OLD_SUBTYPE_ID);
  });

  it('com catalogServiceId (spec 0009, AC-11): usa o subtypeId do serviço NOVO, não o atual', async () => {
    const req = new Request(
      `http://localhost/api/gestao/chamados/${CHAMADO_ID}/eligible-technicians-reassign?catalogServiceId=${NEW_SERVICE_ID}`,
    );

    const res = await GET(req, makeParams(CHAMADO_ID));

    expect(res.status).toBe(200);
    expect(mockServiceCatalogFindById).toHaveBeenCalledWith(NEW_SERVICE_ID);
    expect(mockServiceCatalogFindById).not.toHaveBeenCalledWith(OLD_SERVICE_ID);
    const filtro = mockUserFind.mock.calls[0][0];
    expect(String(filtro.specialties.$in[0])).toBe(NEW_SUBTYPE_ID);
  });

  it('catalogServiceId inválido: responde 400', async () => {
    const req = new Request(
      `http://localhost/api/gestao/chamados/${CHAMADO_ID}/eligible-technicians-reassign?catalogServiceId=xyz`,
    );

    const res = await GET(req, makeParams(CHAMADO_ID));

    expect(res.status).toBe(400);
    expect(mockServiceCatalogFindById).not.toHaveBeenCalled();
  });

  it('recusa fora de em atendimento, mesmo com catalogServiceId informado', async () => {
    mockChamadoFindById.mockReturnValue({
      lean: () => Promise.resolve(chamadoLean({ status: 'validado' })),
    });
    const req = new Request(
      `http://localhost/api/gestao/chamados/${CHAMADO_ID}/eligible-technicians-reassign?catalogServiceId=${NEW_SERVICE_ID}`,
    );

    const res = await GET(req, makeParams(CHAMADO_ID));

    expect(res.status).toBe(400);
  });

  it('exclui o técnico atualmente atribuído da lista de elegíveis', async () => {
    const req = new Request(
      `http://localhost/api/gestao/chamados/${CHAMADO_ID}/eligible-technicians-reassign?catalogServiceId=${NEW_SERVICE_ID}`,
    );

    await GET(req, makeParams(CHAMADO_ID));

    const filtro = mockUserFind.mock.calls[0][0];
    expect(String(filtro._id.$ne)).toBe(CURRENT_TECH_ID);
  });

  it('chamado sem técnico atribuído: 400', async () => {
    mockChamadoFindById.mockReturnValue({
      lean: () => Promise.resolve(chamadoLean({ assignedToUserId: null })),
    });
    const req = new Request(
      `http://localhost/api/gestao/chamados/${CHAMADO_ID}/eligible-technicians-reassign`,
    );

    const res = await GET(req, makeParams(CHAMADO_ID));

    expect(res.status).toBe(400);
  });
});
