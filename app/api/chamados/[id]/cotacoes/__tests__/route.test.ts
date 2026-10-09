import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O valor final da cotação só sai para a gestão (spec 0018, AC-18): o
 * solicitante e o técnico continuam vendo o estimado, como antes.
 */

const mockVerifySession = vi.fn();
vi.mock('@/lib/dal', () => ({ verifySession: () => mockVerifySession() }));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));

const CHAMADO_ID = new Types.ObjectId();
const SOLICITANTE_ID = new Types.ObjectId();
const PREPOSTO_ID = new Types.ObjectId();

const TECNICO_ID = new Types.ObjectId();
const estado = vi.hoisted(() => ({ chamado: undefined as object | null | undefined }));

vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    findById: () => ({
      lean: async () =>
        estado.chamado === undefined
          ? { _id: CHAMADO_ID, solicitanteId: SOLICITANTE_ID, assignedToUserId: TECNICO_ID }
          : estado.chamado,
    }),
  },
}));
vi.mock('@/models/Cotacao', () => ({
  CotacaoModel: {
    find: () => ({
      sort: () => ({
        lean: async () => [
          {
            _id: new Types.ObjectId(),
            chamadoId: CHAMADO_ID,
            pauseLogId: new Types.ObjectId(),
            status: 'aprovada',
            valorEstimado: 300,
            descricao: 'Compressor',
            submittedByUserId: PREPOSTO_ID,
            submittedAt: new Date(),
            valorFinal: 280,
            valorFinalPorUserId: PREPOSTO_ID,
            valorFinalEm: new Date('2026-10-08T12:00:00.000Z'),
            createdAt: new Date(),
          },
        ],
      }),
    }),
  },
}));
vi.mock('@/models/user.model', () => ({
  UserModel: {
    find: () => ({ select: () => ({ lean: async () => [{ _id: PREPOSTO_ID, name: 'Ana' }] }) }),
  },
}));

import { GET } from '../route';

const pedir = () =>
  GET(new Request('http://x'), { params: Promise.resolve({ id: String(CHAMADO_ID) }) });

beforeEach(() => {
  vi.clearAllMocks();
  estado.chamado = undefined;
});

describe('GET /api/chamados/[id]/cotacoes', () => {
  it('Preposto recebe o valor final e quem informou', async () => {
    mockVerifySession.mockResolvedValue({ userId: String(PREPOSTO_ID), role: 'Preposto' });
    const json = await (await pedir()).json();
    expect(json.history[0]).toMatchObject({
      valorEstimado: 300,
      valorFinal: 280,
      valorFinalPorName: 'Ana',
      valorFinalEm: '2026-10-08T12:00:00.000Z',
    });
  });

  it('o solicitante continua vendo só o estimado', async () => {
    mockVerifySession.mockResolvedValue({ userId: String(SOLICITANTE_ID), role: 'Solicitante' });
    const json = await (await pedir()).json();
    expect(json.history[0].valorEstimado).toBe(300);
    expect(json.history[0]).not.toHaveProperty('valorFinal');
    expect(json.history[0]).not.toHaveProperty('valorFinalPorName');
  });

  it('o técnico atribuído também vê só o estimado (AC-18)', async () => {
    mockVerifySession.mockResolvedValue({ userId: String(TECNICO_ID), role: 'Técnico' });
    const res = await pedir();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.history[0].valorEstimado).toBe(300);
    expect(json.history[0]).not.toHaveProperty('valorFinal');
    expect(json.history[0]).not.toHaveProperty('valorFinalEm');
  });

  it('o Admin recebe o valor final como o Preposto', async () => {
    mockVerifySession.mockResolvedValue({ userId: String(new Types.ObjectId()), role: 'Admin' });
    const json = await (await pedir()).json();
    expect(json.history[0].valorFinal).toBe(280);
  });

  it('quem não é dono, técnico atribuído nem gestão recebe 403', async () => {
    mockVerifySession.mockResolvedValue({
      userId: String(new Types.ObjectId()),
      role: 'Técnico',
    });
    expect((await pedir()).status).toBe(403);
  });

  it('sem sessão recebe 401', async () => {
    mockVerifySession.mockResolvedValue(null);
    expect((await pedir()).status).toBe(401);
  });

  it('id inválido recebe 400 e chamado inexistente, 404', async () => {
    mockVerifySession.mockResolvedValue({ userId: String(PREPOSTO_ID), role: 'Preposto' });
    const invalido = await GET(new Request('http://x'), {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(invalido.status).toBe(400);
    estado.chamado = null;
    expect((await pedir()).status).toBe(404);
  });
});
