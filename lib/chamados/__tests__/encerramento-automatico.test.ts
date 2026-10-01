import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
const mockEmitToRoom = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/realtime-emit', () => ({
  emitToRoom: (...args: unknown[]) => mockEmitToRoom(...args),
}));
const mockGetBusinessCalendarConfig = vi.fn();
vi.mock('@/lib/expediente-config', () => ({
  getBusinessCalendarConfig: () => mockGetBusinessCalendarConfig(),
}));

const mockUpdateMany = vi.fn();
const mockFindLean = vi.fn();
const mockFindChain = {
  sort: vi.fn(() => mockFindChain),
  limit: vi.fn(() => mockFindChain),
  select: vi.fn(() => ({ lean: mockFindLean })),
};
const mockFind = vi.fn((..._args: unknown[]) => mockFindChain); // eslint-disable-line @typescript-eslint/no-unused-vars
const mockFindOneAndUpdateLean = vi.fn();
const mockFindOneAndUpdate = vi.fn((..._args: unknown[]) => ({
  // eslint-disable-line @typescript-eslint/no-unused-vars
  select: () => ({ lean: mockFindOneAndUpdateLean }),
}));
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    find: (...args: unknown[]) => mockFind(...args),
    findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
  },
}));
const mockHistoryCreate = vi.fn();
vi.mock('@/models/ChamadoHistory', () => ({
  ChamadoHistoryModel: { create: (...args: unknown[]) => mockHistoryCreate(...args) },
}));

import {
  executarEncerramentoAutomatico,
  LOTE_ENCERRAMENTO_AUTOMATICO,
} from '../encerramento-automatico';

/**
 * A lógica do cron com o banco mockado (spec 0010). A corrida de verdade e a
 * idempotência contra o Mongo estão em `encerramento-automatico.db.test.ts`.
 *
 * covers: AC-6, AC-7, AC-9b
 */

const AGORA = new Date('2026-10-05T15:00:00.000Z');
const HORA = 3_600_000;

function vencido(horasAtras: number) {
  return {
    _id: new Types.ObjectId(),
    ticket_number: `T-${horasAtras}`,
    titulo: 'Lâmpada',
    solicitanteId: new Types.ObjectId(),
    prazoAvaliacaoAte: new Date(AGORA.getTime() - horasAtras * HORA),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetBusinessCalendarConfig.mockResolvedValue({
    timezone: 'America/Belem',
    workdayStart: '08:00',
    workdayEnd: '18:00',
    weekdays: [1, 2, 3, 4, 5],
    prazoAvaliacaoHoras: 48,
  });
  mockUpdateMany.mockResolvedValue({ modifiedCount: 0 });
  mockFindLean.mockResolvedValue([]);
  mockFindOneAndUpdateLean.mockResolvedValue({ _id: 'x' });
  mockHistoryCreate.mockResolvedValue({});
});

describe('executarEncerramentoAutomatico', () => {
  it('preenche os concluídos sem prazo com agora + horas configuradas (AC-7)', async () => {
    // Arrange
    mockUpdateMany.mockResolvedValue({ modifiedCount: 3 });
    mockGetBusinessCalendarConfig.mockResolvedValue({
      timezone: 'America/Belem',
      prazoAvaliacaoHoras: 24,
    });

    // Act
    const r = await executarEncerramentoAutomatico(AGORA);

    // Assert
    expect(r.prazosPreenchidos).toBe(3);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      { status: 'concluído', prazoAvaliacaoAte: null },
      { $set: { prazoAvaliacaoAte: new Date(AGORA.getTime() + 24 * HORA) } },
    );
  });

  it('usa 48 horas quando a configuração falha', async () => {
    // Arrange
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetBusinessCalendarConfig.mockRejectedValue(new Error('fora'));

    // Act
    await executarEncerramentoAutomatico(AGORA);

    // Assert
    expect(mockUpdateMany.mock.calls[0][1]).toEqual({
      $set: { prazoAvaliacaoAte: new Date(AGORA.getTime() + 48 * HORA) },
    });
  });

  it('busca os vencidos do mais antigo ao mais novo, no máximo 200 (AC-6)', async () => {
    // Act
    await executarEncerramentoAutomatico(AGORA);

    // Assert
    expect(mockFind).toHaveBeenCalledWith({
      status: 'concluído',
      prazoAvaliacaoAte: { $lte: AGORA },
    });
    expect(mockFindChain.sort).toHaveBeenCalledWith({ prazoAvaliacaoAte: 1 });
    expect(mockFindChain.limit).toHaveBeenCalledWith(LOTE_ENCERRAMENTO_AUTOMATICO);
    expect(LOTE_ENCERRAMENTO_AUTOMATICO).toBe(200);
  });

  it('encerra com filtro atômico e closedAt = o próprio prazo', async () => {
    // Arrange
    const c = vencido(3);
    mockFindLean.mockResolvedValue([c]);

    // Act
    const r = await executarEncerramentoAutomatico(AGORA);

    // Assert
    expect(r.encerrados).toBe(1);
    const [filtro, update] = mockFindOneAndUpdate.mock.calls[0];
    expect(filtro).toEqual({
      _id: c._id,
      status: 'concluído',
      prazoAvaliacaoAte: c.prazoAvaliacaoAte,
    });
    expect(update).toEqual({
      $set: {
        status: 'encerrado',
        closedAt: c.prazoAvaliacaoAte,
        closedByUserId: null,
        closureNotes: '',
      },
    });
  });

  it('grava o histórico do sistema e avisa só a sala do solicitante (AC-9b)', async () => {
    // Arrange
    const c = vencido(1);
    mockFindLean.mockResolvedValue([c]);

    // Act
    await executarEncerramentoAutomatico(AGORA);

    // Assert
    expect(mockHistoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        chamadoId: c._id,
        userId: null,
        actorType: 'sistema',
        action: 'encerramento_automatico',
        statusAnterior: 'concluído',
        statusNovo: 'encerrado',
      }),
    );
    expect(mockEmitToRoom).toHaveBeenCalledOnce();
    expect(mockEmitToRoom).toHaveBeenCalledWith(
      `user:${String(c.solicitanteId)}`,
      'ticket:closed',
      expect.objectContaining({ closedBy: null, motivo: 'automatico', ticketId: String(c._id) }),
    );
  });

  it('quem perdeu a corrida (avaliação ou outra execução) não conta nem grava histórico', async () => {
    // Arrange
    mockFindLean.mockResolvedValue([vencido(2), vencido(1)]);
    mockFindOneAndUpdateLean.mockResolvedValueOnce(null).mockResolvedValueOnce({ _id: 'y' });

    // Act
    const r = await executarEncerramentoAutomatico(AGORA);

    // Assert
    expect(r.encerrados).toBe(1);
    expect(mockHistoryCreate).toHaveBeenCalledOnce();
    expect(mockEmitToRoom).toHaveBeenCalledOnce();
  });

  it('falha num chamado não para os outros', async () => {
    // Arrange
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFindLean.mockResolvedValue([vencido(2), vencido(1)]);
    mockFindOneAndUpdateLean
      .mockRejectedValueOnce(new Error('escrita caiu'))
      .mockResolvedValueOnce({ _id: 'y' });

    // Act
    const r = await executarEncerramentoAutomatico(AGORA);

    // Assert
    expect(r.encerrados).toBe(1);
  });

  it('envia os avisos juntos, sem esperar um por um (achado da revisão)', async () => {
    // Arrange: três vencidos e um socket que só responde quando liberado
    mockFindLean.mockResolvedValue([vencido(3), vencido(2), vencido(1)]);
    let liberar: () => void = () => {};
    const travado = new Promise<boolean>((r) => {
      liberar = () => r(true);
    });
    mockEmitToRoom.mockReturnValue(travado);

    // Act
    const execucao = executarEncerramentoAutomatico(AGORA);
    await vi.waitFor(() => expect(mockEmitToRoom).toHaveBeenCalledTimes(3));
    liberar();
    const r = await execucao;

    // Assert: os três avisos saíram antes de qualquer um responder
    expect(r.encerrados).toBe(3);
  });
});
