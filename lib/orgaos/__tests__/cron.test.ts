import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Spec 0025, AC-13: `paraCadaOrgaoAtivo` roda um órgão ativo por vez, cada um
 * no seu `comOrgao`, segue depois da falha de um e resume por sigla.
 *
 * covers: AC-13
 */

// Fora da requisição: o `auth()` lança, como no container `cron`.
vi.mock('@/auth', () => ({
  auth: vi.fn(async () => {
    throw new Error('fora da requisição');
  }),
}));
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }));
const lista = vi.hoisted(() => ({ atual: [] as { _id: string; sigla: string }[] }));
vi.mock('@/models/Orgao', () => ({
  OrgaoModel: {
    find: vi.fn(() => ({
      sort: () => ({ select: () => ({ lean: async () => lista.atual }) }),
    })),
  },
}));

import { contextoAtual } from '@/lib/orgaos/contexto';
import { ERRO_DA_RODADA, paraCadaOrgaoAtivo, respostaDaRodada } from '@/lib/orgaos/cron';
import { OrgaoModel } from '@/models/Orgao';

const A = '000000000000000000000001';
const B = '000000000000000000000002';

beforeEach(() => {
  lista.atual = [
    { _id: A, sigla: 'SJAP' },
    { _id: B, sigla: 'SJPA' },
  ];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('paraCadaOrgaoAtivo (AC-13)', () => {
  it('lê só os órgãos ativos e roda cada volta dentro do órgão dela', async () => {
    const vistos: unknown[] = [];

    const r = await paraCadaOrgaoAtivo('teste', async (orgao) => {
      const ctx = await contextoAtual();
      vistos.push({ sigla: orgao.sigla, ctx });
      return { feitos: orgao.sigla.length };
    });

    expect(vi.mocked(OrgaoModel.find)).toHaveBeenCalledWith({ ativo: true });
    expect(vistos).toEqual([
      { sigla: 'SJAP', ctx: { tipo: 'orgao', orgaoId: A, origem: 'explicito' } },
      { sigla: 'SJPA', ctx: { tipo: 'orgao', orgaoId: B, origem: 'explicito' } },
    ]);
    expect(r).toEqual({ ok: true, porOrgao: { SJAP: { feitos: 4 }, SJPA: { feitos: 4 } } });
    expect(respostaDaRodada(r).status).toBe(200);
  });

  it('a falha de um órgão vai ao log, não impede o outro e vira 500', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});

    const r = await paraCadaOrgaoAtivo('teste', async (orgao) => {
      if (orgao.sigla === 'SJAP') throw new Error('matrícula 12345 duplicada');
      return { feitos: 1 };
    });

    expect(r).toEqual({
      ok: false,
      porOrgao: { SJAP: { erro: ERRO_DA_RODADA }, SJPA: { feitos: 1 } },
    });
    // O texto do erro (que pode ter dado pessoal) fica só no log, nunca na resposta.
    expect(JSON.stringify(r)).not.toContain('12345');
    expect(erro).toHaveBeenCalledOnce();
    const resposta = respostaDaRodada(r);
    expect(resposta.status).toBe(500);
  });

  it('sem órgão ativo não roda nada e responde 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    lista.atual = [];
    const fn = vi.fn();

    const r = await paraCadaOrgaoAtivo('teste', fn);

    expect(fn).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, porOrgao: {} });
    expect(respostaDaRodada(r).status).toBe(500);
  });
});
