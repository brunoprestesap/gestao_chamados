import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const mockVerifySession = vi.fn();
vi.mock('@/lib/dal', () => ({
  verifySession: () => mockVerifySession(),
}));

vi.mock('@/lib/db', () => ({
  dbConnect: vi.fn().mockResolvedValue(undefined),
}));

const mockLerDecisoes = vi.fn();
vi.mock('@/lib/conversas', async () => {
  const actual = await vi.importActual<typeof import('@/lib/conversas')>('@/lib/conversas');
  return {
    ...actual,
    lerDecisoes: (...args: unknown[]) => mockLerDecisoes(...args),
  };
});

const mockChamadoLean = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    findById: () => ({ select: () => ({ lean: mockChamadoLean }) }),
  },
}));

const mockServicoLean = vi.fn().mockResolvedValue(null);
vi.mock('@/models/ServiceCatalog', () => ({
  ServiceCatalogModel: {
    findById: () => ({ select: () => ({ lean: mockServicoLean }) }),
  },
}));

const mockTecnicoLean = vi.fn().mockResolvedValue(null);
const mockUsuariosFind = vi.fn().mockReturnValue({ select: () => ({ lean: () => [] }) });
vi.mock('@/models/user.model', () => ({
  UserModel: {
    findById: () => ({ select: () => ({ lean: mockTecnicoLean }) }),
    find: (...args: unknown[]) => mockUsuariosFind(...args),
  },
}));

import { GET } from '@/app/api/gestao/chamados/[id]/decisoes-ia/route';

// ── Helpers ──────────────────────────────────────────────────────

const VALID_ID = '507f1f77bcf86cd799439011';

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function chamado(overrides: Record<string, unknown> = {}) {
  return {
    catalogServiceId: null,
    subtypeId: null,
    finalPriority: null,
    assignedToUserId: null,
    ...overrides,
  };
}

function decisao(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dec1',
    campo: 'prioridade',
    decididoPor: 'ia',
    efeito: 'sugestao',
    valorIa: {
      catalogServiceId: null,
      subtypeId: null,
      tipoServico: null,
      prioridade: 'ALTA',
      tecnicoId: null,
      rotulo: 'Alta',
    },
    valorFinal: {
      catalogServiceId: null,
      subtypeId: null,
      tipoServico: null,
      prioridade: 'ALTA',
      tecnicoId: null,
      rotulo: 'Alta',
    },
    confianca: 0.82,
    motivo: 'Risco de piorar logo.',
    situacao: 'sem_revisao',
    correcoes: [],
    revisadaEm: null,
    revisadaPorUserId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifySession.mockResolvedValue({ userId: '507f1f77bcf86cd799439099', role: 'Preposto' });
  mockChamadoLean.mockResolvedValue(chamado());
  mockServicoLean.mockResolvedValue(null);
  mockTecnicoLean.mockResolvedValue(null);
  mockUsuariosFind.mockReturnValue({ select: () => ({ lean: () => [] }) });
});

// ── Testes ───────────────────────────────────────────────────────

describe('GET /api/gestao/chamados/[id]/decisoes-ia', () => {
  it('responde 401 sem sessão', async () => {
    mockVerifySession.mockResolvedValue(null);
    const req = new Request(`http://localhost/api/gestao/chamados/${VALID_ID}/decisoes-ia`);

    const res = await GET(req, makeParams(VALID_ID));

    expect(res.status).toBe(401);
  });

  it('responde 403 para quem não é Preposto nem Admin', async () => {
    mockVerifySession.mockResolvedValue({ userId: 'u1', role: 'Tecnico' });
    const req = new Request(`http://localhost/api/gestao/chamados/${VALID_ID}/decisoes-ia`);

    const res = await GET(req, makeParams(VALID_ID));

    expect(res.status).toBe(403);
  });

  it('responde 400 com ID inválido', async () => {
    const req = new Request('http://localhost/api/gestao/chamados/x/decisoes-ia');

    const res = await GET(req, makeParams('nao-e-objectid'));

    expect(res.status).toBe(400);
  });

  it('responde 404 quando o chamado não existe', async () => {
    mockChamadoLean.mockResolvedValue(null);
    const req = new Request(`http://localhost/api/gestao/chamados/${VALID_ID}/decisoes-ia`);

    const res = await GET(req, makeParams(VALID_ID));

    expect(res.status).toBe(404);
  });

  it('esconde confiança, motivo e divergente enquanto a decisão de prioridade for cega (tarefa 8)', async () => {
    // Chamado ainda `aberto`, sem prioridade classificada: finalPriority null
    // nunca bate com o valor da decisão, então divergente daria falso positivo
    // sem a trava da tarefa 8.
    mockChamadoLean.mockResolvedValue(chamado({ finalPriority: null }));
    mockLerDecisoes.mockResolvedValue({
      ok: true,
      decisoes: [decisao({ campo: 'prioridade', efeito: 'sugestao', situacao: 'sem_revisao' })],
    });
    const req = new Request(`http://localhost/api/gestao/chamados/${VALID_ID}/decisoes-ia`);

    const res = await GET(req, makeParams(VALID_ID));
    const body = await res.json();
    const linha = body.campos.find((c: { campo: string }) => c.campo === 'prioridade');

    expect(linha.decisao.valorIa.prioridade).toBe('ALTA');
    expect(linha.decisao.confianca).toBeNull();
    expect(linha.decisao.motivo).toBe('');
    expect(linha.divergente).toBe(false);
  });

  it('esconde confiança, motivo e divergente enquanto a decisão de serviço for cega', async () => {
    mockLerDecisoes.mockResolvedValue({
      ok: true,
      decisoes: [
        decisao({
          campo: 'servico',
          efeito: 'sugestao',
          situacao: 'sem_revisao',
          valorIa: {
            catalogServiceId: 'srv1',
            subtypeId: 'sub1',
            tipoServico: 'Manutenção Predial',
            prioridade: null,
            tecnicoId: null,
            rotulo: 'Ar-condicionado',
          },
          valorFinal: {
            catalogServiceId: 'srv1',
            subtypeId: 'sub1',
            tipoServico: 'Manutenção Predial',
            prioridade: null,
            tecnicoId: null,
            rotulo: 'Ar-condicionado',
          },
        }),
      ],
    });
    const req = new Request(`http://localhost/api/gestao/chamados/${VALID_ID}/decisoes-ia`);

    const res = await GET(req, makeParams(VALID_ID));
    const body = await res.json();
    const linha = body.campos.find((c: { campo: string }) => c.campo === 'servico');

    expect(linha.decisao.confianca).toBeNull();
    expect(linha.decisao.motivo).toBe('');
    expect(linha.divergente).toBe(false);
  });

  it('mostra confiança, motivo e divergente depois que a decisão de prioridade é classificada (situacao sai de sem_revisao)', async () => {
    mockChamadoLean.mockResolvedValue(chamado({ finalPriority: 'NORMAL' }));
    mockLerDecisoes.mockResolvedValue({
      ok: true,
      decisoes: [decisao({ campo: 'prioridade', efeito: 'sugestao', situacao: 'confirmada' })],
    });
    const req = new Request(`http://localhost/api/gestao/chamados/${VALID_ID}/decisoes-ia`);

    const res = await GET(req, makeParams(VALID_ID));
    const body = await res.json();
    const linha = body.campos.find((c: { campo: string }) => c.campo === 'prioridade');

    expect(linha.decisao.confianca).toBe(0.82);
    expect(linha.decisao.motivo).toBe('Risco de piorar logo.');
    expect(linha.divergente).toBe(true); // ALTA (decisão) vs NORMAL (chamado)
  });

  it('mostra confiança, motivo e divergente quando a decisão já é aplicado, mesmo ainda sem_revisao', async () => {
    mockChamadoLean.mockResolvedValue(chamado({ finalPriority: 'NORMAL' }));
    mockLerDecisoes.mockResolvedValue({
      ok: true,
      decisoes: [decisao({ campo: 'prioridade', efeito: 'aplicado', situacao: 'sem_revisao' })],
    });
    const req = new Request(`http://localhost/api/gestao/chamados/${VALID_ID}/decisoes-ia`);

    const res = await GET(req, makeParams(VALID_ID));
    const body = await res.json();
    const linha = body.campos.find((c: { campo: string }) => c.campo === 'prioridade');

    expect(linha.decisao.confianca).toBe(0.82);
    expect(linha.decisao.motivo).toBe('Risco de piorar logo.');
    expect(linha.divergente).toBe(true);
  });

  it('nunca mostra a decisão ativo, nem quando o chamado tem uma (spec 0014, AC-11)', async () => {
    // Arrange
    mockLerDecisoes.mockResolvedValue({
      ok: true,
      decisoes: [
        decisao(),
        decisao({
          id: 'dec2',
          campo: 'ativo',
          decididoPor: 'regra',
          efeito: 'aplicado',
          confianca: null,
          valorIa: {
            ...decisao().valorIa,
            prioridade: null,
            ativoId: '507f1f77bcf86cd799439012',
            rotulo: '11997',
          },
          valorFinal: {
            ...decisao().valorFinal,
            prioridade: null,
            ativoId: '507f1f77bcf86cd799439012',
            rotulo: '11997',
          },
        }),
      ],
    });
    const req = new Request(`http://localhost/api/gestao/chamados/${VALID_ID}/decisoes-ia`);

    // Act
    const res = await GET(req, makeParams(VALID_ID));
    const body = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(body.campos.map((c: { campo: string }) => c.campo)).toEqual([
      'servico',
      'prioridade',
      'tecnico',
    ]);
    expect(JSON.stringify(body)).not.toContain('11997');
  });
});
