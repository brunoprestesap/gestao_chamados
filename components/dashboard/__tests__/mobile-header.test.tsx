// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { MobileHeader } from '../mobile-header';

/**
 * O cabeçalho fixo do celular, presente em toda tela do dashboard.
 *
 * covers: AC-18 da spec 0004 (alvo de toque de 44 pixels), que o
 * `/check verify` de 21/09/2026 pegou em 36 pixels no botão de menu e no
 * sino de notificações; corrigido em `/debug`.
 */

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
});

describe('MobileHeader · alvo de toque (AC-18)', () => {
  it('o botão de menu tem nome acessível e 44 pixels (h-11 w-11), não mais 36 (h-9 w-9)', async () => {
    // Act
    render(<MobileHeader />);

    // Assert
    const menu = screen.getByRole('button', { name: 'Abrir menu de navegação' });
    expect(menu.className).toContain('h-11');
    expect(menu.className).toContain('w-11');
    expect(menu.className).not.toContain('h-9');

    // Deixa o efeito assíncrono do sino (dentro do mesmo cabeçalho) assentar
    // antes do teste terminar, para não vazar um `act()` pendente ao próximo.
    await screen.findByRole('button', { name: /notifica/i });
  });

  it('o sino de notificações tem 44 pixels (h-11 w-11), não mais 36 (h-9 w-9)', async () => {
    // Act
    render(<MobileHeader />);

    // Assert
    const sino = await screen.findByRole('button', { name: /notifica/i });
    expect(sino.className).toContain('h-11');
    expect(sino.className).toContain('w-11');
    expect(sino.className).not.toContain('h-9');
  });
});
