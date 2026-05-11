import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (devem vir antes dos imports do módulo testado) ─────────

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const mockRequireSession = vi.fn();
vi.mock('@/lib/dal', () => ({
  requireSession: () => mockRequireSession(),
  canManage: (role?: string) => role === 'Admin' || role === 'Preposto',
}));

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));

vi.mock('@/lib/chamado-utils', () => ({ generateTicketNumber: vi.fn() }));

const mockEmitToRoom = vi.fn();
vi.mock('@/lib/realtime-emit', () => ({
  emitToRoom: (...args: unknown[]) => mockEmitToRoom(...args),
}));

const mockAttachmentFindOne = vi.fn();
vi.mock('@/models/Attachment', () => ({
  AttachmentModel: {
    findOne: (...args: unknown[]) => mockAttachmentFindOne(...args),
  },
}));

const mockChamadoFindById = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    findById: (...args: unknown[]) => mockChamadoFindById(...args),
    findOneAndUpdate: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('@/models/ChamadoComment', () => ({
  ChamadoCommentModel: { create: vi.fn() },
}));

const mockHistoryCreate = vi.fn();
vi.mock('@/models/ChamadoHistory', () => ({
  ChamadoHistoryModel: {
    create: (...args: unknown[]) => mockHistoryCreate(...args),
  },
}));

const mockNotificationCreate = vi.fn();
vi.mock('@/models/Notification', () => ({
  NotificationModel: {
    create: (...args: unknown[]) => mockNotificationCreate(...args),
  },
}));

const mockUserFindById = vi.fn();
const mockUserFind = vi.fn();
vi.mock('@/models/user.model', () => ({
  UserModel: {
    findById: (...args: unknown[]) => mockUserFindById(...args),
    find: (...args: unknown[]) => mockUserFind(...args),
    create: vi.fn(),
  },
}));

// ── Import do SUT (após os mocks) ────────────────────────────────

import { notifyAttachmentAction } from '@/app/(dashboard)/meus-chamados/actions';

// ── Helpers ──────────────────────────────────────────────────────

const VALID_CHAMADO_ID = new Types.ObjectId().toHexString();
const VALID_ATTACHMENT_ID = new Types.ObjectId().toHexString();
const SOLICITANTE_ID = new Types.ObjectId().toHexString();
const TECNICO_ID = new Types.ObjectId().toHexString();
const OUTRO_USER_ID = new Types.ObjectId().toHexString();
const MANAGER_ID = new Types.ObjectId().toHexString();

const SESSION_SOLICITANTE = {
  userId: SOLICITANTE_ID,
  role: 'Solicitante',
  username: 'solicitante1',
  isActive: true,
};

const SESSION_TECNICO = {
  userId: TECNICO_ID,
  role: 'Técnico',
  username: 'tecnico1',
  isActive: true,
};

const SESSION_PREPOSTO = {
  userId: MANAGER_ID,
  role: 'Preposto',
  username: 'preposto1',
  isActive: true,
};

const SESSION_OUTRO = {
  userId: OUTRO_USER_ID,
  role: 'Solicitante',
  username: 'outro1',
  isActive: true,
};

function makeChamadoDoc(overrides: Record<string, unknown> = {}) {
  return {
    solicitanteId: new Types.ObjectId(SOLICITANTE_ID),
    assignedToUserId: new Types.ObjectId(TECNICO_ID),
    ticket_number: 'CHM-2024-00001',
    titulo: 'Lâmpada queimada',
    ...overrides,
  };
}

function makeAttachmentDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(VALID_ATTACHMENT_ID),
    chamadoId: new Types.ObjectId(VALID_CHAMADO_ID),
    originalName: 'foto.jpg',
    mimeType: 'image/jpeg',
    filename: '1700000000-foto.jpg',
    size: 102400,
    url: `/api/uploads/${VALID_CHAMADO_ID}/foto.jpg`,
    context: 'geral',
    ...overrides,
  };
}

function makeFindByIdChain(doc: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(doc),
  };
}

function makeLeanChain(doc: unknown) {
  return { lean: vi.fn().mockResolvedValue(doc) };
}

function makeUserFindChain(docs: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(docs),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);
  mockAttachmentFindOne.mockReturnValue(makeLeanChain(makeAttachmentDoc()));
  mockChamadoFindById.mockReturnValue(makeFindByIdChain(makeChamadoDoc()));
  mockHistoryCreate.mockResolvedValue({ _id: new Types.ObjectId() });
  mockNotificationCreate.mockResolvedValue({ _id: new Types.ObjectId() });
  mockEmitToRoom.mockResolvedValue(undefined);
  mockUserFindById.mockReturnValue(makeFindByIdChain({ name: 'Usuário Teste' }));
  mockUserFind.mockReturnValue(makeUserFindChain([]));
});

// ── Validação Zod ────────────────────────────────────────────────

describe('notifyAttachmentAction — validação de input (Zod)', () => {
  it('deve retornar erro quando chamadoId é inválido', async () => {
    // Arrange
    const input = { chamadoId: 'id-invalido', attachmentId: VALID_ATTACHMENT_ID };

    // Act
    const result = await notifyAttachmentAction(input);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });

  it('deve retornar erro quando attachmentId é inválido', async () => {
    // Arrange
    const input = { chamadoId: VALID_CHAMADO_ID, attachmentId: 'nao-objectid' };

    // Act
    const result = await notifyAttachmentAction(input);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });

  it('deve retornar erro quando ambos os IDs estão ausentes', async () => {
    // Arrange
    const input = {} as never;

    // Act
    const result = await notifyAttachmentAction(input);

    // Assert
    expect(result.ok).toBe(false);
  });
});

// ── Anexo e chamado não encontrado ───────────────────────────────

describe('notifyAttachmentAction — não encontrado', () => {
  it('deve retornar erro quando anexo não existe no banco', async () => {
    // Arrange
    mockAttachmentFindOne.mockReturnValue(makeLeanChain(null));
    const input = { chamadoId: VALID_CHAMADO_ID, attachmentId: VALID_ATTACHMENT_ID };

    // Act
    const result = await notifyAttachmentAction(input);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Anexo não encontrado.');
  });

  it('deve retornar erro quando chamado não existe no banco', async () => {
    // Arrange
    mockChamadoFindById.mockReturnValue(makeFindByIdChain(null));
    const input = { chamadoId: VALID_CHAMADO_ID, attachmentId: VALID_ATTACHMENT_ID };

    // Act
    const result = await notifyAttachmentAction(input);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Chamado não encontrado.');
  });
});

// ── Regras de acesso ─────────────────────────────────────────────

describe('notifyAttachmentAction — regras de acesso', () => {
  it('deve permitir notificação pelo solicitante do chamado', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);
    const input = { chamadoId: VALID_CHAMADO_ID, attachmentId: VALID_ATTACHMENT_ID };

    // Act
    const result = await notifyAttachmentAction(input);

    // Assert
    expect(result.ok).toBe(true);
  });

  it('deve permitir notificação pelo técnico atribuído ao chamado', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_TECNICO);
    const input = { chamadoId: VALID_CHAMADO_ID, attachmentId: VALID_ATTACHMENT_ID };

    // Act
    const result = await notifyAttachmentAction(input);

    // Assert
    expect(result.ok).toBe(true);
  });

  it('deve permitir notificação por Preposto em qualquer chamado', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_PREPOSTO);
    mockChamadoFindById.mockReturnValue(
      makeFindByIdChain(
        makeChamadoDoc({
          solicitanteId: new Types.ObjectId(OUTRO_USER_ID),
          assignedToUserId: new Types.ObjectId(TECNICO_ID),
        }),
      ),
    );
    const input = { chamadoId: VALID_CHAMADO_ID, attachmentId: VALID_ATTACHMENT_ID };

    // Act
    const result = await notifyAttachmentAction(input);

    // Assert
    expect(result.ok).toBe(true);
  });

  it('deve negar acesso a usuário sem vínculo com o chamado', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_OUTRO);
    const input = { chamadoId: VALID_CHAMADO_ID, attachmentId: VALID_ATTACHMENT_ID };

    // Act
    const result = await notifyAttachmentAction(input);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('permissão');
  });
});

// ── Persistência no banco ─────────────────────────────────────────

describe('notifyAttachmentAction — persistência', () => {
  it('deve criar registro de histórico com action "anexo"', async () => {
    // Arrange
    const input = { chamadoId: VALID_CHAMADO_ID, attachmentId: VALID_ATTACHMENT_ID };

    // Act
    await notifyAttachmentAction(input);

    // Assert
    expect(mockHistoryCreate).toHaveBeenCalledOnce();
    const historyArgs = mockHistoryCreate.mock.calls[0][0];
    expect(historyArgs.action).toBe('anexo');
    expect(historyArgs.chamadoId).toBeInstanceOf(Types.ObjectId);
    expect(historyArgs.userId).toBeInstanceOf(Types.ObjectId);
  });

  it('deve incluir o nome original do arquivo na observação do histórico', async () => {
    // Arrange
    mockAttachmentFindOne.mockReturnValue(
      makeLeanChain(makeAttachmentDoc({ originalName: 'evidencia-campo.png' })),
    );
    const input = { chamadoId: VALID_CHAMADO_ID, attachmentId: VALID_ATTACHMENT_ID };

    // Act
    await notifyAttachmentAction(input);

    // Assert
    const historyArgs = mockHistoryCreate.mock.calls[0][0];
    expect(historyArgs.observacoes).toContain('evidencia-campo.png');
  });

  it('deve persistir notificação para o técnico quando autor é solicitante', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);
    const input = { chamadoId: VALID_CHAMADO_ID, attachmentId: VALID_ATTACHMENT_ID };

    // Act
    await notifyAttachmentAction(input);

    // Assert
    expect(mockNotificationCreate).toHaveBeenCalled();
    const notifArgs = mockNotificationCreate.mock.calls[0][0];
    expect(notifArgs.type).toBe('ticket:attachment_added');
  });

  it('deve incluir o número do ticket no título da notificação', async () => {
    // Arrange
    const input = { chamadoId: VALID_CHAMADO_ID, attachmentId: VALID_ATTACHMENT_ID };

    // Act
    await notifyAttachmentAction(input);

    // Assert
    const notifArgs = mockNotificationCreate.mock.calls[0][0];
    expect(notifArgs.title).toContain('CHM-2024-00001');
  });
});

// ── Notificações via Socket ───────────────────────────────────────

describe('notifyAttachmentAction — emissão de socket', () => {
  it('deve notificar técnico atribuído quando autor é solicitante', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);
    const input = { chamadoId: VALID_CHAMADO_ID, attachmentId: VALID_ATTACHMENT_ID };

    // Act
    await notifyAttachmentAction(input);

    // Assert
    const rooms = mockEmitToRoom.mock.calls.map((c) => c[0]);
    expect(rooms).toContain(`user:${TECNICO_ID}`);
  });

  it('deve notificar solicitante quando autor é técnico atribuído', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_TECNICO);
    const input = { chamadoId: VALID_CHAMADO_ID, attachmentId: VALID_ATTACHMENT_ID };

    // Act
    await notifyAttachmentAction(input);

    // Assert
    const rooms = mockEmitToRoom.mock.calls.map((c) => c[0]);
    expect(rooms).toContain(`user:${SOLICITANTE_ID}`);
  });

  it('não deve notificar o próprio autor', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);
    const input = { chamadoId: VALID_CHAMADO_ID, attachmentId: VALID_ATTACHMENT_ID };

    // Act
    await notifyAttachmentAction(input);

    // Assert
    const rooms = mockEmitToRoom.mock.calls.map((c) => c[0]);
    expect(rooms).not.toContain(`user:${SOLICITANTE_ID}`);
  });

  it('deve emitir para sala managers quando autor não é gestor', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);
    const input = { chamadoId: VALID_CHAMADO_ID, attachmentId: VALID_ATTACHMENT_ID };

    // Act
    await notifyAttachmentAction(input);

    // Assert
    const rooms = mockEmitToRoom.mock.calls.map((c) => c[0]);
    expect(rooms).toContain('managers');
  });

  it('não deve emitir para sala managers quando autor já é gestor (Preposto)', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_PREPOSTO);
    mockChamadoFindById.mockReturnValue(
      makeFindByIdChain(makeChamadoDoc({ solicitanteId: new Types.ObjectId(OUTRO_USER_ID) })),
    );
    const input = { chamadoId: VALID_CHAMADO_ID, attachmentId: VALID_ATTACHMENT_ID };

    // Act
    await notifyAttachmentAction(input);

    // Assert
    const rooms = mockEmitToRoom.mock.calls.map((c) => c[0]);
    expect(rooms).not.toContain('managers');
  });

  it('falha do emitToRoom não deve interromper o fluxo (fire-and-forget)', async () => {
    // Arrange
    mockEmitToRoom.mockRejectedValue(new Error('Socket offline'));
    const input = { chamadoId: VALID_CHAMADO_ID, attachmentId: VALID_ATTACHMENT_ID };

    // Act
    const result = await notifyAttachmentAction(input);

    // Assert — histórico deve ter sido criado mesmo com socket offline
    expect(result.ok).toBe(true);
    expect(mockHistoryCreate).toHaveBeenCalledOnce();
  });
});

// ── Retorno e tratamento de erros ─────────────────────────────────

describe('notifyAttachmentAction — retorno e erros', () => {
  it('deve retornar { ok: true } em caso de sucesso', async () => {
    // Arrange
    const input = { chamadoId: VALID_CHAMADO_ID, attachmentId: VALID_ATTACHMENT_ID };

    // Act
    const result = await notifyAttachmentAction(input);

    // Assert
    expect(result.ok).toBe(true);
  });

  it('deve retornar { ok: false, error } quando banco lança exceção ao criar histórico', async () => {
    // Arrange
    mockHistoryCreate.mockRejectedValue(new Error('Falha no banco'));
    const input = { chamadoId: VALID_CHAMADO_ID, attachmentId: VALID_ATTACHMENT_ID };

    // Act
    const result = await notifyAttachmentAction(input);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });

  it('deve nunca lançar exceção — sempre retornar ok/error', async () => {
    // Arrange
    mockChamadoFindById.mockImplementation(() => {
      throw new Error('Erro inesperado no banco');
    });
    const input = { chamadoId: VALID_CHAMADO_ID, attachmentId: VALID_ATTACHMENT_ID };

    // Act & Assert — não deve lançar
    await expect(notifyAttachmentAction(input)).resolves.toMatchObject({ ok: false });
  });
});
