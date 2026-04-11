import { NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../route';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/dal', () => ({
  requireManager: vi.fn().mockResolvedValue({
    user: { id: '507f1f77bcf86cd799439011', role: 'Preposto', name: 'Manager' },
  }),
}));

vi.mock('@/lib/db', () => ({
  dbConnect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    find: vi.fn(),
  },
}));

vi.mock('@/lib/sla-utils', () => ({
  getSlaResolutionStatus: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { getSlaResolutionStatus } from '@/lib/sla-utils';
import { ChamadoModel } from '@/models/Chamado';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2024-06-01T12:00:00.000Z');
const COMPUTED_AT = new Date('2024-06-01T08:00:00.000Z'); // 4h antes de NOW
const RESOLUTION_DUE_AT = new Date('2024-06-01T16:00:00.000Z'); // 8h após computedAt → totalMs = 8h

function buildChamado(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    ticket_number: 'CHM-2024-00001',
    titulo: 'Chamado teste',
    status: 'em atendimento',
    tipoServico: 'Manutenção Predial',
    finalPriority: 'NORMAL',
    assignedToUserId: null,
    slaPausedAt: null,
    totalPausedMinutes: 0,
    createdAt: COMPUTED_AT,
    sla: {
      resolutionDueAt: RESOLUTION_DUE_AT.toISOString(),
      computedAt: COMPUTED_AT.toISOString(),
      responseDueAt: null,
      resolutionBreachedAt: null,
      resolvedAt: null,
      priority: 'NORMAL',
    },
    ...overrides,
  };
}

function mockFind(chamados: unknown[]) {
  const mockLean = vi.fn().mockResolvedValue(chamados);
  const mockPopulate = vi.fn().mockReturnValue({ lean: mockLean });
  const mockSelect = vi.fn().mockReturnValue({ populate: mockPopulate });
  vi.mocked(ChamadoModel.find).mockReturnValue({ select: mockSelect } as ReturnType<
    typeof ChamadoModel.find
  >);
  return { mockLean, mockPopulate, mockSelect };
}

async function callGet(): Promise<ReturnType<typeof NextResponse.json>> {
  const response = await GET();
  return response as ReturnType<typeof NextResponse.json>;
}

async function getJson(response: Awaited<ReturnType<typeof callGet>>) {
  // NextResponse.json armazena o body como stream; em testes Node podemos usar .json()
  return (response as unknown as { json(): Promise<unknown> }).json();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/sla/dashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Retorna 200 com dados corretos
  // -------------------------------------------------------------------------
  it('should return 200 with correct shape when there are active chamados', async () => {
    const chamado = buildChamado();
    mockFind([chamado]);
    vi.mocked(getSlaResolutionStatus).mockReturnValue('no_prazo');

    const response = await callGet();
    const body = await getJson(response);

    expect(response.status).toBe(200);
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('summary');
    expect(body).toHaveProperty('byPriority');
    expect(body).toHaveProperty('byTipoServico');
    expect((body as { items: unknown[] }).items).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // 2. summary com contagens corretas
  // -------------------------------------------------------------------------
  it('should calculate summary counts correctly for mixed statuses', async () => {
    const chamados = [
      buildChamado({ _id: { toString: () => 'aaa' }, ticket_number: 'CHM-2024-00001' }),
      buildChamado({ _id: { toString: () => 'bbb' }, ticket_number: 'CHM-2024-00002' }),
      buildChamado({ _id: { toString: () => 'ccc' }, ticket_number: 'CHM-2024-00003' }),
    ];
    mockFind(chamados);

    vi.mocked(getSlaResolutionStatus)
      .mockReturnValueOnce('no_prazo')
      .mockReturnValueOnce('proximo_vencimento')
      .mockReturnValueOnce('atrasado');

    const response = await callGet();
    const body = (await getJson(response)) as { summary: Record<string, number> };

    expect(body.summary).toEqual({
      total: 3,
      noPrazo: 1,
      proximoVencimento: 1,
      atrasado: 1,
    });
  });

  // -------------------------------------------------------------------------
  // 3. Calcula remainingMs corretamente (totalMs - elapsedMs)
  // -------------------------------------------------------------------------
  it('should calculate remainingMs as totalMs minus elapsedMs', async () => {
    // NOW = 12:00, computedAt = 08:00, resolutionDueAt = 16:00
    // totalMs = 8h = 28_800_000
    // elapsedMs = now - computedAt - pauseMs = 4h = 14_400_000
    // remainingMs = 28_800_000 - 14_400_000 = 14_400_000
    const chamado = buildChamado();
    mockFind([chamado]);
    vi.mocked(getSlaResolutionStatus).mockReturnValue('no_prazo');

    const response = await callGet();
    const body = (await getJson(response)) as { items: { remainingMs: number; totalMs: number }[] };
    const item = body.items[0];

    const expectedTotalMs = RESOLUTION_DUE_AT.getTime() - COMPUTED_AT.getTime();
    const expectedElapsedMs = NOW.getTime() - COMPUTED_AT.getTime();
    const expectedRemainingMs = expectedTotalMs - expectedElapsedMs;

    expect(item.totalMs).toBe(expectedTotalMs);
    expect(item.remainingMs).toBe(expectedRemainingMs);
  });

  // -------------------------------------------------------------------------
  // 4. remainingMs pode ser negativo para chamados atrasados
  // -------------------------------------------------------------------------
  it('should return negative remainingMs for overdue chamados', async () => {
    const overdueResolutionDueAt = new Date('2024-06-01T10:00:00.000Z'); // antes do NOW (12:00)
    const chamado = buildChamado({
      sla: {
        resolutionDueAt: overdueResolutionDueAt.toISOString(),
        computedAt: COMPUTED_AT.toISOString(),
        responseDueAt: null,
        resolutionBreachedAt: new Date('2024-06-01T10:00:00.000Z').toISOString(),
        resolvedAt: null,
        priority: 'NORMAL',
      },
    });
    mockFind([chamado]);
    vi.mocked(getSlaResolutionStatus).mockReturnValue('atrasado');

    const response = await callGet();
    const body = (await getJson(response)) as { items: { remainingMs: number }[] };

    expect(body.items[0].remainingMs).toBeLessThan(0);
  });

  // -------------------------------------------------------------------------
  // 5. elapsedMs nunca é negativo (Math.max(0, ...))
  // -------------------------------------------------------------------------
  it('should never return negative elapsedMs (percentUsed >= 0)', async () => {
    // computedAt no futuro → elapsed bruto seria negativo, mas Math.max garante 0
    const futureComputedAt = new Date('2024-06-01T14:00:00.000Z'); // 2h após NOW
    const futureResolutionDueAt = new Date('2024-06-01T22:00:00.000Z');
    const chamado = buildChamado({
      sla: {
        resolutionDueAt: futureResolutionDueAt.toISOString(),
        computedAt: futureComputedAt.toISOString(),
        responseDueAt: null,
        resolutionBreachedAt: null,
        resolvedAt: null,
        priority: 'NORMAL',
      },
    });
    mockFind([chamado]);
    vi.mocked(getSlaResolutionStatus).mockReturnValue('no_prazo');

    const response = await callGet();
    const body = (await getJson(response)) as {
      items: { percentUsed: number; remainingMs: number }[];
    };
    const item = body.items[0];

    expect(item.percentUsed).toBeGreaterThanOrEqual(0);
    // elapsedMs = 0, então remainingMs = totalMs
    expect(item.remainingMs).toBe(item.totalMs ?? 0);
  });

  // -------------------------------------------------------------------------
  // 6. percentUsed está entre 0 e 100
  // -------------------------------------------------------------------------
  it('should clamp percentUsed between 0 and 100', async () => {
    // Cenário: elapsed > total → percentUsed deve ser 100 (não passar de 100)
    const pastResolutionDueAt = new Date('2024-06-01T09:00:00.000Z'); // apenas 1h após computedAt
    const chamado = buildChamado({
      sla: {
        resolutionDueAt: pastResolutionDueAt.toISOString(),
        computedAt: COMPUTED_AT.toISOString(), // 08:00
        responseDueAt: null,
        resolutionBreachedAt: null,
        resolvedAt: null,
        priority: 'NORMAL',
      },
    });
    mockFind([chamado]);
    vi.mocked(getSlaResolutionStatus).mockReturnValue('atrasado');

    const response = await callGet();
    const body = (await getJson(response)) as { items: { percentUsed: number }[] };

    expect(body.items[0].percentUsed).toBeGreaterThanOrEqual(0);
    expect(body.items[0].percentUsed).toBeLessThanOrEqual(100);
  });

  // -------------------------------------------------------------------------
  // 7. Desconta pausas usando totalPausedMinutes
  // -------------------------------------------------------------------------
  it('should discount totalPausedMinutes from elapsed time', async () => {
    // NOW = 12:00, computedAt = 08:00 → elapsed bruto = 4h = 240 min
    // totalPausedMinutes = 60 → pausedMs = 60 * 60_000 = 3_600_000
    // elapsedMs efetivo = 4h - 1h = 3h = 10_800_000
    // totalMs = 8h = 28_800_000
    // remainingMs = 28_800_000 - 10_800_000 = 18_000_000 (5h)
    const chamadoSemPausa = buildChamado();
    const chamadoComPausa = buildChamado({
      _id: { toString: () => 'bbb' },
      ticket_number: 'CHM-2024-00002',
      totalPausedMinutes: 60,
    });
    mockFind([chamadoSemPausa, chamadoComPausa]);
    vi.mocked(getSlaResolutionStatus).mockReturnValue('no_prazo');

    const response = await callGet();
    const body = (await getJson(response)) as { items: { remainingMs: number }[] };

    // Sem pausa: remainingMs = totalMs - elapsedMs = 28_800_000 - 14_400_000 = 14_400_000
    const semPausa = body.items.find(
      (i: { remainingMs: number }) => i.remainingMs === 14_400_000,
    );
    // Com 60min de pausa: remainingMs = 28_800_000 - 10_800_000 = 18_000_000
    const comPausa = body.items.find(
      (i: { remainingMs: number }) => i.remainingMs === 18_000_000,
    );

    expect(semPausa).toBeDefined();
    expect(comPausa).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 8. Desconta pausa ativa quando slaPausedAt está set
  // -------------------------------------------------------------------------
  it('should discount active pause duration when slaPausedAt is set', async () => {
    // NOW = 12:00, slaPausedAt = 11:00 → activePauseMs = 1h = 3_600_000
    // totalPausedMinutes = 0
    // elapsed bruto = 4h, mas descontamos 1h → 3h = 10_800_000
    // totalMs = 8h = 28_800_000
    // remainingMs = 18_000_000 (5h)
    const slaPausedAt = new Date('2024-06-01T11:00:00.000Z');
    const chamado = buildChamado({
      slaPausedAt,
      totalPausedMinutes: 0,
    });
    mockFind([chamado]);
    vi.mocked(getSlaResolutionStatus).mockReturnValue('no_prazo');

    const response = await callGet();
    const body = (await getJson(response)) as { items: { remainingMs: number; isPaused: boolean }[] };
    const item = body.items[0];

    expect(item.remainingMs).toBe(18_000_000);
    expect(item.isPaused).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 9. Ordena items por urgência: atrasados → proximo_vencimento → no_prazo
  // -------------------------------------------------------------------------
  it('should sort items with atrasado first, then proximo_vencimento, then no_prazo', async () => {
    const chamados = [
      buildChamado({ _id: { toString: () => 'aaa' }, ticket_number: 'CHM-2024-00001' }),
      buildChamado({ _id: { toString: () => 'bbb' }, ticket_number: 'CHM-2024-00002' }),
      buildChamado({ _id: { toString: () => 'ccc' }, ticket_number: 'CHM-2024-00003' }),
    ];
    mockFind(chamados);

    // Deliberadamente fora de ordem: no_prazo, atrasado, proximo_vencimento
    vi.mocked(getSlaResolutionStatus)
      .mockReturnValueOnce('no_prazo')
      .mockReturnValueOnce('atrasado')
      .mockReturnValueOnce('proximo_vencimento');

    const response = await callGet();
    const body = (await getJson(response)) as { items: { slaStatus: string }[] };
    const statuses = body.items.map((i: { slaStatus: string }) => i.slaStatus);

    expect(statuses).toEqual(['atrasado', 'proximo_vencimento', 'no_prazo']);
  });

  // -------------------------------------------------------------------------
  // 10. Popula nome do técnico via populate
  // -------------------------------------------------------------------------
  it('should populate assignedToUserName from populated assignedToUserId', async () => {
    const chamado = buildChamado({
      assignedToUserId: {
        _id: '507f1f77bcf86cd799439099',
        name: 'João Técnico',
      },
    });
    mockFind([chamado]);
    vi.mocked(getSlaResolutionStatus).mockReturnValue('no_prazo');

    const response = await callGet();
    const body = (await getJson(response)) as {
      items: { assignedToUserName: string | null; assignedToUserId: string | null }[];
    };
    const item = body.items[0];

    expect(item.assignedToUserName).toBe('João Técnico');
    expect(item.assignedToUserId).toBe('507f1f77bcf86cd799439099');
  });

  it('should set assignedToUserName to null when no technician assigned', async () => {
    const chamado = buildChamado({ assignedToUserId: null });
    mockFind([chamado]);
    vi.mocked(getSlaResolutionStatus).mockReturnValue('no_prazo');

    const response = await callGet();
    const body = (await getJson(response)) as {
      items: { assignedToUserName: string | null }[];
    };

    expect(body.items[0].assignedToUserName).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 11. Agrega byPriority e byTipoServico corretamente
  // -------------------------------------------------------------------------
  it('should aggregate byPriority correctly', async () => {
    const chamados = [
      buildChamado({
        _id: { toString: () => 'aaa' },
        ticket_number: 'CHM-2024-00001',
        finalPriority: 'ALTA',
      }),
      buildChamado({
        _id: { toString: () => 'bbb' },
        ticket_number: 'CHM-2024-00002',
        finalPriority: 'ALTA',
      }),
      buildChamado({
        _id: { toString: () => 'ccc' },
        ticket_number: 'CHM-2024-00003',
        finalPriority: 'BAIXA',
      }),
    ];
    mockFind(chamados);

    vi.mocked(getSlaResolutionStatus)
      .mockReturnValueOnce('no_prazo')
      .mockReturnValueOnce('atrasado')
      .mockReturnValueOnce('proximo_vencimento');

    const response = await callGet();
    const body = (await getJson(response)) as {
      byPriority: Array<{
        priority: string;
        total: number;
        noPrazo: number;
        proximoVencimento: number;
        atrasado: number;
      }>;
    };

    const alta = body.byPriority.find((p) => p.priority === 'ALTA');
    const baixa = body.byPriority.find((p) => p.priority === 'BAIXA');

    expect(alta).toBeDefined();
    expect(alta!.total).toBe(2);
    expect(alta!.noPrazo).toBe(1);
    expect(alta!.atrasado).toBe(1);

    expect(baixa).toBeDefined();
    expect(baixa!.total).toBe(1);
    expect(baixa!.proximoVencimento).toBe(1);
  });

  it('should aggregate byTipoServico correctly', async () => {
    const chamados = [
      buildChamado({
        _id: { toString: () => 'aaa' },
        ticket_number: 'CHM-2024-00001',
        tipoServico: 'Ar-Condicionado',
      }),
      buildChamado({
        _id: { toString: () => 'bbb' },
        ticket_number: 'CHM-2024-00002',
        tipoServico: 'Ar-Condicionado',
      }),
      buildChamado({
        _id: { toString: () => 'ccc' },
        ticket_number: 'CHM-2024-00003',
        tipoServico: 'Manutenção Predial',
      }),
    ];
    mockFind(chamados);

    vi.mocked(getSlaResolutionStatus)
      .mockReturnValueOnce('atrasado')
      .mockReturnValueOnce('no_prazo')
      .mockReturnValueOnce('no_prazo');

    const response = await callGet();
    const body = (await getJson(response)) as {
      byTipoServico: Array<{
        tipoServico: string;
        total: number;
        noPrazo: number;
        atrasado: number;
      }>;
    };

    const arCond = body.byTipoServico.find((t) => t.tipoServico === 'Ar-Condicionado');
    const manut = body.byTipoServico.find((t) => t.tipoServico === 'Manutenção Predial');

    expect(arCond!.total).toBe(2);
    expect(arCond!.atrasado).toBe(1);
    expect(arCond!.noPrazo).toBe(1);
    expect(manut!.total).toBe(1);
    expect(manut!.noPrazo).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 12. isPaused é true quando slaPausedAt não é null
  // -------------------------------------------------------------------------
  it('should set isPaused true when slaPausedAt is set', async () => {
    const chamado = buildChamado({ slaPausedAt: new Date('2024-06-01T11:00:00.000Z') });
    mockFind([chamado]);
    vi.mocked(getSlaResolutionStatus).mockReturnValue('no_prazo');

    const response = await callGet();
    const body = (await getJson(response)) as { items: { isPaused: boolean }[] };

    expect(body.items[0].isPaused).toBe(true);
  });

  it('should set isPaused false when slaPausedAt is null', async () => {
    const chamado = buildChamado({ slaPausedAt: null });
    mockFind([chamado]);
    vi.mocked(getSlaResolutionStatus).mockReturnValue('no_prazo');

    const response = await callGet();
    const body = (await getJson(response)) as { items: { isPaused: boolean }[] };

    expect(body.items[0].isPaused).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 13. Retorna items vazio quando não há chamados ativos
  // -------------------------------------------------------------------------
  it('should return empty items array when no active chamados exist', async () => {
    mockFind([]);
    // getSlaResolutionStatus não será chamado

    const response = await callGet();
    const body = (await getJson(response)) as {
      items: unknown[];
      summary: Record<string, number>;
      byPriority: unknown[];
      byTipoServico: unknown[];
    };

    expect(body.items).toHaveLength(0);
    expect(body.summary).toEqual({ total: 0, noPrazo: 0, proximoVencimento: 0, atrasado: 0 });
    expect(body.byPriority).toHaveLength(0);
    expect(body.byTipoServico).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 14. Chama .select() e .populate() na query
  // -------------------------------------------------------------------------
  it('should call populate with assignedToUserId and name field', async () => {
    mockFind([]);

    await callGet();

    const { mockPopulate } = mockFind([]); // já foi chamado, inspecionar mock original
    // Verificar via ChamadoModel.find encadeado
    expect(ChamadoModel.find).toHaveBeenCalledWith({
      status: { $in: expect.arrayContaining(['validado', 'em atendimento']) },
      'sla.resolutionDueAt': { $ne: null },
      'sla.resolvedAt': null,
    });
  });

  // -------------------------------------------------------------------------
  // 15. tipoServico fallback para 'Outros' quando ausente
  // -------------------------------------------------------------------------
  it('should use "Outros" as tipoServico when field is null', async () => {
    const chamado = buildChamado({ tipoServico: null });
    mockFind([chamado]);
    vi.mocked(getSlaResolutionStatus).mockReturnValue('no_prazo');

    const response = await callGet();
    const body = (await getJson(response)) as {
      items: { tipoServico: string }[];
      byTipoServico: Array<{ tipoServico: string }>;
    };

    expect(body.items[0].tipoServico).toBe('Outros');
    expect(body.byTipoServico[0].tipoServico).toBe('Outros');
  });

  // -------------------------------------------------------------------------
  // 16. Combina totalPausedMinutes e pausa ativa simultaneamente
  // -------------------------------------------------------------------------
  it('should combine totalPausedMinutes and active pause when both are set', async () => {
    // totalPausedMinutes = 30 (30 min já contabilizados)
    // slaPausedAt = 11:30 → activePauseMs = 30 min
    // totalPauseMs = 60 min = 3_600_000
    // elapsed bruto = 4h, após desconto = 3h = 10_800_000
    // remainingMs = 28_800_000 - 10_800_000 = 18_000_000
    const slaPausedAt = new Date('2024-06-01T11:30:00.000Z');
    const chamado = buildChamado({
      slaPausedAt,
      totalPausedMinutes: 30,
    });
    mockFind([chamado]);
    vi.mocked(getSlaResolutionStatus).mockReturnValue('no_prazo');

    const response = await callGet();
    const body = (await getJson(response)) as { items: { remainingMs: number }[] };

    expect(body.items[0].remainingMs).toBe(18_000_000);
  });
});
