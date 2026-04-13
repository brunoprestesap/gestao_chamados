import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const TECH_USER_ID = new Types.ObjectId().toHexString();
const mockRequireSession = vi.fn();
const mockRequireTechnician = vi.fn();
vi.mock('@/lib/dal', () => ({
  requireSession: () => mockRequireSession(),
  requireTechnician: () => mockRequireTechnician(),
}));

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));

const mockChamadoCountDocuments = vi.fn();
const mockChamadoFind = vi.fn();
const mockChamadoAggregate = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    countDocuments: (...args: unknown[]) => mockChamadoCountDocuments(...args),
    find: (...args: unknown[]) => mockChamadoFind(...args),
    aggregate: (...args: unknown[]) => mockChamadoAggregate(...args),
  },
}));

const mockUserFindById = vi.fn();
vi.mock('@/models/user.model', () => ({
  UserModel: {
    findById: (...args: unknown[]) => mockUserFindById(...args),
  },
}));

const mockServiceSubTypeFind = vi.fn();
vi.mock('@/models/ServiceSubType', () => ({
  ServiceSubTypeModel: {
    find: (...args: unknown[]) => mockServiceSubTypeFind(...args),
  },
}));

import { getDashboardTecnicoData } from '@/app/(dashboard)/dashboard/actions';

// ── Helpers ──────────────────────────────────────────────────────

const SESSION = {
  userId: TECH_USER_ID,
  role: 'Técnico' as const,
  username: 'tecnico1',
  isActive: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue(SESSION);
  mockRequireTechnician.mockResolvedValue(SESSION);
});

// ── getDashboardTecnicoData ──────────────────────────────────────

describe('getDashboardTecnicoData', () => {
  it('retorna os dados corretos para o dashboard do técnico', async () => {
    // Mock user
    mockUserFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          maxAssignedTickets: 5,
          specialties: [
            new Types.ObjectId(),
            new Types.ObjectId(),
          ],
        }),
      }),
    });

    // Mock counts via aggregate
    mockChamadoAggregate.mockResolvedValue([{
      cargaAtiva: [{ total: 3 }],
      emAtendimento: [{ total: 2 }],
      concluidosAguardando: [{ total: 1 }],
      chamadosPorSubtype: [],
      ultimosChamados: [
        { _id: new Types.ObjectId(), ticket_number: 'T-001', titulo: 'Chamado 1', status: 'em atendimento' },
        { _id: new Types.ObjectId(), ticket_number: 'T-002', titulo: 'Chamado 2', status: 'concluído' },
      ],
    }]);

    // Mock ServiceSubType
    mockServiceSubTypeFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { _id: new Types.ObjectId(), name: 'Manutenção Predial' },
        { _id: new Types.ObjectId(), name: 'Elétrica' },
      ]),
    });

    const data = await getDashboardTecnicoData();

    expect(data).toBeDefined();
    expect(data?.cargaAtiva).toBe(3);
    expect(data?.maxAssignedTickets).toBe(5);
    expect(data?.emAtendimento).toBe(2);
    expect(data?.prontosParaConcluir).toBe(2);
    expect(data?.concluidosAguardandoEncerramento).toBe(1);
    expect(data?.especialidades).toHaveLength(2);
    expect(data?.ultimosChamados).toHaveLength(2);
  });

  it('retorna dados padrão se o usuário não for encontrado', async () => {
    mockUserFindById.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    });

    // Mock counts via aggregate
    mockChamadoAggregate.mockResolvedValue([{
      cargaAtiva: [],
      emAtendimento: [],
      concluidosAguardando: [],
      chamadosPorSubtype: [],
      ultimosChamados: [],
    }]);

    const data = await getDashboardTecnicoData();
    expect(data).toBeDefined();
    expect(data?.cargaAtiva).toBe(0);
    expect(data?.maxAssignedTickets).toBe(5);
  });
});
