// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const mockPathname = vi.fn(() => '/conversas');
vi.mock('next/navigation', () => ({ usePathname: () => mockPathname() }));

const mockCarregarMais = vi.fn();
vi.mock('../../actions', () => ({
  carregarMaisConversasAction: (...a: unknown[]) => mockCarregarMais(...a),
}));

import type { ItemLateral } from '../../_types';
import { ListaLateral } from '../ListaLateral';

/**
 * A lateral (spec 0003): rascunhos em cima, chamados embaixo, 20 por vez.
 *
 * covers: AC-2 (dois blocos, `Carregar mais`, marca da situação), AC-1 (a
 * linha ativa é anunciada)
 */

function rascunho(over: Partial<ItemLateral> = {}): ItemLateral {
  return {
    tipo: 'rascunho',
    id: 'r1',
    href: '/conversas/r1',
    titulo: 'O ar da sala 302 pinga',
    apoio: 'Ainda não virou chamado',
    situacao: 'Rascunho',
    statusChave: null,
    em: new Date('2026-09-18T12:00:00.000Z').toISOString(),
    confirmando: false,
    ...over,
  };
}

function chamado(over: Partial<ItemLateral> = {}): ItemLateral {
  return {
    tipo: 'chamado',
    id: 'c1',
    href: '/conversas/c1',
    titulo: 'Lâmpada queimada no corredor',
    apoio: '#CHM-2026-00412 · Maurício está atendendo',
    situacao: 'Em atendimento',
    statusChave: 'em atendimento',
    em: new Date('2026-09-15T12:00:00.000Z').toISOString(),
    confirmando: false,
    ...over,
  };
}

function montar(over: Partial<React.ComponentProps<typeof ListaLateral>> = {}) {
  render(
    <ListaLateral rascunhos={[]} chamados={[chamado()]} temMais={false} cursor={null} {...over} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPathname.mockReturnValue('/conversas');
});

// ── os dois blocos · AC-2 ────────────────────────────────────────

describe('ListaLateral · blocos', () => {
  it('separa rascunhos de chamados, com os rascunhos em cima', () => {
    // Act
    montar({ rascunhos: [rascunho()], chamados: [chamado()] });

    // Assert
    const titulos = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titulos).toEqual(['Rascunhos', 'Chamados']);
  });

  it('esconde o bloco de rascunhos quando não há nenhum', () => {
    // Act
    montar({ rascunhos: [], chamados: [chamado()] });

    // Assert
    expect(screen.queryByRole('heading', { name: 'Rascunhos' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chamados' })).toBeInTheDocument();
  });

  it('mostra o estado vazio quando não há nada, em vez de espaço em branco', () => {
    // Act
    montar({ rascunhos: [], chamados: [] });

    // Assert
    expect(screen.getByText(/nenhuma conversa ainda/i)).toBeInTheDocument();
    expect(screen.getByText(/comece uma conversa/i)).toBeInTheDocument();
  });
});

// ── cada linha · AC-2 ────────────────────────────────────────────

describe('ListaLateral · cada linha', () => {
  it('mostra situação, título e linha de apoio', () => {
    // Act
    montar();

    // Assert
    expect(screen.getByText('Em atendimento')).toBeInTheDocument();
    expect(screen.getByText('Lâmpada queimada no corredor')).toBeInTheDocument();
    expect(screen.getByText('#CHM-2026-00412 · Maurício está atendendo')).toBeInTheDocument();
  });

  it('marca `Confirmando` o rascunho que está virando chamado', () => {
    // Act
    montar({ rascunhos: [rascunho({ situacao: 'Confirmando', confirmando: true })], chamados: [] });

    // Assert
    expect(screen.getByText('Confirmando')).toBeInTheDocument();
  });

  it('leva ao endereço que o servidor calculou, sem o cliente adivinhar', () => {
    // Act
    montar({ chamados: [chamado({ href: '/conversas/id-da-conversa' })] });

    // Assert
    expect(screen.getByRole('link', { name: /lâmpada queimada/i })).toHaveAttribute(
      'href',
      '/conversas/id-da-conversa',
    );
  });

  it('anuncia qual linha é a aberta agora', () => {
    // Arrange
    mockPathname.mockReturnValue('/conversas/c1');

    // Act
    montar();

    // Assert
    expect(screen.getByRole('link', { name: /lâmpada queimada/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('não marca linha nenhuma quando se está na tela de boas vindas', () => {
    // Arrange
    mockPathname.mockReturnValue('/conversas');

    // Act
    montar();

    // Assert
    expect(screen.getByRole('link', { name: /lâmpada queimada/i })).not.toHaveAttribute(
      'aria-current',
    );
  });
});

// ── carregar mais · AC-2 ─────────────────────────────────────────

describe('ListaLateral · carregar mais', () => {
  it('não mostra o botão quando não há próxima página', () => {
    // Act
    montar({ temMais: false, cursor: null });

    // Assert
    expect(screen.queryByRole('button', { name: /carregar mais/i })).not.toBeInTheDocument();
  });

  it('mostra o botão quando há mais e há por onde continuar', () => {
    // Act
    montar({ temMais: true, cursor: { em: 'x', id: 'y' } });

    // Assert
    expect(screen.getByRole('button', { name: /carregar mais/i })).toBeInTheDocument();
  });

  it('acrescenta a página seguinte à lista, sem repetir o que já estava', async () => {
    // Arrange
    const user = userEvent.setup();
    mockCarregarMais.mockResolvedValue({
      itens: [
        chamado({ id: 'c1', titulo: 'repetido' }),
        chamado({ id: 'c2', titulo: 'Tomada solta' }),
      ],
      temMais: false,
      cursor: null,
    });
    montar({ temMais: true, cursor: { em: 'x', id: 'y' } });

    // Act
    await user.click(screen.getByRole('button', { name: /carregar mais/i }));

    // Assert: `c1` já estava na primeira página e não entra de novo
    expect(await screen.findByText('Tomada solta')).toBeInTheDocument();
    expect(screen.queryByText('repetido')).not.toBeInTheDocument();
  });

  it('esconde o botão quando a página seguinte diz que acabou', async () => {
    // Arrange
    const user = userEvent.setup();
    mockCarregarMais.mockResolvedValue({ itens: [], temMais: false, cursor: null });
    montar({ temMais: true, cursor: { em: 'x', id: 'y' } });

    // Act
    await user.click(screen.getByRole('button', { name: /carregar mais/i }));

    // Assert
    expect(await screen.findByRole('heading', { name: 'Chamados' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /carregar mais/i })).not.toBeInTheDocument();
  });

  it('pede a página seguinte a partir do cursor que recebeu', async () => {
    // Arrange
    const user = userEvent.setup();
    const cursor = { em: '2026-06-15T14:12:00.288Z', id: 'ultimo' };
    mockCarregarMais.mockResolvedValue({ itens: [], temMais: false, cursor: null });
    montar({ temMais: true, cursor });

    // Act
    await user.click(screen.getByRole('button', { name: /carregar mais/i }));

    // Assert
    expect(mockCarregarMais).toHaveBeenCalledWith(cursor);
  });
});

// ── as duas entradas do topo · AC-3, AC-7 ────────────────────────

describe('ListaLateral · atalhos do topo', () => {
  it('oferece começar uma conversa nova', () => {
    // Act
    montar();

    // Assert
    expect(screen.getByRole('link', { name: /nova conversa/i })).toHaveAttribute(
      'href',
      '/conversas',
    );
  });

  it('deixa o formulário tradicional sempre à vista', () => {
    // Act
    montar();

    // Assert
    expect(screen.getByRole('link', { name: /abrir por formulário/i })).toHaveAttribute(
      'href',
      '/meus-chamados',
    );
  });
});

// ── estrutura para o leitor de tela · AC-8 ───────────────────────

describe('ListaLateral · estrutura', () => {
  it('é uma região com nome, e a lista é uma lista de verdade', () => {
    // Act
    montar({ rascunhos: [rascunho()], chamados: [chamado()] });

    // Assert
    const regiao = screen.getByRole('region', { name: /suas conversas/i });
    expect(within(regiao).getAllByRole('listitem').length).toBeGreaterThan(0);
  });
});
