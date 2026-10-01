import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * As actions de escrita de ativo e local para a gestão (spec 0011): validam
 * a entrada antes do banco, repassam o autor da sessão para a regra de
 * negócio, revalidam as telas e nunca lançam (AC-4 a AC-7).
 */

const sessao = vi.hoisted(() => ({ atual: { userId: 'u1', role: 'Preposto' } }));
const revalidatePath = vi.hoisted(() => vi.fn());
const cadastro = vi.hoisted(() => ({
  criarAtivo: vi.fn(),
  editarAtivo: vi.fn(),
  alterarStatusAtivo: vi.fn(),
  validarAtivo: vi.fn(),
}));
const localizacao = vi.hoisted(() => ({
  criarLocalizacao: vi.fn(),
  editarLocalizacao: vi.fn(),
  desativarLocalizacao: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/lib/dal', () => ({
  verifySession: async () => sessao.atual,
  canManage: (role?: string) => role === 'Admin' || role === 'Preposto',
}));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/ativos/cadastro', () => cadastro);
vi.mock('@/lib/ativos/localizacao', () => localizacao);

import {
  alterarStatusAtivoAction,
  criarAtivoAction,
  editarLocalizacaoAction,
  validarAtivoAction,
} from '../actions';

const ID = '507f1f77bcf86cd799439011';
const interno = {
  origemCodigo: 'interno' as const,
  descricao: 'x',
  categoriaId: ID,
  tierManutencao: 'A' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('criarAtivoAction', () => {
  it('devolve o primeiro erro de validação sem chamar a regra de negócio', async () => {
    const r = await criarAtivoAction({ ...interno, origemCodigo: 'patrimonio' });
    expect(r).toEqual({ ok: false, error: 'Informe o tombamento.' });
    expect(cadastro.criarAtivo).not.toHaveBeenCalled();
  });

  it('repassa os dados com o autor da sessão e revalida a lista e a ficha', async () => {
    cadastro.criarAtivo.mockResolvedValue({ ok: true, id: ID, codigo: '11997' });
    const r = await criarAtivoAction({
      ...interno,
      origemCodigo: 'patrimonio',
      tombamento: '11997',
      descricao: ' Split ',
    });
    expect(r).toEqual({ ok: true, id: ID, codigo: '11997' });
    expect(cadastro.criarAtivo).toHaveBeenCalledWith(
      expect.objectContaining({ descricao: 'Split', tombamento: '11997' }),
      'u1',
    );
    expect(revalidatePath).toHaveBeenCalledWith('/ativos');
    expect(revalidatePath).toHaveBeenCalledWith(`/ativos/${ID}`);
  });

  it('erro inesperado do banco vira mensagem amigável, sem lançar', async () => {
    cadastro.criarAtivo.mockRejectedValue(new Error('conexão caiu'));
    const r = await criarAtivoAction(interno);
    expect(r).toEqual({ ok: false, error: 'Não foi possível salvar agora. Tente de novo.' });
  });

  it('falha de regra de negócio passa adiante e não revalida', async () => {
    cadastro.criarAtivo.mockResolvedValue({
      ok: false,
      error: 'Já existe um ativo com o código 1',
    });
    const r = await criarAtivoAction(interno);
    expect(r).toEqual({ ok: false, error: 'Já existe um ativo com o código 1' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('alterarStatusAtivoAction e validarAtivoAction', () => {
  it('passa status e observação limpos', async () => {
    cadastro.alterarStatusAtivo.mockResolvedValue({ ok: true });
    await alterarStatusAtivoAction({ id: ID, status: 'baixado', observacao: '  laudo  ' });
    expect(cadastro.alterarStatusAtivo).toHaveBeenCalledWith(
      { id: ID, status: 'baixado', observacao: 'laudo' },
      'u1',
    );
  });

  it('validar recusa id inválido antes do banco', async () => {
    expect((await validarAtivoAction({ id: 'x' })).ok).toBe(false);
    expect(cadastro.validarAtivo).not.toHaveBeenCalled();
  });
});

describe('editarLocalizacaoAction', () => {
  it('unidade vazia vira null (tirar a unidade) e ausente não mexe', async () => {
    localizacao.editarLocalizacao.mockResolvedValue({ ok: true });
    await editarLocalizacaoAction({ id: ID, unitId: '' });
    expect(localizacao.editarLocalizacao).toHaveBeenLastCalledWith({ id: ID, unitId: null });
    await editarLocalizacaoAction({ id: ID, nome: 'Sede' });
    expect(localizacao.editarLocalizacao).toHaveBeenLastCalledWith({ id: ID, nome: 'Sede' });
  });
});
