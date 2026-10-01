import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `vincularAtivoChamadoAction` (spec 0011, AC-16 e AC-17): só Admin e
 * Preposto, com `ok: false` em vez do redirect para os outros perfis.
 */

const sessao = vi.hoisted(() => ({ atual: null as null | { userId: string; role: string } }));
const vincular = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/dal', () => ({
  verifySession: async () => sessao.atual,
  canManage: (role?: string) => role === 'Admin' || role === 'Preposto',
  isAdmin: (role?: string) => role === 'Admin',
  requireManager: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/realtime-emit', () => ({ emitToRoom: vi.fn() }));
vi.mock('@/lib/ativos/vinculo', () => ({ vincularAtivoAoChamado: vincular }));

import { vincularAtivoChamadoAction } from '../actions';

const CHAMADO = '507f1f77bcf86cd799439011';
const ATIVO = '507f1f77bcf86cd799439012';

beforeEach(() => {
  vi.clearAllMocks();
  vincular.mockResolvedValue({ ok: true, mudou: true });
});

describe('vincularAtivoChamadoAction', () => {
  it.each(['Solicitante', 'Técnico'])('%s recebe sem permissão', async (role) => {
    sessao.atual = { userId: CHAMADO, role };
    await expect(
      vincularAtivoChamadoAction({ chamadoId: CHAMADO, ativoId: ATIVO }),
    ).resolves.toEqual({ ok: false, error: 'Sem permissão para esta ação.' });
    expect(vincular).not.toHaveBeenCalled();
  });

  it('Preposto vincula, e null remove', async () => {
    sessao.atual = { userId: CHAMADO, role: 'Preposto' };
    await expect(
      vincularAtivoChamadoAction({ chamadoId: CHAMADO, ativoId: ATIVO }),
    ).resolves.toEqual({ ok: true });
    await vincularAtivoChamadoAction({ chamadoId: CHAMADO, ativoId: null });
    expect(vincular).toHaveBeenLastCalledWith(CHAMADO, null, CHAMADO);
  });

  it('repassa o erro de chamado fechado', async () => {
    sessao.atual = { userId: CHAMADO, role: 'Admin' };
    vincular.mockResolvedValue({ ok: false, error: 'fechado' });
    await expect(
      vincularAtivoChamadoAction({ chamadoId: CHAMADO, ativoId: ATIVO }),
    ).resolves.toEqual({ ok: false, error: 'fechado' });
  });

  it('recusa id inválido antes de chegar ao banco', async () => {
    sessao.atual = { userId: CHAMADO, role: 'Admin' };
    const r = await vincularAtivoChamadoAction({ chamadoId: 'x', ativoId: ATIVO });
    expect(r.ok).toBe(false);
    expect(vincular).not.toHaveBeenCalled();
  });
});
