import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Corrigir e excluir documento (spec 0013, AC-5, AC-6 e AC-10): só Admin e
 * Preposto, validação antes do banco e o erro inesperado vira mensagem fixa.
 * A regra de gravação mora em `lib/ativos/documentos/gravar.ts` (teste de banco).
 */

const sessao = vi.hoisted(() => ({ atual: null as null | { userId: string; role: string } }));
const lib = vi.hoisted(() => ({ corrigirDocumento: vi.fn(), excluirDocumento: vi.fn() }));
const revalidar = vi.hoisted(() => vi.fn());

vi.mock('@/lib/dal', () => ({
  verifySession: async () => sessao.atual,
  canManage: (role?: string) => role === 'Admin' || role === 'Preposto',
}));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: revalidar }));
vi.mock('@/lib/ativos/documentos/gravar', () => lib);
vi.mock('@/models/DocumentoAtivo', () => ({
  DocumentoAtivoModel: {
    findById: () => ({ select: () => ({ lean: async () => ({ ativoId: 'a'.repeat(24) }) }) }),
  },
}));

import { corrigirDocumentoAction, excluirDocumentoAction } from '../actions';

const ID = 'd'.repeat(24);
const correcao = {
  id: ID,
  numero: 'P-1',
  emitidoPor: '',
  emitidoEm: '2026-01-10',
  validadeAte: '2027-01-10',
};

beforeEach(() => {
  vi.clearAllMocks();
  sessao.atual = { userId: 'u'.repeat(24), role: 'Preposto' };
  lib.corrigirDocumento.mockResolvedValue({ ok: true });
  lib.excluirDocumento.mockResolvedValue({ ok: true });
});

describe('corrigirDocumentoAction', () => {
  it.each(['Técnico', 'Solicitante'])('%s é recusado no servidor (AC-10)', async (role) => {
    sessao.atual = { userId: 'u'.repeat(24), role };
    expect(await corrigirDocumentoAction(correcao)).toEqual({
      ok: false,
      error: 'Sem permissão para esta ação.',
    });
    expect(lib.corrigirDocumento).not.toHaveBeenCalled();
  });

  it('sem sessão é recusado', async () => {
    sessao.atual = null;
    expect((await corrigirDocumentoAction(correcao)).ok).toBe(false);
  });

  it('validade anterior à emissão volta como erro, sem chegar ao banco (AC-5)', async () => {
    const r = await corrigirDocumentoAction({ ...correcao, validadeAte: '2025-01-01' });
    expect(r).toEqual({ ok: false, error: 'A validade não pode ser anterior à emissão.' });
    expect(lib.corrigirDocumento).not.toHaveBeenCalled();
  });

  it('corrige com o autor da sessão e revalida a ficha e o painel', async () => {
    expect(await corrigirDocumentoAction(correcao)).toEqual({ ok: true });
    expect(lib.corrigirDocumento).toHaveBeenCalledWith(
      expect.objectContaining({ id: ID, numero: 'P-1', emitidoPor: undefined }),
      'u'.repeat(24),
    );
    expect(revalidar).toHaveBeenCalledWith('/ativos/documentos');
    expect(revalidar).toHaveBeenCalledWith(`/ativos/${'a'.repeat(24)}`);
  });

  it('repassa a recusa da regra (ex.: documento não vigente)', async () => {
    lib.corrigirDocumento.mockResolvedValue({
      ok: false,
      error: 'Só o documento vigente pode ser corrigido.',
      status: 400,
    });
    expect(await corrigirDocumentoAction(correcao)).toEqual({
      ok: false,
      error: 'Só o documento vigente pode ser corrigido.',
    });
  });

  it('erro inesperado vira mensagem fixa, nunca lança', async () => {
    lib.corrigirDocumento.mockRejectedValue(new Error('mongo caiu'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await corrigirDocumentoAction(correcao)).toEqual({
      ok: false,
      error: 'Não foi possível salvar agora. Tente de novo.',
    });
  });
});

describe('excluirDocumentoAction (AC-6)', () => {
  it('motivo vazio ou só espaço é recusado', async () => {
    expect(await excluirDocumentoAction({ id: ID, motivo: '   ' })).toEqual({
      ok: false,
      error: 'Informe o motivo da exclusão.',
    });
    expect(lib.excluirDocumento).not.toHaveBeenCalled();
  });

  it('motivo acima de 500 caracteres é recusado', async () => {
    const r = await excluirDocumentoAction({ id: ID, motivo: 'x'.repeat(501) });
    expect(r.ok).toBe(false);
  });

  it('exclui com o motivo aparado e o autor da sessão', async () => {
    expect(await excluirDocumentoAction({ id: ID, motivo: '  errado  ' })).toEqual({ ok: true });
    expect(lib.excluirDocumento).toHaveBeenCalledWith(ID, 'errado', 'u'.repeat(24));
  });

  it('Técnico é recusado no servidor (AC-10)', async () => {
    sessao.atual = { userId: 'u'.repeat(24), role: 'Técnico' };
    expect((await excluirDocumentoAction({ id: ID, motivo: 'x' })).ok).toBe(false);
    expect(lib.excluirDocumento).not.toHaveBeenCalled();
  });
});
