import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(async () => {
    throw new Error('fora da requisição');
  }),
}));

import { idDoContador, idDoContadorAtual } from '@/lib/orgaos/contador';
import {
  comOrgao,
  OrgaoAusenteError,
  reiniciarModoIsolamentoParaTeste,
  semOrgao,
} from '@/lib/orgaos/contexto';
import { ORGAO_1_ID } from '@/shared/orgaos/orgao.constants';

const B = '000000000000000000000002';

function usarModo(modo: 'observacao' | 'estrito') {
  process.env.ORGAO_ISOLAMENTO = modo;
  reiniciarModoIsolamentoParaTeste();
}

afterEach(() => usarModo('estrito'));

describe('idDoContador (spec 0025, AC-12)', () => {
  it('o órgão 1 mantém o _id de hoje', () => {
    expect(idDoContador(ORGAO_1_ID, 'chamado_2026')).toBe('chamado_2026');
    expect(idDoContador(ORGAO_1_ID, 'ativo_mnt')).toBe('ativo_mnt');
  });

  it('os outros órgãos usam <orgaoId>:<chave>, com o id em minúsculas', () => {
    expect(idDoContador(B, 'chamado_2026')).toBe(`${B}:chamado_2026`);
    expect(idDoContador('0000000000000000000000AB', 'ativo_mnt')).toBe(
      '0000000000000000000000ab:ativo_mnt',
    );
  });
});

describe('idDoContadorAtual', () => {
  it('usa o órgão do comOrgao', async () => {
    expect(await comOrgao(B, () => idDoContadorAtual('ativo_mnt'))).toBe(`${B}:ativo_mnt`);
    expect(await comOrgao(ORGAO_1_ID, () => idDoContadorAtual('ativo_mnt'))).toBe('ativo_mnt');
  });

  it('no estrito sem órgão lança OrgaoAusenteError', async () => {
    usarModo('estrito');
    await expect(idDoContadorAtual('ativo_mnt')).rejects.toBeInstanceOf(OrgaoAusenteError);
  });

  it('na observação sem contexto vale o órgão 1', async () => {
    usarModo('observacao');
    expect(await idDoContadorAtual('chamado_2026')).toBe('chamado_2026');
  });

  it('dentro de semOrgao lança, nos dois modos: a sequência sempre é de um órgão', async () => {
    for (const modo of ['estrito', 'observacao'] as const) {
      usarModo(modo);
      await expect(semOrgao('teste', () => idDoContadorAtual('ativo_mnt'))).rejects.toBeInstanceOf(
        OrgaoAusenteError,
      );
    }
  });
});
