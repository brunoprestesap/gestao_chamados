import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Abrir e encerrar a campanha de vistoria (spec 0012, AC-1): só Admin e
 * Preposto. Técnico e Solicitante recebem a mensagem fixa, sem lançar o
 * redirect e sem chegar ao banco; nome inválido não chega à regra.
 *
 * covers: AC-1, permissões
 */

const sessao = vi.hoisted(() => ({ atual: null as null | { userId: string; role: string } }));
const banco = vi.hoisted(() => ({ dbConnect: vi.fn() }));
const regras = vi.hoisted(() => ({ abrir: vi.fn(), encerrar: vi.fn() }));
const revalidar = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({ revalidatePath: revalidar }));
vi.mock('@/lib/dal', () => ({
  verifySession: async () => sessao.atual,
  canManage: (role?: string) => role === 'Admin' || role === 'Preposto',
}));
vi.mock('@/lib/db', () => banco);
vi.mock('@/lib/vistoria/campanha', () => ({
  abrirCampanha: (...a: unknown[]) => regras.abrir(...a),
  encerrarCampanha: (...a: unknown[]) => regras.encerrar(...a),
}));

import { abrirCampanhaAction, encerrarCampanhaAction } from '../actions';

const ID = '507f1f77bcf86cd799439011';
const SEM_PERMISSAO = { ok: false, error: 'Sem permissão para esta ação.' };

beforeEach(() => {
  vi.clearAllMocks();
  sessao.atual = { userId: ID, role: 'Preposto' };
});

describe('abrirCampanhaAction', () => {
  it.each(['Técnico', 'Solicitante'])('%s não abre campanha', async (role) => {
    sessao.atual = { userId: ID, role };
    expect(await abrirCampanhaAction({ nome: 'Vistoria inicial' })).toEqual(SEM_PERMISSAO);
    expect(banco.dbConnect).not.toHaveBeenCalled();
    expect(regras.abrir).not.toHaveBeenCalled();
  });

  it('sem sessão também é sem permissão', async () => {
    sessao.atual = null;
    expect(await abrirCampanhaAction({ nome: 'Vistoria inicial' })).toEqual(SEM_PERMISSAO);
  });

  it.each(['Admin', 'Preposto'])('%s abre com o nome sem espaços nas pontas', async (role) => {
    sessao.atual = { userId: ID, role };
    regras.abrir.mockResolvedValueOnce({ ok: true, id: 'c1' });
    expect(await abrirCampanhaAction({ nome: '  Vistoria inicial  ' })).toEqual({
      ok: true,
      id: 'c1',
    });
    expect(regras.abrir).toHaveBeenCalledWith('Vistoria inicial', ID);
    expect(revalidar).toHaveBeenCalledWith('/ativos/vistoria');
  });

  it('nome em branco é recusado com a mensagem do formulário', async () => {
    expect(await abrirCampanhaAction({ nome: '   ' })).toEqual({
      ok: false,
      error: 'Informe o nome da campanha.',
    });
    expect(regras.abrir).not.toHaveBeenCalled();
  });

  it('repassa a recusa da regra (já existe uma aberta) sem revalidar', async () => {
    regras.abrir.mockResolvedValueOnce({
      ok: false,
      error: 'Já existe uma campanha aberta: Vistoria inicial',
    });
    expect(await abrirCampanhaAction({ nome: 'Outra' })).toEqual({
      ok: false,
      error: 'Já existe uma campanha aberta: Vistoria inicial',
    });
    expect(revalidar).not.toHaveBeenCalled();
  });

  it('erro inesperado vira "tente de novo"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    regras.abrir.mockRejectedValueOnce(new Error('caiu'));
    expect(await abrirCampanhaAction({ nome: 'Vistoria inicial' })).toEqual({
      ok: false,
      error: 'Não foi possível salvar agora. Tente de novo.',
    });
  });
});

describe('encerrarCampanhaAction', () => {
  it.each(['Técnico', 'Solicitante'])('%s não encerra campanha', async (role) => {
    sessao.atual = { userId: ID, role };
    expect(await encerrarCampanhaAction({ id: ID })).toEqual(SEM_PERMISSAO);
    expect(regras.encerrar).not.toHaveBeenCalled();
  });

  it('id malformado é recusado antes do banco', async () => {
    const r = await encerrarCampanhaAction({ id: 'x' });
    expect(r).toEqual({ ok: false, error: 'Campanha inválida.' });
    expect(banco.dbConnect).not.toHaveBeenCalled();
  });

  it('Preposto encerra com o autor da sessão', async () => {
    regras.encerrar.mockResolvedValueOnce({ ok: true });
    expect(await encerrarCampanhaAction({ id: ID })).toEqual({ ok: true });
    expect(regras.encerrar).toHaveBeenCalledWith(ID, ID);
    expect(revalidar).toHaveBeenCalledWith('/ativos/vistoria');
  });
});
