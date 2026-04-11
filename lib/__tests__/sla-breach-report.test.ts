import { beforeEach, describe, expect, it, vi } from 'vitest';

// server-only → alias para mock vazio (vitest.config.ts)
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));

const mockAggregate = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: { aggregate: (...args: unknown[]) => mockAggregate(...args) },
}));

const mockUserFind = vi.fn();
vi.mock('@/models/user.model', () => ({
  UserModel: { find: (...args: unknown[]) => mockUserFind(...args) },
}));

const mockUnitFind = vi.fn();
vi.mock('@/models/unit', () => ({
  UnitModel: { find: (...args: unknown[]) => mockUnitFind(...args) },
}));

import { computeBreachReport } from '@/lib/sla-breach-report';

/* ─── Helpers ──────────────────────────────────────────────────── */

const TECH_ID = '507f1f77bcf86cd799439011';
const UNIT_ID = '507f1f77bcf86cd799439022';

const START = new Date('2026-01-01T00:00:00.000Z');
const END = new Date('2026-03-31T23:59:59.999Z');

/** Facet vazio — nenhum chamado no período */
function emptyFacets() {
  return [
    {
      byTechnician: [],
      byUnit: [],
      byPriority: [],
      byTipoServico: [],
      breachTimeline: [],
      totals: [],
    },
  ];
}

/** Facet completo com dados realistas */
function fullFacets() {
  return [
    {
      byTechnician: [
        {
          _id: TECH_ID,
          totalChamados: 10,
          breachedChamados: 3,
          responseBreaches: 2,
          resolutionBreaches: 1,
          avgDelayMs: 3_600_000, // 60 min
        },
      ],
      byUnit: [
        {
          _id: UNIT_ID,
          totalChamados: 8,
          breachedChamados: 2,
          responseBreaches: 1,
          resolutionBreaches: 1,
          avgDelayMs: null,
        },
      ],
      byPriority: [{ _id: 'ALTA', total: 3, responseBreaches: 2, resolutionBreaches: 1 }],
      byTipoServico: [
        { _id: 'Manutenção Predial', total: 2, responseBreaches: 1, resolutionBreaches: 1 },
      ],
      breachTimeline: [
        { _id: '2026-03', total: 2, responseBreaches: 1, resolutionBreaches: 1 },
      ],
      totals: [
        {
          _id: null,
          totalChamados: 20,
          breachedChamados: 5,
          responseBreaches: 3,
          resolutionBreaches: 2,
        },
      ],
    },
  ];
}

/** Configura mocks para retorno com nomes */
function setupPopulateMocks() {
  mockUserFind.mockReturnValue({
    lean: () => Promise.resolve([{ _id: TECH_ID, name: 'João Técnico' }]),
  });
  mockUnitFind.mockReturnValue({
    lean: () => Promise.resolve([{ _id: UNIT_ID, name: 'Seção de TI' }]),
  });
}

/** Configura mocks para retorno sem nomes (listas vazias) */
function setupEmptyPopulateMocks() {
  mockUserFind.mockReturnValue({ lean: () => Promise.resolve([]) });
  mockUnitFind.mockReturnValue({ lean: () => Promise.resolve([]) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* ─── Período sem chamados ──────────────────────────────────────── */

describe('computeBreachReport — sem chamados', () => {
  it('should return empty report when no tickets exist in the period', async () => {
    // Arrange
    mockAggregate.mockResolvedValue(emptyFacets());
    setupEmptyPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert
    expect(result.totalChamadosComSla).toBe(0);
    expect(result.totalBreachedChamados).toBe(0);
    expect(result.totalResponseBreaches).toBe(0);
    expect(result.totalResolutionBreaches).toBe(0);
    expect(result.avgBreachRate).toBe(0);
    expect(result.byTechnician).toEqual([]);
    expect(result.byUnit).toEqual([]);
    expect(result.byPriority).toEqual([]);
    expect(result.byTipoServico).toEqual([]);
    expect(result.timeline).toEqual([]);
  });

  it('should include period start and end as ISO strings', async () => {
    // Arrange
    mockAggregate.mockResolvedValue(emptyFacets());
    setupEmptyPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert
    expect(result.period.start).toBe(START.toISOString());
    expect(result.period.end).toBe(END.toISOString());
  });
});

/* ─── totalChamadosComSla e totalBreachedChamados ───────────────── */

describe('computeBreachReport — totais', () => {
  it('should calculate totalChamadosComSla as all tickets with SLA, not just breaches', async () => {
    // Arrange
    mockAggregate.mockResolvedValue(fullFacets());
    setupPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert — 20 no total, apenas 5 com breach
    expect(result.totalChamadosComSla).toBe(20);
    expect(result.totalBreachedChamados).toBe(5);
  });

  it('should calculate totalResponseBreaches and totalResolutionBreaches independently', async () => {
    // Arrange
    mockAggregate.mockResolvedValue(fullFacets());
    setupPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert
    expect(result.totalResponseBreaches).toBe(3);
    expect(result.totalResolutionBreaches).toBe(2);
  });

  it('should not double-count tickets with both response and resolution breach', async () => {
    // Arrange — um chamado pode ter ambos, mas breachedChamados conta 1 por chamado
    const facets = [
      {
        byTechnician: [],
        byUnit: [],
        byPriority: [],
        byTipoServico: [],
        breachTimeline: [],
        totals: [
          {
            _id: null,
            totalChamados: 10,
            breachedChamados: 4, // 4 chamados únicos com breach
            responseBreaches: 5, // pode ser > breachedChamados
            resolutionBreaches: 3,
          },
        ],
      },
    ];
    mockAggregate.mockResolvedValue(facets);
    setupEmptyPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert
    expect(result.totalBreachedChamados).toBe(4); // não soma response+resolution
    expect(result.totalResponseBreaches).toBe(5);
    expect(result.totalResolutionBreaches).toBe(3);
  });
});

/* ─── avgBreachRate ─────────────────────────────────────────────── */

describe('computeBreachReport — avgBreachRate', () => {
  it('should calculate avgBreachRate as breachedChamados / totalChamadosComSla', async () => {
    // Arrange
    mockAggregate.mockResolvedValue(fullFacets());
    setupPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert: 5/20 = 25%
    expect(result.avgBreachRate).toBe(25);
  });

  it('should return avgBreachRate of 0 when there are no tickets', async () => {
    // Arrange
    mockAggregate.mockResolvedValue(emptyFacets());
    setupEmptyPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert
    expect(result.avgBreachRate).toBe(0);
  });

  it('should never return avgBreachRate above 100', async () => {
    // Arrange — breachedChamados = totalChamados (todos em breach)
    const facets = [
      {
        byTechnician: [],
        byUnit: [],
        byPriority: [],
        byTipoServico: [],
        breachTimeline: [],
        totals: [
          {
            _id: null,
            totalChamados: 5,
            breachedChamados: 5,
            responseBreaches: 5,
            resolutionBreaches: 5,
          },
        ],
      },
    ];
    mockAggregate.mockResolvedValue(facets);
    setupEmptyPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert
    expect(result.avgBreachRate).toBeLessThanOrEqual(100);
    expect(result.avgBreachRate).toBe(100);
  });
});

/* ─── byTechnician — breachRate e avgDelayMinutes ──────────────── */

describe('computeBreachReport — byTechnician', () => {
  it('should calculate breachRate per technician as breachedChamados / totalChamados', async () => {
    // Arrange
    mockAggregate.mockResolvedValue(fullFacets());
    setupPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert: 3/10 = 30%
    expect(result.byTechnician).toHaveLength(1);
    expect(result.byTechnician[0].breachRate).toBe(30);
  });

  it('should not use responseBreaches + resolutionBreaches to calculate breachRate', async () => {
    // Arrange — responseBreaches + resolutionBreaches > breachedChamados
    const facets = [
      {
        byTechnician: [
          {
            _id: TECH_ID,
            totalChamados: 10,
            breachedChamados: 3,
            responseBreaches: 2,
            resolutionBreaches: 2, // soma = 4, mas breachedChamados = 3
            avgDelayMs: null,
          },
        ],
        byUnit: [],
        byPriority: [],
        byTipoServico: [],
        breachTimeline: [],
        totals: [
          { _id: null, totalChamados: 10, breachedChamados: 3, responseBreaches: 2, resolutionBreaches: 2 },
        ],
      },
    ];
    mockAggregate.mockResolvedValue(facets);
    setupPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert: usa breachedChamados (3), não responseBreaches+resolutionBreaches (4)
    expect(result.byTechnician[0].breachRate).toBe(30); // 3/10
    expect(result.byTechnician[0].breachRate).not.toBe(40); // não usa 4/10
  });

  it('should populate technician name from UserModel', async () => {
    // Arrange
    mockAggregate.mockResolvedValue(fullFacets());
    setupPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert
    expect(result.byTechnician[0].technicianName).toBe('João Técnico');
    expect(result.byTechnician[0].technicianId).toBe(TECH_ID);
  });

  it('should fall back to "Sem atribuição" when technician name is not found', async () => {
    // Arrange
    mockAggregate.mockResolvedValue(fullFacets());
    mockUserFind.mockReturnValue({ lean: () => Promise.resolve([]) }); // sem resultado
    mockUnitFind.mockReturnValue({ lean: () => Promise.resolve([]) });

    // Act
    const result = await computeBreachReport(START, END);

    // Assert
    expect(result.byTechnician[0].technicianName).toBe('Sem atribuição');
  });

  it('should filter out technicians with zero breaches', async () => {
    // Arrange
    const facets = [
      {
        byTechnician: [
          {
            _id: TECH_ID,
            totalChamados: 10,
            breachedChamados: 0, // sem breach
            responseBreaches: 0,
            resolutionBreaches: 0,
            avgDelayMs: null,
          },
        ],
        byUnit: [],
        byPriority: [],
        byTipoServico: [],
        breachTimeline: [],
        totals: [{ _id: null, totalChamados: 10, breachedChamados: 0, responseBreaches: 0, resolutionBreaches: 0 }],
      },
    ];
    mockAggregate.mockResolvedValue(facets);
    setupEmptyPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert — técnico com 0 breaches não aparece no resultado
    expect(result.byTechnician).toHaveLength(0);
  });

  it('should filter out entries where technician id is null', async () => {
    // Arrange — chamados sem técnico atribuído (_id: null)
    const facets = [
      {
        byTechnician: [
          {
            _id: null,
            totalChamados: 5,
            breachedChamados: 2,
            responseBreaches: 1,
            resolutionBreaches: 1,
            avgDelayMs: null,
          },
        ],
        byUnit: [],
        byPriority: [],
        byTipoServico: [],
        breachTimeline: [],
        totals: [{ _id: null, totalChamados: 5, breachedChamados: 2, responseBreaches: 1, resolutionBreaches: 1 }],
      },
    ];
    mockAggregate.mockResolvedValue(facets);
    setupEmptyPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert — _id null é filtrado
    expect(result.byTechnician).toHaveLength(0);
  });
});

/* ─── avgDelayMinutes ───────────────────────────────────────────── */

describe('computeBreachReport — avgDelayMinutes', () => {
  it('should return null avgDelayMinutes when there are no resolved breaches', async () => {
    // Arrange
    const facets = [
      {
        byTechnician: [
          {
            _id: TECH_ID,
            totalChamados: 5,
            breachedChamados: 2,
            responseBreaches: 2,
            resolutionBreaches: 0,
            avgDelayMs: null, // nenhum resolvedAt disponível
          },
        ],
        byUnit: [],
        byPriority: [],
        byTipoServico: [],
        breachTimeline: [],
        totals: [{ _id: null, totalChamados: 5, breachedChamados: 2, responseBreaches: 2, resolutionBreaches: 0 }],
      },
    ];
    mockAggregate.mockResolvedValue(facets);
    setupPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert
    expect(result.byTechnician[0].avgDelayMinutes).toBeNull();
  });

  it('should calculate avgDelayMinutes as resolvedAt - resolutionDueAt in minutes', async () => {
    // Arrange — avgDelayMs = 3_600_000ms → 60 minutos
    mockAggregate.mockResolvedValue(fullFacets());
    setupPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert
    expect(result.byTechnician[0].avgDelayMinutes).toBe(60);
  });

  it('should round avgDelayMinutes to nearest integer', async () => {
    // Arrange — avgDelayMs que resulta em fração: 90_500ms = 1.508...min → 2
    const facets = [
      {
        byTechnician: [
          {
            _id: TECH_ID,
            totalChamados: 5,
            breachedChamados: 2,
            responseBreaches: 1,
            resolutionBreaches: 1,
            avgDelayMs: 90_500, // ~1.508 min → arredonda para 2
          },
        ],
        byUnit: [],
        byPriority: [],
        byTipoServico: [],
        breachTimeline: [],
        totals: [{ _id: null, totalChamados: 5, breachedChamados: 2, responseBreaches: 1, resolutionBreaches: 1 }],
      },
    ];
    mockAggregate.mockResolvedValue(facets);
    setupPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert
    expect(result.byTechnician[0].avgDelayMinutes).toBe(Math.round(90_500 / 60_000));
  });
});

/* ─── byUnit ────────────────────────────────────────────────────── */

describe('computeBreachReport — byUnit', () => {
  it('should populate unit name from UnitModel', async () => {
    // Arrange
    mockAggregate.mockResolvedValue(fullFacets());
    setupPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert
    expect(result.byUnit).toHaveLength(1);
    expect(result.byUnit[0].unitName).toBe('Seção de TI');
    expect(result.byUnit[0].unitId).toBe(UNIT_ID);
  });

  it('should fall back to "Sem unidade" when unit name is not found', async () => {
    // Arrange
    mockAggregate.mockResolvedValue(fullFacets());
    mockUserFind.mockReturnValue({ lean: () => Promise.resolve([{ _id: TECH_ID, name: 'João' }]) });
    mockUnitFind.mockReturnValue({ lean: () => Promise.resolve([]) }); // unidade não encontrada

    // Act
    const result = await computeBreachReport(START, END);

    // Assert
    expect(result.byUnit[0].unitName).toBe('Sem unidade');
  });

  it('should filter out units with zero breaches', async () => {
    // Arrange
    const facets = [
      {
        byTechnician: [],
        byUnit: [
          {
            _id: UNIT_ID,
            totalChamados: 8,
            breachedChamados: 0,
            responseBreaches: 0,
            resolutionBreaches: 0,
            avgDelayMs: null,
          },
        ],
        byPriority: [],
        byTipoServico: [],
        breachTimeline: [],
        totals: [{ _id: null, totalChamados: 8, breachedChamados: 0, responseBreaches: 0, resolutionBreaches: 0 }],
      },
    ];
    mockAggregate.mockResolvedValue(facets);
    setupEmptyPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert
    expect(result.byUnit).toHaveLength(0);
  });

  it('should calculate breachRate for units as breachedChamados / totalChamados', async () => {
    // Arrange — 2 breaches em 8 chamados = 25%
    mockAggregate.mockResolvedValue(fullFacets());
    setupPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert
    expect(result.byUnit[0].breachRate).toBe(25);
  });

  it('should return null avgDelayMinutes for unit when avgDelayMs is null', async () => {
    // Arrange — fullFacets tem avgDelayMs: null para a unidade
    mockAggregate.mockResolvedValue(fullFacets());
    setupPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert
    expect(result.byUnit[0].avgDelayMinutes).toBeNull();
  });
});

/* ─── byPriority e byTipoServico ────────────────────────────────── */

describe('computeBreachReport — byPriority', () => {
  it('should only count tickets with breach in byPriority', async () => {
    // Arrange
    mockAggregate.mockResolvedValue(fullFacets());
    setupPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert — pipeline já pré-filtra breaches na aggregation
    expect(result.byPriority).toHaveLength(1);
    expect(result.byPriority[0].priority).toBe('ALTA');
    expect(result.byPriority[0].total).toBe(3);
    expect(result.byPriority[0].responseBreaches).toBe(2);
    expect(result.byPriority[0].resolutionBreaches).toBe(1);
  });

  it('should return empty byPriority when there are no breaches', async () => {
    // Arrange
    mockAggregate.mockResolvedValue(emptyFacets());
    setupEmptyPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert
    expect(result.byPriority).toEqual([]);
  });
});

describe('computeBreachReport — byTipoServico', () => {
  it('should only count tickets with breach in byTipoServico', async () => {
    // Arrange
    mockAggregate.mockResolvedValue(fullFacets());
    setupPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert
    expect(result.byTipoServico).toHaveLength(1);
    expect(result.byTipoServico[0].tipoServico).toBe('Manutenção Predial');
    expect(result.byTipoServico[0].total).toBe(2);
    expect(result.byTipoServico[0].responseBreaches).toBe(1);
    expect(result.byTipoServico[0].resolutionBreaches).toBe(1);
  });

  it('should return empty byTipoServico when there are no breaches', async () => {
    // Arrange
    mockAggregate.mockResolvedValue(emptyFacets());
    setupEmptyPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert
    expect(result.byTipoServico).toEqual([]);
  });
});

/* ─── timeline ──────────────────────────────────────────────────── */

describe('computeBreachReport — timeline', () => {
  it('should group breaches by month in YYYY-MM format from sla.computedAt', async () => {
    // Arrange
    mockAggregate.mockResolvedValue(fullFacets());
    setupPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert
    expect(result.timeline).toHaveLength(1);
    expect(result.timeline[0].month).toBe('2026-03');
    expect(result.timeline[0].total).toBe(2);
    expect(result.timeline[0].responseBreaches).toBe(1);
    expect(result.timeline[0].resolutionBreaches).toBe(1);
  });

  it('should return multiple months sorted ascending in timeline', async () => {
    // Arrange — aggregation já retorna ordenado por _id asc
    const facets = [
      {
        byTechnician: [],
        byUnit: [],
        byPriority: [],
        byTipoServico: [],
        breachTimeline: [
          { _id: '2026-01', total: 5, responseBreaches: 3, resolutionBreaches: 2 },
          { _id: '2026-02', total: 3, responseBreaches: 2, resolutionBreaches: 1 },
          { _id: '2026-03', total: 2, responseBreaches: 1, resolutionBreaches: 1 },
        ],
        totals: [{ _id: null, totalChamados: 30, breachedChamados: 10, responseBreaches: 6, resolutionBreaches: 4 }],
      },
    ];
    mockAggregate.mockResolvedValue(facets);
    setupEmptyPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert
    expect(result.timeline).toHaveLength(3);
    expect(result.timeline[0].month).toBe('2026-01');
    expect(result.timeline[1].month).toBe('2026-02');
    expect(result.timeline[2].month).toBe('2026-03');
  });

  it('should return empty timeline when there are no breaches', async () => {
    // Arrange
    mockAggregate.mockResolvedValue(emptyFacets());
    setupEmptyPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert
    expect(result.timeline).toEqual([]);
  });
});

/* ─── Populate — chamadas às models externas ────────────────────── */

describe('computeBreachReport — populate nomes', () => {
  it('should not call UserModel.find when there are no technicians', async () => {
    // Arrange
    mockAggregate.mockResolvedValue(emptyFacets());
    setupEmptyPopulateMocks();

    // Act
    await computeBreachReport(START, END);

    // Assert
    expect(mockUserFind).not.toHaveBeenCalled();
  });

  it('should not call UnitModel.find when there are no units', async () => {
    // Arrange
    mockAggregate.mockResolvedValue(emptyFacets());
    setupEmptyPopulateMocks();

    // Act
    await computeBreachReport(START, END);

    // Assert
    expect(mockUnitFind).not.toHaveBeenCalled();
  });

  it('should call UserModel.find with correct tech ids when technicians are present', async () => {
    // Arrange
    mockAggregate.mockResolvedValue(fullFacets());
    setupPopulateMocks();

    // Act
    await computeBreachReport(START, END);

    // Assert
    expect(mockUserFind).toHaveBeenCalledWith(
      { _id: { $in: [TECH_ID] } },
      '_id name',
    );
  });

  it('should call UnitModel.find with correct unit ids when units are present', async () => {
    // Arrange
    mockAggregate.mockResolvedValue(fullFacets());
    setupPopulateMocks();

    // Act
    await computeBreachReport(START, END);

    // Assert
    expect(mockUnitFind).toHaveBeenCalledWith(
      { _id: { $in: [UNIT_ID] } },
      '_id name',
    );
  });
});

/* ─── Edge cases ────────────────────────────────────────────────── */

describe('computeBreachReport — edge cases', () => {
  it('should handle results[0] being undefined when aggregate returns empty array', async () => {
    // Arrange — aggregate retorna array vazio (sem o objeto de facets)
    mockAggregate.mockResolvedValue([]);
    setupEmptyPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert — não deve lançar exceção, retorna zeros
    expect(result.totalChamadosComSla).toBe(0);
    expect(result.byTechnician).toEqual([]);
    expect(result.timeline).toEqual([]);
  });

  it('should calculate breachRate rounded to 2 decimal places', async () => {
    // Arrange — 1/3 = 33.33%
    const facets = [
      {
        byTechnician: [],
        byUnit: [],
        byPriority: [],
        byTipoServico: [],
        breachTimeline: [],
        totals: [
          {
            _id: null,
            totalChamados: 3,
            breachedChamados: 1,
            responseBreaches: 1,
            resolutionBreaches: 0,
          },
        ],
      },
    ];
    mockAggregate.mockResolvedValue(facets);
    setupEmptyPopulateMocks();

    // Act
    const result = await computeBreachReport(START, END);

    // Assert: 1/3 * 100 = 33.33
    expect(result.avgBreachRate).toBe(33.33);
  });

  it('should sort byTechnician by breachRate descending', async () => {
    // Arrange — dois técnicos com breach rates diferentes
    const techId2 = '507f1f77bcf86cd799439099';
    const facets = [
      {
        byTechnician: [
          {
            _id: TECH_ID,
            totalChamados: 10,
            breachedChamados: 2, // 20%
            responseBreaches: 2,
            resolutionBreaches: 0,
            avgDelayMs: null,
          },
          {
            _id: techId2,
            totalChamados: 4,
            breachedChamados: 3, // 75%
            responseBreaches: 2,
            resolutionBreaches: 1,
            avgDelayMs: null,
          },
        ],
        byUnit: [],
        byPriority: [],
        byTipoServico: [],
        breachTimeline: [],
        totals: [{ _id: null, totalChamados: 14, breachedChamados: 5, responseBreaches: 4, resolutionBreaches: 1 }],
      },
    ];
    mockAggregate.mockResolvedValue(facets);
    mockUserFind.mockReturnValue({
      lean: () =>
        Promise.resolve([
          { _id: TECH_ID, name: 'Técnico A' },
          { _id: techId2, name: 'Técnico B' },
        ]),
    });
    mockUnitFind.mockReturnValue({ lean: () => Promise.resolve([]) });

    // Act
    const result = await computeBreachReport(START, END);

    // Assert — 75% primeiro, depois 20%
    expect(result.byTechnician[0].breachRate).toBe(75);
    expect(result.byTechnician[1].breachRate).toBe(20);
  });

  it('should sort byUnit by breachRate descending', async () => {
    // Arrange
    const unitId2 = '507f1f77bcf86cd799439033';
    const facets = [
      {
        byTechnician: [],
        byUnit: [
          {
            _id: UNIT_ID,
            totalChamados: 10,
            breachedChamados: 1, // 10%
            responseBreaches: 1,
            resolutionBreaches: 0,
            avgDelayMs: null,
          },
          {
            _id: unitId2,
            totalChamados: 5,
            breachedChamados: 4, // 80%
            responseBreaches: 3,
            resolutionBreaches: 1,
            avgDelayMs: null,
          },
        ],
        byPriority: [],
        byTipoServico: [],
        breachTimeline: [],
        totals: [{ _id: null, totalChamados: 15, breachedChamados: 5, responseBreaches: 4, resolutionBreaches: 1 }],
      },
    ];
    mockAggregate.mockResolvedValue(facets);
    mockUserFind.mockReturnValue({ lean: () => Promise.resolve([]) });
    mockUnitFind.mockReturnValue({
      lean: () =>
        Promise.resolve([
          { _id: UNIT_ID, name: 'Unidade A' },
          { _id: unitId2, name: 'Unidade B' },
        ]),
    });

    // Act
    const result = await computeBreachReport(START, END);

    // Assert — 80% primeiro, depois 10%
    expect(result.byUnit[0].breachRate).toBe(80);
    expect(result.byUnit[1].breachRate).toBe(10);
  });
});
