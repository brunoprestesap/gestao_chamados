import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O papel com que alguém escreve no IMR do contrato (spec 0023): fiscal vence
 * gestor, e quem não tem nenhum dos dois só lê. A vigência e o perfil da
 * designação são de `papeisDe` (spec 0019), com teste próprio.
 *
 * covers: AC-14
 */

const designados = vi.hoisted(() => ({ atual: [] as string[] }));

vi.mock('@/lib/material/papeis', () => ({
  papeisDe: async () => ({ tem: (p: string) => designados.atual.includes(p) }),
}));

import { papelNoImr } from '../acesso';

beforeEach(() => {
  designados.atual = [];
});

describe('papelNoImr', () => {
  it('com fiscal e gestor ao mesmo tempo, escreve como fiscal', async () => {
    designados.atual = ['gestor', 'fiscal'];

    expect(await papelNoImr('u1', 'Admin')).toBe('fiscal');
  });

  it('só com gestor, escreve como gestor', async () => {
    designados.atual = ['gestor'];

    expect(await papelNoImr('u1', 'Admin')).toBe('gestor');
  });

  it('sem fiscal nem gestor (até com outra designação), só lê', async () => {
    designados.atual = ['aprovador'];

    expect(await papelNoImr('u1', 'Admin')).toBeNull();
  });
});
