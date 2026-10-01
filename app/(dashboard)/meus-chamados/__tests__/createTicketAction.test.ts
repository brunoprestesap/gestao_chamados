import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const mockRequireSession = vi.fn();
vi.mock('@/lib/dal', () => ({
  requireSession: () => mockRequireSession(),
  canManage: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/realtime-emit', () => ({ emitToRoom: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/email/send-notification-email', () => ({ sendNotificationEmail: vi.fn() }));
vi.mock('@/lib/chamado-utils', () => ({
  generateTicketNumber: vi.fn().mockResolvedValue('CHM-2026-00099'),
}));
const mockNotificarNovoChamado = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/chamados/novo-chamado', () => ({
  notificarNovoChamado: (...args: unknown[]) => mockNotificarNovoChamado(...args),
}));

const mockFindOneLean = vi.fn();
const mockFindOne = vi.fn((..._args: unknown[]) => ({ select: () => ({ lean: mockFindOneLean }) })); // eslint-disable-line @typescript-eslint/no-unused-vars
const mockCreate = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));
const mockHistoryCreate = vi.fn();
vi.mock('@/models/ChamadoHistory', () => ({
  ChamadoHistoryModel: { create: (...args: unknown[]) => mockHistoryCreate(...args) },
}));

import { createTicketAction } from '@/app/(dashboard)/meus-chamados/actions';

/**
 * "O problema voltou" abre um chamado novo ligado ao anterior (spec 0010).
 * O anterior precisa ser do mesmo solicitante e estar encerrado; nada além do
 * vínculo é herdado.
 *
 * covers: AC-11, AC-12
 */

const SOLICITANTE_ID = new Types.ObjectId().toHexString();
const ANTERIOR_ID = new Types.ObjectId();
const NOVO_ID = new Types.ObjectId();

const FORMULARIO = {
  unitId: new Types.ObjectId().toHexString(),
  localExato: 'Sala 205',
  tipoServico: 'Manutenção Predial' as const,
  descricao: 'Voltou a pingar.',
  naturezaAtendimento: 'Padrão' as const,
  grauUrgencia: 'Normal' as const,
  telefoneContato: undefined,
  subtypeId: new Types.ObjectId().toHexString(),
  catalogServiceId: new Types.ObjectId().toHexString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue({ userId: SOLICITANTE_ID, role: 'Solicitante' });
  mockCreate.mockResolvedValue({ _id: NOVO_ID, ticket_number: 'CHM-2026-00099' });
  mockHistoryCreate.mockResolvedValue({});
  mockFindOneLean.mockResolvedValue({ _id: ANTERIOR_ID, ticket_number: 'CHM-2026-00010' });
});

describe('createTicketAction · reincidência', () => {
  it('confere que o anterior é do mesmo solicitante e está encerrado', async () => {
    // Act
    await createTicketAction({ ...FORMULARIO, chamadoAnteriorId: String(ANTERIOR_ID) });

    // Assert
    const filtro = mockFindOne.mock.calls[0][0] as Record<string, unknown>;
    expect(String(filtro._id)).toBe(String(ANTERIOR_ID));
    expect(String(filtro.solicitanteId)).toBe(SOLICITANTE_ID);
    expect(filtro.status).toBe('encerrado');
  });

  it('grava o vínculo e nasce aberto, sem prioridade nem SLA herdados', async () => {
    // Act
    const r = await createTicketAction({ ...FORMULARIO, chamadoAnteriorId: String(ANTERIOR_ID) });

    // Assert
    expect(r).toEqual({ ok: true, ticketId: String(NOVO_ID) });
    const [dados] = mockCreate.mock.calls[0];
    expect(String(dados.chamadoAnteriorId)).toBe(String(ANTERIOR_ID));
    expect(dados.status).toBe('aberto');
    expect(dados).not.toHaveProperty('finalPriority');
    expect(dados).not.toHaveProperty('sla');
  });

  it('o histórico de abertura diz "Reincidência do chamado #N"', async () => {
    // Act
    await createTicketAction({ ...FORMULARIO, chamadoAnteriorId: String(ANTERIOR_ID) });

    // Assert
    expect(mockHistoryCreate.mock.calls[0][0].observacoes).toContain(
      'Reincidência do chamado #CHM-2026-00010',
    );
  });

  it('anterior inválido (de outro dono ou não encerrado) recusa sem criar nada', async () => {
    // Arrange
    mockFindOneLean.mockResolvedValue(null);

    // Act
    const r = await createTicketAction({ ...FORMULARIO, chamadoAnteriorId: String(ANTERIOR_ID) });

    // Assert
    expect(r).toEqual({ ok: false, error: 'Chamado anterior inválido.' });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockHistoryCreate).not.toHaveBeenCalled();
    expect(mockNotificarNovoChamado).not.toHaveBeenCalled();
  });

  it('id do anterior mal formado é barrado na validação', async () => {
    // Act
    const r = await createTicketAction({ ...FORMULARIO, chamadoAnteriorId: 'não-é-id' });

    // Assert
    expect(r).toEqual({ ok: false, error: 'Chamado anterior inválido.' });
    expect(mockFindOne).not.toHaveBeenCalled();
  });

  it('sem anterior, cria como sempre, sem consultar nem gravar vínculo', async () => {
    // Act
    const r = await createTicketAction(FORMULARIO);

    // Assert
    expect(r.ok).toBe(true);
    expect(mockFindOne).not.toHaveBeenCalled();
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('chamadoAnteriorId');
    expect(mockHistoryCreate.mock.calls[0][0].observacoes).not.toContain('Reincidência');
  });
});
