import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QuadroResposta } from '@/shared/conversas/quadro.schemas';

// ── Mocks ────────────────────────────────────────────────────────

const mockVerifySession = vi.fn();
vi.mock('@/lib/dal', () => ({ verifySession: () => mockVerifySession() }));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));

const mockCriarConversa = vi.fn();
const mockDescartarRascunho = vi.fn();
vi.mock('@/lib/conversas', () => ({
  criarConversa: (...a: unknown[]) => mockCriarConversa(...a),
  descartarRascunho: (...a: unknown[]) => mockDescartarRascunho(...a),
}));

const mockResponder = vi.fn();
vi.mock('@/lib/assistente', () => ({
  responderNaConversa: (...a: unknown[]) => mockResponder(...a),
}));

import { POST as postComId } from '../[id]/mensagens/route';
import { POST as postSemId } from '../mensagens/route';

/**
 * As duas rotas de envio (spec 0003). A diferença entre elas é só o começo: a
 * rota sem `id` é a única dona da criação do rascunho, e a única que o descarta
 * quando a mensagem não grava.
 *
 * covers: AC-3 (criação no envio, descarte no insucesso), AC-4 (a rota com id
 * nunca cria segundo rascunho), AC-1 (401 sem sessão)
 */

const SESSAO = {
  userId: '6aad5286df6f201a25eda111',
  role: 'Solicitante',
  username: 'sol',
  isActive: true,
};
const CONVERSA_ID = '6aad5286df6f201a25eda5f1';
const MSG_ID = '6aad5286df6f201a25eda5f2';

function pedido(corpo: unknown = { texto: 'A lâmpada do corredor queimou.' }): Request {
  return new Request('http://localhost/api/conversas/mensagens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
}

async function* umFluxo(): AsyncGenerator<QuadroResposta> {
  yield { tipo: 'inicio', conversaId: CONVERSA_ID, mensagemId: MSG_ID };
  yield { tipo: 'fim', texto: 'Entendi.', mensagemId: '6aad5286df6f201a25eda5f3', motivo: null };
}

const iniciadaOk = () => ({
  ok: true,
  conversaId: CONVERSA_ID,
  mensagemId: MSG_ID,
  quadros: umFluxo(),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mockVerifySession.mockResolvedValue(SESSAO);
  mockCriarConversa.mockResolvedValue({ ok: true, conversaId: CONVERSA_ID });
  mockDescartarRascunho.mockResolvedValue({ ok: true });
  mockResponder.mockResolvedValue(iniciadaOk());
});

// ── a rota dona da criação · AC-3 ────────────────────────────────

describe('POST /api/conversas/mensagens', () => {
  it('cria o rascunho e só então manda a mensagem, nessa ordem', async () => {
    // Act
    const r = await postSemId(pedido());

    // Assert
    expect(r.status).toBe(200);
    expect(mockCriarConversa).toHaveBeenCalledOnce();
    expect(mockResponder).toHaveBeenCalledWith(
      expect.objectContaining({ conversaId: CONVERSA_ID, texto: 'A lâmpada do corredor queimou.' }),
    );
  });

  it('descarta o rascunho recém criado quando a mensagem não grava', async () => {
    // Arrange
    mockResponder.mockResolvedValue({ ok: false, reason: 'erro' });

    // Act
    const r = await postSemId(pedido());

    // Assert: nada sobra no banco
    expect(mockDescartarRascunho).toHaveBeenCalledWith(
      { userId: SESSAO.userId, role: SESSAO.role },
      CONVERSA_ID,
    );
    expect(r.status).toBe(500);
  });

  it('devolve o motivo original mesmo quando o descarte também falha', async () => {
    // Arrange
    mockResponder.mockResolvedValue({ ok: false, reason: 'invalida' });
    mockDescartarRascunho.mockResolvedValue({ ok: false, reason: 'erro' });

    // Act
    const r = await postSemId(pedido());

    // Assert: a tela recebe o que de fato aconteceu, e o órfão vira log
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ reason: 'invalida' });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('rascunho orfao'),
      expect.stringContaining(CONVERSA_ID),
    );
  });

  it('para no teto de 5 rascunhos, sem criar nem tentar mandar mensagem', async () => {
    // Arrange
    mockCriarConversa.mockResolvedValue({ ok: false, reason: 'limite_rascunhos' });

    // Act
    const r = await postSemId(pedido());

    // Assert
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ reason: 'limite_rascunhos' });
    expect(mockResponder).not.toHaveBeenCalled();
    expect(mockDescartarRascunho).not.toHaveBeenCalled();
  });

  it('recusa o corpo inválido antes de criar qualquer coisa', async () => {
    // Act
    const r = await postSemId(pedido({ texto: '' }));

    // Assert
    expect(r.status).toBe(400);
    expect(mockCriarConversa).not.toHaveBeenCalled();
  });

  it('responde 401 sem sessão, antes de tocar no banco', async () => {
    // Arrange
    mockVerifySession.mockResolvedValue(null);

    // Act
    const r = await postSemId(pedido());

    // Assert
    expect(r.status).toBe(401);
    expect(mockCriarConversa).not.toHaveBeenCalled();
  });

  it('usa o dono da sessão, nunca um id vindo do corpo', async () => {
    // Act
    await postSemId(pedido({ texto: 'relato', solicitanteId: 'forjado' }));

    // Assert
    expect(mockCriarConversa).toHaveBeenCalledWith({ userId: SESSAO.userId, role: SESSAO.role });
  });
});

// ── a rota que nunca cria rascunho · AC-4 ────────────────────────

describe('POST /api/conversas/[id]/mensagens', () => {
  const params = Promise.resolve({ id: CONVERSA_ID });

  it('manda a mensagem para a conversa que já existe', async () => {
    // Act
    const r = await postComId(pedido(), { params });

    // Assert
    expect(r.status).toBe(200);
    expect(mockResponder).toHaveBeenCalledWith(
      expect.objectContaining({ conversaId: CONVERSA_ID }),
    );
  });

  it('nunca cria nem descarta rascunho, nem quando a mensagem falha', async () => {
    // Arrange
    mockResponder.mockResolvedValue({ ok: false, reason: 'limite_mensagens' });

    // Act
    const r = await postComId(pedido(), { params });

    // Assert: é isso que impede a nova tentativa de gerar um segundo rascunho
    expect(mockCriarConversa).not.toHaveBeenCalled();
    expect(mockDescartarRascunho).not.toHaveBeenCalled();
    expect(r.status).toBe(409);
  });

  it('responde 404 num id que nem é ObjectId, sem consultar o banco', async () => {
    // Act
    const r = await postComId(pedido(), { params: Promise.resolve({ id: 'nao-e-id' }) });

    // Assert
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ reason: 'nao_encontrada' });
    expect(mockResponder).not.toHaveBeenCalled();
  });

  it('esconde a conversa de outra pessoa atrás do mesmo 404', async () => {
    // Arrange
    mockResponder.mockResolvedValue({ ok: false, reason: 'sem_permissao' });

    // Act
    const r = await postComId(pedido(), { params });

    // Assert
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ reason: 'nao_encontrada' });
  });

  it('responde 401 sem sessão', async () => {
    // Arrange
    mockVerifySession.mockResolvedValue(null);

    // Act
    const r = await postComId(pedido(), { params });

    // Assert
    expect(r.status).toBe(401);
    expect(mockResponder).not.toHaveBeenCalled();
  });

  it('recusa corpo inválido com 400', async () => {
    // Act
    const r = await postComId(pedido({ texto: '   ' }), { params });

    // Assert
    expect(r.status).toBe(400);
    expect(mockResponder).not.toHaveBeenCalled();
  });
});
