import 'server-only';

import { ORGAO_1_ID } from '@/shared/orgaos/orgao.constants';

import { contextoAtual, modoIsolamento, OrgaoAusenteError } from './contexto';

/**
 * O `_id` do `Contador` de uma sequência num órgão (spec 0025, AC-12).
 *
 * O órgão 1 mantém os `_id` de hoje (`chamado_2026`, `ativo_mnt`) e continua a
 * numeração de onde parou; os outros órgãos usam `<orgaoId>:<chave>`. Nenhum
 * código monta o `_id` à mão: tudo passa por aqui.
 */
export function idDoContador(orgaoId: string, chave: string): string {
  const id = String(orgaoId).toLowerCase();
  return id === ORGAO_1_ID ? chave : `${id}:${chave}`;
}

/**
 * O `_id` do `Contador` no órgão da operação em curso: o do contexto (o
 * `comOrgao` ou o JWT). Na observação sem contexto vale o órgão 1, como a
 * gravação sem contexto (AC-8). No estrito sem órgão, ou dentro de `semOrgao`,
 * lança `OrgaoAusenteError`: uma sequência sempre pertence a um órgão.
 */
export async function idDoContadorAtual(chave: string): Promise<string> {
  const contexto = await contextoAtual();
  if (contexto?.tipo === 'orgao') return idDoContador(contexto.orgaoId, chave);
  if (!contexto && modoIsolamento() === 'observacao') return idDoContador(ORGAO_1_ID, chave);
  throw new OrgaoAusenteError('Contador', 'idDoContador');
}
