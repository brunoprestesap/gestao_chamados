import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Aplicar e descartar a importação (spec 0012, AC-27): só o Admin. Os outros
 * perfis recebem a mensagem fixa, sem lançar o redirect e sem chegar ao banco.
 */

const sessao = vi.hoisted(() => ({ atual: null as null | { userId: string; role: string } }));
const banco = vi.hoisted(() => ({ dbConnect: vi.fn() }));
const regras = vi.hoisted(() => ({ aplicar: vi.fn(), descartar: vi.fn() }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/dal', () => ({
  verifySession: async () => sessao.atual,
  isAdmin: (role?: string) => role === 'Admin',
}));
vi.mock('@/lib/db', () => banco);
vi.mock('@/lib/ativos/importacao/aplicar', () => ({
  aplicarImportacao: (...a: unknown[]) => regras.aplicar(...a),
}));
vi.mock('@/lib/ativos/importacao/pendente', () => ({
  descartarImportacao: (...a: unknown[]) => regras.descartar(...a),
}));

import { aplicarImportacaoAction, descartarImportacaoAction } from '../actions';

const ID = '507f1f77bcf86cd799439011';
const SEM_PERMISSAO = { ok: false, error: 'Sem permissão para esta ação.' };
const selecao = {
  id: ID,
  novos: [{ codigo: '1', categoriaId: ID }],
  alterados: ['2'],
  sumidos: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  sessao.atual = { userId: ID, role: 'Admin' };
});

describe('actions do importador', () => {
  it.each(['Preposto', 'Técnico', 'Solicitante'])('%s não aplica nem descarta', async (role) => {
    sessao.atual = { userId: ID, role };
    expect(await aplicarImportacaoAction(selecao)).toEqual(SEM_PERMISSAO);
    expect(await descartarImportacaoAction({ id: ID })).toEqual(SEM_PERMISSAO);
    expect(banco.dbConnect).not.toHaveBeenCalled();
  });

  it('sem sessão também é sem permissão', async () => {
    sessao.atual = null;
    expect(await aplicarImportacaoAction(selecao)).toEqual(SEM_PERMISSAO);
  });

  it('Admin aplica com a seleção e o autor da sessão', async () => {
    const resultado = {
      aplicados: { novos: 1, alterados: 1, sumidos: 0 },
      pulados: { novos: 0, alterados: 0, sumidos: 0 },
      concluida: true,
    };
    regras.aplicar.mockResolvedValueOnce({ ok: true, resultado });
    expect(await aplicarImportacaoAction(selecao)).toEqual({ ok: true, resultado });
    expect(regras.aplicar).toHaveBeenCalledWith(
      ID,
      { novos: selecao.novos, alterados: ['2'], sumidos: [] },
      ID,
    );
  });

  it('seleção malformada é recusada sem chegar ao banco', async () => {
    const r = await aplicarImportacaoAction({ ...selecao, id: 'x' });
    expect(r.ok).toBe(false);
    expect(regras.aplicar).not.toHaveBeenCalled();
  });

  it('erro inesperado vira "tente de novo"', async () => {
    regras.descartar.mockRejectedValueOnce(new Error('caiu'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await descartarImportacaoAction({ id: ID })).toEqual({
      ok: false,
      error: 'Não foi possível concluir agora. Tente de novo.',
    });
  });
});
