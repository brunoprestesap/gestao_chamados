import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Nome de quem gera o relatório (spec 0016). covers: AC-8 */

const findById = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/models/user.model', () => ({ UserModel: { findById } }));

import { nomeDoUsuario } from '../usuario';

const ID = 'b'.repeat(24);

function usuario(doc: unknown) {
  findById.mockReturnValue({ select: () => ({ lean: async () => doc }) });
}

beforeEach(() => vi.clearAllMocks());

describe('nomeDoUsuario', () => {
  it('usa o nome sem espaços nas pontas', async () => {
    usuario({ name: '  Fulana  ', username: 'fulana' });
    expect(await nomeDoUsuario(ID)).toBe('Fulana');
  });

  it('cai no login quando o nome está vazio', async () => {
    usuario({ name: '   ', username: 'fulana' });
    expect(await nomeDoUsuario(ID)).toBe('fulana');
  });

  it('usuário que não existe vira um texto fixo', async () => {
    usuario(null);
    expect(await nomeDoUsuario(ID)).toBe('Usuário');
  });
});
