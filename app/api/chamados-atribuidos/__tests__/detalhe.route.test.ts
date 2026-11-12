import { beforeEach, describe, expect, it, vi } from 'vitest';

const TECNICO_ID = 'a'.repeat(24);
const CHAMADO_ID = 'c'.repeat(24);
const UNIT_ID = 'd'.repeat(24);

vi.mock('@/lib/dal', () => ({
  verifySession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  dbConnect: vi.fn().mockResolvedValue(undefined),
}));

const mockChamadoLean = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    findById: vi.fn(() => ({ lean: mockChamadoLean })),
  },
}));

const mockUnitLean = vi.fn();
const mockUnitSelect = vi.fn(() => ({ lean: mockUnitLean }));
const mockUnitFindById = vi.fn();
vi.mock('@/models/unit', () => ({
  UnitModel: {
    findById: (id: unknown) => mockUnitFindById(id),
  },
}));

import { GET } from '@/app/api/chamados-atribuidos/[id]/route';
import { verifySession } from '@/lib/dal';

function makeChamado(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: CHAMADO_ID,
    ticket_number: 'CHM-2026-00010',
    titulo: 'Ar-condicionado pingando',
    descricao: 'Pinga água sobre a mesa',
    status: 'em atendimento',
    unitId: UNIT_ID,
    localExato: 'Sala 204',
    assignedToUserId: TECNICO_ID,
    createdAt: new Date('2026-11-10T12:00:00Z'),
    updatedAt: new Date('2026-11-10T12:00:00Z'),
    ...overrides,
  };
}

async function chamar() {
  const res = await GET(new Request(`http://localhost/api/chamados-atribuidos/${CHAMADO_ID}`), {
    params: Promise.resolve({ id: CHAMADO_ID }),
  });
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUnitFindById.mockReturnValue({ select: mockUnitSelect });
  vi.mocked(verifySession).mockResolvedValue({
    userId: TECNICO_ID,
    role: 'Técnico',
    username: 'tecnico01',
    unitId: 'e'.repeat(24),
    isActive: true,
  });
});

describe('GET /api/chamados-atribuidos/[id] — unidade', () => {
  it('devolve o nome e o andar da unidade do chamado', async () => {
    mockChamadoLean.mockResolvedValue(makeChamado());
    mockUnitLean.mockResolvedValue({ name: 'Secretaria Administrativa', floor: '2º andar' });

    const { status, body } = await chamar();

    expect(status).toBe(200);
    expect(mockUnitFindById).toHaveBeenCalledWith(UNIT_ID);
    expect(body.item.unitName).toBe('Secretaria Administrativa');
    expect(body.item.unitFloor).toBe('2º andar');
    expect(body.item.localExato).toBe('Sala 204');
  });

  it('devolve andar nulo quando a unidade não tem andar', async () => {
    mockChamadoLean.mockResolvedValue(makeChamado());
    mockUnitLean.mockResolvedValue({ name: 'Protocolo', floor: '' });

    const { body } = await chamar();

    expect(body.item.unitName).toBe('Protocolo');
    expect(body.item.unitFloor).toBeNull();
  });

  it('não consulta unidade quando o chamado não tem unitId', async () => {
    mockChamadoLean.mockResolvedValue(makeChamado({ unitId: null }));

    const { body } = await chamar();

    expect(mockUnitFindById).not.toHaveBeenCalled();
    expect(body.item.unitName).toBeNull();
    expect(body.item.unitFloor).toBeNull();
  });

  it('devolve nulo quando a unidade foi removida', async () => {
    mockChamadoLean.mockResolvedValue(makeChamado());
    mockUnitLean.mockResolvedValue(null);

    const { body } = await chamar();

    expect(body.item.unitName).toBeNull();
    expect(body.item.unitFloor).toBeNull();
  });

  it('não consulta unidade de chamado de outro técnico', async () => {
    mockChamadoLean.mockResolvedValue(makeChamado({ assignedToUserId: 'f'.repeat(24) }));

    const { status } = await chamar();

    expect(status).toBe(403);
    expect(mockUnitFindById).not.toHaveBeenCalled();
  });
});
