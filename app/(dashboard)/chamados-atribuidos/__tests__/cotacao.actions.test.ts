import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const TECH_USER_ID = new Types.ObjectId().toHexString();
const MANAGER_USER_ID = new Types.ObjectId().toHexString();
const mockRequireSession = vi.fn();

vi.mock('@/lib/dal', () => ({
  requireSession: () => mockRequireSession(),
  isTechnician: (role?: string) => role === 'Técnico',
  canManage: (role?: string) => role === 'Admin' || role === 'Preposto',
  isAdmin: (role?: string) => role === 'Admin',
  isPreposto: (role?: string) => role === 'Preposto',
}));

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/realtime-emit', () => ({ emitToRoom: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/sla-utils', () => ({
  computeNewResolutionDueAtOnResume: vi.fn(
    (
      currentDueAt: Date,
      _slaPausedAt: Date,
      _now: Date,
      _businessHoursOnly: boolean,
      pausedMinutes: number,
    ) => new Date(currentDueAt.getTime() + pausedMinutes * 60_000),
  ),
}));
vi.mock('@/lib/expediente-config', () => ({
  getBusinessCalendarConfig: vi.fn().mockResolvedValue({
    timezone: 'America/Belem',
    workdayStart: '08:00',
    workdayEnd: '18:00',
    weekdays: [1, 2, 3, 4, 5],
  }),
}));
vi.mock('@/lib/holidays', () => ({
  getActiveHolidaysForRange: vi.fn().mockResolvedValue(new Set<string>()),
}));
vi.mock('@/lib/email/send-notification-email', () => ({
  sendNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

const mockChamadoFindById = vi.fn();
const mockChamadoUpdateOne = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    findById: (...args: unknown[]) => mockChamadoFindById(...args),
    updateOne: (...args: unknown[]) => mockChamadoUpdateOne(...args),
  },
}));

const mockHistoryCreate = vi.fn();
vi.mock('@/models/ChamadoHistory', () => ({
  ChamadoHistoryModel: { create: (...args: unknown[]) => mockHistoryCreate(...args) },
}));

const mockCotacaoCreate = vi.fn();
const mockCotacaoFindById = vi.fn();
const mockCotacaoFindOne = vi.fn();
vi.mock('@/models/Cotacao', () => ({
  CotacaoModel: {
    create: (...args: unknown[]) => mockCotacaoCreate(...args),
    findById: (...args: unknown[]) => mockCotacaoFindById(...args),
    findOne: (...args: unknown[]) => mockCotacaoFindOne(...args),
  },
}));

const mockNotificationCreate = vi.fn();
const mockNotificationInsertMany = vi.fn();
vi.mock('@/models/Notification', () => ({
  NotificationModel: {
    create: (...args: unknown[]) => mockNotificationCreate(...args),
    insertMany: (...args: unknown[]) => mockNotificationInsertMany(...args),
  },
}));

const mockPauseLogCreate = vi.fn();
const mockPauseLogFindByIdAndUpdate = vi.fn();
const mockPauseLogFindByIdAndDelete = vi.fn();
vi.mock('@/models/PauseLog', () => ({
  PauseLogModel: {
    create: (...args: unknown[]) => mockPauseLogCreate(...args),
    findByIdAndUpdate: (...args: unknown[]) => mockPauseLogFindByIdAndUpdate(...args),
    findByIdAndDelete: (...args: unknown[]) => mockPauseLogFindByIdAndDelete(...args),
  },
}));

const mockUserFindById = vi.fn();
const mockUserFind = vi.fn();
vi.mock('@/models/user.model', () => ({
  UserModel: {
    findById: (...args: unknown[]) => mockUserFindById(...args),
    find: (...args: unknown[]) => mockUserFind(...args),
  },
}));

import { pauseTicketAction } from '@/app/(dashboard)/chamados-atribuidos/actions';
import {
  approveCotacaoAction,
  rejectCotacaoAction,
  submitCotacaoAction,
} from '@/app/(dashboard)/chamados-atribuidos/cotacao.actions';

// ── Helpers ──────────────────────────────────────────────────────

const TICKET_ID = new Types.ObjectId().toHexString();
const COTACAO_ID = new Types.ObjectId().toHexString();
const PAUSE_LOG_ID = new Types.ObjectId().toHexString();
const SOLICITANTE_ID = new Types.ObjectId().toHexString();

const SESSION_TECNICO = {
  userId: TECH_USER_ID,
  role: 'Técnico' as const,
  username: 'tec1',
  isActive: true,
};
const SESSION_PREPOSTO = {
  userId: MANAGER_USER_ID,
  role: 'Preposto' as const,
  username: 'prep1',
  isActive: true,
};
const SESSION_ADMIN = {
  userId: MANAGER_USER_ID,
  role: 'Admin' as const,
  username: 'adm1',
  isActive: true,
};
const SESSION_SOLICITANTE = {
  userId: new Types.ObjectId().toHexString(),
  role: 'Solicitante' as const,
  username: 'sol1',
  isActive: true,
};

function makeChamadoDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(TICKET_ID),
    status: 'em atendimento',
    assignedToUserId: new Types.ObjectId(TECH_USER_ID),
    solicitanteId: new Types.ObjectId(SOLICITANTE_ID),
    ticket_number: 'CHM-2024-00042',
    titulo: 'Teste cotação',
    sla: {
      resolutionDueAt: new Date(Date.now() + 86_400_000),
      pausedMinutes: 0,
    },
    slaPausedAt: undefined,
    totalPausedMinutes: 0,
    ...overrides,
  };
}

function makeCotacaoDoc(overrides: Record<string, unknown> = {}) {
  const save = vi.fn().mockResolvedValue(undefined);
  return {
    _id: new Types.ObjectId(COTACAO_ID),
    chamadoId: new Types.ObjectId(TICKET_ID),
    pauseLogId: new Types.ObjectId(PAUSE_LOG_ID),
    status: 'enviada' as 'enviada' | 'aprovada' | 'recusada',
    valorEstimado: 1500,
    descricao: 'Lâmpada LED 18W, quantidade 20 unidades',
    prazoEntregaDias: 5,
    observacoes: undefined as string | undefined,
    submittedByUserId: new Types.ObjectId(TECH_USER_ID),
    submittedAt: new Date(),
    reviewedByUserId: undefined,
    reviewedAt: undefined,
    reviewObservacao: undefined,
    save,
    ...overrides,
  };
}

function setupCommonMocks() {
  mockUserFindById.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve({ name: 'Usuário Teste' }) }),
  });
  mockUserFind.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve([{ _id: new Types.ObjectId() }]) }),
  });
  mockCotacaoFindOne.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(null) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue(SESSION_TECNICO);
  mockChamadoUpdateOne.mockResolvedValue({ matchedCount: 1 });
  mockHistoryCreate.mockResolvedValue({});
  mockNotificationCreate.mockResolvedValue({});
  mockNotificationInsertMany.mockResolvedValue([]);
  mockPauseLogCreate.mockResolvedValue({ _id: new Types.ObjectId(PAUSE_LOG_ID) });
  mockPauseLogFindByIdAndUpdate.mockResolvedValue({});
  mockPauseLogFindByIdAndDelete.mockResolvedValue({});
  mockCotacaoCreate.mockResolvedValue({ _id: new Types.ObjectId(COTACAO_ID) });
  setupCommonMocks();
});

// ── pauseTicketAction (guards novos) ─────────────────────────────

describe('pauseTicketAction — guards de cotação', () => {
  const VALID_INPUT_BASE = { ticketId: TICKET_ID, details: 'Detalhe qualquer' };

  it('bloqueia pausa quando motivo é falta_peca_contratada', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_TECNICO);

    // Act
    const result = await pauseTicketAction({
      ...VALID_INPUT_BASE,
      reason: 'falta_peca_contratada',
    });

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/responsabilidade da contratada/i);
      expect(result.code).toBeUndefined();
    }
    expect(mockChamadoFindById).not.toHaveBeenCalled();
    expect(mockChamadoUpdateOne).not.toHaveBeenCalled();
    expect(mockPauseLogCreate).not.toHaveBeenCalled();
  });

  it('retorna code REQUIRES_QUOTE quando motivo é falta_peca_aprovacao_cliente', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_TECNICO);

    // Act
    const result = await pauseTicketAction({
      ...VALID_INPUT_BASE,
      reason: 'falta_peca_aprovacao_cliente',
    });

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('REQUIRES_QUOTE');
      expect(result.error).toMatch(/cotação/i);
    }
    expect(mockPauseLogCreate).not.toHaveBeenCalled();
  });

  it('permite pausa normal com motivo aguardando_fornecedor', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_TECNICO);
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

    // Act
    const result = await pauseTicketAction({
      ...VALID_INPUT_BASE,
      reason: 'aguardando_fornecedor',
    });

    // Assert
    expect(result.ok).toBe(true);
    expect(mockPauseLogCreate).toHaveBeenCalledOnce();
  });
});

// ── submitCotacaoAction ──────────────────────────────────────────

describe('submitCotacaoAction', () => {
  const VALID_INPUT = {
    ticketId: TICKET_ID,
    valorEstimado: 1500,
    descricao: 'Lâmpada LED 18W, 20 unidades',
    prazoEntregaDias: 5,
  };

  it('nega acesso a Solicitante', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);

    // Act
    const result = await submitCotacaoAction(VALID_INPUT);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/apenas o preposto/i);
  });

  it('nega acesso a Técnico (mesmo atribuído)', async () => {
    // Arrange — Técnico agora é bloqueado; mesmo atribuído ao chamado não pode submeter
    mockRequireSession.mockResolvedValue(SESSION_TECNICO);

    // Act
    const result = await submitCotacaoAction(VALID_INPUT);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/apenas o preposto/i);
    // Não chega a consultar o chamado — guard rejeita no topo
    expect(mockChamadoFindById).not.toHaveBeenCalled();
  });

  it('nega acesso a Admin (apenas Preposto submete)', async () => {
    // Arrange — Admin representa a contratante; não pode submeter cotação em nome da contratada
    mockRequireSession.mockResolvedValue(SESSION_ADMIN);

    // Act
    const result = await submitCotacaoAction(VALID_INPUT);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/apenas o preposto/i);
    expect(mockChamadoFindById).not.toHaveBeenCalled();
  });

  it('bloqueia quando chamado não está em atendimento', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_PREPOSTO);
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc({ status: 'aberto' }));

    // Act
    const result = await submitCotacaoAction(VALID_INPUT);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/em atendimento/i);
  });

  it('bloqueia quando já existe cotação enviada', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_PREPOSTO);
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc());
    mockCotacaoFindOne.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ _id: new Types.ObjectId() }) }),
    });

    // Act
    const result = await submitCotacaoAction(VALID_INPUT);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/já existe uma cotação/i);
    expect(mockPauseLogCreate).not.toHaveBeenCalled();
  });

  it('rejeita payload inválido (descricao curta)', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_PREPOSTO);

    // Act
    const result = await submitCotacaoAction({ ...VALID_INPUT, descricao: 'curto' });

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/10/);
  });

  it('rejeita valor zero ou negativo', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_PREPOSTO);

    // Act
    const result = await submitCotacaoAction({ ...VALID_INPUT, valorEstimado: 0 });

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/maior que zero/i);
  });

  it('happy path: Preposto cria PauseLog + Cotacao + History e pausa chamado', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_PREPOSTO);
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

    // Act
    const result = await submitCotacaoAction(VALID_INPUT);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.cotacaoId).toBe(COTACAO_ID);

    // Chamado é atualizado para aguardando_terceiros com slaPausedAt
    expect(mockChamadoUpdateOne).toHaveBeenCalledOnce();
    const updateCall = mockChamadoUpdateOne.mock.calls[0];
    expect(updateCall[1].$set).toMatchObject({
      status: 'aguardando_terceiros',
      pauseReason: 'falta_peca_aprovacao_cliente',
    });
    expect(updateCall[1].$set.slaPausedAt).toBeInstanceOf(Date);

    // PauseLog é criado com reason correto
    expect(mockPauseLogCreate).toHaveBeenCalledOnce();
    expect(mockPauseLogCreate.mock.calls[0][0]).toMatchObject({
      reason: 'falta_peca_aprovacao_cliente',
    });

    // Cotação é criada vinculada ao PauseLog
    expect(mockCotacaoCreate).toHaveBeenCalledOnce();
    expect(mockCotacaoCreate.mock.calls[0][0]).toMatchObject({
      status: 'enviada',
      valorEstimado: 1500,
      prazoEntregaDias: 5,
    });

    // History com action cotacao_enviada
    expect(mockHistoryCreate).toHaveBeenCalledOnce();
    expect(mockHistoryCreate.mock.calls[0][0]).toMatchObject({
      action: 'cotacao_enviada',
      statusAnterior: 'em atendimento',
      statusNovo: 'aguardando_terceiros',
    });
  });

  it('traduz erro de duplicate key (11000) em mensagem amigável', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_PREPOSTO);
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc());
    const dupErr = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    mockCotacaoCreate.mockRejectedValueOnce(dupErr);

    // Act
    const result = await submitCotacaoAction(VALID_INPUT);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/já existe uma cotação/i);
  });
});

// ── approveCotacaoAction ─────────────────────────────────────────

describe('approveCotacaoAction', () => {
  const pausedAtDate = new Date(Date.now() - 90 * 60_000); // 90 min atrás

  function setupForReview() {
    const cotacao = makeCotacaoDoc();
    mockCotacaoFindById.mockResolvedValue(cotacao);
    mockChamadoFindById.mockResolvedValue(
      makeChamadoDoc({
        status: 'aguardando_terceiros',
        slaPausedAt: pausedAtDate,
        pauseReason: 'falta_peca_aprovacao_cliente',
      }),
    );
    return cotacao;
  }

  it('nega acesso a Técnico', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_TECNICO);

    // Act
    const result = await approveCotacaoAction({ cotacaoId: COTACAO_ID });

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/apenas o gestor do contrato/i);
  });

  it('nega acesso a Solicitante', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);

    // Act
    const result = await approveCotacaoAction({ cotacaoId: COTACAO_ID });

    // Assert
    expect(result.ok).toBe(false);
  });

  it('nega acesso a Preposto (separação contratual: quem propõe não autoriza)', async () => {
    // Arrange — Preposto submete, mas não pode aprovar própria cotação
    mockRequireSession.mockResolvedValue(SESSION_PREPOSTO);

    // Act
    const result = await approveCotacaoAction({ cotacaoId: COTACAO_ID });

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/apenas o gestor do contrato/i);
    // Guard rejeita no topo — não chega a ler a cotação
    expect(mockCotacaoFindById).not.toHaveBeenCalled();
  });

  it('retorna erro quando cotação não existe', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_ADMIN);
    mockCotacaoFindById.mockResolvedValue(null);

    // Act
    const result = await approveCotacaoAction({ cotacaoId: COTACAO_ID });

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/não encontrada/i);
  });

  it('retorna erro quando cotação já foi revisada (idempotência)', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_ADMIN);
    mockCotacaoFindById.mockResolvedValue(makeCotacaoDoc({ status: 'aprovada' }));

    // Act
    const result = await approveCotacaoAction({ cotacaoId: COTACAO_ID });

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/já foi revisada/i);
  });

  it('retorna erro quando chamado não está em aguardando_terceiros', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_ADMIN);
    mockCotacaoFindById.mockResolvedValue(makeCotacaoDoc());
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc({ status: 'em atendimento' }));

    // Act
    const result = await approveCotacaoAction({ cotacaoId: COTACAO_ID });

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/não está mais aguardando/i);
  });

  it('retorna erro quando slaPausedAt está ausente', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_ADMIN);
    mockCotacaoFindById.mockResolvedValue(makeCotacaoDoc());
    mockChamadoFindById.mockResolvedValue(
      makeChamadoDoc({ status: 'aguardando_terceiros', slaPausedAt: undefined }),
    );

    // Act
    const result = await approveCotacaoAction({ cotacaoId: COTACAO_ID });

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/data de pausa/i);
  });

  it('happy path: Admin aprova — estende resolutionDueAt e fecha PauseLog', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_ADMIN);
    const cotacao = setupForReview();

    // Act
    const result = await approveCotacaoAction({ cotacaoId: COTACAO_ID, observacao: 'OK' });

    // Assert
    expect(result.ok).toBe(true);

    // Chamado retomado com resolutionDueAt estendido e pause fields desfeitos
    expect(mockChamadoUpdateOne).toHaveBeenCalledOnce();
    const updateCall = mockChamadoUpdateOne.mock.calls[0];
    expect(updateCall[1].$set.status).toBe('em atendimento');
    expect(updateCall[1].$set['sla.resolutionDueAt']).toBeInstanceOf(Date);
    expect(updateCall[1].$inc.totalPausedMinutes).toBeGreaterThanOrEqual(89);
    expect(updateCall[1].$inc.totalPausedMinutes).toBeLessThanOrEqual(91);
    expect(updateCall[1].$unset).toMatchObject({
      slaPausedAt: 1,
      pauseReason: 1,
      pauseDetails: 1,
    });

    // PauseLog fechado via findByIdAndUpdate (pelo pauseLogId da cotacao)
    expect(mockPauseLogFindByIdAndUpdate).toHaveBeenCalledOnce();
    const [pauseLogArg, pauseLogSet] = mockPauseLogFindByIdAndUpdate.mock.calls[0];
    expect(String(pauseLogArg)).toBe(PAUSE_LOG_ID);
    expect(pauseLogSet.$set.resumedAt).toBeInstanceOf(Date);

    // Cotação aprovada
    expect(cotacao.save).toHaveBeenCalledOnce();
    expect(cotacao.status).toBe('aprovada');
    expect(cotacao.reviewObservacao).toBe('OK');

    // History action cotacao_aprovada
    expect(mockHistoryCreate).toHaveBeenCalledOnce();
    expect(mockHistoryCreate.mock.calls[0][0]).toMatchObject({
      action: 'cotacao_aprovada',
      statusAnterior: 'aguardando_terceiros',
      statusNovo: 'em atendimento',
    });
  });
});

// ── rejectCotacaoAction ──────────────────────────────────────────

describe('rejectCotacaoAction', () => {
  const pausedAtDate = new Date(Date.now() - 30 * 60_000); // 30 min

  function setupForReject() {
    const cotacao = makeCotacaoDoc();
    mockCotacaoFindById.mockResolvedValue(cotacao);
    mockChamadoFindById.mockResolvedValue(
      makeChamadoDoc({
        status: 'aguardando_terceiros',
        slaPausedAt: pausedAtDate,
        pauseReason: 'falta_peca_aprovacao_cliente',
      }),
    );
    return cotacao;
  }

  it('rejeita observação curta (menos de 5 chars)', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_ADMIN);

    // Act
    const result = await rejectCotacaoAction({ cotacaoId: COTACAO_ID, observacao: 'no' });

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/motivo|5/i);
  });

  it('happy path: Admin recusa, retoma SLA, grava history cotacao_recusada', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_ADMIN);
    const cotacao = setupForReject();

    // Act
    const result = await rejectCotacaoAction({
      cotacaoId: COTACAO_ID,
      observacao: 'Valor acima do mercado',
    });

    // Assert
    expect(result.ok).toBe(true);
    expect(cotacao.status).toBe('recusada');
    expect(cotacao.reviewObservacao).toBe('Valor acima do mercado');
    expect(mockHistoryCreate.mock.calls[0][0]).toMatchObject({
      action: 'cotacao_recusada',
      statusAnterior: 'aguardando_terceiros',
      statusNovo: 'em atendimento',
    });
    // SLA é retomado igualmente (resolutionDueAt estendido)
    const updateCall = mockChamadoUpdateOne.mock.calls[0];
    expect(updateCall[1].$set.status).toBe('em atendimento');
    expect(updateCall[1].$inc.totalPausedMinutes).toBeGreaterThanOrEqual(29);
  });

  it('nega acesso a Técnico', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_TECNICO);

    // Act
    const result = await rejectCotacaoAction({
      cotacaoId: COTACAO_ID,
      observacao: 'motivo válido',
    });

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/apenas o gestor do contrato/i);
  });

  it('nega acesso a Preposto (quem submete não pode recusar)', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_PREPOSTO);

    // Act
    const result = await rejectCotacaoAction({
      cotacaoId: COTACAO_ID,
      observacao: 'motivo válido',
    });

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/apenas o gestor do contrato/i);
  });
});

// ── Casos de borda — re-atribuição e estados intermediários ──────

describe('Casos de borda', () => {
  const pausedAtDate = new Date(Date.now() - 30 * 60_000);

  it('aprovação ainda fecha o PauseLog correto após re-atribuição do técnico', async () => {
    // Arrange — cotação enviada pelo Preposto, mas chamado re-atribuído entre técnicos antes da aprovação
    mockRequireSession.mockResolvedValue(SESSION_ADMIN);
    const cotacao = makeCotacaoDoc({
      submittedByUserId: new Types.ObjectId(TECH_USER_ID), // Preposto enviou (TECH_USER_ID é só um stub)
    });
    mockCotacaoFindById.mockResolvedValue(cotacao);
    const novoTecnicoId = new Types.ObjectId();
    mockChamadoFindById.mockResolvedValue(
      makeChamadoDoc({
        status: 'aguardando_terceiros',
        slaPausedAt: pausedAtDate,
        assignedToUserId: novoTecnicoId, // re-atribuído para T2
      }),
    );

    // Act
    const result = await approveCotacaoAction({ cotacaoId: COTACAO_ID });

    // Assert — PauseLog é fechado pelo pauseLogId vinculado (não importa quem é o técnico atual)
    expect(result.ok).toBe(true);
    expect(mockPauseLogFindByIdAndUpdate).toHaveBeenCalledOnce();
    const [pauseLogArg] = mockPauseLogFindByIdAndUpdate.mock.calls[0];
    expect(String(pauseLogArg)).toBe(PAUSE_LOG_ID);
  });

  it('aprovação não falha quando chamado não tem técnico atribuído (assignedToUserId null)', async () => {
    // Arrange — caso de borda raro mas possível se admin desatribuiu antes da aprovação
    mockRequireSession.mockResolvedValue(SESSION_ADMIN);
    mockCotacaoFindById.mockResolvedValue(makeCotacaoDoc());
    mockChamadoFindById.mockResolvedValue(
      makeChamadoDoc({
        status: 'aguardando_terceiros',
        slaPausedAt: pausedAtDate,
        assignedToUserId: undefined,
      }),
    );

    // Act
    const result = await approveCotacaoAction({ cotacaoId: COTACAO_ID });

    // Assert — não crasha; só notifica solicitante e managers (sem técnico)
    expect(result.ok).toBe(true);
  });

  it('submit reverte status do chamado quando criação da Cotacao falha por erro inesperado', async () => {
    // Arrange — chamado em atendimento, sem cotação ativa; Preposto submetendo
    mockRequireSession.mockResolvedValue(SESSION_PREPOSTO);
    mockChamadoFindById.mockResolvedValue(makeChamadoDoc());

    // Simula falha não-11000 no create da Cotacao (ex.: erro de rede, WriteConcern)
    mockCotacaoCreate.mockRejectedValueOnce(new Error('connection lost'));

    // Act
    const result = await submitCotacaoAction({
      ticketId: TICKET_ID,
      valorEstimado: 1500,
      descricao: 'Material com descrição válida',
    });

    // Assert — retorna erro
    expect(result.ok).toBe(false);

    // E roda compensação: 2 updateOne (1 para pausar + 1 para reverter) + delete do PauseLog
    expect(mockChamadoUpdateOne).toHaveBeenCalledTimes(2);
    const rollbackCall = mockChamadoUpdateOne.mock.calls[1];
    expect(rollbackCall[1].$set.status).toBe('em atendimento');
    expect(rollbackCall[1].$unset).toMatchObject({
      slaPausedAt: 1,
      pauseReason: 1,
      pauseDetails: 1,
    });
  });
});
