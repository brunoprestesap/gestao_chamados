import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

vi.mock('@/lib/dal', () => ({
  requireManager: vi.fn().mockResolvedValue({
    userId: 'a'.repeat(24),
    role: 'Admin',
    username: 'admin',
  }),
}));

vi.mock('@/lib/db', () => ({
  dbConnect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/dto-normalizers', () => ({
  normalizeMaterialObservations: vi.fn().mockReturnValue([]),
}));

const mockLean = vi.fn();
const mockLimit = vi.fn().mockReturnValue({ lean: mockLean });
const mockSkip = vi.fn().mockReturnValue({ limit: mockLimit });
const mockSort = vi.fn().mockReturnValue({ skip: mockSkip });
const mockPopulate = vi.fn().mockReturnValue({ sort: mockSort });
const mockFind = vi.fn().mockReturnValue({ populate: mockPopulate });
const mockCountDocuments = vi.fn();

vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    find: (...args: unknown[]) => mockFind(...args),
    countDocuments: (...args: unknown[]) => mockCountDocuments(...args),
  },
}));

const mockUserFind = vi.fn();
vi.mock('@/models/user.model', () => ({
  UserModel: { find: (...args: unknown[]) => mockUserFind(...args) },
}));

const mockServicoSugerido = vi.fn();
const mockPrioridadeValidada = vi.fn();
vi.mock('@/lib/conversas', () => ({
  servicoSugeridoPelaIa: (...args: unknown[]) => mockServicoSugerido(...args),
  prioridadeValidadaPelaIa: (...args: unknown[]) => mockPrioridadeValidada(...args),
}));

// Import after mocks
import { GET } from '@/app/api/gestao/chamados/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/gestao/chamados');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString());
}

function makeChamado(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: 'c'.repeat(24),
    ticket_number: 'CHM-2024-00001',
    titulo: 'Ar-condicionado não funciona',
    descricao: 'Sala 301',
    status: 'aberto',
    solicitanteId: 'b'.repeat(24),
    unitId: 'e'.repeat(24),
    localExato: 'Bloco A',
    tipoServico: 'Ar-Condicionado',
    naturezaAtendimento: 'Padrão',
    grauUrgencia: 'Normal',
    telefoneContato: '',
    finalPriority: null,
    classificationNotes: '',
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T12:00:00Z'),
    materialObservations: [],
    sla: null,
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
  mockServicoSugerido.mockResolvedValue(new Set());
  mockPrioridadeValidada.mockResolvedValue(new Set());
});

describe('GET /api/gestao/chamados — pagination', () => {
  it('should return paginated response with defaults (page=1, limit=20)', async () => {
    mockCountDocuments.mockResolvedValue(0);
    mockLean.mockResolvedValue([]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('pagination');
    expect(body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it('should pass skip and limit to Mongoose query', async () => {
    mockCountDocuments.mockResolvedValue(50);
    mockLean.mockResolvedValue([]);

    await GET(makeRequest({ page: '3', limit: '10' }));

    // skip = (3-1) * 10 = 20
    expect(mockSkip).toHaveBeenCalledWith(20);
    expect(mockLimit).toHaveBeenCalledWith(10);
  });

  it('should calculate totalPages correctly', async () => {
    mockCountDocuments.mockResolvedValue(25);
    mockLean.mockResolvedValue([]);

    const res = await GET(makeRequest({ limit: '10' }));
    const body = await res.json();

    expect(body.pagination.total).toBe(25);
    expect(body.pagination.totalPages).toBe(3); // ceil(25/10)
  });

  it('should return items normalized', async () => {
    const chamado = makeChamado();
    mockCountDocuments.mockResolvedValue(1);
    mockLean.mockResolvedValue([chamado]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toHaveProperty('_id', 'c'.repeat(24));
    expect(body.items[0]).toHaveProperty('ticket_number', 'CHM-2024-00001');
    expect(body.items[0]).toHaveProperty('titulo', 'Ar-condicionado não funciona');
  });
});

describe('GET /api/gestao/chamados — filters', () => {
  it('should not add status filter when status is "all"', async () => {
    mockCountDocuments.mockResolvedValue(0);
    mockLean.mockResolvedValue([]);

    await GET(makeRequest({ status: 'all' }));

    const findFilter = mockFind.mock.calls[0][0];
    expect(findFilter).not.toHaveProperty('status');
  });

  it('should add status filter when a specific status is provided', async () => {
    mockCountDocuments.mockResolvedValue(0);
    mockLean.mockResolvedValue([]);

    await GET(makeRequest({ status: 'aberto' }));

    const findFilter = mockFind.mock.calls[0][0];
    expect(findFilter.status).toBe('aberto');
  });

  it('should add $or regex filter when q is provided', async () => {
    mockCountDocuments.mockResolvedValue(0);
    mockLean.mockResolvedValue([]);

    await GET(makeRequest({ q: 'elevador' }));

    const findFilter = mockFind.mock.calls[0][0];
    expect(findFilter.$or).toBeDefined();
    expect(findFilter.$or).toHaveLength(5);
    expect(findFilter.$or[0]).toHaveProperty('ticket_number');
    expect(findFilter.$or[0].ticket_number.$regex).toBe('elevador');
  });

  it('should not add $or filter when q is empty', async () => {
    mockCountDocuments.mockResolvedValue(0);
    mockLean.mockResolvedValue([]);

    await GET(makeRequest({ q: '' }));

    const findFilter = mockFind.mock.calls[0][0];
    expect(findFilter.$or).toBeUndefined();
  });

  it('should trim whitespace from q before filtering', async () => {
    mockCountDocuments.mockResolvedValue(0);
    mockLean.mockResolvedValue([]);

    await GET(makeRequest({ q: '  elevador  ' }));

    const findFilter = mockFind.mock.calls[0][0];
    expect(findFilter.$or[0].ticket_number.$regex).toBe('elevador');
  });
});

describe('GET /api/gestao/chamados — projection', () => {
  it('should pass projection as second argument to find()', async () => {
    mockCountDocuments.mockResolvedValue(0);
    mockLean.mockResolvedValue([]);

    await GET(makeRequest());

    const projection = mockFind.mock.calls[0][1];
    expect(projection).toBeDefined();
    expect(projection).toHaveProperty('ticket_number', 1);
    expect(projection).toHaveProperty('titulo', 1);
    expect(projection).toHaveProperty('status', 1);
    expect(projection).toHaveProperty('sla', 1);
    // Should NOT include heavy fields
    expect(projection).not.toHaveProperty('executions');
    expect(projection).not.toHaveProperty('evaluation');
    expect(projection).not.toHaveProperty('closureNotes');
  });
});

describe('GET /api/gestao/chamados — sorting', () => {
  it('should sort by updatedAt descending', async () => {
    mockCountDocuments.mockResolvedValue(0);
    mockLean.mockResolvedValue([]);

    await GET(makeRequest());

    expect(mockSort).toHaveBeenCalledWith({ updatedAt: -1 });
  });
});

describe('GET /api/gestao/chamados — validation errors', () => {
  it('should return 400 for invalid page value', async () => {
    const res = await GET(makeRequest({ page: '0' }));
    expect(res.status).toBe(400);
  });

  it('should return 400 for invalid limit value', async () => {
    const res = await GET(makeRequest({ limit: '200' }));
    expect(res.status).toBe(400);
  });

  it('should treat unknown status as all (200, no status filter)', async () => {
    mockCountDocuments.mockResolvedValue(0);
    mockLean.mockResolvedValue([]);

    const res = await GET(makeRequest({ status: 'inexistente' }));
    expect(res.status).toBe(200);

    const findFilter = mockFind.mock.calls[0][0];
    expect(findFilter).not.toHaveProperty('status');
  });
});

describe('GET /api/gestao/chamados — marca do chat (spec 0004, AC-15)', () => {
  it('consulta as decisões uma vez por página, só com os chamados do chat', async () => {
    // Arrange
    const doChat = makeChamado({ _id: '1'.repeat(24), canalAbertura: 'chat' });
    const semIa = makeChamado({ _id: '2'.repeat(24), canalAbertura: 'chat' });
    const doFormulario = makeChamado({ _id: '3'.repeat(24) });
    mockCountDocuments.mockResolvedValue(3);
    mockLean.mockResolvedValue([doChat, semIa, doFormulario]);
    mockServicoSugerido.mockResolvedValue(new Set(['1'.repeat(24)]));

    // Act
    const res = await GET(makeRequest());
    const body = await res.json();

    // Assert
    expect(mockServicoSugerido).toHaveBeenCalledTimes(1);
    expect(mockServicoSugerido).toHaveBeenCalledWith(['1'.repeat(24), '2'.repeat(24)]);
    expect(
      body.items.map((i: { canalAbertura: string; servicoSugeridoIa: boolean }) => [
        i.canalAbertura,
        i.servicoSugeridoIa,
      ]),
    ).toEqual([
      ['chat', true],
      ['chat', false],
      ['formulario', false],
    ]);
  });

  it('pede o canal de abertura na projeção', async () => {
    // Arrange
    mockCountDocuments.mockResolvedValue(0);
    mockLean.mockResolvedValue([]);

    // Act
    await GET(makeRequest());

    // Assert
    expect(mockFind.mock.calls[0][1]).toHaveProperty('canalAbertura', 1);
  });
});

describe('GET /api/gestao/chamados — selo "validado pela IA" (spec 0007, AC-15)', () => {
  it('marca validadoPelaIa por chamado, sem restringir ao canal chat', async () => {
    // Arrange
    const validado = makeChamado({ _id: '1'.repeat(24), canalAbertura: 'chat' });
    const naoValidado = makeChamado({ _id: '2'.repeat(24) });
    mockCountDocuments.mockResolvedValue(2);
    mockLean.mockResolvedValue([validado, naoValidado]);
    mockPrioridadeValidada.mockResolvedValue(new Set(['1'.repeat(24)]));

    // Act
    const res = await GET(makeRequest());
    const body = await res.json();

    // Assert
    expect(mockPrioridadeValidada).toHaveBeenCalledWith(['1'.repeat(24), '2'.repeat(24)]);
    expect(
      body.items.map((i: { _id: string; validadoPelaIa: boolean }) => [i._id, i.validadoPelaIa]),
    ).toEqual([
      ['1'.repeat(24), true],
      ['2'.repeat(24), false],
    ]);
  });
});

describe('GET /api/gestao/chamados — countDocuments + find run in parallel', () => {
  it('should call both countDocuments and find with the same filter', async () => {
    mockCountDocuments.mockResolvedValue(5);
    mockLean.mockResolvedValue([]);

    await GET(makeRequest({ status: 'validado', q: 'teste' }));

    const countFilter = mockCountDocuments.mock.calls[0][0];
    const findFilter = mockFind.mock.calls[0][0];

    // Both should have the same filter
    expect(countFilter.status).toBe('validado');
    expect(findFilter.status).toBe('validado');
    expect(countFilter.$or).toBeDefined();
    expect(findFilter.$or).toBeDefined();
  });
});

describe('GET /api/gestao/chamados — atribuição automática (spec 0008, AC-15)', () => {
  const TECNICO_ESCOLHIDO = '7'.repeat(24);
  const TECNICO_ATUAL = '8'.repeat(24);

  function comTecnicos(nomes: Record<string, string>) {
    mockUserFind.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve(Object.entries(nomes).map(([_id, name]) => ({ _id, name }))),
      }),
    });
  }

  it('pede o campo na projeção', async () => {
    // Act
    await GET(makeRequest());

    // Assert
    expect(mockFind.mock.calls[0][1]).toHaveProperty('atribuicaoAutomatica', 1);
  });

  it('devolve o técnico que a regra escolheu, e não o de hoje, depois de uma reatribuição', async () => {
    // Arrange: a regra escolheu o 7777…, o Preposto trocou para o 8888…
    const reatribuido = makeChamado({
      _id: '1'.repeat(24),
      status: 'em atendimento',
      assignedToUserId: { _id: TECNICO_ATUAL, name: 'Diego' },
      atribuicaoAutomatica: {
        resultado: 'atribuido',
        motivo: null,
        tecnicoId: TECNICO_ESCOLHIDO,
        em: new Date('2026-09-25T15:00:00Z'),
      },
    });
    mockCountDocuments.mockResolvedValue(1);
    mockLean.mockResolvedValue([reatribuido]);
    comTecnicos({ [TECNICO_ESCOLHIDO]: 'Carla' });

    // Act
    const body = await (await GET(makeRequest())).json();

    // Assert
    expect(body.items[0].atribuicaoAutomatica).toEqual({
      resultado: 'atribuido',
      motivo: null,
      tecnicoNome: 'Carla',
      em: '2026-09-25T15:00:00.000Z',
    });
    expect(body.items[0].assignedToUserName).toBe('Diego');
    // Uma consulta só, com os ids da página
    expect(mockUserFind).toHaveBeenCalledTimes(1);
    expect(mockUserFind.mock.calls[0][0]).toEqual({ _id: { $in: [TECNICO_ESCOLHIDO] } });
  });

  it('sem técnico: devolve o motivo e nenhum nome', async () => {
    // Arrange
    mockCountDocuments.mockResolvedValue(1);
    mockLean.mockResolvedValue([
      makeChamado({
        status: 'validado',
        atribuicaoAutomatica: {
          resultado: 'sem_tecnico',
          motivo: 'sem_especialidade',
          tecnicoId: null,
          em: new Date('2026-09-25T15:00:00Z'),
        },
      }),
    ]);

    // Act
    const body = await (await GET(makeRequest())).json();

    // Assert
    expect(body.items[0].atribuicaoAutomatica).toEqual({
      resultado: 'sem_tecnico',
      motivo: 'sem_especialidade',
      tecnicoNome: null,
      em: '2026-09-25T15:00:00.000Z',
    });
    expect(mockUserFind).not.toHaveBeenCalled();
  });

  it('chamado sem o campo (formulário, chave desligada) devolve null, sem consultar usuários', async () => {
    // Arrange
    mockCountDocuments.mockResolvedValue(1);
    mockLean.mockResolvedValue([makeChamado()]);

    // Act
    const body = await (await GET(makeRequest())).json();

    // Assert
    expect(body.items[0].atribuicaoAutomatica).toBeNull();
    expect(mockUserFind).not.toHaveBeenCalled();
  });

  it('nome de técnico que sumiu do banco vira nulo, e o resultado continua saindo', async () => {
    // Arrange
    mockCountDocuments.mockResolvedValue(1);
    mockLean.mockResolvedValue([
      makeChamado({
        atribuicaoAutomatica: {
          resultado: 'atribuido',
          motivo: null,
          tecnicoId: TECNICO_ESCOLHIDO,
          em: new Date('2026-09-25T15:00:00Z'),
        },
      }),
    ]);
    comTecnicos({});

    // Act
    const body = await (await GET(makeRequest())).json();

    // Assert
    expect(body.items[0].atribuicaoAutomatica).toMatchObject({
      resultado: 'atribuido',
      tecnicoNome: null,
    });
  });

  it('resultado gravado que a tela não conhece vira null, e o resto da lista continua saindo', async () => {
    // Arrange: um documento com resultado inesperado ao lado de um chamado normal
    mockCountDocuments.mockResolvedValue(2);
    mockLean.mockResolvedValue([
      makeChamado({
        _id: '1'.repeat(24),
        atribuicaoAutomatica: {
          resultado: 'em_analise',
          motivo: null,
          tecnicoId: null,
          em: new Date('2026-09-25T15:00:00Z'),
        },
      }),
      makeChamado({ _id: '2'.repeat(24) }),
    ]);

    // Act
    const response = await GET(makeRequest());
    const body = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].atribuicaoAutomatica).toBeNull();
    expect(body.items[1].atribuicaoAutomatica).toBeNull();
  });
});
