import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (antes do import do módulo testado) ────────────────────

const mockEmitToRoom = vi.fn();
vi.mock('@/lib/realtime-emit', () => ({
  emitToRoom: (...args: unknown[]) => mockEmitToRoom(...args),
}));

const mockSendNotificationEmail = vi.fn();
vi.mock('@/lib/email/send-notification-email', () => ({
  sendNotificationEmail: (...args: unknown[]) => mockSendNotificationEmail(...args),
}));

const mockChamadoFindById = vi.fn();
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    findById: (...args: unknown[]) => mockChamadoFindById(...args),
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
  },
}));

// ── Import do código sob teste (depois dos mocks) ────────────────

import { criarComentario } from '@/lib/chamados/comentarios';

/**
 * Núcleo do comentário do chamado (spec 0002, AC-13).
 *
 * Foi extraído da Server Action para a mensagem da conversa e o comentário da
 * página seguirem o mesmo caminho. O que se prova aqui é o comportamento que
 * os dois passaram a compartilhar: quem pode comentar, quem enxerga o que foi
 * dito, quem é avisado, e que um aviso que falha não derruba o comentário.
 */

const CHAMADO_ID = new Types.ObjectId().toHexString();
const SOLICITANTE_ID = new Types.ObjectId().toHexString();
const TECNICO_ID = new Types.ObjectId().toHexString();
const GESTOR_ID = new Types.ObjectId().toHexString();
const ESTRANHO_ID = new Types.ObjectId().toHexString();
const COMENTARIO_ID = new Types.ObjectId().toHexString();

/** `findById(...).select(...).lean()` devolvendo o chamado informado. */
function chamadoNoBanco(chamado: Record<string, unknown> | null) {
  mockChamadoFindById.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(chamado) }),
  });
}

function gestoresNoBanco(ids: string[]) {
  mockUserFind.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(ids.map((id) => ({ _id: id }))) }),
  });
}

const chamadoPadrao = {
  _id: CHAMADO_ID,
  solicitanteId: SOLICITANTE_ID,
  assignedToUserId: TECNICO_ID,
  ticket_number: 1042,
  titulo: 'Ar-condicionado parado',
};

const params = (extra: Record<string, unknown> = {}) => ({
  chamadoId: CHAMADO_ID,
  autorUserId: SOLICITANTE_ID,
  autorRole: 'Solicitante' as const,
  content: 'continua sem gelar',
  visibility: 'publico' as const,
  ...extra,
});

/** As salas para onde o socket recebeu emissão nesta chamada. */
const salasAvisadas = () => mockEmitToRoom.mock.calls.map((chamada) => chamada[0] as string);

/** Os destinatários das notificações gravadas no Mongo. */
const destinatarios = () =>
  mockNotificationCreate.mock.calls.map((chamada) =>
    String((chamada[0] as { userId: unknown }).userId),
  );

beforeEach(() => {
  vi.clearAllMocks();
  chamadoNoBanco(chamadoPadrao);
  mockCommentCreate.mockResolvedValue({ _id: COMENTARIO_ID });
  mockHistoryCreate.mockResolvedValue({});
  mockNotificationCreate.mockResolvedValue({});
  mockUserFindById.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve({ name: 'Ana Souza' }) }),
  });
  gestoresNoBanco([]);
  mockEmitToRoom.mockResolvedValue(undefined);
  mockSendNotificationEmail.mockResolvedValue(undefined);
});

// ── chamado e permissão ──────────────────────────────────────────

describe('criarComentario · chamado e permissão', () => {
  it('recusa quando o chamado não existe', async () => {
    // Arrange
    chamadoNoBanco(null);

    // Act
    const resultado = await criarComentario(params());

    // Assert
    expect(resultado).toEqual({ ok: false, error: 'Chamado não encontrado.' });
  });

  it('não grava nada quando o chamado não existe', async () => {
    // Arrange
    chamadoNoBanco(null);

    // Act
    await criarComentario(params());

    // Assert
    expect(mockCommentCreate).not.toHaveBeenCalled();
    expect(mockHistoryCreate).not.toHaveBeenCalled();
  });

  it('recusa quem não é solicitante, técnico atribuído nem gestor', async () => {
    // Arrange
    const deFora = params({ autorUserId: ESTRANHO_ID, autorRole: 'Solicitante' });

    // Act
    const resultado = await criarComentario(deFora);

    // Assert
    expect(resultado).toEqual({
      ok: false,
      error: 'Você não tem permissão para comentar neste chamado.',
    });
  });

  it('não grava comentário de quem não tem permissão', async () => {
    // Arrange
    const deFora = params({ autorUserId: ESTRANHO_ID, autorRole: 'Solicitante' });

    // Act
    await criarComentario(deFora);

    // Assert
    expect(mockCommentCreate).not.toHaveBeenCalled();
    expect(mockEmitToRoom).not.toHaveBeenCalled();
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it('recusa técnico que não é o atribuído', async () => {
    // Arrange
    const outroTecnico = params({ autorUserId: ESTRANHO_ID, autorRole: 'Técnico' });

    // Act
    const resultado = await criarComentario(outroTecnico);

    // Assert
    expect(resultado.ok).toBe(false);
  });

  it('aceita o solicitante do chamado', async () => {
    // Act
    const resultado = await criarComentario(params());

    // Assert
    expect(resultado).toMatchObject({ ok: true, id: COMENTARIO_ID });
  });

  it('aceita o técnico atribuído', async () => {
    // Arrange
    const doTecnico = params({ autorUserId: TECNICO_ID, autorRole: 'Técnico' });

    // Act
    const resultado = await criarComentario(doTecnico);

    // Assert
    expect(resultado.ok).toBe(true);
  });

  it.each(['Admin', 'Preposto'])('aceita o gestor de perfil %s', async (autorRole) => {
    // Arrange
    const daGestao = params({ autorUserId: GESTOR_ID, autorRole });

    // Act
    const resultado = await criarComentario(daGestao);

    // Assert
    expect(resultado.ok).toBe(true);
  });
});

// ── visibilidade ─────────────────────────────────────────────────

describe('criarComentario · visibilidade', () => {
  it('força para público o comentário interno pedido pelo solicitante', async () => {
    // Arrange: solicitante puro não tem como escrever escondido do próprio chamado
    const tentandoInterno = params({ visibility: 'interno' });

    // Act
    await criarComentario(tentandoInterno);

    // Assert
    expect(mockCommentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'publico' }),
    );
  });

  it('devolve a visibilidade que valeu, não a que foi pedida', async () => {
    // Arrange
    const tentandoInterno = params({ visibility: 'interno' });

    // Act
    const resultado = await criarComentario(tentandoInterno);

    // Assert
    expect(resultado).toMatchObject({ ok: true, visibility: 'publico' });
  });

  it('mantém interno o comentário interno do gestor', async () => {
    // Arrange
    const daGestao = params({
      autorUserId: GESTOR_ID,
      autorRole: 'Preposto',
      visibility: 'interno',
    });

    // Act
    const resultado = await criarComentario(daGestao);

    // Assert
    expect(resultado).toMatchObject({ visibility: 'interno' });
    expect(mockCommentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'interno' }),
    );
  });

  it('mantém interno o comentário interno do técnico atribuído', async () => {
    // Arrange
    const doTecnico = params({
      autorUserId: TECNICO_ID,
      autorRole: 'Técnico',
      visibility: 'interno',
    });

    // Act
    const resultado = await criarComentario(doTecnico);

    // Assert
    expect(resultado).toMatchObject({ visibility: 'interno' });
  });

  it('não avisa o solicitante de comentário interno', async () => {
    // Arrange
    const interno = params({
      autorUserId: GESTOR_ID,
      autorRole: 'Preposto',
      visibility: 'interno',
    });

    // Act
    await criarComentario(interno);

    // Assert: o aviso entregaria ao solicitante um texto que ele não pode ler
    expect(salasAvisadas()).not.toContain(`user:${SOLICITANTE_ID}`);
    expect(destinatarios()).not.toContain(SOLICITANTE_ID);
  });

  it('emite para a sala da gestão mesmo em comentário interno', async () => {
    // Arrange
    const interno = params({
      autorUserId: TECNICO_ID,
      autorRole: 'Técnico',
      visibility: 'interno',
    });

    // Act
    await criarComentario(interno);

    // Assert: a gestão também enxerga comentário interno (spec 0005)
    expect(salasAvisadas()).toContain('managers');
  });

  it('avisa o técnico atribuído mesmo em comentário interno', async () => {
    // Arrange
    const interno = params({
      autorUserId: GESTOR_ID,
      autorRole: 'Preposto',
      visibility: 'interno',
    });

    // Act
    await criarComentario(interno);

    // Assert
    expect(salasAvisadas()).toContain(`user:${TECNICO_ID}`);
  });

  it('emite para a sala da gestão mesmo quando é a própria gestão comentando em interno', async () => {
    // Arrange: a combinação que faltava, autor gestor e visibilidade interna
    const internoDoGestor = params({
      autorUserId: GESTOR_ID,
      autorRole: 'Preposto',
      visibility: 'interno',
    });

    // Act
    await criarComentario(internoDoGestor);

    // Assert: a emissão para `managers` é incondicional (spec 0005)
    expect(salasAvisadas()).toContain('managers');
  });
});

// ── avisos ───────────────────────────────────────────────────────

describe('criarComentario · avisos', () => {
  it('avisa o técnico atribuído e a gestão no comentário público do solicitante', async () => {
    // Act
    await criarComentario(params());

    // Assert
    expect(salasAvisadas()).toEqual(expect.arrayContaining([`user:${TECNICO_ID}`, 'managers']));
  });

  it('nunca avisa o próprio autor', async () => {
    // Act
    await criarComentario(params());

    // Assert
    expect(salasAvisadas()).not.toContain(`user:${SOLICITANTE_ID}`);
    expect(destinatarios()).not.toContain(SOLICITANTE_ID);
  });

  it('avisa o solicitante quando quem comenta é o técnico', async () => {
    // Arrange
    const doTecnico = params({ autorUserId: TECNICO_ID, autorRole: 'Técnico' });

    // Act
    await criarComentario(doTecnico);

    // Assert
    expect(salasAvisadas()).toContain(`user:${SOLICITANTE_ID}`);
    expect(salasAvisadas()).not.toContain(`user:${TECNICO_ID}`);
  });

  it('emite para a sala da gestão mesmo quando quem comenta é da gestão', async () => {
    // Arrange
    const daGestao = params({ autorUserId: GESTOR_ID, autorRole: 'Admin' });

    // Act
    await criarComentario(daGestao);

    // Assert: outro gestor com o mesmo chamado aberto também precisa ver (spec 0005)
    expect(salasAvisadas()).toContain('managers');
  });

  it('grava notificação para cada gestor ativo, menos o autor', async () => {
    // Arrange
    const outroGestor = new Types.ObjectId().toHexString();
    gestoresNoBanco([GESTOR_ID, outroGestor]);

    // Act
    await criarComentario(params());

    // Assert
    expect(destinatarios()).toEqual(expect.arrayContaining([GESTOR_ID, outroGestor]));
  });

  it('busca só gestor ativo', async () => {
    // Act
    await criarComentario(params());

    // Assert
    expect(mockUserFind).toHaveBeenCalledWith({
      role: { $in: ['Preposto', 'Admin'] },
      isActive: true,
    });
  });

  it('não repete destinatário que é gestor e técnico atribuído ao mesmo tempo', async () => {
    // Arrange: o mesmo id chega por dois caminhos
    gestoresNoBanco([TECNICO_ID]);

    // Act
    await criarComentario(params());

    // Assert
    const avisados = destinatarios();
    expect(avisados.filter((id) => id === TECNICO_ID)).toHaveLength(1);
  });

  it('envia e-mail para cada destinatário da notificação', async () => {
    // Arrange
    gestoresNoBanco([GESTOR_ID]);

    // Act
    await criarComentario(params());

    // Assert
    const porEmail = mockSendNotificationEmail.mock.calls.map((chamada) => chamada[0]);
    expect(porEmail).toEqual(expect.arrayContaining([TECNICO_ID, GESTOR_ID]));
  });

  it('não grava notificação quando não há ninguém a avisar', async () => {
    // Arrange: chamado sem técnico, comentado pelo próprio solicitante,
    // e sem gestor cadastrado
    chamadoNoBanco({ ...chamadoPadrao, assignedToUserId: null });

    // Act
    await criarComentario(params());

    // Assert
    expect(mockNotificationCreate).not.toHaveBeenCalled();
    expect(mockSendNotificationEmail).not.toHaveBeenCalled();
  });

  it('leva o número do chamado no título da notificação', async () => {
    // Arrange
    gestoresNoBanco([GESTOR_ID]);

    // Act
    await criarComentario(params());

    // Assert
    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Novo comentário no chamado #1042' }),
    );
  });

  it('usa título genérico quando o chamado ainda não tem número', async () => {
    // Arrange
    chamadoNoBanco({ ...chamadoPadrao, ticket_number: null });
    gestoresNoBanco([GESTOR_ID]);

    // Act
    await criarComentario(params());

    // Assert
    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Novo comentário no chamado' }),
    );
  });
});

// ── histórico e prévia ───────────────────────────────────────────

describe('criarComentario · histórico', () => {
  it('registra a ação como praticada por gente', async () => {
    // Act
    await criarComentario(params());

    // Assert
    expect(mockHistoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'comentario', actorType: 'usuario' }),
    );
  });

  it('guarda o texto inteiro quando cabe na prévia', async () => {
    // Act
    await criarComentario(params({ content: 'continua sem gelar' }));

    // Assert
    expect(mockHistoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({ observacoes: 'continua sem gelar' }),
    );
  });

  it('corta a prévia em 100 caracteres e marca com reticências', async () => {
    // Arrange
    const longo = 'a'.repeat(150);

    // Act
    await criarComentario(params({ content: longo }));

    // Assert
    const gravado = mockHistoryCreate.mock.calls[0]?.[0] as { observacoes: string };
    expect(gravado.observacoes).toBe('a'.repeat(100) + '…');
  });

  it('não corta texto de exatamente 100 caracteres', async () => {
    // Arrange
    const noLimite = 'a'.repeat(100);

    // Act
    await criarComentario(params({ content: noLimite }));

    // Assert
    const gravado = mockHistoryCreate.mock.calls[0]?.[0] as { observacoes: string };
    expect(gravado.observacoes).toBe(noLimite);
  });

  it('grava o comentário com o texto inteiro, sem corte', async () => {
    // Arrange
    const longo = 'a'.repeat(150);

    // Act
    await criarComentario(params({ content: longo }));

    // Assert: o corte é só da prévia do histórico
    expect(mockCommentCreate).toHaveBeenCalledWith(expect.objectContaining({ content: longo }));
  });
});

// ── falha dos avisos não derruba o comentário ────────────────────

describe('criarComentario · falha de aviso', () => {
  it('devolve sucesso mesmo com o socket fora do ar', async () => {
    // Arrange
    mockEmitToRoom.mockRejectedValue(new Error('socket offline'));

    // Act
    const resultado = await criarComentario(params());

    // Assert
    expect(resultado).toMatchObject({ ok: true });
  });

  it('grava o comentário mesmo com o socket fora do ar', async () => {
    // Arrange
    mockEmitToRoom.mockRejectedValue(new Error('socket offline'));

    // Act
    await criarComentario(params());

    // Assert
    expect(mockCommentCreate).toHaveBeenCalled();
  });

  it('devolve sucesso mesmo com o e-mail falhando', async () => {
    // Arrange
    gestoresNoBanco([GESTOR_ID]);
    mockSendNotificationEmail.mockRejectedValue(new Error('smtp fora'));

    // Act
    const resultado = await criarComentario(params());

    // Assert
    expect(resultado).toMatchObject({ ok: true });
  });

  it('devolve sucesso mesmo com a notificação do Mongo falhando', async () => {
    // Arrange
    gestoresNoBanco([GESTOR_ID]);
    mockNotificationCreate.mockRejectedValue(new Error('mongo fora'));

    // Act
    const resultado = await criarComentario(params());

    // Assert
    expect(resultado).toMatchObject({ ok: true });
  });

  it('segue em frente quando o autor não é achado para pegar o nome', async () => {
    // Arrange
    mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });

    // Act
    const resultado = await criarComentario(params());

    // Assert
    expect(resultado).toMatchObject({ ok: true });
  });
});
