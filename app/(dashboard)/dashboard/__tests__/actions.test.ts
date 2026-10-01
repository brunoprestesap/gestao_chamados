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

import {
  getDashboardSolicitanteData,
  getDashboardTecnicoData,
} from '@/app/(dashboard)/dashboard/actions';

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
          specialties: [new Types.ObjectId(), new Types.ObjectId()],
        }),
      }),
    });

    // Mock counts via aggregate
    mockChamadoAggregate.mockResolvedValue([
      {
        cargaAtiva: [{ total: 3 }],
        emAtendimento: [{ total: 2 }],
        concluidosAguardando: [{ total: 1 }],
        chamadosPorSubtype: [],
        ultimosChamados: [
          {
            _id: new Types.ObjectId(),
            ticket_number: 'T-001',
            titulo: 'Chamado 1',
            status: 'em atendimento',
          },
          {
            _id: new Types.ObjectId(),
            ticket_number: 'T-002',
            titulo: 'Chamado 2',
            status: 'concluído',
          },
        ],
      },
    ]);

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
    mockChamadoAggregate.mockResolvedValue([
      {
        cargaAtiva: [],
        emAtendimento: [],
        concluidosAguardando: [],
        chamadosPorSubtype: [],
        ultimosChamados: [],
      },
    ]);

    const data = await getDashboardTecnicoData();
    expect(data).toBeDefined();
    expect(data?.cargaAtiva).toBe(0);
    expect(data?.maxAssignedTickets).toBe(5);
  });
});

// covers: AC-15 (avaliações pendentes = concluídos com a janela aberta)
describe('getDashboardSolicitanteData · avaliações pendentes (spec 0010)', () => {
  beforeEach(() => {
    mockChamadoAggregate.mockResolvedValue([
      {
        emAndamento: [{ total: 1 }],
        avaliacoesPendentes: [{ total: 2 }],
        ultimosChamados: [],
        encerradosTotal: [{ total: 5 }],
        encerradosAvaliados: [{ total: 3 }],
      },
    ]);
  });

  it('conta só os concluídos com a janela aberta e sem nota', async () => {
    // Act
    await getDashboardSolicitanteData();

    // Assert
    const [pipeline] = mockChamadoAggregate.mock.calls[0];
    const filtro = pipeline[1].$facet.avaliacoesPendentes[0].$match;
    expect(filtro.status).toBe('concluído');
    expect(filtro.$or).toEqual([
      { prazoAvaliacaoAte: { $gt: expect.any(Date) } },
      { prazoAvaliacaoAte: null },
    ]);
    expect(filtro.$nor).toEqual([{ 'evaluation.rating': { $gte: 1, $lte: 5 } }]);
  });

  it('encerrados e encerrados avaliados continuam como antes', async () => {
    // Act
    const data = await getDashboardSolicitanteData();

    // Assert
    expect(data).toMatchObject({
      avaliacoesPendentes: 2,
      encerradosTotal: 5,
      encerradosAvaliados: 3,
    });
    const [pipeline] = mockChamadoAggregate.mock.calls[0];
    expect(pipeline[1].$facet.encerradosTotal[0].$match).toEqual({ status: 'encerrado' });
  });
});
