// @vitest-environment jsdom
import { ReadableStream } from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { QuadroResposta } from '@/shared/conversas/quadro.schemas';

import type { MensagemNaTela } from '../../_types';
import { useEnvio } from '../useEnvio';

/**
 * O envio pela tela e a leitura do fluxo de quadros (spec 0003). Duas promessas
 * mandam aqui: o texto digitado nunca se perde quando falha, e a nova tentativa
 * nunca cria um segundo rascunho.
 *
 * covers: AC-4 (envio otimista, `Tentar de novo`, rota com id), AC-5 (quadros),
 * AC-5b (resposta não salva), AC-8 (o que a região ao vivo recebe)
 */

const CONVERSA_ID = '6aad5286df6f201a25eda5f1';
const MSG_SOLICITANTE = '6aad5286df6f201a25eda5f2';
const MSG_IA = '6aad5286df6f201a25eda5f3';

/**
 * O fluxo do Node e o do navegador se comportam igual; só os tipos não se
 * reconhecem, daí a conversão explícita ao montar a resposta.
 */

/** Uma resposta NDJSON com os quadros dados, como a rota devolve. */
function resposta(quadros: QuadroResposta[], status = 200): Response {
  const corpo = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const q of quadros) controller.enqueue(enc.encode(`${JSON.stringify(q)}\n`));
      controller.close();
    },
  });
  return new Response(corpo as unknown as BodyInit, {
    status,
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

function erro(status: number, reason: string): Response {
  return new Response(JSON.stringify({ reason }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const QUADROS_OK: QuadroResposta[] = [
  { tipo: 'inicio', conversaId: CONVERSA_ID, mensagemId: MSG_SOLICITANTE },
  { tipo: 'parcial', texto: 'Entendi,' },
  { tipo: 'parcial', texto: 'Entendi, iluminação apagada.' },
  { tipo: 'fim', texto: 'Entendi, iluminação apagada.', mensagemId: MSG_IA, motivo: null },
];

const mockFetch = vi.fn();

function montar(over: Partial<Parameters<typeof useEnvio>[0]> = {}) {
  const aoConcluir = vi.fn();
  const doServidor: MensagemNaTela[] = [];
  const hook = renderHook(() =>
    useEnvio({
      conversaId: null,
      doServidor,
      contagemInicial: 0,
      mensagensMax: 30,
      aoConcluir,
      ...over,
    }),
  );
  return { ...hook, aoConcluir };
}

beforeEach(() => {
  vi.clearAllMocks();
  // O jsdom não traz os utilitários de fluxo; os do Node são os mesmos que o
  // navegador oferece em produção.
  vi.stubGlobal('ReadableStream', ReadableStream);
  vi.stubGlobal('TextEncoder', TextEncoder);
  vi.stubGlobal('TextDecoder', TextDecoder);
  vi.stubGlobal('fetch', mockFetch);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockFetch.mockResolvedValue(resposta(QUADROS_OK));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── caminho feliz · AC-5 ─────────────────────────────────────────

describe('useEnvio · envio que dá certo', () => {
  it('usa a rota sem id quando a conversa ainda não existe', async () => {
    // Arrange
    const { result } = montar();

    // Act
    await act(() => result.current.enviar('A lâmpada queimou'));

    // Assert
    expect(mockFetch.mock.calls[0][0]).toBe('/api/conversas/mensagens');
  });

  it('usa a rota com id quando a conversa já existe', async () => {
    // Arrange
    const { result } = montar({ conversaId: CONVERSA_ID });

    // Act
    await act(() => result.current.enviar('segunda mensagem'));

    // Assert
    expect(mockFetch.mock.calls[0][0]).toBe(`/api/conversas/${CONVERSA_ID}/mensagens`);
  });

  it('mostra a mensagem do solicitante e a resposta do assistente, nessa ordem', async () => {
    // Arrange
    const { result } = montar();

    // Act
    await act(() => result.current.enviar('A lâmpada queimou'));

    // Assert
    await waitFor(() => {
      expect(result.current.mensagens.map((m) => m.autor)).toEqual(['solicitante', 'ia']);
    });
    expect(result.current.mensagens[0].texto).toBe('A lâmpada queimou');
  });

  it('limpa o pendente assim que o `inicio` chega', async () => {
    // Arrange
    const { result } = montar();

    // Act
    await act(() => result.current.enviar('relato'));

    // Assert
    expect(result.current.pendente).toBeNull();
  });

  it('conta a mensagem gravada contra o teto de 30', async () => {
    // Arrange
    const { result } = montar({ contagemInicial: 4 });

    // Act
    await act(() => result.current.enviar('relato'));

    // Assert: a do solicitante e a da IA
    await waitFor(() => expect(result.current.contagem).toBe(6));
  });

  it('avisa quem chamou que terminou, com o id da conversa', async () => {
    // Arrange
    const { result, aoConcluir } = montar();

    // Act
    await act(() => result.current.enviar('relato'));

    // Assert
    expect(aoConcluir).toHaveBeenCalledWith({ conversaId: CONVERSA_ID, preservar: false });
  });

  it('ignora um envio novo enquanto o anterior ainda está indo', async () => {
    // Arrange: a primeira requisição fica pendurada, como uma resposta lenta
    let liberar: (r: Response) => void = () => undefined;
    mockFetch.mockReturnValueOnce(new Promise<Response>((r) => (liberar = r)));
    const { result } = montar();

    // Act: dispara a primeira e deixa o React assentar o estado
    let primeira: Promise<void> | undefined;
    await act(async () => {
      primeira = result.current.enviar('primeira');
      await Promise.resolve();
    });
    expect(result.current.enviando).toBe(true);

    // Act: a segunda chega com o envio em andamento
    await act(() => result.current.enviar('segunda'));

    // Assert: nada de segunda requisição
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Limpa: solta a primeira para o teste não terminar com promessa solta
    await act(async () => {
      liberar(resposta(QUADROS_OK));
      await primeira;
    });
  });

  it('não envia texto vazio nem só espaço', async () => {
    // Arrange
    const { result } = montar();

    // Act
    await act(() => result.current.enviar('   '));

    // Assert
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('tira o espaço das pontas antes de mandar', async () => {
    // Arrange
    const { result } = montar();

    // Act
    await act(() => result.current.enviar('  relato  '));

    // Assert
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ texto: 'relato' });
  });
});

// ── o texto que cresce · AC-5, AC-8 ──────────────────────────────

describe('useEnvio · enquanto o assistente escreve', () => {
  it('limpa o parcial quando a resposta termina', async () => {
    // Arrange
    const { result } = montar();

    // Act
    await act(() => result.current.enviar('relato'));

    // Assert
    expect(result.current.parcial).toBeNull();
    expect(result.current.respondendo).toBe(false);
  });

  it('anuncia primeiro que está respondendo e depois o texto inteiro', async () => {
    // Arrange
    const { result } = montar();

    // Act
    await act(() => result.current.enviar('relato'));

    // Assert: o último anúncio é a resposta completa
    expect(result.current.anuncio).toBe('Entendi, iluminação apagada.');
  });

  it('ignora quadro que não entende, sem quebrar o fluxo', async () => {
    // Arrange
    const corpo = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(enc.encode('{ isto não é json\n'));
        controller.enqueue(enc.encode('\n'));
        for (const q of QUADROS_OK) controller.enqueue(enc.encode(`${JSON.stringify(q)}\n`));
        controller.close();
      },
    });
    mockFetch.mockResolvedValue(new Response(corpo as unknown as BodyInit, { status: 200 }));
    const { result } = montar();

    // Act
    await act(() => result.current.enviar('relato'));

    // Assert
    await waitFor(() => expect(result.current.mensagens).toHaveLength(2));
  });

  it('aguenta quadro partido em dois pedaços da rede', async () => {
    // Arrange
    const texto = QUADROS_OK.map((q) => `${JSON.stringify(q)}\n`).join('');
    const corte = Math.floor(texto.length / 2);
    const corpo = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(enc.encode(texto.slice(0, corte)));
        controller.enqueue(enc.encode(texto.slice(corte)));
        controller.close();
      },
    });
    mockFetch.mockResolvedValue(new Response(corpo as unknown as BodyInit, { status: 200 }));
    const { result } = montar();

    // Act
    await act(() => result.current.enviar('relato'));

    // Assert
    await waitFor(() => expect(result.current.mensagens).toHaveLength(2));
  });
});

// ── falha e nova tentativa · AC-4 ────────────────────────────────

describe('useEnvio · quando falha', () => {
  it('guarda o texto digitado e explica o motivo em português', async () => {
    // Arrange
    mockFetch.mockResolvedValue(erro(409, 'limite_rascunhos'));
    const { result } = montar();

    // Act
    await act(() => result.current.enviar('meu relato'));

    // Assert
    expect(result.current.pendente?.texto).toBe('meu relato');
    expect(result.current.pendente?.frase).toContain('5 conversas');
  });

  it('cai na frase de rede quando a requisição nem chega', async () => {
    // Arrange
    mockFetch.mockRejectedValue(new TypeError('failed to fetch'));
    const { result } = montar();

    // Act
    await act(() => result.current.enviar('meu relato'));

    // Assert
    expect(result.current.pendente?.frase).toContain('conexão');
  });

  it('reenvia o mesmo texto no `Tentar de novo`, sem a pessoa redigitar', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce(erro(500, 'erro')).mockResolvedValue(resposta(QUADROS_OK));
    const { result } = montar();
    await act(() => result.current.enviar('meu relato'));

    // Act
    await act(() => {
      result.current.tentarDeNovo();
    });

    // Assert
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({ texto: 'meu relato' });
  });

  it('a nova tentativa vai pela rota sem id quando nenhum rascunho chegou a existir', async () => {
    // Arrange
    mockFetch.mockResolvedValue(erro(409, 'limite_rascunhos'));
    const { result } = montar();
    await act(() => result.current.enviar('relato'));

    // Act
    await act(() => {
      result.current.tentarDeNovo();
    });

    // Assert
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(mockFetch.mock.calls[1][0]).toBe('/api/conversas/mensagens');
  });

  it('a nova tentativa vai pela rota com id assim que o `inicio` já chegou', async () => {
    // Arrange: o primeiro envio cria a conversa, o segundo falha
    mockFetch
      .mockResolvedValueOnce(resposta(QUADROS_OK))
      .mockResolvedValueOnce(erro(500, 'erro'))
      .mockResolvedValue(resposta(QUADROS_OK));
    const { result } = montar();
    await act(() => result.current.enviar('primeira'));
    await act(() => result.current.enviar('segunda'));

    // Act
    await act(() => {
      result.current.tentarDeNovo();
    });

    // Assert: nunca um segundo rascunho
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
    expect(mockFetch.mock.calls[2][0]).toBe(`/api/conversas/${CONVERSA_ID}/mensagens`);
  });

  it('não chama quem espera o fim quando a conversa nem chegou a existir', async () => {
    // Arrange
    mockFetch.mockResolvedValue(erro(409, 'limite_rascunhos'));
    const { result, aoConcluir } = montar();

    // Act
    await act(() => result.current.enviar('relato'));

    // Assert
    expect(aoConcluir).not.toHaveBeenCalled();
  });
});

// ── resposta que não ficou salva · AC-5b ─────────────────────────

describe('useEnvio · resposta não salva', () => {
  const semGravar: QuadroResposta[] = [
    { tipo: 'inicio', conversaId: CONVERSA_ID, mensagemId: MSG_SOLICITANTE },
    {
      tipo: 'fim',
      texto: 'Resposta boa que não coube.',
      mensagemId: null,
      motivo: 'limite_mensagens',
    },
  ];

  it('mostra a resposta mesmo assim, com o aviso de que não fica salva', async () => {
    // Arrange
    mockFetch.mockResolvedValue(resposta(semGravar));
    const { result } = montar();

    // Act
    await act(() => result.current.enviar('relato'));

    // Assert
    await waitFor(() => expect(result.current.mensagens).toHaveLength(2));
    expect(result.current.aviso).toContain('não ficou salva');
  });

  it('não conta a mensagem que não foi gravada contra o teto', async () => {
    // Arrange
    mockFetch.mockResolvedValue(resposta(semGravar));
    const { result } = montar({ contagemInicial: 10 });

    // Act
    await act(() => result.current.enviar('relato'));

    // Assert: só a do solicitante entrou
    await waitFor(() => expect(result.current.contagem).toBe(11));
  });

  it('pede para quem chamou não sair da tela, senão a resposta se perde', async () => {
    // Arrange
    mockFetch.mockResolvedValue(resposta(semGravar));
    const { result, aoConcluir } = montar();

    // Act
    await act(() => result.current.enviar('relato'));

    // Assert
    expect(aoConcluir).toHaveBeenCalledWith({ conversaId: CONVERSA_ID, preservar: true });
  });
});

// ── a reserva da IA · AC-7 ───────────────────────────────────────

describe('useEnvio · a IA falhou', () => {
  it('mostra a mensagem de sistema no lugar da resposta', async () => {
    // Arrange
    mockFetch.mockResolvedValue(
      resposta([
        { tipo: 'inicio', conversaId: CONVERSA_ID, mensagemId: MSG_SOLICITANTE },
        {
          tipo: 'reserva',
          texto: 'O assistente está desligado no momento.',
          mensagemId: MSG_IA,
          motivo: 'disabled',
        },
      ]),
    );
    const { result } = montar();

    // Act
    await act(() => result.current.enviar('relato'));

    // Assert
    await waitFor(() => {
      expect(result.current.mensagens.map((m) => m.autor)).toEqual(['solicitante', 'sistema']);
    });
  });
});

// ── o que vem do servidor manda · AC-5 ───────────────────────────

describe('useEnvio · junção com o servidor', () => {
  it('mostra o que o servidor já conhece, sem repetir o que nasceu aqui', async () => {
    // Arrange: o servidor já sabe da mensagem que este envio criou
    const doServidor: MensagemNaTela[] = [
      { id: MSG_SOLICITANTE, autor: 'solicitante', texto: 'relato', em: new Date().toISOString() },
      { id: MSG_IA, autor: 'ia', texto: 'Entendi.', em: new Date().toISOString() },
    ];
    const { result } = montar({ doServidor, contagemInicial: 2 });

    // Act
    await act(() => result.current.enviar('relato'));

    // Assert: nada duplicado, e a contagem não conta duas vezes
    await waitFor(() => expect(result.current.mensagens).toHaveLength(2));
    expect(result.current.contagem).toBe(2);
  });

  it('avisa quando a conversa chegou ao teto', () => {
    // Act
    const { result } = montar({ contagemInicial: 30 });

    // Assert
    expect(result.current.noLimite).toBe(true);
  });

  it('não avisa de teto antes da hora', () => {
    // Act
    const { result } = montar({ contagemInicial: 29 });

    // Assert
    expect(result.current.noLimite).toBe(false);
  });
});
