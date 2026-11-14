import { ORGAO_1_ID } from '@/shared/orgaos/orgao.constants';

/**
 * A sessão simulada dos testes de banco (spec 0025, AC-16).
 *
 * Na requisição, o órgão de cada consulta vem do `orgaoId` do JWT, lido por
 * `auth()`. Os testes de banco chamam as funções de `lib/` direto, sem
 * requisição; `tests/setup-db-orgao.ts` troca o `auth()` por esta sessão, de
 * um usuário do órgão 1, para o plugin seguir o mesmo caminho da produção em
 * `estrito`. Teste que precisa de "sem sessão" (os de órgão) chama
 * `definirOrgaoDaSessaoDeTeste(null)`.
 */
let orgaoDaSessao: string | null = ORGAO_1_ID;

export function definirOrgaoDaSessaoDeTeste(orgaoId: string | null): void {
  orgaoDaSessao = orgaoId;
}

export function orgaoDaSessaoDeTeste(): string | null {
  return orgaoDaSessao;
}

export function sessaoDeTeste(): { user: { orgaoId: string } } | null {
  return orgaoDaSessao ? { user: { orgaoId: orgaoDaSessao } } : null;
}
