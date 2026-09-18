import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CONVERSA_FALHAS } from '@/shared/conversas/conversa.constants';
import type { QuadroResposta } from '@/shared/conversas/quadro.schemas';

// ── Mocks ────────────────────────────────────────────────────────

const mockVerifySession = vi.fn();
vi.mock('@/lib/dal', () => ({ verifySession: () => mockVerifySession() }));

import { emQuadros, exigirViewer, falha, lerTexto, responder } from '../_lib/fluxo';

/**
 * O que as duas rotas de envio têm em comum (spec 0003): sessão, corpo, a
 * tradução de motivo em status, e os quadros virando NDJSON.
 *
 * covers: AC-1 (401 sem sessão, 404 que não revela conversa de outro),
 * AC-5 (fluxo NDJSON), AC-9 (motivo por status)
 */

const SESSAO = {
  userId: '6aad5286df6f201a25eda111',
  role: 'Solicitante',
  username: 'sol',
  isActive: true,
};

function pedido(corpo: unknown): Request {
  return new Request('http://localhost/api/conversas/mensagens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
}

/** Lê o corpo NDJSON de volta como lista de quadros. */
async function lerFluxo(resposta: Response): Promise<QuadroResposta[]> {
  const texto = await resposta.text();
  return texto
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifySession.mockResolvedValue(SESSAO);
});

// ── sessão · AC-1 ────────────────────────────────────────────────

describe('exigirViewer', () => {
  it('devolve o viewer da sessão verificada, nunca do corpo do pedido', async () => {
    // Act
    const r = await exigirViewer();

    // Assert
    expect(r).toEqual({ ok: true, viewer: { userId: SESSAO.userId, role: SESSAO.role } });
  });

  it('responde 401 em JSON sem sessão, em vez de redirecionar', async () => {
    // Arrange
    mockVerifySession.mockResolvedValue(null);

    // Act
    const r = await exigirViewer();

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.resposta.status).toBe(401);
    expect(await r.resposta.json()).toEqual({ reason: 'sem_sessao' });
  });
});

// ── corpo do pedido · AC-9 ───────────────────────────────────────

describe('lerTexto', () => {
  it('aceita o texto e devolve sem espaço nas pontas', async () => {
    // Act
    const r = await lerTexto(pedido({ texto: '  relato com espaço  ' }));

    // Assert
    expect(r).toEqual({ ok: true, texto: 'relato com espaço' });
  });

  it('recusa corpo que não é JSON, com 400', async () => {
    // Act
    const r = await lerTexto(pedido('{ isto não é json'));

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.resposta.status).toBe(400);
    expect(await r.resposta.json()).toEqual({ reason: 'invalida' });
  });

  it('recusa texto ausente, vazio ou só espaço', async () => {
    // Act & Assert
    for (const corpo of [{}, { texto: '' }, { texto: '   ' }, { texto: null }]) {
      const r = await lerTexto(pedido(corpo));
      expect(r.ok, JSON.stringify(corpo)).toBe(false);
    }
  });

  it('recusa texto que não é string', async () => {
    // Act
    const r = await lerTexto(pedido({ texto: 42 }));

    // Assert
    expect(r.ok).toBe(false);
  });

  it('recusa texto acima do teto de 2.000 caracteres', async () => {
    // Act
    const r = await lerTexto(pedido({ texto: 'a'.repeat(2001) }));

    // Assert
    expect(r.ok).toBe(false);
  });

  it('aceita exatamente no teto', async () => {
    // Act
    const r = await lerTexto(pedido({ texto: 'a'.repeat(2000) }));

    // Assert
    expect(r.ok).toBe(true);
  });

  it('ignora campo a mais no corpo, como um `solicitanteId` forjado', async () => {
    // Act: o dono vem da sessão, então nada no corpo muda isso
    const r = await lerTexto(pedido({ texto: 'relato', solicitanteId: 'outro' }));

    // Assert
    expect(r).toEqual({ ok: true, texto: 'relato' });
  });
});

// ── motivo virando status · AC-1, AC-9 ───────────────────────────

describe('falha', () => {
  it('responde 404 igual para conversa de outra pessoa e para inexistente', async () => {
    // Act
    const inexistente = falha('nao_encontrada');
    const deOutro = falha('sem_permissao');

    // Assert: mesmo status e mesmo corpo, nada revela que a outra existe
    expect(inexistente.status).toBe(404);
    expect(deOutro.status).toBe(404);
    expect(await deOutro.json()).toEqual(await inexistente.json());
  });

  it('nunca deixa `sem_permissao` aparecer no corpo', async () => {
    // Act & Assert
    expect(await falha('sem_permissao').json()).toEqual({ reason: 'nao_encontrada' });
  });

  it('usa 400 para entrada inválida e 409 para os tetos', () => {
    // Assert
    expect(falha('invalida').status).toBe(400);
    expect(falha('limite_rascunhos').status).toBe(409);
    expect(falha('limite_mensagens').status).toBe(409);
    expect(falha('confirmacao_em_andamento').status).toBe(409);
  });

  it('usa 500 só no erro inesperado', () => {
    // Assert
    expect(falha('erro').status).toBe(500);
  });

  it('tem status para todo motivo de `lib/conversas`, sem cair no genérico', () => {
    // Act & Assert
    for (const motivo of CONVERSA_FALHAS) {
      const status = falha(motivo).status;
      expect(status, motivo).toBeGreaterThanOrEqual(400);
      expect(status, motivo).toBeLessThan(600);
    }
  });
});

// ── os quadros virando NDJSON · AC-5 ─────────────────────────────

describe('emQuadros', () => {
  async function* tresQuadros(): AsyncGenerator<QuadroResposta> {
    yield {
      tipo: 'inicio',
      conversaId: '6aad5286df6f201a25eda5f1',
      mensagemId: '6aad5286df6f201a25eda5f2',
    };
    yield { tipo: 'parcial', texto: 'Entendi' };
    yield {
      tipo: 'fim',
      texto: 'Entendi tudo',
      mensagemId: '6aad5286df6f201a25eda5f3',
      motivo: null,
    };
  }

  it('declara NDJSON e pede para ninguém bufferizar no caminho', () => {
    // Act
    const r = emQuadros(tresQuadros());

    // Assert: sem isso o nginx entrega tudo de uma vez e o streaming some
    expect(r.headers.get('content-type')).toContain('application/x-ndjson');
    expect(r.headers.get('x-accel-buffering')).toBe('no');
    expect(r.headers.get('cache-control')).toContain('no-store');
  });

  it('escreve um quadro por linha, na ordem em que saíram', async () => {
    // Act
    const quadros = await lerFluxo(emQuadros(tresQuadros()));

    // Assert
    expect(quadros.map((q) => q.tipo)).toEqual(['inicio', 'parcial', 'fim']);
  });

  it('fecha a conexão sem quebrar quando o gerador estoura no meio', async () => {
    // Arrange
    async function* quebra(): AsyncGenerator<QuadroResposta> {
      yield { tipo: 'parcial', texto: 'começou' };
      throw new Error('defeito nosso');
    }
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // Act
    const quadros = await lerFluxo(emQuadros(quebra()));

    // Assert: a tela fica com o que já recebeu, em vez de um corpo pela metade
    expect(quadros).toHaveLength(1);
    expect(console.error).toHaveBeenCalled();
  });

  it('não vaza a mensagem do erro em log, só o nome dele', async () => {
    // Arrange
    async function* quebra(): AsyncGenerator<QuadroResposta> {
      yield { tipo: 'parcial', texto: 'x' };
      throw new Error('texto secreto do relato');
    }
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // Act
    await lerFluxo(emQuadros(quebra()));

    // Assert
    const logado = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .flat()
      .join(' ');
    expect(logado).not.toContain('texto secreto');
  });
});

// ── o desfecho comum às duas rotas ───────────────────────────────

describe('responder', () => {
  it('entrega os quadros quando a resposta começou', async () => {
    // Arrange
    async function* um(): AsyncGenerator<QuadroResposta> {
      yield { tipo: 'parcial', texto: 'oi' };
    }

    // Act
    const r = responder({ ok: true, conversaId: 'x', mensagemId: 'y', quadros: um() });

    // Assert
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('ndjson');
  });

  it('entrega a falha traduzida quando a resposta nem começou', async () => {
    // Act
    const r = responder({ ok: false, reason: 'limite_rascunhos' });

    // Assert
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ reason: 'limite_rascunhos' });
  });
});
