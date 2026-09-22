// @vitest-environment jsdom
import { ReadableStream } from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CartaoPayload } from '@/shared/conversas/conversa.schemas';
import type { QuadroResposta } from '@/shared/conversas/quadro.schemas';

import { CARTAO_PRONTO_ANUNCIO } from '../../_constants';
import type { MensagemNaTela } from '../../_types';
import { useEnvio } from '../useEnvio';

/**
 * O cartão resumo chegando pela tela (spec 0004): pelo quadro `cartao`, depois
 * de `fim` ou `reserva`, ou pelo `Revisar e abrir`.
 *
 * covers: AC-4 (cartão novo e cartão que deixa de valer), AC-12 (só um cartão
 * vale), AC-13 (cartão fora do teto), AC-18 (uma única atualização da região
 * ao vivo por fluxo)
 */

const CONVERSA_ID = '6aad5286df6f201a25eda5f1';
const MSG_SOLICITANTE = '6aad5286df6f201a25eda5f2';
const MSG_IA = '6aad5286df6f201a25eda5f3';
const CARTAO_ID = '6aad5286df6f201a25eda5f5';
const CARTAO_VELHO = '6aad5286df6f201a25eda5f6';

const CARTAO: CartaoPayload = {
  modo: 'ia',
  servico: {
    catalogServiceId: '6aad5286df6f201a25edb001',
    subtypeId: '6aad5286df6f201a25edb002',
    tipoServico: 'Manutenção Predial',
    rotuloServico: 'Troca de lâmpada',
    rotuloSubtipo: 'Iluminação',
  },
  unidade: { unitId: '6aad5286df6f201a25edc001', rotulo: 'Fórum Central', andar: '3º andar' },
  localExato: 'Sala 302',
  faltando: [],
};

const RESPOSTA = 'Entendi: a lâmpada da sala 302 queimou.';

function resposta(quadros: QuadroResposta[]): Response {
  const corpo = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const q of quadros) controller.enqueue(enc.encode(`${JSON.stringify(q)}\n`));
      controller.close();
    },
  });
  return new Response(corpo as unknown as BodyInit, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

const COM_CARTAO: QuadroResposta[] = [
  { tipo: 'inicio', conversaId: CONVERSA_ID, mensagemId: MSG_SOLICITANTE },
  { tipo: 'parcial', texto: 'Entendi' },
  { tipo: 'fim', texto: RESPOSTA, mensagemId: MSG_IA, motivo: null },
  { tipo: 'cartao', mensagemId: CARTAO_ID, cartao: CARTAO, substituiId: null },
];

const mockFetch = vi.fn();

function montar(over: Partial<Parameters<typeof useEnvio>[0]> = {}) {
  const aoConcluir = vi.fn();
  const doServidor: MensagemNaTela[] = [];
  // Todo valor que a região ao vivo recebeu, render a render.
  const anuncios: string[] = [];
  const hook = renderHook((props: Partial<Parameters<typeof useEnvio>[0]>) => {
    const envio = useEnvio({
      conversaId: CONVERSA_ID,
      doServidor,
      contagemInicial: 2,
      mensagensMax: 30,
      aoConcluir,
      ...over,
      ...props,
    });
    if (anuncios.at(-1) !== envio.anuncio) anuncios.push(envio.anuncio);
    return envio;
  });
  return { ...hook, aoConcluir, anuncios };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('ReadableStream', ReadableStream);
  vi.stubGlobal('TextEncoder', TextEncoder);
  vi.stubGlobal('TextDecoder', TextDecoder);
  vi.stubGlobal('fetch', mockFetch);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockFetch.mockResolvedValue(resposta(COM_CARTAO));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useEnvio · cartão pelo quadro', () => {
  it('põe o cartão na lista depois da resposta e o marca como o que vale', async () => {
    // Arrange
    const { result } = montar();

    // Act
    await act(() => result.current.enviar('A lâmpada queimou'));

    // Assert
    const ultima = result.current.mensagens.at(-1);
    expect(ultima).toMatchObject({ id: CARTAO_ID, tipo: 'cartao', autor: 'ia', cartao: CARTAO });
    expect(result.current.cartaoAtualId).toBe(CARTAO_ID);
  });

  it('não conta o cartão no teto de mensagens (AC-13)', async () => {
    // Arrange
    const { result } = montar();

    // Act
    await act(() => result.current.enviar('A lâmpada queimou'));

    // Assert: 2 do servidor mais a do solicitante e a da IA, sem o cartão
    expect(result.current.contagem).toBe(4);
  });

  it('anuncia uma vez só, no fim, a resposta seguida da frase do cartão (AC-18)', async () => {
    // Arrange
    const { result, anuncios } = montar();

    // Act
    await act(() => result.current.enviar('A lâmpada queimou'));

    // Assert: a resposta sozinha nunca foi anunciada antes da frase do cartão
    expect(anuncios).not.toContain(RESPOSTA);
    expect(anuncios.at(-1)).toBe(`${RESPOSTA} ${CARTAO_PRONTO_ANUNCIO}`);
  });

  it('sem cartão novo, anuncia só a resposta', async () => {
    // Arrange
    mockFetch.mockResolvedValue(resposta(COM_CARTAO.slice(0, 3)));
    const { result } = montar();

    // Act
    await act(() => result.current.enviar('A lâmpada queimou'));

    // Assert
    expect(result.current.anuncio).toBe(RESPOSTA);
  });

  it('cartão que deixa de valer: nenhum cartão fica atual e nada entra na lista', async () => {
    // Arrange
    mockFetch.mockResolvedValue(
      resposta([
        ...COM_CARTAO.slice(0, 3),
        { tipo: 'cartao', mensagemId: null, cartao: null, substituiId: CARTAO_VELHO },
      ]),
    );
    const { result } = montar({ cartaoAtualDoServidor: CARTAO_VELHO });

    // Act
    await act(() => result.current.enviar('Na verdade é a tomada.'));

    // Assert
    expect(result.current.cartaoAtualId).toBeNull();
    expect(result.current.mensagens.some((m) => m.tipo === 'cartao')).toBe(false);
    expect(result.current.anuncio).toBe(RESPOSTA);
  });

  it('volta a seguir o servidor quando a recarga traz um ponteiro novo', async () => {
    // Arrange
    const { result, rerender } = montar({ cartaoAtualDoServidor: null });
    await act(() => result.current.enviar('A lâmpada queimou'));
    expect(result.current.cartaoAtualId).toBe(CARTAO_ID);

    // Act: outra aba gravou outro cartão; a recarga traz o ponteiro dele
    rerender({ cartaoAtualDoServidor: CARTAO_VELHO });

    // Assert
    expect(result.current.cartaoAtualId).toBe(CARTAO_VELHO);
  });
});

describe('useEnvio · cartão do `Revisar e abrir`', () => {
  it('põe o cartão na lista e anuncia só a frase do cartão (AC-18)', () => {
    // Arrange
    const { result } = montar();

    // Act
    act(() =>
      result.current.aplicarCartaoRevisado({
        mensagemId: CARTAO_ID,
        cartao: { ...CARTAO, modo: 'manual', servico: null, faltando: ['tipo'] },
        substituiId: null,
      }),
    );

    // Assert
    expect(result.current.mensagens.at(-1)).toMatchObject({ id: CARTAO_ID, autor: 'sistema' });
    expect(result.current.cartaoAtualId).toBe(CARTAO_ID);
    expect(result.current.anuncio).toBe(CARTAO_PRONTO_ANUNCIO);
  });

  it('o mesmo cartão devolvido de novo não entra duas vezes', () => {
    // Arrange
    const { result } = montar();
    const recebido = { mensagemId: CARTAO_ID, cartao: CARTAO, substituiId: null };

    // Act
    act(() => result.current.aplicarCartaoRevisado(recebido));
    act(() => result.current.aplicarCartaoRevisado(recebido));

    // Assert
    expect(result.current.mensagens.filter((m) => m.id === CARTAO_ID)).toHaveLength(1);
  });
});
