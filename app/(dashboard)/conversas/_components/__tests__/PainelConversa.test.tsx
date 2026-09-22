// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { ReadableStream } from 'node:stream/web';
import { TextEncoder } from 'node:util';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QuadroResposta } from '@/shared/conversas/quadro.schemas';

// ── Mocks ────────────────────────────────────────────────────────

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

vi.mock('../../actions', () => ({ descartarRascunhoAction: vi.fn() }));

import type { ConversaNaTela } from '../../_types';
import { PainelConversa } from '../PainelConversa';

/**
 * O centro da tela quando a conversa é um rascunho (spec 0003). A mesma peça
 * serve a tela de boas vindas e a conversa que já existe.
 *
 * covers: AC-3 (boas vindas com saudação, exemplos e caixa em foco),
 * AC-12 (o descarte fica à mão), AC-9 (conversa no teto)
 */

const CONVERSA_ID = '6aad5286df6f201a25eda5f1';

function conversa(over: Partial<ConversaNaTela> = {}): ConversaNaTela {
  return {
    id: CONVERSA_ID,
    situacao: 'rascunho',
    previa: 'O ar da sala 302 está pingando',
    mensagensCount: 2,
    cartaoAtualId: null,
    mensagens: [
      {
        id: 'm1',
        autor: 'solicitante',
        texto: 'O ar da sala 302 está pingando',
        em: new Date('2026-09-18T09:12:00.000Z').toISOString(),
      },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  // O jsdom não implementa rolagem; no navegador ela existe e é o que mantém a
  // conversa acompanhando o texto que cresce.
  Element.prototype.scrollIntoView = vi.fn();
});

// ── boas vindas · AC-3 ───────────────────────────────────────────

describe('PainelConversa · tela de boas vindas', () => {
  it('cumprimenta pelo primeiro nome', () => {
    // Act
    render(<PainelConversa conversa={null} primeiroNome="Bruno" mensagensMax={30} />);

    // Assert
    expect(screen.getByRole('heading', { name: 'Olá, Bruno' })).toBeInTheDocument();
  });

  it('cumprimenta sem nome quando o perfil não tem um', () => {
    // Act
    render(<PainelConversa conversa={null} primeiroNome={null} mensagensMax={30} />);

    // Assert
    expect(screen.getByRole('heading', { name: 'Olá' })).toBeInTheDocument();
  });

  it('mostra os três exemplos para começar', () => {
    // Act
    render(<PainelConversa conversa={null} primeiroNome="Bruno" mensagensMax={30} />);

    // Assert
    expect(
      screen.getByRole('button', { name: /ar condicionado da sala 302/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /lâmpada do corredor/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /elevador social/i })).toBeInTheDocument();
  });

  it('põe o exemplo clicado na caixa, sem enviar sozinho', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<PainelConversa conversa={null} primeiroNome="Bruno" mensagensMax={30} />);

    // Act
    await user.click(screen.getByRole('button', { name: /lâmpada do corredor/i }));

    // Assert: a pessoa ainda revisa antes de mandar
    expect(screen.getByRole('textbox')).toHaveValue('A lâmpada do corredor do 2º andar queimou');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('não tem cabeçalho de conversa, porque ainda não existe conversa', () => {
    // Act
    render(<PainelConversa conversa={null} primeiroNome="Bruno" mensagensMax={30} />);

    // Assert
    expect(screen.queryByRole('button', { name: /descartar/i })).not.toBeInTheDocument();
  });

  it('abre com a caixa pronta para digitar', () => {
    // Act
    render(<PainelConversa conversa={null} primeiroNome="Bruno" mensagensMax={30} />);

    // Assert
    expect(document.activeElement).toBe(screen.getByRole('textbox'));
  });

  it('começa o contador do zero', () => {
    // Act
    render(<PainelConversa conversa={null} primeiroNome="Bruno" mensagensMax={30} />);

    // Assert
    expect(screen.getByText(/0 de 30 mensagens/)).toBeInTheDocument();
  });
});

// ── conversa que já existe · AC-12 ───────────────────────────────

describe('PainelConversa · rascunho aberto', () => {
  it('usa a prévia como título e diz que ainda não é chamado', () => {
    // Act
    render(<PainelConversa conversa={conversa()} primeiroNome={null} mensagensMax={30} />);

    // Assert
    expect(
      screen.getByRole('heading', { name: 'O ar da sala 302 está pingando' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ainda não é um chamado/i)).toBeInTheDocument();
  });

  it('mostra a marca de rascunho', () => {
    // Act
    render(<PainelConversa conversa={conversa()} primeiroNome={null} mensagensMax={30} />);

    // Assert
    expect(screen.getByText('Rascunho')).toBeInTheDocument();
  });

  it('deixa o descarte à mão', () => {
    // Act
    render(<PainelConversa conversa={conversa()} primeiroNome={null} mensagensMax={30} />);

    // Assert
    expect(screen.getByRole('button', { name: /descartar/i })).toBeInTheDocument();
  });

  it('põe o foco no título ao abrir, que é o que orienta no celular', () => {
    // Act
    render(<PainelConversa conversa={conversa()} primeiroNome={null} mensagensMax={30} />);

    // Assert
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'O ar da sala 302 está pingando' }),
    );
  });

  it('mostra as mensagens em vez das boas vindas', () => {
    // Act
    render(<PainelConversa conversa={conversa()} primeiroNome="Bruno" mensagensMax={30} />);

    // Assert
    expect(screen.queryByRole('heading', { name: /Olá/ })).not.toBeInTheDocument();
    expect(
      screen.getByText('O ar da sala 302 está pingando', { selector: 'p' }),
    ).toBeInTheDocument();
  });

  it('oferece voltar para a lista, que é o caminho do celular', () => {
    // Act
    render(<PainelConversa conversa={conversa()} primeiroNome={null} mensagensMax={30} />);

    // Assert
    expect(screen.getByRole('link', { name: /voltar para a lista/i })).toHaveAttribute(
      'href',
      '/conversas',
    );
  });

  it('aguenta rascunho sem prévia', () => {
    // Act
    render(
      <PainelConversa
        conversa={conversa({ previa: '  ', mensagens: [] })}
        primeiroNome={null}
        mensagensMax={30}
      />,
    );

    // Assert
    expect(screen.getByRole('heading', { name: 'Conversa sem texto' })).toBeInTheDocument();
  });
});

// ── conversa no teto · AC-9 ──────────────────────────────────────

describe('PainelConversa · conversa no limite', () => {
  it('troca a caixa pelo aviso quando chega em 30', () => {
    // Act
    render(
      <PainelConversa
        conversa={conversa({ mensagensCount: 30 })}
        primeiroNome={null}
        mensagensMax={30}
      />,
    );

    // Assert
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText(/limite de mensagens/i)).toBeInTheDocument();
  });
});

// ── conversa virando chamado ─────────────────────────────────────

describe('PainelConversa · confirmação em andamento', () => {
  it('não aceita mensagem nova e explica o que está acontecendo', () => {
    // Act
    render(
      <PainelConversa
        conversa={conversa({ situacao: 'reservada' })}
        primeiroNome={null}
        mensagensMax={30}
      />,
    );

    // Assert
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText(/virando chamado neste instante/i)).toBeInTheDocument();
    expect(screen.getByText('Confirmando')).toBeInTheDocument();
  });
});

// ── acessibilidade · AC-8 ────────────────────────────────────────

describe('PainelConversa · acessibilidade', () => {
  it('a região da conversa tem nome', () => {
    // Act
    render(<PainelConversa conversa={conversa()} primeiroNome={null} mensagensMax={30} />);

    // Assert
    expect(screen.getByRole('region', { name: 'Conversa' })).toBeInTheDocument();
  });

  it('a região de boas vindas também tem nome', () => {
    // Act
    render(<PainelConversa conversa={null} primeiroNome={null} mensagensMax={30} />);

    // Assert
    expect(screen.getByRole('region', { name: 'Nova conversa' })).toBeInTheDocument();
  });

  it('tem a região ao vivo pronta desde o começo', () => {
    // Act
    render(<PainelConversa conversa={null} primeiroNome={null} mensagensMax={30} />);

    // Assert
    const regiao = screen.getByRole('status');
    expect(regiao).toHaveAttribute('aria-live', 'polite');
    expect(regiao).toHaveAttribute('aria-atomic', 'true');
  });
});

// ── resposta que não fica salva · AC-5b ──────────────────────────

/** Uma resposta NDJSON com os quadros dados, como a rota devolve. */
function fluxo(quadros: QuadroResposta[]): Response {
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

/** Quadros de uma resposta boa que não coube no banco (o `fim` vem sem id). */
function quadrosSemGravar(motivo: 'nao_encontrada' | 'limite_mensagens'): QuadroResposta[] {
  return [
    { tipo: 'inicio', conversaId: CONVERSA_ID, mensagemId: '6aad5286df6f201a25eda5f2' },
    { tipo: 'parcial', texto: 'Entendi,' },
    {
      tipo: 'fim',
      texto: 'Entendi, o ar da sala 302 está pingando.',
      mensagemId: null,
      motivo,
    },
  ];
}

async function enviarEsperandoResposta(): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox'), 'Continua pingando');
  await user.click(screen.getByRole('button', { name: /enviar mensagem/i }));
  await screen.findByText(/não ficou salva/i);
}

describe('PainelConversa · resposta boa que não pôde ser gravada', () => {
  it('não recarrega a rota, porque a recarga cairia no 404 e levaria a resposta junto', async () => {
    // Arrange: o rascunho foi descartado noutra aba enquanto a resposta vinha.
    vi.mocked(fetch).mockResolvedValue(
      fluxo(quadrosSemGravar('nao_encontrada')) as unknown as Response,
    );
    render(<PainelConversa conversa={conversa()} primeiroNome={null} mensagensMax={30} />);

    // Act
    await enviarEsperandoResposta();

    // Assert: a tela fica onde está, com a resposta e o aviso à vista
    expect(router.refresh).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(
      screen.getByText('Entendi, o ar da sala 302 está pingando.', { selector: 'p' }),
    ).toBeInTheDocument();
  });

  it('também segura a recarga quando o teto de 30 foi atingido no meio', async () => {
    // Arrange
    vi.mocked(fetch).mockResolvedValue(
      fluxo(quadrosSemGravar('limite_mensagens')) as unknown as Response,
    );
    render(<PainelConversa conversa={conversa()} primeiroNome={null} mensagensMax={30} />);

    // Act
    await enviarEsperandoResposta();

    // Assert
    expect(router.refresh).not.toHaveBeenCalled();
    expect(
      screen.getByText('Entendi, o ar da sala 302 está pingando.', { selector: 'p' }),
    ).toBeInTheDocument();
  });

  it('recarrega normalmente quando a resposta foi gravada', async () => {
    // Arrange
    vi.mocked(fetch).mockResolvedValue(
      fluxo([
        { tipo: 'inicio', conversaId: CONVERSA_ID, mensagemId: '6aad5286df6f201a25eda5f2' },
        {
          tipo: 'fim',
          texto: 'Entendi, o ar da sala 302 está pingando.',
          mensagemId: '6aad5286df6f201a25eda5f3',
          motivo: null,
        },
      ]) as unknown as Response,
    );
    render(<PainelConversa conversa={conversa()} primeiroNome={null} mensagensMax={30} />);

    // Act
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox'), 'Continua pingando');
    await user.click(screen.getByRole('button', { name: /enviar mensagem/i }));

    // Assert
    await screen.findByText('Entendi, o ar da sala 302 está pingando.', { selector: 'p' });
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.queryByText(/não ficou salva/i)).not.toBeInTheDocument();
  });
});
