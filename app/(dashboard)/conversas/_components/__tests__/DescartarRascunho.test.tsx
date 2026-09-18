// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const mockReplace = vi.fn();
const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, refresh: mockRefresh }),
}));

const mockDescartar = vi.fn();
vi.mock('../../actions', () => ({
  descartarRascunhoAction: (...a: unknown[]) => mockDescartar(...a),
}));

import { DescartarRascunho } from '../DescartarRascunho';

/**
 * O descarte do rascunho (spec 0003). Some de vez, então pergunta antes.
 *
 * covers: AC-12 (confirmação, volta para a lista, frase própria na falha),
 * AC-8 (diálogo com nome e foco)
 */

const CONVERSA_ID = '6aad5286df6f201a25eda5f1';

const abrir = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /descartar/i }));

beforeEach(() => {
  vi.clearAllMocks();
  mockDescartar.mockResolvedValue({ ok: true });
});

// ── a confirmação · AC-12 ────────────────────────────────────────

describe('DescartarRascunho · confirmação', () => {
  it('não descarta nada só de clicar no botão do cabeçalho', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<DescartarRascunho conversaId={CONVERSA_ID} />);

    // Act
    await abrir(user);

    // Assert
    expect(mockDescartar).not.toHaveBeenCalled();
  });

  it('abre um diálogo explicando que não tem volta', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<DescartarRascunho conversaId={CONVERSA_ID} />);

    // Act
    await abrir(user);

    // Assert
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveAccessibleName(/descartar esta conversa/i);
    expect(screen.getByText(/não tem volta/i)).toBeInTheDocument();
  });

  it('tranquiliza dizendo que nenhum chamado fica pendente', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<DescartarRascunho conversaId={CONVERSA_ID} />);

    // Act
    await abrir(user);

    // Assert
    expect(await screen.findByText(/nada fica pendente/i)).toBeInTheDocument();
  });

  it('oferece manter a conversa como saída', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<DescartarRascunho conversaId={CONVERSA_ID} />);

    // Act
    await abrir(user);

    // Assert
    expect(await screen.findByRole('button', { name: /manter conversa/i })).toBeInTheDocument();
  });
});

// ── descarte que dá certo · AC-12 ────────────────────────────────

describe('DescartarRascunho · confirmado', () => {
  it('descarta a conversa certa e volta para a lista', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<DescartarRascunho conversaId={CONVERSA_ID} />);
    await abrir(user);

    // Act
    const dialogo = await screen.findByRole('dialog');
    await user.click(
      screen.getAllByRole('button', { name: /^descartar$/i }).find((b) => dialogo.contains(b))!,
    );

    // Assert
    expect(mockDescartar).toHaveBeenCalledWith(CONVERSA_ID);
    expect(mockReplace).toHaveBeenCalledWith('/conversas');
    expect(mockRefresh).toHaveBeenCalled();
  });
});

// ── descarte que falha · AC-12, AC-9 ─────────────────────────────

describe('DescartarRascunho · quando falha', () => {
  it('explica em português quando a confirmação já começou, e fica onde está', async () => {
    // Arrange
    const user = userEvent.setup();
    mockDescartar.mockResolvedValue({ ok: false, reason: 'confirmacao_em_andamento' });
    render(<DescartarRascunho conversaId={CONVERSA_ID} />);
    await abrir(user);

    // Act
    const dialogo = await screen.findByRole('dialog');
    await user.click(
      screen.getAllByRole('button', { name: /^descartar$/i }).find((b) => dialogo.contains(b))!,
    );

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(/virando chamado neste instante/i);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('nunca mostra o motivo cru', async () => {
    // Arrange
    const user = userEvent.setup();
    mockDescartar.mockResolvedValue({ ok: false, reason: 'sem_permissao' });
    render(<DescartarRascunho conversaId={CONVERSA_ID} />);
    await abrir(user);

    // Act
    const dialogo = await screen.findByRole('dialog');
    await user.click(
      screen.getAllByRole('button', { name: /^descartar$/i }).find((b) => dialogo.contains(b))!,
    );

    // Assert
    const alerta = await screen.findByRole('alert');
    expect(alerta).not.toHaveTextContent('sem_permissao');
  });

  it('avisa quando nem deu para falar com o servidor', async () => {
    // Arrange
    const user = userEvent.setup();
    mockDescartar.mockRejectedValue(new TypeError('failed to fetch'));
    render(<DescartarRascunho conversaId={CONVERSA_ID} />);
    await abrir(user);

    // Act
    const dialogo = await screen.findByRole('dialog');
    await user.click(
      screen.getAllByRole('button', { name: /^descartar$/i }).find((b) => dialogo.contains(b))!,
    );

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(/conexão/i);
  });
});

// ── acessibilidade · AC-8 ────────────────────────────────────────

describe('DescartarRascunho · acessibilidade', () => {
  it('o botão tem nome mesmo quando é só ícone no celular', () => {
    // Act
    render(<DescartarRascunho conversaId={CONVERSA_ID} />);

    // Assert
    expect(screen.getByRole('button', { name: /descartar/i })).toBeInTheDocument();
  });

  it('leva o foco para dentro do diálogo ao abrir', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<DescartarRascunho conversaId={CONVERSA_ID} />);

    // Act
    await abrir(user);

    // Assert
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo.contains(document.activeElement)).toBe(true);
  });

  it('fecha com Escape, sem descartar nada', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<DescartarRascunho conversaId={CONVERSA_ID} />);
    await abrir(user);
    await screen.findByRole('dialog');

    // Act
    await user.keyboard('{Escape}');

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockDescartar).not.toHaveBeenCalled();
  });
});
