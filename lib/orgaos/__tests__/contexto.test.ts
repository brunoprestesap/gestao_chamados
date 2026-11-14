import { afterEach, describe, expect, it, vi } from 'vitest';

// Sem requisição: o `auth()` do NextAuth lança fora dela, e o teste reproduz isso.
vi.mock('@/auth', () => ({
  auth: vi.fn(async () => {
    throw new Error('fora da requisição');
  }),
}));

import {
  comOrgao,
  contextoAtual,
  modoIsolamento,
  OrgaoAusenteError,
  reiniciarModoIsolamentoParaTeste,
  semOrgao,
} from '@/lib/orgaos/contexto';
import { ChamadoModel } from '@/models/Chamado';
import { UserModel } from '@/models/user.model';

const A = '000000000000000000000001';
const B = '000000000000000000000002';

function usarModo(valor: string | undefined) {
  if (valor === undefined) delete process.env.ORGAO_ISOLAMENTO;
  else process.env.ORGAO_ISOLAMENTO = valor;
  reiniciarModoIsolamentoParaTeste();
}

afterEach(() => {
  vi.restoreAllMocks();
  usarModo('observacao');
});

describe('modoIsolamento (AC-3)', () => {
  it('ausente ou vazio vale estrito, sem erro no log', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    usarModo(undefined);
    expect(modoIsolamento()).toBe('estrito');
    usarModo('');
    expect(modoIsolamento()).toBe('estrito');
    expect(erro).not.toHaveBeenCalled();
  });

  it('valor inválido vale estrito e gera um console.error na primeira leitura', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    usarModo('observaçao');
    expect(modoIsolamento()).toBe('estrito');
    expect(modoIsolamento()).toBe('estrito');
    expect(erro).toHaveBeenCalledTimes(1);
  });

  it('aceita observacao e estrito', () => {
    usarModo('observacao');
    expect(modoIsolamento()).toBe('observacao');
    usarModo('estrito');
    expect(modoIsolamento()).toBe('estrito');
  });
});

describe('contexto (AC-2)', () => {
  it('comOrgao vence a sessão e chega ao código aguardado', async () => {
    const ctx = await comOrgao(A, async () => {
      await Promise.resolve();
      return contextoAtual();
    });
    expect(ctx).toEqual({ tipo: 'orgao', orgaoId: A, origem: 'explicito' });
  });

  it('comOrgao dentro de comOrgao com outro órgão lança', () => {
    expect(() => comOrgao(A, () => comOrgao(B, () => 1))).toThrow(/órgão diferente/);
    expect(comOrgao(A, () => comOrgao(A, () => 1))).toBe(1);
  });

  it('semOrgao exige motivo e marca o contexto', async () => {
    expect(() => semOrgao('  ', () => 1)).toThrow();
    const ctx = await semOrgao('teste', () => contextoAtual());
    expect(ctx).toEqual({ tipo: 'sem', motivo: 'teste' });
  });

  it('fora da requisição e sem comOrgao não há contexto', async () => {
    expect(await contextoAtual()).toBeNull();
  });

  it('recusa id de órgão inválido', () => {
    expect(() => comOrgao('xyz', () => 1)).toThrow(/inválido/);
  });
});

describe('falha fechada no estrito (AC-6), sem banco', () => {
  it('find, findById e create sem órgão lançam OrgaoAusenteError antes do banco', async () => {
    usarModo('estrito');
    await expect(ChamadoModel.find({}).lean()).rejects.toBeInstanceOf(OrgaoAusenteError);
    await expect(UserModel.findById(A).lean()).rejects.toBeInstanceOf(OrgaoAusenteError);
    await expect(UserModel.create({ username: 'x', name: 'X' })).rejects.toBeInstanceOf(
      OrgaoAusenteError,
    );
  });

  it('o erro leva modelo e operação, sem filtro nem documento', async () => {
    usarModo('estrito');
    const erro = await ChamadoModel.findOne({ titulo: 'segredo' })
      .lean()
      .catch((e: unknown) => e as OrgaoAusenteError);
    expect(erro).toBeInstanceOf(OrgaoAusenteError);
    expect((erro as OrgaoAusenteError).modelo).toBe('Chamado');
    expect((erro as OrgaoAusenteError).operacao).toBe('findOne');
    expect((erro as Error).message).not.toContain('segredo');
  });

  it('estimatedDocumentCount é recusado mesmo com órgão', async () => {
    usarModo('estrito');
    await expect(comOrgao(A, () => ChamadoModel.estimatedDocumentCount())).rejects.toThrow(
      /estimatedDocumentCount/,
    );
  });
});
