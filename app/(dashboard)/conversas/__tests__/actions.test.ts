import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));

const mockRequireSession = vi.fn();
vi.mock('@/lib/dal', () => ({ requireSession: () => mockRequireSession() }));

const mockDescartarRascunho = vi.fn();
const mockListarRascunhos = vi.fn();
vi.mock('@/lib/conversas', () => ({
  descartarRascunho: (...a: unknown[]) => mockDescartarRascunho(...a),
  listarRascunhos: (...a: unknown[]) => mockListarRascunhos(...a),
}));

/** O banco é o único limite mockado; `_lib/lateral` roda de verdade. */
let docs: unknown[] = [];
let explode = false;
vi.mock('@/models/Chamado', () => ({
  ChamadoModel: {
    find: () => {
      const c = {
        select: () => c,
        populate: () => c,
        sort: () => c,
        limit: () => c,
        lean: async () => {
          if (explode) throw new Error('banco fora do ar');
          return docs;
        },
      };
      return c;
    },
  },
}));

import { revalidatePath } from 'next/cache';

import { carregarMaisConversasAction, descartarRascunhoAction } from '../actions';

/**
 * As duas ações da tela (spec 0003). Uma nunca lança e devolve lista vazia em
 * qualquer falha; a outra devolve o motivo para a tela virar frase.
 *
 * covers: AC-2 (`Carregar mais`), AC-12 (descartar rascunho)
 */

const SESSAO = {
  userId: '6aad5286df6f201a25eda111',
  role: 'Solicitante',
  username: 'sol',
  isActive: true,
};
const CONVERSA_ID = '6aad5286df6f201a25eda5f1';
const CURSOR = { em: '2026-06-15T14:12:00.288Z', id: new Types.ObjectId().toHexString() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  docs = [];
  explode = false;
  mockRequireSession.mockResolvedValue(SESSAO);
  mockDescartarRascunho.mockResolvedValue({ ok: true });
  mockListarRascunhos.mockResolvedValue({ ok: true, rascunhos: [] });
});

// ── carregar mais · AC-2 ─────────────────────────────────────────

describe('carregarMaisConversasAction', () => {
  it('devolve a página seguinte com o cursor da próxima', async () => {
    // Arrange
    const ultimo = {
      _id: new Types.ObjectId(),
      ticket_number: 'CHM-2026-00001',
      titulo: 'Tomada solta',
      status: 'encerrado',
      updatedAt: new Date('2026-05-01T10:00:00.000Z'),
      conversaId: null,
      assignedToUserId: null,
    };
    docs = [ultimo];

    // Act
    const r = await carregarMaisConversasAction(CURSOR);

    // Assert
    expect(r.itens).toHaveLength(1);
    expect(r.temMais).toBe(false);
    expect(r.cursor).toEqual({ em: '2026-05-01T10:00:00.000Z', id: String(ultimo._id) });
  });

  it('devolve lista vazia quando o banco cai, em vez de lançar na tela', async () => {
    // Arrange
    explode = true;

    // Act
    const r = await carregarMaisConversasAction(CURSOR);

    // Assert
    expect(r).toEqual({ itens: [], temMais: false, cursor: null });
    expect(console.error).toHaveBeenCalled();
  });

  it('devolve lista vazia quando não há sessão, sem deixar o erro subir', async () => {
    // Arrange: `requireSession` redireciona lançando
    mockRequireSession.mockRejectedValue(new Error('NEXT_REDIRECT'));

    // Act
    const r = await carregarMaisConversasAction(CURSOR);

    // Assert
    expect(r.itens).toEqual([]);
  });

  it('não vaza a mensagem do erro, só o nome dele', async () => {
    // Arrange
    explode = true;

    // Act
    await carregarMaisConversasAction(CURSOR);

    // Assert
    const logado = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .flat()
      .join(' ');
    expect(logado).not.toContain('banco fora do ar');
  });

  it('usa o solicitante da sessão, nunca um id vindo de fora', async () => {
    // Act
    await carregarMaisConversasAction(CURSOR);

    // Assert
    expect(mockRequireSession).toHaveBeenCalledOnce();
  });
});

// ── descartar rascunho · AC-12 ───────────────────────────────────

describe('descartarRascunhoAction', () => {
  it('descarta e manda a lateral se recarregar', async () => {
    // Act
    const r = await descartarRascunhoAction(CONVERSA_ID);

    // Assert
    expect(r).toEqual({ ok: true });
    expect(mockDescartarRascunho).toHaveBeenCalledWith(
      { userId: SESSAO.userId, role: SESSAO.role },
      CONVERSA_ID,
    );
    expect(revalidatePath).toHaveBeenCalledWith('/conversas');
  });

  it('devolve o motivo quando a confirmação já começou, sem recarregar nada', async () => {
    // Arrange
    mockDescartarRascunho.mockResolvedValue({ ok: false, reason: 'confirmacao_em_andamento' });

    // Act
    const r = await descartarRascunhoAction(CONVERSA_ID);

    // Assert
    expect(r).toEqual({ ok: false, reason: 'confirmacao_em_andamento' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('devolve o motivo quando a conversa é de outra pessoa', async () => {
    // Arrange
    mockDescartarRascunho.mockResolvedValue({ ok: false, reason: 'sem_permissao' });

    // Act
    const r = await descartarRascunhoAction(CONVERSA_ID);

    // Assert
    expect(r).toEqual({ ok: false, reason: 'sem_permissao' });
  });

  it('exige sessão antes de descartar qualquer coisa', async () => {
    // Arrange
    mockRequireSession.mockRejectedValue(new Error('NEXT_REDIRECT'));

    // Act & Assert
    await expect(descartarRascunhoAction(CONVERSA_ID)).rejects.toThrow();
    expect(mockDescartarRascunho).not.toHaveBeenCalled();
  });
});
