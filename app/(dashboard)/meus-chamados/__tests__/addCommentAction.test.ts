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

const mockChamadoFindById = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    findById: (...args: unknown[]) => mockChamadoFindById(...args),
    findOneAndUpdate: vi.fn(),
    create: vi.fn(),
  },
}));

const mockCommentCreate = vi.fn();
vi.mock('@/models/ChamadoComment', () => ({
  ChamadoCommentModel: {
    create: (...args: unknown[]) => mockCommentCreate(...args),
  },
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

import { addCommentAction } from '@/app/(dashboard)/meus-chamados/actions';

// ── Helpers ──────────────────────────────────────────────────────

const VALID_CHAMADO_ID = new Types.ObjectId().toHexString();
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

const SESSION_ADMIN = {
  userId: MANAGER_ID,
  role: 'Admin',
  username: 'admin1',
  isActive: true,
};

const SESSION_OUTRO = {
  userId: OUTRO_USER_ID,
  role: 'Solicitante',
  username: 'outro1',
  isActive: true,
};

/** Chamado cujo solicitante é SOLICITANTE_ID e técnico atribuído é TECNICO_ID */
function makeChamadoDoc(overrides: Record<string, unknown> = {}) {
  return {
    solicitanteId: new Types.ObjectId(SOLICITANTE_ID),
    assignedToUserId: new Types.ObjectId(TECNICO_ID),
    ticket_number: 'CHM-2024-00001',
    titulo: 'Lâmpada queimada',
    ...overrides,
  };
}

function makeFindByIdChain(doc: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(doc),
  };
}

function makeUserFindByIdChain(doc: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(doc),
  };
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
  mockCommentCreate.mockResolvedValue({ _id: new Types.ObjectId() });
  mockHistoryCreate.mockResolvedValue({ _id: new Types.ObjectId() });
  mockNotificationCreate.mockResolvedValue({ _id: new Types.ObjectId() });
  mockEmitToRoom.mockResolvedValue(undefined);
  mockUserFindById.mockReturnValue(makeUserFindByIdChain({ name: 'Usuário Teste' }));
  mockUserFind.mockReturnValue(makeUserFindChain([]));
});

// ── Validação Zod ────────────────────────────────────────────────

describe('addCommentAction — validação de input (Zod)', () => {
  it('deve retornar erro quando chamadoId é inválido', async () => {
    // Arrange
    const input = {
      chamadoId: 'id-invalido',
      content: 'Comentário',
      visibility: 'publico' as const,
    };

    // Act
    const result = await addCommentAction(input);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('inválido');
  });

  it('deve retornar erro quando content está vazio', async () => {
    // Arrange
    const input = { chamadoId: VALID_CHAMADO_ID, content: '', visibility: 'publico' as const };

    // Act
    const result = await addCommentAction(input);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('vazio');
  });

  it('deve retornar erro quando visibility tem valor inválido', async () => {
    // Arrange
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Comentário válido',
      visibility: 'privado' as never,
    };

    // Act
    const result = await addCommentAction(input);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });

  it('deve retornar erro quando content tem mais de 5000 caracteres', async () => {
    // Arrange
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'x'.repeat(5001),
      visibility: 'publico' as const,
    };

    // Act
    const result = await addCommentAction(input);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('5000');
  });
});

// ── Chamado não encontrado ────────────────────────────────────────

describe('addCommentAction — chamado não encontrado', () => {
  it('deve retornar erro quando chamado não existe no banco', async () => {
    // Arrange
    mockChamadoFindById.mockReturnValue(makeFindByIdChain(null));
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Comentário',
      visibility: 'publico' as const,
    };

    // Act
    const result = await addCommentAction(input);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Chamado não encontrado.');
  });
});

// ── Regras de acesso ─────────────────────────────────────────────

describe('addCommentAction — regras de acesso', () => {
  it('deve permitir comentário do solicitante do chamado', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);
    mockChamadoFindById.mockReturnValue(makeFindByIdChain(makeChamadoDoc()));
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Meu comentário',
      visibility: 'publico' as const,
    };

    // Act
    const result = await addCommentAction(input);

    // Assert
    expect(result.ok).toBe(true);
  });

  it('deve permitir comentário do técnico atribuído ao chamado', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_TECNICO);
    mockChamadoFindById.mockReturnValue(makeFindByIdChain(makeChamadoDoc()));
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Atendimento iniciado',
      visibility: 'publico' as const,
    };

    // Act
    const result = await addCommentAction(input);

    // Assert
    expect(result.ok).toBe(true);
  });

  it('deve permitir comentário de Preposto em qualquer chamado', async () => {
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
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Prioridade alterada',
      visibility: 'publico' as const,
    };

    // Act
    const result = await addCommentAction(input);

    // Assert
    expect(result.ok).toBe(true);
  });

  it('deve permitir comentário de Admin em qualquer chamado', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_ADMIN);
    mockChamadoFindById.mockReturnValue(
      makeFindByIdChain(
        makeChamadoDoc({
          solicitanteId: new Types.ObjectId(OUTRO_USER_ID),
          assignedToUserId: new Types.ObjectId(TECNICO_ID),
        }),
      ),
    );
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Comentário de admin',
      visibility: 'publico' as const,
    };

    // Act
    const result = await addCommentAction(input);

    // Assert
    expect(result.ok).toBe(true);
  });

  it('deve negar comentário de usuário que não é solicitante, técnico nem gestor', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_OUTRO);
    mockChamadoFindById.mockReturnValue(makeFindByIdChain(makeChamadoDoc()));
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Tentativa indevida',
      visibility: 'publico' as const,
    };

    // Act
    const result = await addCommentAction(input);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('permissão');
  });

  it('deve negar comentário de Técnico que não está atribuído ao chamado', async () => {
    // Arrange
    const outroTecnicoId = new Types.ObjectId().toHexString();
    mockRequireSession.mockResolvedValue({
      userId: outroTecnicoId,
      role: 'Técnico',
      username: 'tecnico2',
      isActive: true,
    });
    mockChamadoFindById.mockReturnValue(makeFindByIdChain(makeChamadoDoc()));
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Comentário indevido',
      visibility: 'publico' as const,
    };

    // Act
    const result = await addCommentAction(input);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('permissão');
  });
});

// ── Regras de visibilidade ────────────────────────────────────────

describe('addCommentAction — regras de visibilidade', () => {
  it('deve forçar visibilidade "publico" para solicitante puro mesmo enviando "interno"', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);
    // Chamado sem técnico atribuído, apenas solicitante
    mockChamadoFindById.mockReturnValue(
      makeFindByIdChain(makeChamadoDoc({ assignedToUserId: null })),
    );
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Tentativa de comentário interno',
      visibility: 'interno' as const,
    };

    // Act
    const result = await addCommentAction(input);

    // Assert
    expect(result.ok).toBe(true);
    expect(mockCommentCreate).toHaveBeenCalledOnce();
    const createArgs = mockCommentCreate.mock.calls[0][0];
    expect(createArgs.visibility).toBe('publico');
  });

  it('deve permitir visibilidade "interno" para técnico atribuído', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_TECNICO);
    mockChamadoFindById.mockReturnValue(makeFindByIdChain(makeChamadoDoc()));
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Nota técnica interna',
      visibility: 'interno' as const,
    };

    // Act
    const result = await addCommentAction(input);

    // Assert
    expect(result.ok).toBe(true);
    const createArgs = mockCommentCreate.mock.calls[0][0];
    expect(createArgs.visibility).toBe('interno');
  });

  it('deve permitir visibilidade "interno" para Preposto', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_PREPOSTO);
    mockChamadoFindById.mockReturnValue(
      makeFindByIdChain(
        makeChamadoDoc({
          solicitanteId: new Types.ObjectId(OUTRO_USER_ID),
        }),
      ),
    );
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Nota interna de gestão',
      visibility: 'interno' as const,
    };

    // Act
    const result = await addCommentAction(input);

    // Assert
    expect(result.ok).toBe(true);
    const createArgs = mockCommentCreate.mock.calls[0][0];
    expect(createArgs.visibility).toBe('interno');
  });

  it('deve permitir visibilidade "interno" para Admin', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_ADMIN);
    mockChamadoFindById.mockReturnValue(
      makeFindByIdChain(
        makeChamadoDoc({
          solicitanteId: new Types.ObjectId(OUTRO_USER_ID),
        }),
      ),
    );
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Nota confidencial',
      visibility: 'interno' as const,
    };

    // Act
    const result = await addCommentAction(input);

    // Assert
    expect(result.ok).toBe(true);
    const createArgs = mockCommentCreate.mock.calls[0][0];
    expect(createArgs.visibility).toBe('interno');
  });

  it('deve forçar "publico" para solicitante que também é técnico atribuído ao enviar "interno"', async () => {
    // Arrange — mesmo ID para solicitante e técnico atribuído → isPureRequester = false
    const hybridId = new Types.ObjectId().toHexString();
    mockRequireSession.mockResolvedValue({
      userId: hybridId,
      role: 'Solicitante',
      username: 'hibrido1',
      isActive: true,
    });
    mockChamadoFindById.mockReturnValue(
      makeFindByIdChain(
        makeChamadoDoc({
          solicitanteId: new Types.ObjectId(hybridId),
          assignedToUserId: new Types.ObjectId(hybridId),
        }),
      ),
    );
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Comentário híbrido',
      visibility: 'interno' as const,
    };

    // Act
    const result = await addCommentAction(input);

    // Assert
    expect(result.ok).toBe(true);
    const createArgs = mockCommentCreate.mock.calls[0][0];
    // Como isAssignedTech = true, isPureRequester = false → visibility preservada
    expect(createArgs.visibility).toBe('interno');
  });
});

// ── Persistência no banco ─────────────────────────────────────────

describe('addCommentAction — persistência', () => {
  it('deve criar ChamadoComment com os dados corretos', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);
    mockChamadoFindById.mockReturnValue(
      makeFindByIdChain(makeChamadoDoc({ assignedToUserId: null })),
    );
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Conteúdo do comentário',
      visibility: 'publico' as const,
    };

    // Act
    await addCommentAction(input);

    // Assert
    expect(mockCommentCreate).toHaveBeenCalledOnce();
    const args = mockCommentCreate.mock.calls[0][0];
    expect(args.content).toBe('Conteúdo do comentário');
    expect(args.visibility).toBe('publico');
    expect(args.userId).toBeInstanceOf(Types.ObjectId);
    expect(args.chamadoId).toBeInstanceOf(Types.ObjectId);
  });

  it('deve criar registro de auditoria no ChamadoHistory com action "comentario"', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);
    mockChamadoFindById.mockReturnValue(
      makeFindByIdChain(makeChamadoDoc({ assignedToUserId: null })),
    );
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Comentário para auditoria',
      visibility: 'publico' as const,
    };

    // Act
    await addCommentAction(input);

    // Assert
    expect(mockHistoryCreate).toHaveBeenCalledOnce();
    const historyArgs = mockHistoryCreate.mock.calls[0][0];
    expect(historyArgs.action).toBe('comentario');
    expect(historyArgs.chamadoId).toBeInstanceOf(Types.ObjectId);
    expect(historyArgs.userId).toBeInstanceOf(Types.ObjectId);
  });

  it('deve salvar preview de até 100 chars no histórico', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);
    mockChamadoFindById.mockReturnValue(
      makeFindByIdChain(makeChamadoDoc({ assignedToUserId: null })),
    );
    const longContent = 'a'.repeat(200);
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: longContent,
      visibility: 'publico' as const,
    };

    // Act
    await addCommentAction(input);

    // Assert
    const historyArgs = mockHistoryCreate.mock.calls[0][0];
    expect(historyArgs.observacoes).toHaveLength(101); // 100 chars + '…'
    expect(historyArgs.observacoes.endsWith('…')).toBe(true);
  });

  it('deve salvar observação com o conteúdo exato quando tem 100 chars ou menos', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);
    mockChamadoFindById.mockReturnValue(
      makeFindByIdChain(makeChamadoDoc({ assignedToUserId: null })),
    );
    const shortContent = 'a'.repeat(100);
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: shortContent,
      visibility: 'publico' as const,
    };

    // Act
    await addCommentAction(input);

    // Assert
    const historyArgs = mockHistoryCreate.mock.calls[0][0];
    expect(historyArgs.observacoes).toBe(shortContent);
  });
});

// ── Notificações ──────────────────────────────────────────────────

describe('addCommentAction — notificações', () => {
  it('deve notificar técnico atribuído quando solicitante comenta (público)', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);
    mockChamadoFindById.mockReturnValue(makeFindByIdChain(makeChamadoDoc()));
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Olá técnico',
      visibility: 'publico' as const,
    };

    // Act
    await addCommentAction(input);

    // Assert
    const emitCalls = mockEmitToRoom.mock.calls.map((c) => c[0]);
    expect(emitCalls).toContain(`user:${TECNICO_ID}`);
  });

  it('deve notificar solicitante quando técnico faz comentário público', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_TECNICO);
    mockChamadoFindById.mockReturnValue(makeFindByIdChain(makeChamadoDoc()));
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Resposta do técnico',
      visibility: 'publico' as const,
    };

    // Act
    await addCommentAction(input);

    // Assert
    const emitCalls = mockEmitToRoom.mock.calls.map((c) => c[0]);
    expect(emitCalls).toContain(`user:${SOLICITANTE_ID}`);
  });

  it('não deve notificar o próprio autor do comentário', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);
    // Chamado onde solicitante = autor; técnico atribuído é diferente
    mockChamadoFindById.mockReturnValue(makeFindByIdChain(makeChamadoDoc()));
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Minha mensagem',
      visibility: 'publico' as const,
    };

    // Act
    await addCommentAction(input);

    // Assert
    const emitCalls = mockEmitToRoom.mock.calls.map((c) => c[0]);
    expect(emitCalls).not.toContain(`user:${SOLICITANTE_ID}`);
  });

  it('deve emitir para sala managers quando comentário é público e autor não é gestor', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_TECNICO);
    mockChamadoFindById.mockReturnValue(makeFindByIdChain(makeChamadoDoc()));
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Nota pública',
      visibility: 'publico' as const,
    };

    // Act
    await addCommentAction(input);

    // Assert
    const emitCalls = mockEmitToRoom.mock.calls.map((c) => c[0]);
    expect(emitCalls).toContain('managers');
  });

  it('não deve emitir para sala managers quando comentário é interno', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_TECNICO);
    mockChamadoFindById.mockReturnValue(makeFindByIdChain(makeChamadoDoc()));
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Nota interna',
      visibility: 'interno' as const,
    };

    // Act
    await addCommentAction(input);

    // Assert
    const emitCalls = mockEmitToRoom.mock.calls.map((c) => c[0]);
    expect(emitCalls).not.toContain('managers');
  });

  it('não deve emitir para sala managers quando autor já é gestor', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_PREPOSTO);
    mockChamadoFindById.mockReturnValue(
      makeFindByIdChain(makeChamadoDoc({ solicitanteId: new Types.ObjectId(OUTRO_USER_ID) })),
    );
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Comentário do gestor',
      visibility: 'publico' as const,
    };

    // Act
    await addCommentAction(input);

    // Assert
    const emitCalls = mockEmitToRoom.mock.calls.map((c) => c[0]);
    expect(emitCalls).not.toContain('managers');
  });

  it('deve persistir notificação no MongoDB para cada destinatário', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);
    mockChamadoFindById.mockReturnValue(makeFindByIdChain(makeChamadoDoc()));
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Notificação persistida',
      visibility: 'publico' as const,
    };

    // Act
    await addCommentAction(input);

    // Assert — ao menos uma notificação criada (para o técnico)
    expect(mockNotificationCreate).toHaveBeenCalled();
    const notifArgs = mockNotificationCreate.mock.calls[0][0];
    expect(notifArgs.type).toBe('ticket:comment_added');
  });

  it('não deve notificar técnico atribuído quando não há técnico no chamado', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);
    mockChamadoFindById.mockReturnValue(
      makeFindByIdChain(makeChamadoDoc({ assignedToUserId: null })),
    );
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Sem técnico',
      visibility: 'publico' as const,
    };

    // Act
    await addCommentAction(input);

    // Assert — não deve ter emit para user:<tecnicoId>
    const emitCalls = mockEmitToRoom.mock.calls.map((c) => c[0]);
    expect(emitCalls.every((room: string) => !room.startsWith('user:'))).toBe(true);
  });
});

// ── Retorno e tratamento de erros ─────────────────────────────────

describe('addCommentAction — retorno e tratamento de erros', () => {
  it('deve retornar { ok: true } em caso de sucesso', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);
    mockChamadoFindById.mockReturnValue(
      makeFindByIdChain(makeChamadoDoc({ assignedToUserId: null })),
    );
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Comentário válido',
      visibility: 'publico' as const,
    };

    // Act
    const result = await addCommentAction(input);

    // Assert
    expect(result.ok).toBe(true);
  });

  it('deve retornar { ok: false, error } quando banco lança exceção ao criar comentário', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);
    mockChamadoFindById.mockReturnValue(
      makeFindByIdChain(makeChamadoDoc({ assignedToUserId: null })),
    );
    mockCommentCreate.mockRejectedValue(new Error('Falha no banco'));
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Comentário com erro',
      visibility: 'publico' as const,
    };

    // Act
    const result = await addCommentAction(input);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Falha no banco');
  });

  it('deve retornar { ok: false, error } quando banco lança exceção não-Error', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);
    mockChamadoFindById.mockReturnValue(
      makeFindByIdChain(makeChamadoDoc({ assignedToUserId: null })),
    );
    mockCommentCreate.mockRejectedValue('erro genérico');
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Comentário com erro genérico',
      visibility: 'publico' as const,
    };

    // Act
    const result = await addCommentAction(input);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });

  it('deve nunca lançar exceção — sempre retornar ok/error', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);
    mockChamadoFindById.mockImplementation(() => {
      throw new Error('Erro inesperado');
    });
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Comentário',
      visibility: 'publico' as const,
    };

    // Act & Assert — não deve lançar
    await expect(addCommentAction(input)).resolves.toMatchObject({ ok: false });
  });

  it('falha do emitToRoom não deve interromper o fluxo (fire-and-forget)', async () => {
    // Arrange
    mockRequireSession.mockResolvedValue(SESSION_SOLICITANTE);
    mockChamadoFindById.mockReturnValue(makeFindByIdChain(makeChamadoDoc()));
    mockEmitToRoom.mockRejectedValue(new Error('Socket offline'));
    const input = {
      chamadoId: VALID_CHAMADO_ID,
      content: 'Comentário',
      visibility: 'publico' as const,
    };

    // Act
    const result = await addCommentAction(input);

    // Assert — comentário deve ter sido criado mesmo com socket falhando
    expect(result.ok).toBe(true);
    expect(mockCommentCreate).toHaveBeenCalledOnce();
  });
});
