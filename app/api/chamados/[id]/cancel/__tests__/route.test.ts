import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Spec 0017: os interessados ficam fora deste teste.
vi.mock('@/lib/chamados/interessados', () => ({
  notificarFimAosInteressados: vi.fn().mockResolvedValue(undefined),
  zerarAvisoDeFim: vi.fn().mockResolvedValue(undefined),
  interessadosDosChamados: vi.fn().mockResolvedValue(new Map()),
}));

// ── Mocks ──────────────────────────────────────────────────��─────

const mockVerifySession = vi.fn();
vi.mock('@/lib/dal', () => ({
  verifySession: () => mockVerifySession(),
}));

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));

const mockFindById = vi.fn();
const mockUpdateOne = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    findById: (...args: unknown[]) => mockFindById(...args),
    updateOne: (...args: unknown[]) => mockUpdateOne(...args),
  },
}));

const mockHistoryCreate = vi.fn();
vi.mock('@/models/ChamadoHistory', () => ({
  ChamadoHistoryModel: { create: (...args: unknown[]) => mockHistoryCreate(...args) },
}));

import { POST } from '@/app/api/chamados/[id]/cancel/route';
import { notificarFimAosInteressados } from '@/lib/chamados/interessados';

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
  mockUpdateOne.mockResolvedValue({ matchedCount: 1 });
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

    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: CHAMADO_ID, status: 'aberto' },
      { $set: { status: 'cancelado' } },
    );

    expect(mockHistoryCreate).toHaveBeenCalledOnce();
    const historyArg = mockHistoryCreate.mock.calls[0][0];
    expect(historyArg.action).toBe('cancelamento');
    expect(historyArg.statusAnterior).toBe('aberto');
    expect(historyArg.statusNovo).toBe('cancelado');
    expect(historyArg.observacoes).toBe('Não preciso mais');
  });

  it('avisa os interessados do cancelamento depois de gravar (spec 0017, AC-17)', async () => {
    mockVerifySession.mockResolvedValue(SESSION);
    mockFindById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: CHAMADO_ID,
          solicitanteId: new Types.ObjectId(USER_ID),
          status: 'aberto',
        }),
    });

    await POST(makeRequest({}), makeParams());

    expect(vi.mocked(notificarFimAosInteressados)).toHaveBeenCalledWith(CHAMADO_ID, 'cancelado');
    expect(mockUpdateOne.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(notificarFimAosInteressados).mock.invocationCallOrder[0],
    );
  });

  it('cancelamento recusado (já cancelado) não avisa ninguém (spec 0017, AC-17)', async () => {
    mockVerifySession.mockResolvedValue(SESSION);
    mockFindById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: CHAMADO_ID,
          solicitanteId: new Types.ObjectId(USER_ID),
          status: 'cancelado',
        }),
    });

    await POST(makeRequest({}), makeParams());

    expect(vi.mocked(notificarFimAosInteressados)).not.toHaveBeenCalled();
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
    for (const status of ['aberto', 'validado', 'em atendimento']) {
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
      mockUpdateOne.mockResolvedValue({ matchedCount: 1 });
      mockHistoryCreate.mockResolvedValue({});

      const res = await POST(makeRequest(), makeParams());
      expect(res.status).toBe(200);
    }
  });
});

describe('POST /api/chamados/[id]/cancel · corrida com outra mudança de status', () => {
  it('chamado que mudou depois da leitura responde 409, sem histórico nem aviso', async () => {
    mockVerifySession.mockResolvedValue(SESSION);
    mockFindById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: CHAMADO_ID,
          solicitanteId: new Types.ObjectId(USER_ID),
          status: 'aberto',
        }),
    });
    mockUpdateOne.mockResolvedValue({ matchedCount: 0 });

    const res = await POST(makeRequest({}), makeParams());

    expect(res.status).toBe(409);
    expect(mockHistoryCreate).not.toHaveBeenCalled();
    expect(vi.mocked(notificarFimAosInteressados)).not.toHaveBeenCalled();
  });
});
