import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Server Actions do cadastro de contratos (spec 0016): só Admin, validação
 * antes de tocar o banco, revalidação das duas telas quando dá certo e erro
 * inesperado virando mensagem fixa, nunca exceção.
 *
 * covers: AC-1, AC-2, AC-3, AC-4, AC-20
 */

const sessao = vi.hoisted(() => ({ atual: null as null | { role: string } }));
const lib = vi.hoisted(() => ({
  criarContrato: vi.fn(),
  editarContrato: vi.fn(),
  alterarSituacaoContrato: vi.fn(),
}));
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock('@/lib/dal', () => ({
  verifySession: vi.fn(async () => sessao.atual),
  isAdmin: (role?: string) => role === 'Admin',
}));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/contratos/cadastro', () => lib);
vi.mock('next/cache', () => ({ revalidatePath }));

import { ERRO_SEM_PERMISSAO } from '@/shared/ativos/ativo.constants';

import {
  alterarSituacaoContratoAction,
  criarContratoAction,
  editarContratoAction,
} from '../actions';

const ID = 'a'.repeat(24);
const valido = {
  numero: ' 12/2025 ',
  empresa: 'Refrigeração Amazônia',
  cnpj: '11.222.333/0001-81',
  processoSei: '0001234-56.2025',
  vigenciaInicio: '2025-03-01',
  vigenciaFim: '2026-02-28',
  tiposServico: ['Ar-Condicionado' as const],
};

beforeEach(() => {
  vi.clearAllMocks();
  sessao.atual = { role: 'Admin' };
  lib.criarContrato.mockResolvedValue({ ok: true, id: ID });
  lib.editarContrato.mockResolvedValue({ ok: true });
  lib.alterarSituacaoContrato.mockResolvedValue({ ok: true });
});

describe('permissão (AC-20)', () => {
  it.each([null, { role: 'Preposto' }, { role: 'Técnico' }])(
    'recusa sem sessão ou sem perfil Admin (%o) e não chama o cadastro',
    async (s) => {
      sessao.atual = s;
      expect(await criarContratoAction(valido)).toEqual({ ok: false, error: ERRO_SEM_PERMISSAO });
      expect(await editarContratoAction({ id: ID, ...valido })).toEqual({
        ok: false,
        error: ERRO_SEM_PERMISSAO,
      });
      expect(await alterarSituacaoContratoAction({ id: ID, isActive: false })).toEqual({
        ok: false,
        error: ERRO_SEM_PERMISSAO,
      });
      expect(lib.criarContrato).not.toHaveBeenCalled();
      expect(lib.editarContrato).not.toHaveBeenCalled();
      expect(lib.alterarSituacaoContrato).not.toHaveBeenCalled();
    },
  );
});

describe('criarContratoAction', () => {
  it('passa os dados já limpos para o cadastro e revalida as duas telas', async () => {
    const r = await criarContratoAction(valido);

    expect(r).toEqual({ ok: true, id: ID });
    expect(lib.criarContrato).toHaveBeenCalledWith(
      expect.objectContaining({ numero: '12/2025', cnpj: '11222333000181', objeto: null }),
    );
    expect(revalidatePath).toHaveBeenCalledWith('/configuracoes/contratos');
    expect(revalidatePath).toHaveBeenCalledWith('/relatorios/contrato');
  });

  it('devolve a primeira mensagem do Zod sem chamar o cadastro (AC-2)', async () => {
    const r = await criarContratoAction({ ...valido, cnpj: '11.222.333/0001-82' });

    expect(r).toEqual({ ok: false, error: 'CNPJ inválido.' });
    expect(lib.criarContrato).not.toHaveBeenCalled();
  });

  it('data com mês 13 volta como erro de validação, sem lançar (AC-2)', async () => {
    const r = await criarContratoAction({ ...valido, vigenciaInicio: '2026-13-01' });

    expect(r).toEqual({ ok: false, error: 'Início da vigência inválido.' });
    expect(lib.criarContrato).not.toHaveBeenCalled();
  });

  it('repassa a recusa do cadastro e não revalida (AC-3)', async () => {
    lib.criarContrato.mockResolvedValueOnce({ ok: false, error: 'O contrato 1 já cobre …' });

    expect(await criarContratoAction(valido)).toEqual({
      ok: false,
      error: 'O contrato 1 já cobre …',
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('erro inesperado vira mensagem fixa, sem lançar', async () => {
    lib.criarContrato.mockRejectedValueOnce(new Error('mongo caiu'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await criarContratoAction(valido)).toEqual({
      ok: false,
      error: 'Não foi possível salvar agora. Tente de novo.',
    });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe('editarContratoAction', () => {
  it('separa o id dos campos e repassa os dois', async () => {
    expect(await editarContratoAction({ id: ID, ...valido })).toEqual({ ok: true });
    expect(lib.editarContrato).toHaveBeenCalledWith(
      ID,
      expect.not.objectContaining({ id: expect.anything() }),
    );
  });

  it('recusa id que não é ObjectId', async () => {
    expect(await editarContratoAction({ id: 'x', ...valido })).toEqual({
      ok: false,
      error: 'Contrato inválido.',
    });
    expect(lib.editarContrato).not.toHaveBeenCalled();
  });
});

describe('alterarSituacaoContratoAction (AC-4)', () => {
  it('inativa e reativa pelo booleano recebido', async () => {
    await alterarSituacaoContratoAction({ id: ID, isActive: false });
    await alterarSituacaoContratoAction({ id: ID, isActive: true });

    expect(lib.alterarSituacaoContrato).toHaveBeenNthCalledWith(1, ID, false);
    expect(lib.alterarSituacaoContrato).toHaveBeenNthCalledWith(2, ID, true);
  });

  it('recusa situação que não é booleana', async () => {
    const r = await alterarSituacaoContratoAction({ id: ID, isActive: 'sim' as never });
    expect(r).toEqual({ ok: false, error: 'Situação inválida.' });
  });
});
