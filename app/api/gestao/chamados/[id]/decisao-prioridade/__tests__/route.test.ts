import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const mockRequireManager = vi.fn();
vi.mock('@/lib/dal', () => ({
  requireManager: () => mockRequireManager(),
}));

const mockLerDecisoes = vi.fn();
vi.mock('@/lib/conversas', () => ({
  lerDecisoes: (...args: unknown[]) => mockLerDecisoes(...args),
}));

import { GET } from '@/app/api/gestao/chamados/[id]/decisao-prioridade/route';

// ── Helpers ──────────────────────────────────────────────────────

const VALID_ID = '507f1f77bcf86cd799439011';

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function decisao(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dec1',
    campo: 'prioridade',
    decididoPor: 'ia',
    efeito: 'sugestao',
    valorIa: { prioridade: 'ALTA', rotulo: 'ALTA' },
    valorFinal: { prioridade: 'ALTA', rotulo: 'ALTA' },
    confianca: 0.6,
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
  mockRequireManager.mockResolvedValue({ userId: '507f1f77bcf86cd799439099', role: 'Preposto' });
});

// ── Testes ───────────────────────────────────────────────────────

describe('GET /api/gestao/chamados/[id]/decisao-prioridade', () => {
  it('responde 400 com ID inválido', async () => {
    const req = new Request('http://localhost/api/gestao/chamados/x/decisao-prioridade');
    const res = await GET(req, makeParams('nao-e-objectid'));

    expect(res.status).toBe(400);
  });

  it('devolve a sugestão de prioridade ainda não revisada (AC-8)', async () => {
    mockLerDecisoes.mockResolvedValue({ ok: true, decisoes: [decisao()] });
    const req = new Request(`http://localhost/api/gestao/chamados/${VALID_ID}/decisao-prioridade`);

    const res = await GET(req, makeParams(VALID_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ sugestao: { prioridade: 'ALTA' } });
    expect(mockLerDecisoes).toHaveBeenCalledWith(
      { userId: '507f1f77bcf86cd799439099', role: 'Preposto' },
      VALID_ID,
    );
  });

  it('não devolve sugestão quando a decisão já é aplicado (nasceu validado sozinho)', async () => {
    mockLerDecisoes.mockResolvedValue({ ok: true, decisoes: [decisao({ efeito: 'aplicado' })] });
    const req = new Request(`http://localhost/api/gestao/chamados/${VALID_ID}/decisao-prioridade`);

    const res = await GET(req, makeParams(VALID_ID));
    const body = await res.json();

    expect(body).toEqual({ sugestao: null });
  });

  it('não devolve sugestão quando a decisão já foi corrigida', async () => {
    mockLerDecisoes.mockResolvedValue({
      ok: true,
      decisoes: [decisao({ situacao: 'corrigida' })],
    });
    const req = new Request(`http://localhost/api/gestao/chamados/${VALID_ID}/decisao-prioridade`);

    const res = await GET(req, makeParams(VALID_ID));
    const body = await res.json();

    expect(body).toEqual({ sugestao: null });
  });

  it('não devolve sugestão quando não há decisão de prioridade (chamado do formulário)', async () => {
    mockLerDecisoes.mockResolvedValue({ ok: true, decisoes: [] });
    const req = new Request(`http://localhost/api/gestao/chamados/${VALID_ID}/decisao-prioridade`);

    const res = await GET(req, makeParams(VALID_ID));
    const body = await res.json();

    expect(body).toEqual({ sugestao: null });
  });

  it('não devolve sugestão quando lerDecisoes falha (ex.: sem permissão)', async () => {
    mockLerDecisoes.mockResolvedValue({ ok: false, reason: 'sem_permissao' });
    const req = new Request(`http://localhost/api/gestao/chamados/${VALID_ID}/decisao-prioridade`);

    const res = await GET(req, makeParams(VALID_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ sugestao: null });
  });
});
