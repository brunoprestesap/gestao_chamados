import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const mockSendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/email/send-notification-email', () => ({
  sendNotificationEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const mockEmitToRoom = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/realtime-emit', () => ({
  emitToRoom: (...args: unknown[]) => mockEmitToRoom(...args),
}));

const mockInsertMany = vi.fn().mockResolvedValue([]);
vi.mock('@/models/Notification', () => ({
  NotificationModel: { insertMany: (...args: unknown[]) => mockInsertMany(...args) },
}));

const mockUserFind = vi.fn();
const mockUserFindById = vi.fn();
vi.mock('@/models/user.model', () => ({
  UserModel: {
    find: (...args: unknown[]) => mockUserFind(...args),
    findById: (...args: unknown[]) => mockUserFindById(...args),
  },
}));

import { notificarNovoChamado } from '../novo-chamado';

/**
 * Notificação de novo chamado para a gestão (spec 0004, AC-11), com o texto
 * variando quando o chamado já nasce `validado` sozinho pela IA (spec 0007,
 * AC-13).
 */

const CHAMADO_ID = '6aad5286df6f201a25edd001';
const SOLICITANTE_ID = '6aad5286df6f201a25eda111';
const PREPOSTO_ID = '6aad5286df6f201a25eda222';

beforeEach(() => {
  vi.clearAllMocks();
  mockUserFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });
  mockUserFind.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve([{ _id: PREPOSTO_ID }]) }),
  });
});

describe('notificarNovoChamado', () => {
  it('sem jaValidado (padrão), usa o texto de abertura de sempre', async () => {
    await notificarNovoChamado({
      chamadoId: CHAMADO_ID,
      ticketNumber: 'CHM-2026-00001',
      titulo: 'Troca de lâmpada — Sala 302',
      solicitanteId: SOLICITANTE_ID,
    });

    expect(mockInsertMany).toHaveBeenCalledOnce();
    const doc = mockInsertMany.mock.calls[0][0][0];
    expect(doc.title).toBe('Novo chamado #CHM-2026-00001 aberto');
  });

  it('com jaValidado: true, avisa que já foi validado automaticamente (AC-13)', async () => {
    await notificarNovoChamado({
      chamadoId: CHAMADO_ID,
      ticketNumber: 'CHM-2026-00001',
      titulo: 'Troca de lâmpada — Sala 302',
      solicitanteId: SOLICITANTE_ID,
      jaValidado: true,
    });

    expect(mockInsertMany).toHaveBeenCalledOnce();
    const doc = mockInsertMany.mock.calls[0][0][0];
    expect(doc.title).toBe('Chamado #CHM-2026-00001 validado automaticamente');
    expect(doc.title).not.toContain('aberto');
    // O aviso ao vivo e o e-mail levam a mesma marca, para variarem o texto também.
    expect(mockEmitToRoom).toHaveBeenCalledWith(
      'managers',
      'ticket:new',
      expect.objectContaining({ jaValidado: true }),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      PREPOSTO_ID,
      'ticket:new',
      expect.objectContaining({ jaValidado: true }),
    );
  });

  it('sem ticketNumber, usa o texto genérico correspondente', async () => {
    await notificarNovoChamado({
      chamadoId: CHAMADO_ID,
      ticketNumber: '',
      titulo: 'Troca de lâmpada — Sala 302',
      solicitanteId: SOLICITANTE_ID,
      jaValidado: true,
    });

    const doc = mockInsertMany.mock.calls[0][0][0];
    expect(doc.title).toBe('Chamado validado automaticamente');
  });
});

// ── spec 0008, AC-13: o resultado da atribuição automática no aviso ─

describe('notificarNovoChamado · atribuição automática (spec 0008, AC-13)', () => {
  const base = {
    chamadoId: CHAMADO_ID,
    ticketNumber: 'CHM-2026-00001',
    titulo: 'Troca de lâmpada — Sala 302',
    solicitanteId: SOLICITANTE_ID,
    jaValidado: true,
  };

  it('atribuído: o título diz a quem, e nunca diz que falta atribuir', async () => {
    // Act
    await notificarNovoChamado({
      ...base,
      atribuicao: { resultado: 'atribuido', tecnicoId: 't1', tecnicoNome: 'Carla' },
    });

    // Assert
    const doc = mockInsertMany.mock.calls[0][0][0];
    expect(doc.title).toBe('Chamado #CHM-2026-00001 validado e atribuído a Carla');
    expect(doc.body).toBe('Troca de lâmpada — Sala 302');
    expect(JSON.stringify(doc)).not.toContain('falta atribuir');
    expect(doc.data.atribuicao).toEqual({ resultado: 'atribuido', tecnicoNome: 'Carla' });
  });

  it('atribuído com nome vazio: usa um técnico', async () => {
    // Act
    await notificarNovoChamado({
      ...base,
      atribuicao: { resultado: 'atribuido', tecnicoId: 't1', tecnicoNome: '' },
    });

    // Assert
    const doc = mockInsertMany.mock.calls[0][0][0];
    expect(doc.title).toBe('Chamado #CHM-2026-00001 validado e atribuído a um técnico');
  });

  it.each([
    ['sem_especialidade', 'nenhum técnico ativo com a especialidade'],
    ['sem_vaga', 'todos os técnicos no limite de carga'],
    ['erro', 'falha na atribuição automática'],
  ] as const)('sem técnico por %s: título e motivo em português', async (motivo, texto) => {
    // Act
    await notificarNovoChamado({ ...base, atribuicao: { resultado: 'sem_tecnico', motivo } });

    // Assert
    const doc = mockInsertMany.mock.calls[0][0][0];
    expect(doc.title).toBe('Chamado #CHM-2026-00001 validado, sem técnico disponível');
    expect(doc.body).toContain(texto);
    expect(doc.body).toContain('Troca de lâmpada — Sala 302');
    expect(doc.data.atribuicao).toEqual({ resultado: 'sem_tecnico', motivo });
  });

  it('o payload do socket e o do email levam o resultado, para variarem o texto', async () => {
    // Arrange
    const atribuicao = { resultado: 'sem_tecnico', motivo: 'sem_vaga' } as const;

    // Act
    await notificarNovoChamado({ ...base, atribuicao });

    // Assert
    expect(mockEmitToRoom).toHaveBeenCalledWith(
      'managers',
      'ticket:new',
      expect.objectContaining({ atribuicao }),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      PREPOSTO_ID,
      'ticket:new',
      expect.objectContaining({ atribuicao }),
    );
  });

  it('nao_tentada mantém o texto e o payload da 0007, sem a chave atribuicao', async () => {
    // Act
    await notificarNovoChamado({ ...base, atribuicao: { resultado: 'nao_tentada' } });

    // Assert
    const doc = mockInsertMany.mock.calls[0][0][0];
    expect(doc.title).toBe('Chamado #CHM-2026-00001 validado automaticamente');
    expect(doc.body).toBe('Troca de lâmpada — Sala 302');
    expect('atribuicao' in doc.data).toBe(false);
  });

  it('chamado que nasceu aberto ignora o resultado', async () => {
    // Act
    await notificarNovoChamado({
      ...base,
      jaValidado: false,
      atribuicao: { resultado: 'atribuido', tecnicoId: 't1', tecnicoNome: 'Carla' },
    });

    // Assert
    const doc = mockInsertMany.mock.calls[0][0][0];
    expect(doc.title).toBe('Novo chamado #CHM-2026-00001 aberto');
    expect('atribuicao' in doc.data).toBe(false);
  });
});

describe('notificarNovoChamado, casos de borda', () => {
  const base = {
    chamadoId: CHAMADO_ID,
    ticketNumber: 'CHM-2026-00001',
    titulo: 'Troca de lâmpada — Sala 302',
    solicitanteId: SOLICITANTE_ID,
  };

  it.each(['Troca de lâmpada', 'Troca de lâmpada.', 'Troca de lâmpada!', 'Troca de lâmpada...  '])(
    'sem técnico, título "%s": o corpo termina o título uma vez só, sem ponto duplo',
    async (titulo) => {
      // Act
      await notificarNovoChamado({
        ...base,
        titulo,
        jaValidado: true,
        atribuicao: { resultado: 'sem_tecnico', motivo: 'sem_especialidade' },
      });

      // Assert
      expect(mockInsertMany.mock.calls[0][0][0].body).toBe(
        'Troca de lâmpada. Motivo: nenhum técnico ativo com a especialidade.',
      );
    },
  );

  it('chamado aberto sem número: usa o título genérico "Novo chamado aberto"', async () => {
    // Act
    await notificarNovoChamado({ ...base, ticketNumber: '', jaValidado: false });

    // Assert
    expect(mockInsertMany.mock.calls[0][0][0].title).toBe('Novo chamado aberto');
  });

  it('id de solicitante inválido: não consulta o banco e o aviso sai sem o nome dele', async () => {
    // Act
    await notificarNovoChamado({ ...base, solicitanteId: 'nao-e-um-object-id' });

    // Assert
    expect(mockUserFindById).not.toHaveBeenCalled();
    expect(mockEmitToRoom).toHaveBeenCalledWith(
      'managers',
      'ticket:new',
      expect.objectContaining({ openedBy: { id: 'nao-e-um-object-id', name: undefined } }),
    );
  });

  it('sem gestor ativo: não grava Notification nem manda email, mas ainda avisa a sala dos gestores', async () => {
    // Arrange
    mockUserFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });

    // Act
    await notificarNovoChamado({ ...base, jaValidado: true });

    // Assert
    expect(mockInsertMany).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockEmitToRoom).toHaveBeenCalledOnce();
  });
});
