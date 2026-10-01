import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Solicitante e Técnico nunca escrevem no módulo de ativos (spec 0011,
 * AC-17): toda action de escrita devolve `ok: false` com a mensagem fixa, sem
 * lançar o redirect, e sem chegar ao banco.
 */

const sessao = vi.hoisted(() => ({ atual: null as null | { userId: string; role: string } }));
const banco = vi.hoisted(() => ({ dbConnect: vi.fn() }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/dal', () => ({
  verifySession: async () => sessao.atual,
  canManage: (role?: string) => role === 'Admin' || role === 'Preposto',
  isAdmin: (role?: string) => role === 'Admin',
}));
vi.mock('@/lib/db', () => banco);
vi.mock('@/lib/ativos/cadastro', () => ({
  criarAtivo: vi.fn(),
  editarAtivo: vi.fn(),
  alterarStatusAtivo: vi.fn(),
  validarAtivo: vi.fn(),
}));
vi.mock('@/lib/ativos/localizacao', () => ({
  criarLocalizacao: vi.fn(),
  editarLocalizacao: vi.fn(),
  desativarLocalizacao: vi.fn(),
}));
vi.mock('@/lib/ativos/categoria', () => ({
  criarCategoria: vi.fn(),
  editarCategoria: vi.fn(),
  desativarCategoria: vi.fn(),
}));

import {
  criarCategoriaAtivoAction,
  desativarCategoriaAtivoAction,
  editarCategoriaAtivoAction,
} from '@/app/(dashboard)/configuracoes/categorias-ativo/actions';
import { criarCategoria } from '@/lib/ativos/categoria';

import {
  alterarStatusAtivoAction,
  criarAtivoAction,
  criarLocalizacaoAction,
  desativarLocalizacaoAction,
  editarAtivoAction,
  editarLocalizacaoAction,
  validarAtivoAction,
} from '../actions';

const ID = '507f1f77bcf86cd799439011';
const SEM_PERMISSAO = { ok: false, error: 'Sem permissão para esta ação.' };

const acoesDeGestao = {
  criarLocalizacaoAction: () => criarLocalizacaoAction({ nome: 'Sede', tipo: 'predio' }),
  editarLocalizacaoAction: () => editarLocalizacaoAction({ id: ID, nome: 'X' }),
  desativarLocalizacaoAction: () => desativarLocalizacaoAction({ id: ID }),
  criarAtivoAction: () =>
    criarAtivoAction({
      origemCodigo: 'patrimonio',
      tombamento: '1',
      descricao: 'x',
      categoriaId: ID,
      tierManutencao: 'A',
    }),
  editarAtivoAction: () =>
    editarAtivoAction({
      id: ID,
      descricao: 'x',
      categoriaId: ID,
      tierManutencao: 'A',
      criticidade: 'media',
    }),
  alterarStatusAtivoAction: () => alterarStatusAtivoAction({ id: ID, status: 'inoperante' }),
  validarAtivoAction: () => validarAtivoAction({ id: ID }),
};

const acoesDeAdmin = {
  criarCategoriaAtivoAction: () =>
    criarCategoriaAtivoAction({ chave: 'abc', nome: 'Abc', criticidadePadrao: 'baixa' }),
  editarCategoriaAtivoAction: () =>
    editarCategoriaAtivoAction({ id: ID, chave: 'abc', nome: 'Abc', criticidadePadrao: 'baixa' }),
  desativarCategoriaAtivoAction: () => desativarCategoriaAtivoAction({ id: ID }),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each(['Solicitante', 'Técnico'])('%s', (role) => {
  beforeEach(() => {
    sessao.atual = { userId: ID, role };
  });

  it.each(Object.entries({ ...acoesDeGestao, ...acoesDeAdmin }))(
    '%s devolve sem permissão e não toca o banco',
    async (_nome, chamar) => {
      await expect(chamar()).resolves.toEqual(SEM_PERMISSAO);
      expect(banco.dbConnect).not.toHaveBeenCalled();
    },
  );
});

describe('sem sessão', () => {
  it('também devolve sem permissão', async () => {
    sessao.atual = null;
    await expect(acoesDeGestao.criarAtivoAction()).resolves.toEqual(SEM_PERMISSAO);
  });
});

describe('Preposto', () => {
  it('não mexe em categoria, que é só do Admin', async () => {
    sessao.atual = { userId: ID, role: 'Preposto' };
    for (const chamar of Object.values(acoesDeAdmin)) {
      await expect(chamar()).resolves.toEqual(SEM_PERMISSAO);
    }
  });

  it('passa da barreira nas actions de gestão', async () => {
    sessao.atual = { userId: ID, role: 'Preposto' };
    const r = await acoesDeGestao.validarAtivoAction();
    expect(r).not.toEqual(SEM_PERMISSAO);
    expect(banco.dbConnect).toHaveBeenCalled();
  });
});

describe('Admin', () => {
  it('cria categoria', async () => {
    sessao.atual = { userId: ID, role: 'Admin' };
    vi.mocked(criarCategoria).mockResolvedValue({ ok: true, id: ID });
    await expect(acoesDeAdmin.criarCategoriaAtivoAction()).resolves.toEqual({ ok: true, id: ID });
  });
});
