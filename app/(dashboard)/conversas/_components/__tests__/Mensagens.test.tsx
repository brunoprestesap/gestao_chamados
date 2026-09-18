// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { MensagemNaTela } from '../../_types';
import {
  BolhaAssistente,
  BolhaNaoEnviada,
  CartaoSistema,
  ListaMensagens,
  RegiaoAoVivo,
  Respondendo,
  viraDia,
} from '../Mensagens';

/**
 * As mensagens da conversa (spec 0003). O que mais importa aqui é o que o
 * leitor de tela ouve: a bolha que cresce fica escondida dele, e quem avisa é
 * a região ao vivo, uma vez só.
 *
 * covers: AC-8 (região ao vivo e bolha em construção), AC-4 (não enviada e
 * `Tentar de novo`), AC-7 (cartão do sistema com o formulário)
 */

const HOJE = new Date('2026-09-18T09:12:00.000Z').toISOString();

function mensagem(over: Partial<MensagemNaTela> = {}): MensagemNaTela {
  return { id: 'm1', autor: 'solicitante', texto: 'A lâmpada queimou.', em: HOJE, ...over };
}

// ── a bolha que cresce · AC-8 ────────────────────────────────────

describe('BolhaAssistente', () => {
  it('fica escondida do leitor de tela enquanto o texto cresce', () => {
    // Act
    const { container } = render(<BolhaAssistente texto="Entendi que" emConstrucao />);

    // Assert: sem isso o leitor leria pedaço a pedaço
    expect(container.querySelector('p[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('volta a ser lida quando a resposta termina', () => {
    // Act
    const { container } = render(<BolhaAssistente texto="Entendi tudo." em={HOJE} />);

    // Assert
    expect(container.querySelector('p[aria-hidden="true"]')).not.toBeInTheDocument();
    expect(screen.getByText('Entendi tudo.')).toBeInTheDocument();
  });

  it('só mostra o horário quando a mensagem já tem um', () => {
    // Act
    const { container } = render(<BolhaAssistente texto="crescendo" emConstrucao />);

    // Assert
    expect(container.querySelector('time')).not.toBeInTheDocument();
  });

  it('marca o horário como `<time>` legível por máquina', () => {
    // Act
    const { container } = render(<BolhaAssistente texto="pronta" em={HOJE} />);

    // Assert
    expect(container.querySelector('time')).toHaveAttribute('datetime', HOJE);
  });
});

// ── a região ao vivo · AC-8 ──────────────────────────────────────

describe('RegiaoAoVivo', () => {
  it('é educada e anuncia o texto inteiro de uma vez', () => {
    // Act
    render(<RegiaoAoVivo texto="O assistente está respondendo" />);

    // Assert
    const regiao = screen.getByRole('status');
    expect(regiao).toHaveAttribute('aria-live', 'polite');
    expect(regiao).toHaveAttribute('aria-atomic', 'true');
    expect(regiao).toHaveTextContent('O assistente está respondendo');
  });

  it('não ocupa espaço na tela, só no leitor', () => {
    // Act
    render(<RegiaoAoVivo texto="anúncio" />);

    // Assert
    expect(screen.getByRole('status').className).toContain('sr-only');
  });
});

describe('Respondendo', () => {
  it('diz em texto que o assistente está respondendo, não só com pontinhos', () => {
    // Act
    render(<Respondendo />);

    // Assert
    expect(screen.getByText(/O assistente está respondendo/i)).toBeInTheDocument();
  });
});

// ── a mensagem que não foi · AC-4 ────────────────────────────────

describe('BolhaNaoEnviada', () => {
  it('mostra o texto digitado, que nunca se perde', () => {
    // Act
    render(
      <BolhaNaoEnviada
        texto="A mancha está perto da tomada"
        frase="Não deu para falar com o Sigma."
        onTentarDeNovo={vi.fn()}
        enviando={false}
      />,
    );

    // Assert
    expect(screen.getByText('A mancha está perto da tomada')).toBeInTheDocument();
  });

  it('explica em português o que aconteceu', () => {
    // Act
    render(
      <BolhaNaoEnviada
        texto="relato"
        frase="Você já tem 5 conversas em aberto."
        onTentarDeNovo={vi.fn()}
        enviando={false}
      />,
    );

    // Assert
    expect(screen.getByText('Você já tem 5 conversas em aberto.')).toBeInTheDocument();
  });

  it('oferece tentar de novo, e chama quem sabe reenviar', async () => {
    // Arrange
    const user = userEvent.setup();
    const onTentarDeNovo = vi.fn();
    render(
      <BolhaNaoEnviada
        texto="relato"
        frase="falhou"
        onTentarDeNovo={onTentarDeNovo}
        enviando={false}
      />,
    );

    // Act
    await user.click(screen.getByRole('button', { name: /tentar de novo/i }));

    // Assert
    expect(onTentarDeNovo).toHaveBeenCalledOnce();
  });

  it('não deixa tentar duas vezes ao mesmo tempo', () => {
    // Act
    render(<BolhaNaoEnviada texto="relato" frase="falhou" onTentarDeNovo={vi.fn()} enviando />);

    // Assert
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeDisabled();
  });

  it('enquanto está indo, mostra que está enviando e não oferece tentar de novo', () => {
    // Act
    render(<BolhaNaoEnviada texto="relato" frase={null} onTentarDeNovo={vi.fn()} enviando />);

    // Assert
    expect(screen.getByText(/enviando/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tentar de novo/i })).not.toBeInTheDocument();
  });
});

// ── o aviso do sistema · AC-7 ────────────────────────────────────

describe('CartaoSistema', () => {
  it('mostra o texto do Sigma e oferece o formulário', () => {
    // Act
    render(<CartaoSistema texto="O assistente não conseguiu responder agora." em={HOJE} />);

    // Assert
    expect(screen.getByText(/não conseguiu responder/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /abrir por formulário/i })).toHaveAttribute(
      'href',
      '/meus-chamados',
    );
  });

  it('deixa claro que quem falou foi o sistema', () => {
    // Act
    render(<CartaoSistema texto="aviso" em={HOJE} />);

    // Assert
    expect(screen.getByText(/sistema/i)).toBeInTheDocument();
  });
});

// ── a lista e o separador de dia ─────────────────────────────────

describe('ListaMensagens', () => {
  it('desenha cada mensagem pelo autor dela', () => {
    // Act
    render(
      <ListaMensagens
        mensagens={[
          mensagem({ id: 'm1', autor: 'solicitante', texto: 'meu relato' }),
          mensagem({ id: 'm2', autor: 'ia', texto: 'entendi' }),
          mensagem({ id: 'm3', autor: 'sistema', texto: 'o assistente falhou' }),
        ]}
      />,
    );

    // Assert
    expect(screen.getByText('meu relato')).toBeInTheDocument();
    expect(screen.getByText('entendi')).toBeInTheDocument();
    expect(screen.getByText('o assistente falhou')).toBeInTheDocument();
  });

  it('não desenha nada com a lista vazia', () => {
    // Act
    const { container } = render(<ListaMensagens mensagens={[]} />);

    // Assert
    expect(container).toBeEmptyDOMElement();
  });

  it('põe um separador só no primeiro item do dia', () => {
    // Arrange: duas do mesmo dia
    const cedo = new Date('2026-09-18T08:00:00.000Z').toISOString();
    const tarde = new Date('2026-09-18T18:00:00.000Z').toISOString();

    // Act
    render(
      <ListaMensagens
        mensagens={[mensagem({ id: 'a', em: cedo }), mensagem({ id: 'b', em: tarde })]}
      />,
    );

    // Assert
    expect(screen.getAllByText(/hoje|de setembro/i)).toHaveLength(1);
  });
});

describe('viraDia', () => {
  it('vira no primeiro item, que nunca tem anterior', () => {
    // Act & Assert
    expect(viraDia(HOJE, undefined)).toBe(true);
  });

  it('não vira dentro do mesmo dia', () => {
    // Act & Assert
    expect(
      viraDia(new Date(2026, 8, 18, 18, 0).toISOString(), {
        em: new Date(2026, 8, 18, 8, 0).toISOString(),
      }),
    ).toBe(false);
  });

  it('vira na troca de dia', () => {
    // Act & Assert
    expect(
      viraDia(new Date(2026, 8, 19, 8, 0).toISOString(), {
        em: new Date(2026, 8, 18, 23, 0).toISOString(),
      }),
    ).toBe(true);
  });
});
