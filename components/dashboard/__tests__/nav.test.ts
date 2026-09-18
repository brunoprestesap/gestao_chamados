import { describe, expect, it } from 'vitest';

import { NAV_GROUP_ORDER, NAV_ITEMS } from '../nav';

/**
 * O item `Conversas` no menu (spec 0003). A regra é simples: a tela é dos
 * quatro perfis, então o item não pode ter trava de perfil.
 *
 * covers: AC-1 (`/conversas` aparece na sidebar para os quatro perfis)
 */

const conversas = () => NAV_ITEMS.find((item) => item.href === '/conversas');

// ── o item novo · AC-1 ───────────────────────────────────────────

describe('NAV_ITEMS · Conversas', () => {
  it('existe e aponta para a rota da tela', () => {
    // Assert
    expect(conversas()).toBeDefined();
  });

  it('fica no grupo Principal, junto de Meus Chamados', () => {
    // Assert
    expect(conversas()?.group).toBe('Principal');
    expect(NAV_GROUP_ORDER).toContain('Principal');
  });

  it('não tem trava de perfil, porque os quatro perfis veem a tela', () => {
    // Assert: `allowedRoles` ausente é o que libera para todos
    expect(conversas()?.allowedRoles).toBeUndefined();
  });

  it('tem rótulo e ícone, que é o que a sidebar desenha', () => {
    // Assert
    expect(conversas()?.label).toBe('Conversas');
    expect(conversas()?.icon).toBeTruthy();
  });

  it('vem antes de Meus Chamados, que é a entrada que ela quer substituir', () => {
    // Act
    const iConversas = NAV_ITEMS.findIndex((i) => i.href === '/conversas');
    const iChamados = NAV_ITEMS.findIndex((i) => i.href === '/meus-chamados');

    // Assert
    expect(iConversas).toBeGreaterThanOrEqual(0);
    expect(iConversas).toBeLessThan(iChamados);
  });
});

// ── o menu como um todo continua íntegro ─────────────────────────

describe('NAV_ITEMS', () => {
  it('não repete endereço, para nenhum item ficar marcado duas vezes', () => {
    // Act
    const hrefs = NAV_ITEMS.map((i) => i.href);

    // Assert
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('só usa grupos que a sidebar sabe desenhar', () => {
    // Assert
    for (const item of NAV_ITEMS) {
      expect(NAV_GROUP_ORDER, item.label).toContain(item.group);
    }
  });

  it('mantém `Meus Chamados` no menu, porque a entrada antiga continua', () => {
    // Assert: a spec 0003 acrescenta uma entrada, não troca a que existe
    expect(NAV_ITEMS.some((i) => i.href === '/meus-chamados')).toBe(true);
  });
});
