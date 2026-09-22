// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { LeituraChamado } from '../../_types';
import { PainelChamado } from '../PainelChamado';

/**
 * O chamado aberto em modo leitura (spec 0003): a linha do tempo inteira, sem
 * caixa de envio, com o rodapé explicando por onde se responde.
 *
 * covers: AC-10 (cabeçalho, linha do tempo, sem caixa de envio, rodapé)
 */

const CHAMADO_ID = '6aad5286df6f201a25eda5f9';

function leitura(over: Partial<LeituraChamado> = {}): LeituraChamado {
  return {
    chamadoId: CHAMADO_ID,
    ticketNumber: 'CHM-2026-00412',
    titulo: 'Lâmpada queimada no corredor',
    situacao: 'Em atendimento',
    abertoEm: new Date('2026-09-17T11:40:00.000Z').toISOString(),
    marca: null,
    itens: [],
    truncado: false,
    ...over,
  };
}

// ── aviso de chamado aberto · spec 0004, AC-11 ───────────────────

describe('PainelChamado · aviso de chamado aberto', () => {
  it('mostra o aviso como sucesso, sem o link do formulário', () => {
    // Arrange
    const em = new Date('2026-09-17T11:41:00.000Z').toISOString();

    // Act
    render(
      <PainelChamado
        leitura={leitura({
          itens: [
            {
              fonte: 'mensagem',
              id: 'm1',
              em,
              autor: 'sistema',
              texto: 'Chamado #CHM-2026-00412 aberto.',
              chamadoAberto: true,
            },
          ],
        })}
      />,
    );

    // Assert
    expect(screen.getByText('Chamado #CHM-2026-00412 aberto.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /abrir por formulário/i })).not.toBeInTheDocument();
  });
});

// ── marca do chat · spec 0004, AC-15 ─────────────────────────────

describe('PainelChamado · marca do chat', () => {
  it('mostra a marca em texto no cabeçalho', () => {
    // Act
    render(
      <PainelChamado leitura={leitura({ marca: 'Aberto pelo chat · serviço sugerido pela IA' })} />,
    );

    // Assert
    expect(screen.getByText('Aberto pelo chat · serviço sugerido pela IA')).toBeInTheDocument();
  });

  it('chamado do formulário não tem marca', () => {
    // Act
    render(<PainelChamado leitura={leitura()} />);

    // Assert
    expect(screen.queryByText(/aberto pelo chat/i)).not.toBeInTheDocument();
  });
});

// ── cabeçalho · AC-10 ────────────────────────────────────────────

describe('PainelChamado · cabeçalho', () => {
  it('mostra título, situação e número do chamado', () => {
    // Act
    render(<PainelChamado leitura={leitura()} />);

    // Assert
    expect(screen.getByRole('heading', { name: /lâmpada queimada/i })).toBeInTheDocument();
    expect(screen.getByText('Em atendimento')).toBeInTheDocument();
    expect(screen.getByText(/#CHM-2026-00412/)).toBeInTheDocument();
  });

  it('leva ao detalhe do chamado', () => {
    // Act
    render(<PainelChamado leitura={leitura()} />);

    // Assert
    expect(screen.getByRole('link', { name: /abrir detalhe do chamado/i })).toHaveAttribute(
      'href',
      `/meus-chamados/${CHAMADO_ID}`,
    );
  });

  it('oferece voltar para a lista, que é o caminho do celular', () => {
    // Act
    render(<PainelChamado leitura={leitura()} />);

    // Assert
    expect(screen.getByRole('link', { name: /voltar para a lista/i })).toHaveAttribute(
      'href',
      '/conversas',
    );
  });

  it('aguenta chamado sem número, sem escrever `#undefined`', () => {
    // Act
    render(<PainelChamado leitura={leitura({ ticketNumber: '' })} />);

    // Assert
    expect(screen.queryByText(/#undefined|#$/)).not.toBeInTheDocument();
    expect(screen.getByText(/aberto em/i)).toBeInTheDocument();
  });

  it('põe o foco no título ao abrir, para quem vem da lista se situar', () => {
    // Act
    render(<PainelChamado leitura={leitura()} />);

    // Assert
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: /lâmpada queimada/i }));
  });
});

// ── modo leitura · AC-10 ─────────────────────────────────────────

describe('PainelChamado · modo leitura', () => {
  it('não tem caixa de envio nenhuma', () => {
    // Act
    render(<PainelChamado leitura={leitura()} />);

    // Assert
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('explica que para falar com quem atende se usa os comentários', () => {
    // Act
    render(<PainelChamado leitura={leitura()} />);

    // Assert
    expect(screen.getByText(/modo leitura/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ir para os comentários/i })).toHaveAttribute(
      'href',
      `/meus-chamados/${CHAMADO_ID}`,
    );
  });

  it('avisa quando a conversa é longa e só a parte recente aparece', () => {
    // Act
    render(<PainelChamado leitura={leitura({ truncado: true })} />);

    // Assert
    expect(screen.getByText(/só a parte mais recente/i)).toBeInTheDocument();
  });

  it('explica o vazio quando o chamado ainda não tem nada', () => {
    // Act
    render(<PainelChamado leitura={leitura({ itens: [] })} />);

    // Assert
    expect(screen.getByText(/ainda não tem mensagens nem comentários/i)).toBeInTheDocument();
  });
});

// ── a linha do tempo · AC-10 ─────────────────────────────────────

describe('PainelChamado · linha do tempo', () => {
  const em = new Date('2026-09-17T08:38:00.000Z').toISOString();

  it('mostra as três fontes juntas, na ordem que veio', () => {
    // Act
    render(
      <PainelChamado
        leitura={leitura({
          itens: [
            { fonte: 'mensagem', id: 'm1', em, autor: 'solicitante', texto: 'a lâmpada queimou' },
            { fonte: 'mensagem', id: 'm2', em, autor: 'ia', texto: 'Anotado.' },
            { fonte: 'historico', id: 'h1', em, texto: 'Abertura do Chamado por Ana' },
            {
              fonte: 'comentario',
              id: 'c1',
              em,
              autorNome: 'Maurício Lima',
              interno: false,
              texto: 'passo hoje à tarde',
            },
          ],
        })}
      />,
    );

    // Assert
    expect(screen.getByText('a lâmpada queimou')).toBeInTheDocument();
    expect(screen.getByText('Anotado.')).toBeInTheDocument();
    expect(screen.getByText(/Abertura do Chamado por Ana/)).toBeInTheDocument();
    expect(screen.getByText('passo hoje à tarde')).toBeInTheDocument();
  });

  it('diz quem escreveu cada comentário', () => {
    // Act
    render(
      <PainelChamado
        leitura={leitura({
          itens: [
            {
              fonte: 'comentario',
              id: 'c1',
              em,
              autorNome: 'Maurício Lima',
              interno: false,
              texto: 'passo hoje',
            },
          ],
        })}
      />,
    );

    // Assert
    expect(screen.getByText(/Maurício Lima/)).toBeInTheDocument();
  });

  it('marca o comentário interno, para não confundir com o que o solicitante escreveu', () => {
    // Act
    render(
      <PainelChamado
        leitura={leitura({
          itens: [
            {
              fonte: 'comentario',
              id: 'c1',
              em,
              autorNome: 'Ana',
              interno: true,
              texto: 'nota da gestão',
            },
          ],
        })}
      />,
    );

    // Assert
    expect(screen.getByText(/comentário interno/i)).toBeInTheDocument();
  });

  it('mostra o aviso do sistema com o link do formulário, como na conversa', () => {
    // Act
    render(
      <PainelChamado
        leitura={leitura({
          itens: [
            { fonte: 'mensagem', id: 'm1', em, autor: 'sistema', texto: 'O assistente falhou.' },
          ],
        })}
      />,
    );

    // Assert
    expect(screen.getByRole('link', { name: /abrir por formulário/i })).toBeInTheDocument();
  });
});
