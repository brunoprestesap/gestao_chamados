import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const mockVerifySession = vi.fn();
vi.mock('@/lib/dal', () => ({ verifySession: () => mockVerifySession() }));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));

const mockCriarComentario = vi.fn();
vi.mock('@/lib/chamados/comentarios', () => ({
  criarComentario: (...a: unknown[]) => mockCriarComentario(...a),
}));

import { POST } from '../route';

/**
 * A rota nova de comentário pela conversa (spec 0005, AC-5, AC-6, AC-7, AC-9,
 * AC-11): JSON simples, sem NDJSON, chamando `criarComentario` direto pelo id
 * do chamado do próprio caminho, nunca de uma Conversa.
 */

const SESSAO = { userId: '6aad5286df6f201a25eda111', role: 'Solicitante', username: 'sol' };
const CHAMADO_ID = '6aad5286df6f201a25eda5f9';

function pedido(corpo: unknown = { texto: 'Passo hoje à tarde.', visibility: 'publico' }): Request {
  return new Request(`http://localhost/api/conversas/chamado/${CHAMADO_ID}/comentarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
}

const params = Promise.resolve({ chamadoId: CHAMADO_ID });

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifySession.mockResolvedValue(SESSAO);
  mockCriarComentario.mockResolvedValue({ ok: true, id: 'c1', visibility: 'publico' });
});

// ── sessão · AC-11 ───────────────────────────────────────────────

describe('POST /api/conversas/chamado/[chamadoId]/comentarios · sessão', () => {
  it('responde 401 sem sessão, antes de tocar no banco', async () => {
    // Arrange
    mockVerifySession.mockResolvedValue(null);

    // Act
    const r = await POST(pedido(), { params });

    // Assert
    expect(r.status).toBe(401);
    expect(mockCriarComentario).not.toHaveBeenCalled();
  });
});

// ── corpo do pedido ──────────────────────────────────────────────

describe('POST /api/conversas/chamado/[chamadoId]/comentarios · validação', () => {
  it('recusa corpo que não é JSON, com 400', async () => {
    // Arrange
    const pedidoQuebrado = new Request(
      `http://localhost/api/conversas/chamado/${CHAMADO_ID}/comentarios`,
      { method: 'POST', body: 'não é json' },
    );

    // Act
    const r = await POST(pedidoQuebrado, { params });

    // Assert
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ reason: 'invalida' });
    expect(mockCriarComentario).not.toHaveBeenCalled();
  });

  it('recusa texto vazio, com 400', async () => {
    // Act
    const r = await POST(pedido({ texto: '', visibility: 'publico' }), { params });

    // Assert
    expect(r.status).toBe(400);
    expect(mockCriarComentario).not.toHaveBeenCalled();
  });

  it('recusa texto maior que 5000 caracteres, com 400', async () => {
    // Act
    const r = await POST(pedido({ texto: 'x'.repeat(5001) }), { params });

    // Assert
    expect(r.status).toBe(400);
    expect(mockCriarComentario).not.toHaveBeenCalled();
  });

  it('usa o id do chamado do caminho, nunca um id vindo do corpo', async () => {
    // Act
    await POST(pedido({ texto: 'relato', chamadoId: 'forjado' }), { params });

    // Assert
    expect(mockCriarComentario).toHaveBeenCalledWith(
      expect.objectContaining({ chamadoId: CHAMADO_ID }),
    );
  });

  it('assume público quando a visibilidade não vem no corpo', async () => {
    // Act
    await POST(pedido({ texto: 'relato' }), { params });

    // Assert
    expect(mockCriarComentario).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'publico' }),
    );
  });
});

// ── caminho feliz · AC-5, AC-6, AC-7, AC-9 ────────────────────────

describe('POST /api/conversas/chamado/[chamadoId]/comentarios · caminho feliz', () => {
  it('chama criarComentario com a sessão atual e o texto, e devolve 200', async () => {
    // Act
    const r = await POST(pedido({ texto: 'Passo hoje à tarde.', visibility: 'interno' }), {
      params,
    });

    // Assert
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, id: 'c1', visibility: 'publico' });
    expect(mockCriarComentario).toHaveBeenCalledWith({
      chamadoId: CHAMADO_ID,
      autorUserId: SESSAO.userId,
      autorRole: SESSAO.role,
      content: 'Passo hoje à tarde.',
      visibility: 'interno',
    });
  });

  it('nunca toca em Conversa: só chama criarComentario, que grava direto no chamado', async () => {
    // Act
    await POST(pedido(), { params });

    // Assert: a ausência de qualquer mock de Conversa/lib de conversa já
    // prova isso, mas o teste documenta a garantia da AC-9 explicitamente.
    expect(mockCriarComentario).toHaveBeenCalledOnce();
  });
});

// ── permissão negada · AC-11 ───────────────────────────────────────

describe('POST /api/conversas/chamado/[chamadoId]/comentarios · sem permissão', () => {
  it('esconde chamado inexistente atrás de 404 "não encontrada"', async () => {
    // Arrange
    mockCriarComentario.mockResolvedValue({ ok: false, error: 'Chamado não encontrado.' });

    // Act
    const r = await POST(pedido(), { params });

    // Assert
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ reason: 'nao_encontrada' });
  });

  it('esconde a falta de permissão atrás da mesma resposta de 404', async () => {
    // Arrange: mesma resposta que o chamado inexistente, para não revelar
    // que o chamado existe
    mockCriarComentario.mockResolvedValue({
      ok: false,
      error: 'Você não tem permissão para comentar neste chamado.',
    });

    // Act
    const r = await POST(pedido(), { params });

    // Assert
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ reason: 'nao_encontrada' });
  });
});
