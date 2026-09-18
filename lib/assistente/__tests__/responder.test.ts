import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QuadroResposta } from '@/shared/conversas/quadro.schemas';

// ── Mocks ────────────────────────────────────────────────────────

const mockLerConversa = vi.fn();
const mockEnviarMensagem = vi.fn();
vi.mock('@/lib/conversas', () => ({
  lerConversa: (...args: unknown[]) => mockLerConversa(...args),
  enviarMensagem: (...args: unknown[]) => mockEnviarMensagem(...args),
}));

const mockStream = vi.fn();
vi.mock('@/lib/llm', () => ({
  streamLlmObject: (...args: unknown[]) => mockStream(...args),
}));

import { responderNaConversa } from '../responder';

/**
 * O caminho que a mensagem faz do envio até a resposta (spec 0003). Este módulo
 * nunca lança e nunca cria nem descarta rascunho: falha da IA vira mensagem de
 * `sistema`, e resposta boa que não grava vira `fim` sem `mensagemId`.
 *
 * covers: AC-5 (quadros e gravação), AC-5b (resposta não salva), AC-6 (só
 * conversa), AC-7 (mensagem de reserva)
 */

const VIEWER = { userId: '6aad5286df6f201a25eda111', role: 'Solicitante' as const };
const CONVERSA_ID = '6aad5286df6f201a25eda5f1';
const MSG_SOLICITANTE = '6aad5286df6f201a25eda5f2';
const MSG_IA = '6aad5286df6f201a25eda5f3';
const CALL_ID = '6aad5286df6f201a25eda5f4';
const TEXTO = 'A lâmpada do corredor queimou.';

/** Recolhe todos os quadros do gerador, como a rota faz. */
async function coletar(gerador: AsyncGenerator<QuadroResposta>): Promise<QuadroResposta[]> {
  const quadros: QuadroResposta[] = [];
  for await (const q of gerador) quadros.push(q);
  return quadros;
}

function conversaLida(
  situacao: 'rascunho' | 'reservada' | 'vinculada' = 'rascunho',
  mensagens: unknown[] = [],
) {
  return { ok: true, conversa: { id: CONVERSA_ID, situacao }, mensagens };
}

/** Um fluxo de `lib/llm` que entrega os parciais e depois o objeto final. */
function fluxo(partes: string[], final: unknown) {
  return {
    ok: true,
    partial: (async function* () {
      for (const texto of partes) yield { resposta: texto };
    })(),
    final: Promise.resolve(final),
  };
}

const finalOk = {
  ok: true,
  data: { resposta: 'Entendi, iluminação apagada no corredor.' },
  meta: { callId: CALL_ID, task: 'conversa.acolhimento', promptVersion: '1', model: 'qwen3-8b' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockLerConversa.mockResolvedValue(conversaLida());
  mockEnviarMensagem.mockImplementation(async ({ autor }: { autor: string }) =>
    autor === 'solicitante'
      ? { ok: true, destino: 'conversa', id: MSG_SOLICITANTE }
      : { ok: true, destino: 'conversa', id: MSG_IA },
  );
  mockStream.mockResolvedValue(fluxo(['Entendi,', 'Entendi, iluminação'], finalOk));
});

// ── caminho feliz · AC-5 ─────────────────────────────────────────

describe('responderNaConversa · resposta normal', () => {
  it('devolve os quadros na ordem inicio, parcial, fim', async () => {
    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });
    if (!r.ok) throw new Error('esperava sucesso');
    const quadros = await coletar(r.quadros);

    // Assert
    expect(quadros.map((q) => q.tipo)).toEqual(['inicio', 'parcial', 'parcial', 'fim']);
  });

  it('manda no `inicio` a conversa e a mensagem do solicitante já gravada', async () => {
    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });
    if (!r.ok) throw new Error('esperava sucesso');
    const [inicio] = await coletar(r.quadros);

    // Assert
    expect(inicio).toEqual({
      tipo: 'inicio',
      conversaId: CONVERSA_ID,
      mensagemId: MSG_SOLICITANTE,
    });
  });

  it('grava só o objeto final, com o `llmCallId` da chamada', async () => {
    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });
    if (!r.ok) throw new Error('esperava sucesso');
    await coletar(r.quadros);

    // Assert: duas gravações apenas, e nenhuma com o texto parcial
    expect(mockEnviarMensagem).toHaveBeenCalledTimes(2);
    expect(mockEnviarMensagem).toHaveBeenLastCalledWith(
      expect.objectContaining({
        autor: 'ia',
        tipo: 'texto',
        texto: finalOk.data.resposta,
        llmCallId: CALL_ID,
      }),
    );
  });

  it('nunca grava texto parcial, mesmo com muitos parciais chegando', async () => {
    // Arrange
    mockStream.mockResolvedValue(fluxo(['a', 'ab', 'abc', 'abcd'], finalOk));

    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });
    if (!r.ok) throw new Error('esperava sucesso');
    await coletar(r.quadros);

    // Assert
    const textosGravados = mockEnviarMensagem.mock.calls.map((c) => c[0].texto);
    expect(textosGravados).toEqual([TEXTO, finalOk.data.resposta]);
  });

  it('ignora parcial vazio, para a tela não piscar bolha sem conteúdo', async () => {
    // Arrange
    mockStream.mockResolvedValue(fluxo(['', '', 'Entendi'], finalOk));

    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });
    if (!r.ok) throw new Error('esperava sucesso');
    const quadros = await coletar(r.quadros);

    // Assert
    expect(quadros.filter((q) => q.tipo === 'parcial')).toHaveLength(1);
  });

  it('fecha com o texto final e o id da mensagem gravada', async () => {
    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });
    if (!r.ok) throw new Error('esperava sucesso');
    const quadros = await coletar(r.quadros);

    // Assert
    expect(quadros.at(-1)).toEqual({
      tipo: 'fim',
      texto: finalOk.data.resposta,
      mensagemId: MSG_IA,
      motivo: null,
    });
  });
});

// ── o que vai para o modelo · AC-5, AC-6 ─────────────────────────

describe('responderNaConversa · chamada ao modelo', () => {
  it('usa a raia interativa com o usuário da sessão e a referência da conversa', async () => {
    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });
    if (!r.ok) throw new Error('esperava sucesso');
    await coletar(r.quadros);

    // Assert
    expect(mockStream).toHaveBeenCalledWith(
      expect.objectContaining({
        task: 'conversa.acolhimento',
        promptVersion: '1',
        lane: 'interactive',
        userId: VIEWER.userId,
        ref: { type: 'conversa', id: CONVERSA_ID },
        sampling: { maxOutputTokens: 300 },
      }),
    );
  });

  it('repassa o sinal de cancelamento, que é o que libera a vaga na GPU', async () => {
    // Arrange
    const controller = new AbortController();

    // Act
    const r = await responderNaConversa({
      viewer: VIEWER,
      conversaId: CONVERSA_ID,
      texto: TEXTO,
      signal: controller.signal,
    });
    if (!r.ok) throw new Error('esperava sucesso');
    await coletar(r.quadros);

    // Assert
    expect(mockStream.mock.calls[0][0].signal).toBe(controller.signal);
  });

  it('monta o histórico virando solicitante em user e ia em assistant', async () => {
    // Arrange
    mockLerConversa.mockResolvedValue(
      conversaLida('rascunho', [
        { autor: 'solicitante', texto: 'primeira' },
        { autor: 'ia', texto: 'resposta da ia' },
      ]),
    );

    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });
    if (!r.ok) throw new Error('esperava sucesso');
    await coletar(r.quadros);

    // Assert
    expect(mockStream.mock.calls[0][0].messages).toEqual([
      { role: 'user', content: 'primeira' },
      { role: 'assistant', content: 'resposta da ia' },
      { role: 'user', content: TEXTO },
    ]);
  });

  it('deixa a mensagem de sistema de fora, porque é aviso do Sigma e não diálogo', async () => {
    // Arrange
    mockLerConversa.mockResolvedValue(
      conversaLida('rascunho', [
        { autor: 'solicitante', texto: 'primeira' },
        { autor: 'sistema', texto: 'O assistente não conseguiu responder agora.' },
      ]),
    );

    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });
    if (!r.ok) throw new Error('esperava sucesso');
    await coletar(r.quadros);

    // Assert
    const papeis = mockStream.mock.calls[0][0].messages.map((m: { content: string }) => m.content);
    expect(papeis).not.toContain('O assistente não conseguiu responder agora.');
  });

  it('corta o histórico nas últimas 20, contando a mensagem nova', async () => {
    // Arrange: 30 anteriores mais a nova
    const anteriores = Array.from({ length: 30 }, (_, i) => ({
      autor: 'solicitante',
      texto: `mensagem ${i}`,
    }));
    mockLerConversa.mockResolvedValue(conversaLida('rascunho', anteriores));

    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });
    if (!r.ok) throw new Error('esperava sucesso');
    await coletar(r.quadros);

    // Assert
    const messages = mockStream.mock.calls[0][0].messages;
    expect(messages).toHaveLength(20);
    expect(messages.at(-1)).toEqual({ role: 'user', content: TEXTO });
  });
});

// ── portaria antes do modelo · AC-1 ──────────────────────────────

describe('responderNaConversa · antes de gastar vaga na GPU', () => {
  it('para na conversa que não existe, sem chamar o modelo', async () => {
    // Arrange
    mockLerConversa.mockResolvedValue({ ok: false, reason: 'nao_encontrada' });

    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });

    // Assert
    expect(r).toEqual({ ok: false, reason: 'nao_encontrada' });
    expect(mockStream).not.toHaveBeenCalled();
    expect(mockEnviarMensagem).not.toHaveBeenCalled();
  });

  it('para na conversa de outra pessoa, sem chamar o modelo', async () => {
    // Arrange
    mockLerConversa.mockResolvedValue({ ok: false, reason: 'sem_permissao' });

    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });

    // Assert
    expect(r).toEqual({ ok: false, reason: 'sem_permissao' });
    expect(mockStream).not.toHaveBeenCalled();
  });

  it('some com a conversa já ligada a chamado, que abre em modo leitura', async () => {
    // Arrange
    mockLerConversa.mockResolvedValue(conversaLida('vinculada'));

    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });

    // Assert: mesma resposta de inexistente, e nenhuma gravação
    expect(r).toEqual({ ok: false, reason: 'nao_encontrada' });
    expect(mockEnviarMensagem).not.toHaveBeenCalled();
    expect(mockStream).not.toHaveBeenCalled();
  });

  it('devolve o motivo quando a mensagem do solicitante não grava, sem chamar o modelo', async () => {
    // Arrange
    mockEnviarMensagem.mockResolvedValue({ ok: false, reason: 'limite_mensagens' });

    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });

    // Assert
    expect(r).toEqual({ ok: false, reason: 'limite_mensagens' });
    expect(mockStream).not.toHaveBeenCalled();
  });
});

// ── a IA falhou · AC-7 ───────────────────────────────────────────

describe('responderNaConversa · mensagem de reserva', () => {
  it('vai direto para a reserva quando a IA está desligada, sem parcial nenhum', async () => {
    // Arrange
    mockStream.mockResolvedValue({ ok: false, reason: 'disabled', meta: null });

    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });
    if (!r.ok) throw new Error('esperava sucesso');
    const quadros = await coletar(r.quadros);

    // Assert
    expect(quadros.map((q) => q.tipo)).toEqual(['inicio', 'reserva']);
  });

  it('grava a reserva como mensagem de `sistema`, com texto do Sigma', async () => {
    // Arrange
    mockStream.mockResolvedValue({ ok: false, reason: 'unavailable', meta: null });

    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });
    if (!r.ok) throw new Error('esperava sucesso');
    const quadros = await coletar(r.quadros);

    // Assert
    expect(mockEnviarMensagem).toHaveBeenLastCalledWith(
      expect.objectContaining({ autor: 'sistema', tipo: 'texto' }),
    );
    const reserva = quadros.at(-1);
    expect(reserva?.tipo).toBe('reserva');
    expect(reserva && 'texto' in reserva && reserva.texto.toLowerCase()).toContain('formulário');
  });

  it('troca o texto parcial pela reserva quando o objeto final é reprovado', async () => {
    // Arrange: chega conteúdo, mas o final não passa no schema
    mockStream.mockResolvedValue(
      fluxo(['Entendi,'], { ok: false, reason: 'invalid_output', meta: null }),
    );

    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });
    if (!r.ok) throw new Error('esperava sucesso');
    const quadros = await coletar(r.quadros);

    // Assert
    expect(quadros.map((q) => q.tipo)).toEqual(['inicio', 'parcial', 'reserva']);
  });

  it('não grava nada e não manda reserva quando quem desistiu foi a pessoa', async () => {
    // Arrange: aba fechada no meio
    mockStream.mockResolvedValue({ ok: false, reason: 'cancelled', meta: null });

    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });
    if (!r.ok) throw new Error('esperava sucesso');
    const quadros = await coletar(r.quadros);

    // Assert: só o `inicio`; nenhuma mensagem de sistema suja a conversa
    expect(quadros.map((q) => q.tipo)).toEqual(['inicio']);
    expect(mockEnviarMensagem).toHaveBeenCalledTimes(1);
  });

  it('ainda mostra a reserva na tela quando nem ela consegue ser gravada', async () => {
    // Arrange
    mockStream.mockResolvedValue({ ok: false, reason: 'timeout', meta: null });
    mockEnviarMensagem.mockImplementation(async ({ autor }: { autor: string }) =>
      autor === 'solicitante'
        ? { ok: true, destino: 'conversa', id: MSG_SOLICITANTE }
        : { ok: false, reason: 'erro' },
    );

    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });
    if (!r.ok) throw new Error('esperava sucesso');
    const quadros = await coletar(r.quadros);

    // Assert
    const reserva = quadros.at(-1);
    expect(reserva?.tipo).toBe('reserva');
    expect(reserva && 'mensagemId' in reserva && reserva.mensagemId).toBeNull();
  });

  it('nunca lança, seja qual for o motivo da IA', async () => {
    // Arrange & Act & Assert
    for (const reason of ['timeout', 'unavailable', 'circuit_open', 'busy', 'auth_error']) {
      mockStream.mockResolvedValue({ ok: false, reason, meta: null });
      const r = await responderNaConversa({
        viewer: VIEWER,
        conversaId: CONVERSA_ID,
        texto: TEXTO,
      });
      if (!r.ok) throw new Error('esperava sucesso');
      await expect(coletar(r.quadros)).resolves.toBeDefined();
    }
  });
});

// ── resposta boa que não coube · AC-5b ───────────────────────────

describe('responderNaConversa · resposta não gravada', () => {
  it('manda `fim` sem `mensagemId` e com o motivo quando o teto estourou no meio', async () => {
    // Arrange
    mockEnviarMensagem.mockImplementation(async ({ autor }: { autor: string }) =>
      autor === 'solicitante'
        ? { ok: true, destino: 'conversa', id: MSG_SOLICITANTE }
        : { ok: false, reason: 'limite_mensagens' },
    );

    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });
    if (!r.ok) throw new Error('esperava sucesso');
    const quadros = await coletar(r.quadros);

    // Assert: o texto vai para a tela mesmo sem ficar salvo
    expect(quadros.at(-1)).toEqual({
      tipo: 'fim',
      texto: finalOk.data.resposta,
      mensagemId: null,
      motivo: 'limite_mensagens',
    });
  });

  it('faz o mesmo quando o rascunho sumiu noutra aba', async () => {
    // Arrange
    mockEnviarMensagem.mockImplementation(async ({ autor }: { autor: string }) =>
      autor === 'solicitante'
        ? { ok: true, destino: 'conversa', id: MSG_SOLICITANTE }
        : { ok: false, reason: 'nao_encontrada' },
    );

    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });
    if (!r.ok) throw new Error('esperava sucesso');
    const quadros = await coletar(r.quadros);

    // Assert
    expect(quadros.at(-1)).toMatchObject({ mensagemId: null, motivo: 'nao_encontrada' });
  });

  it('registra o motivo em log, sem lançar', async () => {
    // Arrange
    mockEnviarMensagem.mockImplementation(async ({ autor }: { autor: string }) =>
      autor === 'solicitante'
        ? { ok: true, destino: 'conversa', id: MSG_SOLICITANTE }
        : { ok: false, reason: 'limite_mensagens' },
    );

    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });
    if (!r.ok) throw new Error('esperava sucesso');
    await coletar(r.quadros);

    // Assert
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('resposta nao gravada'),
      expect.stringContaining('limite_mensagens'),
    );
  });
});

// ── o que entra em log · segurança ───────────────────────────────

describe('responderNaConversa · log', () => {
  it('nunca escreve o texto do relato nem a resposta em log', async () => {
    // Arrange
    mockStream.mockResolvedValue({ ok: false, reason: 'unavailable', meta: null });

    // Act
    const r = await responderNaConversa({ viewer: VIEWER, conversaId: CONVERSA_ID, texto: TEXTO });
    if (!r.ok) throw new Error('esperava sucesso');
    await coletar(r.quadros);

    // Assert
    const tudo = (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .flat()
      .join(' ');
    expect(tudo).not.toContain(TEXTO);
    expect(tudo).not.toContain(finalOk.data.resposta);
    expect(tudo).toContain(CONVERSA_ID);
  });
});
