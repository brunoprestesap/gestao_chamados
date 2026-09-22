import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const mockVerifySession = vi.fn();
vi.mock('@/lib/dal', () => ({
  verifySession: () => mockVerifySession(),
}));

const mockDbConnect = vi.fn();
vi.mock('@/lib/db', () => ({
  dbConnect: () => mockDbConnect(),
}));

const mockChamadoFindById = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    findById: (...args: unknown[]) => mockChamadoFindById(...args),
  },
}));

const mockHistoryLean = vi.fn();
const mockHistorySort = vi.fn();
const mockHistoryFind = vi.fn();
vi.mock('@/models/ChamadoHistory', () => ({
  ChamadoHistoryModel: {
    find: (...args: unknown[]) => mockHistoryFind(...args),
  },
}));

const mockDecisoesOcultas = vi.fn();
vi.mock('@/lib/conversas', () => ({
  decisoesOcultas: (...args: unknown[]) => mockDecisoesOcultas(...args),
}));

import { GET } from '@/app/api/chamados/[id]/history/route';

/**
 * Leitura do histórico de um chamado.
 *
 * A spec 0002 acrescentou entradas sem usuário, praticadas pela IA e pelo
 * sistema. O que se tranca aqui é a normalização que segura isso: usuário
 * ausente vira `null` em vez de `"undefined"`, e entrada antiga sem
 * `actorType` continua sendo lida como ação de gente (AC-11).
 */

const CHAMADO_ID = new Types.ObjectId().toHexString();
const SOLICITANTE_ID = new Types.ObjectId().toHexString();
const TECNICO_ID = new Types.ObjectId().toHexString();
const ESTRANHO_ID = new Types.ObjectId().toHexString();

const sessao = (userId: string, role: string) => ({
  userId,
  role,
  username: 'usuario',
  isActive: true,
});

function chamadoNoBanco(chamado: Record<string, unknown> | null) {
  mockChamadoFindById.mockReturnValue({ lean: () => Promise.resolve(chamado) });
}

const chamadoPadrao = {
  _id: CHAMADO_ID,
  solicitanteId: SOLICITANTE_ID,
  assignedToUserId: TECNICO_ID,
};

function pedido(id: string = CHAMADO_ID) {
  return [
    new Request(`http://localhost/api/chamados/${id}/history`),
    { params: Promise.resolve({ id }) },
  ] as const;
}

/** Uma entrada de histórico como o `.lean()` a devolve. */
function linha(extra: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    chamadoId: new Types.ObjectId(CHAMADO_ID),
    userId: new Types.ObjectId(),
    action: 'comentario',
    createdAt: new Date('2026-09-10T12:00:00Z'),
    updatedAt: new Date('2026-09-10T12:00:00Z'),
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifySession.mockResolvedValue(sessao(SOLICITANTE_ID, 'Solicitante'));
  mockDbConnect.mockResolvedValue(undefined);
  mockDecisoesOcultas.mockResolvedValue(new Set());
  chamadoNoBanco(chamadoPadrao);
  mockHistoryFind.mockReturnValue({ sort: mockHistorySort });
  mockHistorySort.mockReturnValue({ lean: mockHistoryLean });
  mockHistoryLean.mockResolvedValue([]);
});

// ── autenticação e autorização ───────────────────────────────────

describe('GET /api/chamados/[id]/history · acesso', () => {
  it('responde 401 sem sessão', async () => {
    // Arrange
    mockVerifySession.mockResolvedValue(null);

    // Act
    const res = await GET(...pedido());

    // Assert
    expect(res.status).toBe(401);
  });

  it('não toca no banco sem sessão', async () => {
    // Arrange
    mockVerifySession.mockResolvedValue(null);

    // Act
    await GET(...pedido());

    // Assert
    expect(mockDbConnect).not.toHaveBeenCalled();
    expect(mockHistoryFind).not.toHaveBeenCalled();
  });

  it('responde 400 quando o id não é um ObjectId', async () => {
    // Act
    const res = await GET(...pedido('nao-e-um-id'));

    // Assert
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'ID inválido' });
  });

  it('responde 404 quando o chamado não existe', async () => {
    // Arrange
    chamadoNoBanco(null);

    // Act
    const res = await GET(...pedido());

    // Assert
    expect(res.status).toBe(404);
  });

  it('responde 403 para quem não tem nada com o chamado', async () => {
    // Arrange
    mockVerifySession.mockResolvedValue(sessao(ESTRANHO_ID, 'Solicitante'));

    // Act
    const res = await GET(...pedido());

    // Assert
    expect(res.status).toBe(403);
  });

  it('não devolve histórico para quem recebeu 403', async () => {
    // Arrange
    mockVerifySession.mockResolvedValue(sessao(ESTRANHO_ID, 'Solicitante'));

    // Act
    await GET(...pedido());

    // Assert
    expect(mockHistoryFind).not.toHaveBeenCalled();
  });

  it('responde 403 para técnico que não é o atribuído', async () => {
    // Arrange
    mockVerifySession.mockResolvedValue(sessao(ESTRANHO_ID, 'Técnico'));

    // Act
    const res = await GET(...pedido());

    // Assert
    expect(res.status).toBe(403);
  });

  it('deixa o solicitante do chamado ler', async () => {
    // Act
    const res = await GET(...pedido());

    // Assert
    expect(res.status).toBe(200);
  });

  it('deixa o técnico atribuído ler', async () => {
    // Arrange
    mockVerifySession.mockResolvedValue(sessao(TECNICO_ID, 'Técnico'));

    // Act
    const res = await GET(...pedido());

    // Assert
    expect(res.status).toBe(200);
  });

  it.each(['Admin', 'Preposto'])('deixa o perfil %s ler qualquer chamado', async (role) => {
    // Arrange
    mockVerifySession.mockResolvedValue(sessao(ESTRANHO_ID, role));

    // Act
    const res = await GET(...pedido());

    // Assert
    expect(res.status).toBe(200);
  });

  it('deixa o solicitante ler chamado ainda sem técnico', async () => {
    // Arrange
    chamadoNoBanco({ ...chamadoPadrao, assignedToUserId: null });

    // Act
    const res = await GET(...pedido());

    // Assert
    expect(res.status).toBe(200);
  });
});

// ── consulta ─────────────────────────────────────────────────────

describe('GET /api/chamados/[id]/history · consulta', () => {
  it('busca só o histórico daquele chamado', async () => {
    // Act
    await GET(...pedido());

    // Assert
    expect(mockHistoryFind).toHaveBeenCalledWith({
      chamadoId: new Types.ObjectId(CHAMADO_ID),
    });
  });

  it('pede o mais recente primeiro', async () => {
    // Act
    await GET(...pedido());

    // Assert
    expect(mockHistorySort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  it('devolve lista vazia quando não há histórico', async () => {
    // Act
    const res = await GET(...pedido());

    // Assert
    await expect(res.json()).resolves.toEqual({ items: [] });
  });
});

// ── normalização · AC-11 ─────────────────────────────────────────

describe('GET /api/chamados/[id]/history · entrada sem usuário (AC-11)', () => {
  it('devolve userId nulo na entrada da IA', async () => {
    // Arrange
    mockHistoryLean.mockResolvedValue([
      linha({ userId: null, actorType: 'ia', action: 'decisao_ia' }),
    ]);

    // Act
    const res = await GET(...pedido());
    const corpo = await res.json();

    // Assert: nulo é o sinal de "não busque usuário"; um "undefined" em texto
    // faria a tela pedir /api/users/undefined
    expect(corpo.items[0].userId).toBeNull();
  });

  it('devolve userId nulo quando o campo nem veio do banco', async () => {
    // Arrange
    const semCampo = linha({ actorType: 'sistema', action: 'decisao_ia' });
    delete (semCampo as { userId?: unknown }).userId;
    mockHistoryLean.mockResolvedValue([semCampo]);

    // Act
    const res = await GET(...pedido());
    const corpo = await res.json();

    // Assert
    expect(corpo.items[0].userId).toBeNull();
  });

  it('mantém o actorType da entrada da IA', async () => {
    // Arrange
    mockHistoryLean.mockResolvedValue([
      linha({ userId: null, actorType: 'ia', action: 'decisao_ia' }),
    ]);

    // Act
    const res = await GET(...pedido());
    const corpo = await res.json();

    // Assert
    expect(corpo.items[0].actorType).toBe('ia');
  });

  it('lê entrada antiga sem actorType como ação de gente', async () => {
    // Arrange: histórico gravado antes da spec 0002, e o .lean() não aplica
    // o padrão do Mongoose
    const antiga = linha();
    delete (antiga as { actorType?: unknown }).actorType;
    mockHistoryLean.mockResolvedValue([antiga]);

    // Act
    const res = await GET(...pedido());
    const corpo = await res.json();

    // Assert
    expect(corpo.items[0].actorType).toBe('usuario');
  });

  it('devolve o id da decisão ligada à entrada', async () => {
    // Arrange
    const decisaoIaId = new Types.ObjectId();
    mockHistoryLean.mockResolvedValue([
      linha({ userId: null, actorType: 'ia', action: 'decisao_ia', decisaoIaId }),
    ]);

    // Act
    const res = await GET(...pedido());
    const corpo = await res.json();

    // Assert
    expect(corpo.items[0].decisaoIaId).toBe(String(decisaoIaId));
  });

  it('devolve decisaoIaId nulo nas entradas que não são da IA', async () => {
    // Arrange
    mockHistoryLean.mockResolvedValue([linha()]);

    // Act
    const res = await GET(...pedido());
    const corpo = await res.json();

    // Assert
    expect(corpo.items[0].decisaoIaId).toBeNull();
  });

  it('devolve os identificadores como texto', async () => {
    // Arrange
    const userId = new Types.ObjectId();
    mockHistoryLean.mockResolvedValue([linha({ userId })]);

    // Act
    const res = await GET(...pedido());
    const corpo = await res.json();

    // Assert
    expect(corpo.items[0].userId).toBe(String(userId));
    expect(corpo.items[0].chamadoId).toBe(CHAMADO_ID);
  });

  it('devolve observações vazias quando a entrada não tem texto', async () => {
    // Arrange
    mockHistoryLean.mockResolvedValue([linha()]);

    // Act
    const res = await GET(...pedido());
    const corpo = await res.json();

    // Assert
    expect(corpo.items[0].observacoes).toBe('');
  });

  it('devolve status anterior e novo nulos quando a ação não muda status', async () => {
    // Arrange
    mockHistoryLean.mockResolvedValue([linha()]);

    // Act
    const res = await GET(...pedido());
    const corpo = await res.json();

    // Assert
    expect(corpo.items[0].statusAnterior).toBeNull();
    expect(corpo.items[0].statusNovo).toBeNull();
  });

  it('devolve as entradas da IA junto com as de gente, na ordem do banco', async () => {
    // Arrange
    mockHistoryLean.mockResolvedValue([
      linha({ userId: null, actorType: 'ia', action: 'decisao_ia' }),
      linha({ action: 'abertura' }),
    ]);

    // Act
    const res = await GET(...pedido());
    const corpo = await res.json();

    // Assert
    expect(corpo.items).toHaveLength(2);
    expect(corpo.items.map((item: { action: string }) => item.action)).toEqual([
      'decisao_ia',
      'abertura',
    ]);
  });
});

// ── prioridade sugerida escondida · spec 0004, AC-15 ─────────────

describe('GET /api/chamados/[id]/history · prioridade sugerida', () => {
  it('tira do histórico toda entrada ligada à decisão de prioridade, até para a gestão', async () => {
    // Arrange
    const prioridadeId = new Types.ObjectId();
    const servicoId = new Types.ObjectId();
    mockVerifySession.mockResolvedValue(sessao(ESTRANHO_ID, 'Preposto'));
    mockDecisoesOcultas.mockResolvedValue(new Set([String(prioridadeId)]));
    mockHistoryLean.mockResolvedValue([
      linha({
        action: 'correcao_ia',
        decisaoIaId: prioridadeId,
        observacoes: 'prioridade: NORMAL → ALTA',
      }),
      linha({ action: 'decisao_ia', decisaoIaId: prioridadeId, observacoes: 'prioridade: NORMAL' }),
      linha({
        action: 'decisao_ia',
        decisaoIaId: servicoId,
        observacoes: 'serviço: Troca de lâmpada',
      }),
      linha({ action: 'abertura' }),
    ]);

    // Act
    const res = await GET(...pedido());
    const corpo = await res.json();

    // Assert
    expect(mockDecisoesOcultas).toHaveBeenCalledWith(CHAMADO_ID);
    expect(corpo.items.map((item: { action: string }) => item.action)).toEqual([
      'decisao_ia',
      'abertura',
    ]);
    expect(JSON.stringify(corpo)).not.toContain('NORMAL');
  });
});
