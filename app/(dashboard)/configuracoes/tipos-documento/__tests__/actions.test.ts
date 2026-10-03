import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Tipos de documento (spec 0013, AC-1): só Admin, chave validada antes do banco. */

const sessao = vi.hoisted(() => ({ atual: null as null | { userId: string; role: string } }));
const lib = vi.hoisted(() => ({
  criarTipoDocumento: vi.fn(),
  renomearTipoDocumento: vi.fn(),
  alternarTipoDocumento: vi.fn(),
}));
const revalidar = vi.hoisted(() => vi.fn());

vi.mock('@/lib/dal', () => ({
  verifySession: async () => sessao.atual,
  isAdmin: (role?: string) => role === 'Admin',
}));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: revalidar }));
vi.mock('@/lib/ativos/documentos/tipos', () => lib);

import {
  alternarTipoDocumentoAction,
  criarTipoDocumentoAction,
  editarTipoDocumentoAction,
} from '../actions';

const ID = 'a'.repeat(24);

beforeEach(() => {
  vi.clearAllMocks();
  sessao.atual = { userId: 'u'.repeat(24), role: 'Admin' };
  lib.criarTipoDocumento.mockResolvedValue({ ok: true, id: ID });
  lib.renomearTipoDocumento.mockResolvedValue({ ok: true });
  lib.alternarTipoDocumento.mockResolvedValue({ ok: true, isActive: false });
});

describe('criarTipoDocumentoAction', () => {
  it('Preposto não cria tipo', async () => {
    sessao.atual = { userId: 'u'.repeat(24), role: 'Preposto' };
    expect(await criarTipoDocumentoAction({ chave: 'pmoc', nome: 'PMOC' })).toEqual({
      ok: false,
      error: 'Sem permissão para esta ação.',
    });
    expect(lib.criarTipoDocumento).not.toHaveBeenCalled();
  });

  it.each(['Chave Ruim', 'a', 'pmoc-2', 'x'.repeat(41)])('chave "%s" é recusada', async (chave) => {
    const r = await criarTipoDocumentoAction({ chave, nome: 'Qualquer' });
    expect(r).toEqual({
      ok: false,
      error: 'A chave usa de 2 a 40 letras minúsculas, números ou "_".',
    });
  });

  it('chave em maiúsculas vira minúscula; nome é aparado', async () => {
    await criarTipoDocumentoAction({ chave: 'LAUDO_SPDA', nome: '  Laudo  ' });
    expect(lib.criarTipoDocumento).toHaveBeenCalledWith({ chave: 'laudo_spda', nome: 'Laudo' });
  });

  it('nome vazio é recusado', async () => {
    expect((await criarTipoDocumentoAction({ chave: 'pmoc', nome: '  ' })).ok).toBe(false);
  });

  it('cria e revalida tipos, categorias e painel', async () => {
    expect(await criarTipoDocumentoAction({ chave: 'pmoc', nome: 'PMOC' })).toEqual({
      ok: true,
      id: ID,
    });
    expect(revalidar).toHaveBeenCalledWith('/configuracoes/tipos-documento');
    expect(revalidar).toHaveBeenCalledWith('/configuracoes/categorias-ativo');
    expect(revalidar).toHaveBeenCalledWith('/ativos/documentos');
  });

  it('repetido volta a mensagem da regra, sem revalidar', async () => {
    lib.criarTipoDocumento.mockResolvedValue({
      ok: false,
      error: 'Já existe um tipo com essa chave ou esse nome.',
    });
    const r = await criarTipoDocumentoAction({ chave: 'pmoc', nome: 'PMOC' });
    expect(r).toEqual({ ok: false, error: 'Já existe um tipo com essa chave ou esse nome.' });
    expect(revalidar).not.toHaveBeenCalled();
  });
});

describe('editarTipoDocumentoAction e alternarTipoDocumentoAction', () => {
  it('renomear muda só o nome', async () => {
    await editarTipoDocumentoAction({ id: ID, nome: 'PMOC novo' });
    expect(lib.renomearTipoDocumento).toHaveBeenCalledWith(ID, 'PMOC novo');
  });

  it('alternar devolve a situação nova', async () => {
    expect(await alternarTipoDocumentoAction({ id: ID })).toEqual({ ok: true, isActive: false });
  });

  it('id inválido é recusado sem chegar ao banco', async () => {
    expect((await alternarTipoDocumentoAction({ id: 'x' })).ok).toBe(false);
    expect(lib.alternarTipoDocumento).not.toHaveBeenCalled();
  });

  it('erro inesperado vira mensagem fixa', async () => {
    lib.renomearTipoDocumento.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await editarTipoDocumentoAction({ id: ID, nome: 'X' })).toEqual({
      ok: false,
      error: 'Não foi possível salvar agora. Tente de novo.',
    });
  });
});
