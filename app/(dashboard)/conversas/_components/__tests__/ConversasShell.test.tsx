// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const mockRefresh = vi.fn();
const mockPathname = vi.fn(() => '/conversas');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
  usePathname: () => mockPathname(),
}));

vi.mock('../../actions', () => ({ carregarMaisConversasAction: vi.fn() }));

import { ConversasShell } from '../ConversasShell';

/**
 * O quadro da tela (spec 0003). Duas colunas no computador; no celular, uma
 * tela de cada vez, escolhida pela rota. A recarga em tempo real pega carona
 * num evento que o `RealtimeProvider` já dispara.
 *
 * covers: AC-13 (agrupa a rajada e recarrega uma vez), AC-11 (a troca é por
 * rota e CSS, sem gaveta)
 */

function montar() {
  render(
    <ConversasShell rascunhos={[]} chamados={[]} temMais={false} cursor={null}>
      <div data-testid="painel">conversa aberta</div>
    </ConversasShell>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockPathname.mockReturnValue('/conversas');
});

afterEach(() => {
  vi.useRealTimers();
});

// ── tempo real · AC-13 ───────────────────────────────────────────

describe('ConversasShell · recarga em tempo real', () => {
  it('não recarrega nada sozinho, sem evento', () => {
    // Act
    montar();
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Assert
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('recarrega depois do evento, e não antes da espera terminar', () => {
    // Arrange
    montar();

    // Act
    act(() => {
      window.dispatchEvent(new CustomEvent('notification:new'));
    });
    act(() => {
      vi.advanceTimersByTime(700);
    });

    // Assert: ainda dentro dos 800ms
    expect(mockRefresh).not.toHaveBeenCalled();

    // Act
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Assert
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it('junta uma rajada de avisos numa recarga só', () => {
    // Arrange
    montar();

    // Act: seis eventos espaçados, como uma enxurrada de SLA
    act(() => {
      for (let i = 0; i < 6; i++) {
        window.dispatchEvent(new CustomEvent('notification:new'));
        vi.advanceTimersByTime(100);
      }
    });
    act(() => {
      vi.advanceTimersByTime(900);
    });

    // Assert
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it('volta a recarregar quando um evento novo chega depois da espera', () => {
    // Arrange
    montar();

    // Act
    act(() => {
      window.dispatchEvent(new CustomEvent('notification:new'));
      vi.advanceTimersByTime(900);
    });
    act(() => {
      window.dispatchEvent(new CustomEvent('notification:new'));
      vi.advanceTimersByTime(900);
    });

    // Assert
    expect(mockRefresh).toHaveBeenCalledTimes(2);
  });

  it('para de escutar ao sair da tela, sem recarregar depois', () => {
    // Arrange
    const { unmount } = render(
      <ConversasShell rascunhos={[]} chamados={[]} temMais={false} cursor={null}>
        <div />
      </ConversasShell>,
    );

    // Act
    act(() => {
      window.dispatchEvent(new CustomEvent('notification:new'));
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Assert
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

// ── as duas colunas · AC-11 ──────────────────────────────────────

describe('ConversasShell · as duas colunas', () => {
  it('mostra a lateral e a conversa, cada uma no seu lugar', () => {
    // Act
    montar();

    // Assert
    expect(screen.getByRole('region', { name: /suas conversas/i })).toBeInTheDocument();
    expect(screen.getByTestId('painel')).toBeInTheDocument();
  });

  it('esconde a conversa no celular quando se está na lista', () => {
    // Arrange
    mockPathname.mockReturnValue('/conversas');

    // Act
    montar();

    // Assert: escondida no celular, visível a partir de `md`
    const caixa = screen.getByTestId('painel').parentElement;
    expect(caixa?.className).toContain('hidden');
    expect(caixa?.className).toContain('md:flex');
  });

  it('esconde a lista no celular quando uma conversa está aberta', () => {
    // Arrange
    mockPathname.mockReturnValue('/conversas/6aad5286df6f201a25eda5f1');

    // Act
    montar();

    // Assert
    const lateral = screen.getByRole('region', { name: /suas conversas/i });
    expect(lateral.className).toContain('hidden');
    expect(lateral.className).toContain('md:flex');
  });

  it('dá título e subtítulo à tela', () => {
    // Act
    montar();

    // Assert
    expect(screen.getByRole('heading', { level: 1, name: 'Conversas' })).toBeInTheDocument();
    expect(screen.getByText(/relate o problema/i)).toBeInTheDocument();
  });
});
