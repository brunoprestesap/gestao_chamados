import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const TECNICO_ID = 'a'.repeat(24);

vi.mock('@/lib/dal', () => ({
  verifySession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  dbConnect: vi.fn().mockResolvedValue(undefined),
}));

const mockLean = vi.fn();
const mockLimit = vi.fn().mockReturnValue({ lean: mockLean });
const mockSkip = vi.fn().mockReturnValue({ limit: mockLimit });
const mockSort = vi.fn().mockReturnValue({ skip: mockSkip });
const mockFind = vi.fn().mockReturnValue({ sort: mockSort });
const mockCountDocuments = vi.fn();

vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    find: (...args: unknown[]) => mockFind(...args),
    countDocuments: (...args: unknown[]) => mockCountDocuments(...args),
  },
}));

const mockUnitLean = vi.fn().mockResolvedValue([]);
const mockUnitSelect = vi.fn().mockReturnValue({ lean: mockUnitLean });
const mockUnitFind = vi.fn().mockReturnValue({ select: mockUnitSelect });

vi.mock('@/models/unit', () => ({
  UnitModel: {
    find: (...args: unknown[]) => mockUnitFind(...args),
  },
}));

// Import after mocks
import { GET } from '@/app/api/chamados-atribuidos/route';
import { verifySession } from '@/lib/dal';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockTechnicianSession() {
  vi.mocked(verifySession).mockResolvedValue({
    userId: TECNICO_ID,
    role: 'Técnico',
    username: 'tecnico01',
    unitId: 'e'.repeat(24),
    isActive: true,
  });
}

function mockManagerSession() {
  vi.mocked(verifySession).mockResolvedValue({
    userId: 'b'.repeat(24),
    role: 'Admin',
    username: 'admin',
    unitId: 'e'.repeat(24),
    isActive: true,
  });
}

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/chamados-atribuidos');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString());
}

function makeChamado(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: 'c'.repeat(24),
    ticket_number: 'CHM-2024-00010',
    titulo: 'Lâmpada queimada',
    descricao: 'Corredor 2o andar',
    status: 'em atendimento',
    solicitanteId: 'b'.repeat(24),
    unitId: 'e'.repeat(24),
    localExato: 'Corredor 2o andar',
    tipoServico: 'Manutenção Predial',
    naturezaAtendimento: 'Padrão',
    grauUrgencia: 'Normal',
    telefoneContato: '',
    assignedToUserId: TECNICO_ID,
    assignedAt: new Date('2024-01-16T08:00:00Z'),
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-16T09:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockCountDocuments.mockResolvedValue(0);
  mockLean.mockResolvedValue([]);
  mockUnitLean.mockResolvedValue([]);
});

describe('GET /api/chamados-atribuidos — auth', () => {
  it('should return 401 when session is null', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Não autorizado');
  });

  it('should return 403 when role is not Técnico', async () => {
    mockManagerSession();

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Acesso restrito a técnicos');
  });

  it('should return 200 when role is Técnico', async () => {
    mockTechnicianSession();

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
  });
});

describe('GET /api/chamados-atribuidos — pagination', () => {
  beforeEach(mockTechnicianSession);

  it('should return paginated response with defaults (page=1, limit=10)', async () => {
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('pagination');
    expect(body.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0,
    });
  });

  it('should pass skip and limit to Mongoose query', async () => {
    mockCountDocuments.mockResolvedValue(30);

    await GET(makeRequest({ page: '2', limit: '10' }));

    // skip = (2-1) * 10 = 10
    expect(mockSkip).toHaveBeenCalledWith(10);
    expect(mockLimit).toHaveBeenCalledWith(10);
  });

  it('should calculate totalPages correctly', async () => {
    mockCountDocuments.mockResolvedValue(15);

    const res = await GET(makeRequest({ limit: '10' }));
    const body = await res.json();

    expect(body.pagination.totalPages).toBe(2); // ceil(15/10)
  });

  it('should return items when data exists', async () => {
    const chamado = makeChamado();
    mockCountDocuments.mockResolvedValue(1);
    mockLean.mockResolvedValue([chamado]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toHaveProperty('_id', 'c'.repeat(24));
    expect(body.items[0]).toHaveProperty('ticket_number', 'CHM-2024-00010');
  });
});

describe('GET /api/chamados-atribuidos — filters', () => {
  beforeEach(mockTechnicianSession);

  it('should always filter by assignedToUserId of current user', async () => {
    await GET(makeRequest());

    const findFilter = mockFind.mock.calls[0][0];
    expect(findFilter.assignedToUserId).toBeDefined();
    expect(String(findFilter.assignedToUserId)).toBe(TECNICO_ID);
  });

  it('should add status filter when provided', async () => {
    await GET(makeRequest({ status: 'em atendimento' }));

    const findFilter = mockFind.mock.calls[0][0];
    expect(findFilter.status).toBe('em atendimento');
  });

  it('should not add status filter when "all"', async () => {
    await GET(makeRequest({ status: 'all' }));

    const findFilter = mockFind.mock.calls[0][0];
    expect(findFilter).not.toHaveProperty('status');
  });

  it('should add $or regex filter when q is provided', async () => {
    await GET(makeRequest({ q: 'lâmpada' }));

    const findFilter = mockFind.mock.calls[0][0];
    expect(findFilter.$or).toBeDefined();
    expect(findFilter.$or).toHaveLength(4);
    expect(findFilter.$or[0].ticket_number.$regex).toBe('lâmpada');
  });

  it('should not add $or filter when q is empty or whitespace', async () => {
    await GET(makeRequest({ q: '   ' }));

    const findFilter = mockFind.mock.calls[0][0];
    expect(findFilter.$or).toBeUndefined();
  });
});

describe('GET /api/chamados-atribuidos — projection', () => {
  beforeEach(mockTechnicianSession);

  it('should pass projection as second argument to find()', async () => {
    await GET(makeRequest());

    const projection = mockFind.mock.calls[0][1];
    expect(projection).toBeDefined();
    expect(projection).toHaveProperty('ticket_number', 1);
    expect(projection).toHaveProperty('titulo', 1);
    expect(projection).toHaveProperty('localExato', 1);
    expect(projection).toHaveProperty('assignedToUserId', 1);
    // Should NOT include heavy fields
    expect(projection).not.toHaveProperty('executions');
    expect(projection).not.toHaveProperty('evaluation');
    expect(projection).not.toHaveProperty('sla');
  });
});

describe('GET /api/chamados-atribuidos — unit name resolution', () => {
  beforeEach(mockTechnicianSession);

  it('should resolve unit names for items with unitId', async () => {
    const unitId = 'e'.repeat(24);
    mockCountDocuments.mockResolvedValue(1);
    mockLean.mockResolvedValue([makeChamado({ unitId })]);
    mockUnitLean.mockResolvedValue([{ _id: unitId, name: 'TI - Suporte' }]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.items[0].unitName).toBe('TI - Suporte');
    expect(mockUnitFind).toHaveBeenCalledOnce();
  });

  it('should not query units when no items have unitId', async () => {
    mockCountDocuments.mockResolvedValue(1);
    mockLean.mockResolvedValue([makeChamado({ unitId: null })]);

    await GET(makeRequest());

    expect(mockUnitFind).not.toHaveBeenCalled();
  });
});

describe('GET /api/chamados-atribuidos — sorting', () => {
  beforeEach(mockTechnicianSession);

  it('should sort by updatedAt descending', async () => {
    await GET(makeRequest());

    expect(mockSort).toHaveBeenCalledWith({ updatedAt: -1 });
  });
});

describe('GET /api/chamados-atribuidos — validation', () => {
  beforeEach(mockTechnicianSession);

  it('should return 400 for invalid page', async () => {
    const res = await GET(makeRequest({ page: '0' }));
    expect(res.status).toBe(400);
  });

  it('should return 400 for invalid limit', async () => {
    const res = await GET(makeRequest({ limit: '999' }));
    expect(res.status).toBe(400);
  });
});
