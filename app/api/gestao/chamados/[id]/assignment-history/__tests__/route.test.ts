import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const mockRequireManager = vi.fn();
vi.mock('@/lib/dal', () => ({
  requireManager: () => mockRequireManager(),
}));

const mockDbConnect = vi.fn();
vi.mock('@/lib/db', () => ({
  dbConnect: () => mockDbConnect(),
}));

const mockLean = vi.fn();
const mockPopulate = vi.fn(() => ({ lean: mockLean }));
const mockSort = vi.fn(() => ({ populate: mockPopulate }));
// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
const mockFind = vi.fn((..._args: any[]) => ({ sort: mockSort }));
vi.mock('@/models/ChamadoHistory', () => ({
  ChamadoHistoryModel: {
    find: (...args: unknown[]) => mockFind(...args),
  },
}));

import { GET } from '@/app/api/gestao/chamados/[id]/assignment-history/route';

// ── Helpers ──────────────────────────────────────────────────────

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

async function parseJson(response: Response) {
  return response.json();
}

// ── Setup ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireManager.mockResolvedValue(undefined);
  mockDbConnect.mockResolvedValue(undefined);
  mockLean.mockResolvedValue([]);
});

// ── Testes ───────────────────────────────────────────────────────

describe('GET /api/gestao/chamados/[id]/assignment-history', () => {
  describe('quando o ID é inválido', () => {
    it('deve responder 400 quando id não é um ObjectId', async () => {
      // Arrange
      const req = new Request('http://localhost/api/gestao/chamados/nao-e-id/assignment-history');
      const ctx = makeParams('nao-e-um-objectid');

      // Act
      const res = await GET(req, ctx);

      // Assert
      expect(res.status).toBe(400);
      const body = await parseJson(res);
      expect(body.error).toBe('ID de chamado inválido');
    });

    it('deve responder 400 quando id é string vazia', async () => {
      // Arrange
      const req = new Request('http://localhost/api/gestao/chamados//assignment-history');
      const ctx = makeParams('');

      // Act
      const res = await GET(req, ctx);

      // Assert
      expect(res.status).toBe(400);
    });
  });

  describe('quando o ID é válido e não há resultados', () => {
    it('deve responder { items: [] } quando não há histórico', async () => {
      // Arrange
      mockLean.mockResolvedValue([]);
      const req = new Request(
        'http://localhost/api/gestao/chamados/507f1f77bcf86cd799439011/assignment-history',
      );
      const ctx = makeParams('507f1f77bcf86cd799439011');

      // Act
      const res = await GET(req, ctx);

      // Assert
      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body).toEqual({ items: [] });
    });
  });

  describe('quando o ID é válido e há resultados', () => {
    it('deve mapear corretamente os campos do histórico populado', async () => {
      // Arrange
      const createdAt = new Date('2024-06-01T10:00:00.000Z');
      mockLean.mockResolvedValue([
        {
          _id: { toString: () => 'hist001aabbccdd001122334455' },
          action: 'atribuicao_tecnico',
          observacoes: 'Atribuição inicial ao técnico João.',
          createdAt,
          userId: { name: 'João Silva', username: 'joao.silva' },
        },
        {
          _id: { toString: () => 'hist002aabbccdd001122334455' },
          action: 'reatribuicao_tecnico',
          observacoes: 'Técnico João de férias, transferindo para Maria.',
          createdAt,
          userId: { name: 'Maria Souza', username: 'maria.souza' },
        },
      ]);
      const req = new Request(
        'http://localhost/api/gestao/chamados/507f1f77bcf86cd799439011/assignment-history',
      );
      const ctx = makeParams('507f1f77bcf86cd799439011');

      // Act
      const res = await GET(req, ctx);

      // Assert
      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.items).toHaveLength(2);

      const [first, second] = body.items;
      expect(first._id).toBe('hist001aabbccdd001122334455');
      expect(first.action).toBe('atribuicao_tecnico');
      expect(first.observacoes).toBe('Atribuição inicial ao técnico João.');
      expect(first.createdAt).toBe(createdAt.toISOString());
      expect(first.user).toEqual({ name: 'João Silva', username: 'joao.silva' });

      expect(second._id).toBe('hist002aabbccdd001122334455');
      expect(second.action).toBe('reatribuicao_tecnico');
      expect(second.user).toEqual({ name: 'Maria Souza', username: 'maria.souza' });
    });

    it('deve usar string vazia em observacoes quando o campo é undefined', async () => {
      // Arrange
      const createdAt = new Date('2024-06-01T10:00:00.000Z');
      mockLean.mockResolvedValue([
        {
          _id: { toString: () => 'hist003aabbccdd001122334455' },
          action: 'atribuicao_tecnico',
          observacoes: undefined,
          createdAt,
          userId: { name: 'Carlos', username: 'carlos' },
        },
      ]);
      const req = new Request(
        'http://localhost/api/gestao/chamados/507f1f77bcf86cd799439011/assignment-history',
      );
      const ctx = makeParams('507f1f77bcf86cd799439011');

      // Act
      const res = await GET(req, ctx);

      // Assert
      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.items[0].observacoes).toBe('');
    });
  });

  describe('quando userId é null (usuário deletado)', () => {
    it('deve retornar user: null no item mapeado', async () => {
      // Arrange
      const createdAt = new Date('2024-06-01T10:00:00.000Z');
      mockLean.mockResolvedValue([
        {
          _id: { toString: () => 'hist004aabbccdd001122334455' },
          action: 'reatribuicao_tecnico',
          observacoes: 'Reatribuição por usuário removido do sistema.',
          createdAt,
          userId: null,
        },
      ]);
      const req = new Request(
        'http://localhost/api/gestao/chamados/507f1f77bcf86cd799439011/assignment-history',
      );
      const ctx = makeParams('507f1f77bcf86cd799439011');

      // Act
      const res = await GET(req, ctx);

      // Assert
      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.items[0].user).toBeNull();
    });
  });

  describe('quando requireManager lança erro', () => {
    it('deve responder 500 ao lançar exceção de autorização', async () => {
      // Arrange
      mockRequireManager.mockRejectedValue(new Error('Acesso negado'));
      const req = new Request(
        'http://localhost/api/gestao/chamados/507f1f77bcf86cd799439011/assignment-history',
      );
      const ctx = makeParams('507f1f77bcf86cd799439011');

      // Act
      const res = await GET(req, ctx);

      // Assert
      expect(res.status).toBe(500);
      const body = await parseJson(res);
      expect(body.error).toBe('Erro ao buscar histórico de atribuições');
    });

    it('deve responder 500 ao lançar exceção de banco de dados', async () => {
      // Arrange
      mockDbConnect.mockRejectedValue(new Error('Falha na conexão com o banco'));
      const req = new Request(
        'http://localhost/api/gestao/chamados/507f1f77bcf86cd799439011/assignment-history',
      );
      const ctx = makeParams('507f1f77bcf86cd799439011');

      // Act
      const res = await GET(req, ctx);

      // Assert
      expect(res.status).toBe(500);
      const body = await parseJson(res);
      expect(body.error).toBe('Erro ao buscar histórico de atribuições');
    });
  });

  describe('encadeamento correto da query MongoDB', () => {
    it('deve chamar find com filtro de ações correto e encadear sort/populate/lean', async () => {
      // Arrange
      mockLean.mockResolvedValue([]);
      const chamadoId = '507f1f77bcf86cd799439011';
      const req = new Request(
        `http://localhost/api/gestao/chamados/${chamadoId}/assignment-history`,
      );
      const ctx = makeParams(chamadoId);

      // Act
      await GET(req, ctx);

      // Assert
      expect(mockFind).toHaveBeenCalledOnce();
      const findArgs = mockFind.mock.calls[0][0];
      expect(findArgs.action.$in).toContain('atribuicao_tecnico');
      expect(findArgs.action.$in).toContain('reatribuicao_tecnico');

      expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(mockPopulate).toHaveBeenCalledWith('userId', 'name username');
      expect(mockLean).toHaveBeenCalledOnce();
    });
  });
});
