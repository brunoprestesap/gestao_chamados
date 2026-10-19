import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * As actions da cotação de material (spec 0019): sessão, validação antes de
 * qualquer regra, repasse do ator a `transicionar` e a remoção de arquivo.
 * As regras de cada transição estão em `lib/material/__tests__/*.db.test.ts`.
 *
 * covers: AC-1, AC-5, AC-8, AC-10, AC-15
 */

const sessao = vi.hoisted(() => ({ atual: null as null | { userId: string; role: string } }));
const lib = vi.hoisted(() => ({
  criarCotacao: vi.fn(),
  salvarRascunho: vi.fn(),
  transicionar: vi.fn(),
}));
const banco = vi.hoisted(() => ({
  arquivo: null as null | Record<string, unknown>,
  situacao: 'rascunho',
  notaFiscal: null as null | { arquivoId: string },
  responsavelTecnico: true,
  atualizado: vi.fn(),
}));

vi.mock('@/lib/dal', () => ({ verifySession: async () => sessao.atual }));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
vi.mock('@/lib/material/transicoes', () => lib);
vi.mock('@/lib/material/papeis', () => ({
  papeisDe: async () => ({
    tem: (p: string) => p === 'responsavel_tecnico' && banco.responsavelTecnico,
  }),
}));
vi.mock('@/models/CotacaoMaterial', () => ({
  CotacaoMaterialModel: {
    findById: () => ({
      select: () => ({
        lean: async () => ({
          chamadoId: 'ch',
          situacao: banco.situacao,
          notaFiscal: banco.notaFiscal,
        }),
      }),
    }),
  },
}));
vi.mock('@/models/ArquivoCotacao', () => ({
  ArquivoCotacaoModel: {
    findOne: () => ({ lean: async () => banco.arquivo }),
    findById: () => ({ select: () => ({ lean: async () => banco.arquivo }) }),
    updateOne: banco.atualizado,
  },
}));

import {
  aprovarAction,
  criarCotacaoAction,
  devolverAction,
  enviarCotacaoAction,
  executarAction,
  removerArquivoAction,
  salvarRascunhoAction,
} from '../actions';

const ID = 'c'.repeat(24);
const EU = 'u'.repeat(24);
const item = { descricao: 'Disjuntor', unidade: 'un', quantidade: 2, motivo: 'Troca' };

beforeEach(() => {
  vi.clearAllMocks();
  sessao.atual = { userId: EU, role: 'Preposto' };
  lib.transicionar.mockResolvedValue({ ok: true, situacao: 'enviada', versao: 3 });
  lib.criarCotacao.mockResolvedValue({ ok: true, id: ID });
  lib.salvarRascunho.mockResolvedValue({ ok: true, versao: 2 });
  banco.arquivo = { _id: 'a'.repeat(24), cotacaoId: ID, tipo: 'orcamento', enviadoPorUserId: EU };
  banco.situacao = 'rascunho';
  banco.notaFiscal = null;
  banco.responsavelTecnico = true;
});

describe('sessão', () => {
  it('sem sessão nenhuma action chega na regra', async () => {
    sessao.atual = null;
    const r = await enviarCotacaoAction({ id: ID, versao: 1 });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/Sessão/) });
    expect(lib.transicionar).not.toHaveBeenCalled();
  });
});

describe('validação antes da regra', () => {
  it('criar sem itens é recusado sem chamar a regra (AC-1)', async () => {
    const r = await criarCotacaoAction({ chamadoId: ID, itens: [] });
    expect(r.ok).toBe(false);
    expect(lib.criarCotacao).not.toHaveBeenCalled();
  });

  it('devolver sem motivo é recusado sem chamar a regra (AC-5)', async () => {
    const r = await devolverAction({ id: ID, versao: 2, motivo: '' });
    expect(r.ok).toBe(false);
    expect(lib.transicionar).not.toHaveBeenCalled();
  });

  it('aprovar sem empenho é recusado (AC-8)', async () => {
    expect((await aprovarAction({ id: ID, versao: 2 })).ok).toBe(false);
    expect(lib.transicionar).not.toHaveBeenCalled();
  });

  it('executar com quantidade negativa é recusado (AC-10)', async () => {
    const r = await executarAction({
      id: ID,
      versao: 2,
      quantidades: [{ itemId: ID, quantidadeExecutada: -1 }],
    });
    expect(r.ok).toBe(false);
    expect(lib.transicionar).not.toHaveBeenCalled();
  });

  it('salvar com versão ausente é recusado', async () => {
    expect((await salvarRascunhoAction({ id: ID, itens: [{ ...item, id: ID }] })).ok).toBe(false);
    expect(lib.salvarRascunho).not.toHaveBeenCalled();
  });
});

describe('repasse', () => {
  it('o ator vem da sessão, nunca da entrada', async () => {
    await enviarCotacaoAction({ id: ID, versao: 1, ator: { tipo: 'sistema', userId: null } });
    expect(lib.transicionar).toHaveBeenCalledWith({
      cotacaoId: ID,
      acao: 'enviar',
      versao: 1,
      ator: { tipo: 'usuario', userId: EU, role: 'Preposto' },
    });
  });

  it('aprovar repassa o empenho escolhido', async () => {
    await aprovarAction({ id: ID, versao: 4, empenhoId: 'e'.repeat(24) });
    expect(lib.transicionar).toHaveBeenCalledWith(
      expect.objectContaining({ acao: 'aprovar', empenhoId: 'e'.repeat(24) }),
    );
  });

  it('devolve impedimentos da regra como vieram', async () => {
    lib.transicionar.mockResolvedValue({
      ok: false,
      error: 'Faltam orçamentos para enviar.',
      impedimentos: ['orcamentos_insuficientes'],
    });
    expect(await enviarCotacaoAction({ id: ID, versao: 1 })).toEqual({
      ok: false,
      error: 'Faltam orçamentos para enviar.',
      impedimentos: ['orcamentos_insuficientes'],
    });
  });

  it('erro inesperado vira mensagem fixa, nunca throw', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    lib.transicionar.mockRejectedValue(new Error('mongo caiu'));
    const r = await enviarCotacaoAction({ id: ID, versao: 1 });
    expect(r).toEqual({ ok: false, error: expect.not.stringContaining('mongo') });
  });
});

describe('removerArquivoAction', () => {
  it('quem enviou remove no rascunho, marcando removidoEm', async () => {
    const r = await removerArquivoAction({ arquivoId: 'a'.repeat(24) });
    expect(r.ok).toBe(true);
    expect(banco.atualizado).toHaveBeenCalledWith(expect.objectContaining({ removidoEm: null }), {
      $set: expect.objectContaining({ removidoEm: expect.any(Date), removidoPorUserId: EU }),
    });
  });

  it('outra pessoa não remove', async () => {
    banco.arquivo = { ...banco.arquivo, enviadoPorUserId: 'x'.repeat(24) };
    expect((await removerArquivoAction({ arquivoId: 'a'.repeat(24) })).ok).toBe(false);
    expect(banco.atualizado).not.toHaveBeenCalled();
  });

  it('fora de rascunho ou devolvida, não remove', async () => {
    banco.situacao = 'enviada';
    expect((await removerArquivoAction({ arquivoId: 'a'.repeat(24) })).ok).toBe(false);
    expect(banco.atualizado).not.toHaveBeenCalled();
  });

  it('na atestada, remove a NF ainda não ligada à nota, para a nova tentativa (AC-22)', async () => {
    banco.situacao = 'atestada';
    banco.arquivo = { ...banco.arquivo, tipo: 'nota_fiscal' };
    banco.notaFiscal = null;
    expect((await removerArquivoAction({ arquivoId: 'a'.repeat(24) })).ok).toBe(true);
    expect(banco.atualizado).toHaveBeenCalled();
  });

  it('na atestada, quem enviou mas perdeu a designação de responsável técnico não remove (AC-22)', async () => {
    banco.situacao = 'atestada';
    banco.arquivo = { ...banco.arquivo, tipo: 'nota_fiscal' };
    banco.responsavelTecnico = false;
    expect((await removerArquivoAction({ arquivoId: 'a'.repeat(24) })).ok).toBe(false);
    expect(banco.atualizado).not.toHaveBeenCalled();
  });

  it('na atestada, a NF ligada à nota não sai (AC-22)', async () => {
    banco.situacao = 'atestada';
    banco.arquivo = { ...banco.arquivo, tipo: 'nota_fiscal' };
    banco.notaFiscal = { arquivoId: String(banco.arquivo._id) };
    expect((await removerArquivoAction({ arquivoId: 'a'.repeat(24) })).ok).toBe(false);
    expect(banco.atualizado).not.toHaveBeenCalled();
  });

  it('id inválido é recusado sem consultar', async () => {
    expect((await removerArquivoAction({ arquivoId: '../x' })).ok).toBe(false);
  });
});
