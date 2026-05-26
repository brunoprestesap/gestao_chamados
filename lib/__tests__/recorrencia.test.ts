import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const mockLean = vi.fn();
const mockSelect = vi.fn(() => ({ lean: mockLean }));
const mockLimit = vi.fn(() => ({ select: mockSelect }));
const mockSort = vi.fn(() => ({ limit: mockLimit }));
// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
const mockFind = vi.fn((..._args: any[]) => ({ sort: mockSort }));
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    find: (...args: unknown[]) => mockFind(...args),
  },
}));

import { findChamadosRecorrentes } from '@/lib/recorrencia';

// ── Helpers ──────────────────────────────────────────────────────

const ALVO = {
  _id: 'alvo000000000000000000aa',
  unitId: 'unit000000000000000000bb',
  tipoServico: 'Ar-Condicionado',
  subtypeId: 'sub00000000000000000000cc',
};

const AGORA = new Date('2026-05-26T12:00:00.000Z');

// ── Setup ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockLean.mockResolvedValue([]);
});

// ── Testes ───────────────────────────────────────────────────────

describe('findChamadosRecorrentes', () => {
  describe('campos obrigatórios ausentes', () => {
    it('retorna [] sem consultar o banco quando falta subtypeId', async () => {
      // Arrange
      const alvo = { ...ALVO, subtypeId: '' };

      // Act
      const result = await findChamadosRecorrentes(alvo);

      // Assert
      expect(result).toEqual([]);
      expect(mockFind).not.toHaveBeenCalled();
    });

    it('retorna [] sem consultar o banco quando falta unitId', async () => {
      // Arrange
      const alvo = { ...ALVO, unitId: '' };

      // Act
      const result = await findChamadosRecorrentes(alvo);

      // Assert
      expect(result).toEqual([]);
      expect(mockFind).not.toHaveBeenCalled();
    });
  });

  describe('construção da query', () => {
    it('filtra por mesmo defeito, status fechados e janela de 30 dias', async () => {
      // Arrange
      mockLean.mockResolvedValue([]);

      // Act
      await findChamadosRecorrentes(ALVO, { agora: AGORA });

      // Assert
      expect(mockFind).toHaveBeenCalledOnce();
      const filter = mockFind.mock.calls[0][0];
      expect(filter._id).toEqual({ $ne: ALVO._id });
      expect(filter.unitId).toBe(ALVO.unitId);
      expect(filter.tipoServico).toBe(ALVO.tipoServico);
      expect(filter.subtypeId).toBe(ALVO.subtypeId);
      expect(filter.status.$in).toEqual(['concluído', 'encerrado']);

      const desdeEsperado = new Date('2026-04-26T12:00:00.000Z');
      expect((filter.concludedAt.$gte as Date).toISOString()).toBe(desdeEsperado.toISOString());
    });

    it('respeita janela e limite customizados e encadeia sort/limit/select/lean', async () => {
      // Arrange
      mockLean.mockResolvedValue([]);

      // Act
      await findChamadosRecorrentes(ALVO, { dias: 15, limite: 3, agora: AGORA });

      // Assert
      const filter = mockFind.mock.calls[0][0];
      const desdeEsperado = new Date('2026-05-11T12:00:00.000Z');
      expect((filter.concludedAt.$gte as Date).toISOString()).toBe(desdeEsperado.toISOString());
      expect(mockSort).toHaveBeenCalledWith({ concludedAt: -1 });
      expect(mockLimit).toHaveBeenCalledWith(3);
      expect(mockSelect).toHaveBeenCalledWith('ticket_number titulo status concludedAt');
      expect(mockLean).toHaveBeenCalledOnce();
    });
  });

  describe('mapeamento dos resultados', () => {
    it('normaliza os campos e calcula diasDesdeConclusao', async () => {
      // Arrange
      mockLean.mockResolvedValue([
        {
          _id: { toString: () => 'rec0000000000000000000011' },
          ticket_number: 'SKU-000123',
          titulo: 'Ar-condicionado da sala 502 não gela',
          status: 'encerrado',
          concludedAt: new Date('2026-05-16T12:00:00.000Z'), // 10 dias antes de AGORA
        },
      ]);

      // Act
      const result = await findChamadosRecorrentes(ALVO, { agora: AGORA });

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        _id: 'rec0000000000000000000011',
        ticket_number: 'SKU-000123',
        titulo: 'Ar-condicionado da sala 502 não gela',
        status: 'encerrado',
        concludedAt: '2026-05-16T12:00:00.000Z',
        diasDesdeConclusao: 10,
      });
    });

    it('usa valores padrão e diasDesdeConclusao null quando concludedAt ausente', async () => {
      // Arrange
      mockLean.mockResolvedValue([
        {
          _id: { toString: () => 'rec0000000000000000000022' },
          concludedAt: null,
        },
      ]);

      // Act
      const result = await findChamadosRecorrentes(ALVO, { agora: AGORA });

      // Assert
      expect(result[0]).toEqual({
        _id: 'rec0000000000000000000022',
        ticket_number: '',
        titulo: '',
        status: '',
        concludedAt: null,
        diasDesdeConclusao: null,
      });
    });
  });
});
