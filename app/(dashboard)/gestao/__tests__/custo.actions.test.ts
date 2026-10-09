import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * As actions de custo do chamado (spec 0018): só Admin e Preposto passam, a
 * validação devolve a mensagem do AC-1 sem tocar o banco, e o sucesso
 * revalida a gestão e a ficha.
 *
 * covers: AC-1, AC-18
 */

const mockVerifySession = vi.fn();
vi.mock('@/lib/dal', () => ({
  verifySession: () => mockVerifySession(),
  canManage: (role?: string) => role === 'Admin' || role === 'Preposto',
}));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock('next/cache', () => ({ revalidatePath }));
const regra = vi.hoisted(() => ({
  adicionarMaterial: vi.fn(),
  editarMaterial: vi.fn(),
  removerMaterial: vi.fn(),
  informarValorFinalCotacao: vi.fn(),
}));
vi.mock('@/lib/chamados/custo', () => regra);

import {
  adicionarMaterialAction,
  editarMaterialAction,
  informarValorFinalCotacaoAction,
  removerMaterialAction,
} from '../custo.actions';

const ID = '507f1f77bcf86cd799439011';
const item = { chamadoId: ID, descricao: 'Cabo', quantidade: 2.5, valorUnitario: 10 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('custo.actions', () => {
  it.each(['Técnico', 'Solicitante'])(
    '%s recebe "Sem permissão." sem nada gravado',
    async (role) => {
      mockVerifySession.mockResolvedValue({ userId: ID, role });
      expect(await adicionarMaterialAction(item)).toEqual({ ok: false, error: 'Sem permissão.' });
      expect(await removerMaterialAction({ chamadoId: ID, itemId: ID })).toEqual({
        ok: false,
        error: 'Sem permissão.',
      });
      expect(regra.adicionarMaterial).not.toHaveBeenCalled();
      expect(regra.removerMaterial).not.toHaveBeenCalled();
    },
  );

  it('sem sessão também recusa', async () => {
    mockVerifySession.mockResolvedValue(null);
    expect(await informarValorFinalCotacaoAction({ cotacaoId: ID, valorFinal: 1 })).toEqual({
      ok: false,
      error: 'Sem permissão.',
    });
  });

  it('valida antes de gravar', async () => {
    mockVerifySession.mockResolvedValue({ userId: ID, role: 'Preposto' });
    expect(await adicionarMaterialAction({ ...item, quantidade: 0 })).toEqual({
      ok: false,
      error: 'Quantidade inválida.',
    });
    expect(regra.adicionarMaterial).not.toHaveBeenCalled();
  });

  it('no sucesso, chama a regra com o usuário da sessão e revalida', async () => {
    mockVerifySession.mockResolvedValue({ userId: ID, role: 'Admin' });
    regra.adicionarMaterial.mockResolvedValue({ ok: true, itemId: ID });
    expect(await adicionarMaterialAction(item)).toEqual({ ok: true, itemId: ID });
    expect(regra.adicionarMaterial).toHaveBeenCalledWith(item, ID);
    expect(revalidatePath).toHaveBeenCalledWith('/gestao');
  });

  it('erro inesperado vira mensagem fixa', async () => {
    mockVerifySession.mockResolvedValue({ userId: ID, role: 'Admin' });
    regra.adicionarMaterial.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await adicionarMaterialAction(item)).toEqual({
      ok: false,
      error: 'Não foi possível salvar o custo agora. Tente de novo.',
    });
  });

  it('no sucesso, revalida também a ficha do ativo', async () => {
    mockVerifySession.mockResolvedValue({ userId: ID, role: 'Preposto' });
    regra.removerMaterial.mockResolvedValue({ ok: true });
    await removerMaterialAction({ chamadoId: ID, itemId: ID });
    expect(revalidatePath).toHaveBeenCalledWith('/ativos', 'layout');
  });

  it('recusa de regra volta como veio e não revalida nada', async () => {
    mockVerifySession.mockResolvedValue({ userId: ID, role: 'Admin' });
    const travado = { ok: false, error: 'O custo deste chamado não pode mais ser alterado.' };
    regra.editarMaterial.mockResolvedValue(travado);
    expect(await editarMaterialAction({ ...item, itemId: ID })).toEqual(travado);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('a edição exige o id do item', async () => {
    mockVerifySession.mockResolvedValue({ userId: ID, role: 'Admin' });
    const r = await editarMaterialAction({ ...item, itemId: 'nao-e-id' });
    expect(r.ok).toBe(false);
    expect(regra.editarMaterial).not.toHaveBeenCalled();
  });

  it('valor final inválido devolve a mensagem do AC-5 sem gravar', async () => {
    mockVerifySession.mockResolvedValue({ userId: ID, role: 'Preposto' });
    expect(await informarValorFinalCotacaoAction({ cotacaoId: ID, valorFinal: 1.005 })).toEqual({
      ok: false,
      error: 'Valor final inválido.',
    });
    expect(regra.informarValorFinalCotacao).not.toHaveBeenCalled();
  });

  it('valor final null chega à regra para voltar ao estimado', async () => {
    mockVerifySession.mockResolvedValue({ userId: ID, role: 'Preposto' });
    regra.informarValorFinalCotacao.mockResolvedValue({ ok: true });
    expect(await informarValorFinalCotacaoAction({ cotacaoId: ID, valorFinal: null })).toEqual({
      ok: true,
    });
    expect(regra.informarValorFinalCotacao).toHaveBeenCalledWith(
      { cotacaoId: ID, valorFinal: null },
      ID,
    );
  });
});
