// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { NotificationsBell } from '../NotificationsBell';

/**
 * O sino de notificações, usado no cabeçalho mobile e no desktop.
 *
 * covers: AC-18 da spec 0004 (alvo de toque de 44 pixels), que o
 * `/check verify` de 21/09/2026 pegou em 36 pixels no cabeçalho mobile;
 * corrigido em `/debug`. Não cobre a lista de notificações nem o popover
 * (fora do escopo desta correção).
 */

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
});

describe('NotificationsBell · alvo de toque (AC-18)', () => {
  it('tem nome acessível e 44 pixels (h-11 w-11), não mais 36 (h-9 w-9)', async () => {
    // Act
    render(<NotificationsBell />);

    // Assert
    const sino = await screen.findByRole('button', { name: /notifica/i });
    expect(sino.className).toContain('h-11');
    expect(sino.className).toContain('w-11');
    expect(sino.className).not.toContain('h-9');
  });
});
