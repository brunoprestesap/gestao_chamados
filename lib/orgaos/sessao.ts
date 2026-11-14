import 'server-only';

import { UserModel } from '@/models/user.model';
import { ORGAO_1_ID } from '@/shared/orgaos/orgao.constants';

import { modoIsolamento, semOrgao } from './contexto';

/**
 * Lembra o órgão já lido de cada usuário. O `orgaoId` nunca muda depois de
 * gravado (AC-5), então a memória não envelhece; ela só evita ler o `User`
 * de novo a cada `auth()` de uma sessão antiga, cujo cookie o Server
 * Component não consegue regravar.
 */
const orgaoPorUsuario = new Map<string, string>();

/**
 * Completa o JWT aberto antes da troca, que não tem `orgaoId` (AC-10).
 *
 * Lê o `User` dentro de `semOrgao`: o órgão ainda não é conhecido, e esta
 * leitura roda dentro do `auth()`, então passar pelo plugin seria chamar o
 * `auth()` de dentro dele. Sem `orgaoId` no `User`: na observação vale o
 * órgão 1; no estrito devolve `null` e a sessão vale como deslogada.
 */
export async function orgaoDoTokenAntigo(userId: string): Promise<string | null> {
  const lembrado = orgaoPorUsuario.get(userId);
  if (lembrado) return lembrado;

  const { dbConnect } = await import('@/lib/db');
  await dbConnect();
  const user = await semOrgao('sessão antiga sem órgão no JWT (spec 0025, AC-10)', () =>
    UserModel.findById(userId).select('orgaoId').lean(),
  );
  const doUsuario = (user as { orgaoId?: unknown } | null)?.orgaoId;
  if (doUsuario) {
    const id = String(doUsuario);
    orgaoPorUsuario.set(userId, id);
    return id;
  }
  return modoIsolamento() === 'observacao' ? ORGAO_1_ID : null;
}

/** Só para testes. */
export function esquecerOrgaosLembradosParaTeste(): void {
  orgaoPorUsuario.clear();
}
