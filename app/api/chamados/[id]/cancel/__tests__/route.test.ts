import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────��─────

const mockVerifySession = vi.fn();
vi.mock('@/lib/dal', () => ({
  verifySession: () => mockVerifySession(),
}));

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));

const mockFindById = vi.fn();
const mockFindByIdAndUpdate = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    findById: (...args: unknown[]) => mockFindById(...args),
    findByIdAndUpdate: (...args: unknown[]) => mockFindByIdAndUpdate(...args),
  },
}));

const mockHistoryCreate = vi.fn();
vi.mock('@/models/ChamadoHistory', () => ({
  ChamadoHistoryModel: { create: (...args: unknown[]) => mockHistoryCreate(...args) },
}));

import { POST } from '@/app/api/chamados/[id]/cancel/route';

// ── Helpers ──────────────────────────────────────────────────────

const USER_ID = new Types.ObjectId().toHexString();
const SESSION = { userId: USER_ID, username: 'joao', role: 'Solicitante', isActive: true };
const CHAMADO_ID = new Types.ObjectId().toHexString();

function makeRequest(body: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/chamados/' + CHAMADO_ID + '/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(id: string = CHAMADO_ID) {
  return { params: Promise.resolve({ id }) };
}

async function parseJson(response: Response) {
  return response.json();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHistoryCreate.mockResolvedValue({});
  mockFindByIdAndUpdate.mockResolvedValue({});
});

// ── Tests ────────────────────────────────────────────────────────

describe('POST /api/chamados/[id]/cancel', () => {
  it('retorna 401 se não autenticado', async () => {
    mockVerifySession.mockResolvedValue(null);
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(401);
    const body = await parseJson(res);
    expect(body.error).toBeDefined();
  });

  it('retorna 400 se ID inválido (não ObjectId)', async () => {
    mockVerifySession.mockResolvedValue(SESSION);
    const res = await POST(makeRequest(), makeParams('invalid-id'));
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error).toContain('ID inválido');
  });

  it('retorna 404 se chamado não encontrado', async () => {
    mockVerifySession.mockResolvedValue(SESSION);
    mockFindById.mockReturnValue({ lean: () => Promise.resolve(null) });

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it('retorna 403 se usuário não é o solicitante', async () => {
    mockVerifySession.mockResolvedValue(SESSION);
    mockFindById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: CHAMADO_ID,
          solicitanteId: new Types.ObjectId(), // outro usuário
          status: 'aberto',
        }),
    });

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(403);
    const body = await parseJson(res);
    expect(body.error).toContain('solicitante');
  });

  it('retorna 400 se chamado já cancelado', async () => {
    mockVerifySession.mockResolvedValue(SESSION);
    mockFindById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: CHAMADO_ID,
          solicitanteId: new Types.ObjectId(USER_ID),
          status: 'cancelado',
        }),
    });

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error).toContain('cancelado');
  });

  it('retorna 400 se chamado concluído', async () => {
    mockVerifySession.mockResolvedValue(SESSION);
    mockFindById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: CHAMADO_ID,
          solicitanteId: new Types.ObjectId(USER_ID),
          status: 'concluído',
        }),
    });

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(400);
    const body = await parseJson(res);
    expect(body.error).toContain('concluído');
  });

  it('cancela com sucesso e cria histórico', async () => {
    mockVerifySession.mockResolvedValue(SESSION);
    mockFindById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: CHAMADO_ID,
          solicitanteId: new Types.ObjectId(USER_ID),
          status: 'aberto',
        }),
    });

    const res = await POST(makeRequest({ observacoes: 'Não preciso mais' }), makeParams());
    expect(res.status).toBe(200);
    const body = await parseJson(res);
    expect(body).toEqual({ ok: true });

    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
      CHAMADO_ID,
      { status: 'cancelado' },
      { new: true },
    );

    expect(mockHistoryCreate).toHaveBeenCalledOnce();
    const historyArg = mockHistoryCreate.mock.calls[0][0];
    expect(historyArg.action).toBe('cancelamento');
    expect(historyArg.statusAnterior).toBe('aberto');
    expect(historyArg.statusNovo).toBe('cancelado');
    expect(historyArg.observacoes).toBe('Não preciso mais');
  });

  it('usa mensagem padrão quando observacoes vazia', async () => {
    mockVerifySession.mockResolvedValue(SESSION);
    mockFindById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: CHAMADO_ID,
          solicitanteId: new Types.ObjectId(USER_ID),
          status: 'em atendimento',
        }),
    });

    const res = await POST(makeRequest({}), makeParams());
    expect(res.status).toBe(200);

    const historyArg = mockHistoryCreate.mock.calls[0][0];
    expect(historyArg.observacoes).toContain('Chamado cancelado pelo solicitante');
    expect(historyArg.statusAnterior).toBe('em atendimento');
  });

  it('permite cancelar chamado em qualquer status (exceto cancelado/concluído)', async () => {
    for (const status of ['aberto', 'validado', 'em atendimento', 'emvalidacao']) {
      vi.clearAllMocks();
      mockVerifySession.mockResolvedValue(SESSION);
      mockFindById.mockReturnValue({
        lean: () =>
          Promise.resolve({
            _id: CHAMADO_ID,
            solicitanteId: new Types.ObjectId(USER_ID),
            status,
          }),
      });
      mockFindByIdAndUpdate.mockResolvedValue({});
      mockHistoryCreate.mockResolvedValue({});

      const res = await POST(makeRequest(), makeParams());
      expect(res.status).toBe(200);
    }
  });
});
