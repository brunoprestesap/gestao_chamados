'use server';

import { revalidatePath } from 'next/cache';

import type { Resultado } from '@/lib/ativos/erros';
import { aplicarImportacao, type ResultadoAplicacao } from '@/lib/ativos/importacao/aplicar';
import { descartarImportacao } from '@/lib/ativos/importacao/pendente';
import { isAdmin, verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ERRO_SEM_PERMISSAO } from '@/shared/ativos/ativo.constants';
import {
  type AplicarImportacaoInput,
  AplicarImportacaoSchema,
  type DescartarImportacaoInput,
  DescartarImportacaoSchema,
} from '@/shared/ativos/importacao.schemas';

/**
 * Importador do SICAM (spec 0012, AC-21 a AC-27): só o Admin. Mesmo padrão
 * das actions de `/ativos`: `verifySession()` e conferência do papel, nunca
 * `requireAdmin()` (o `redirect()` dele lança aqui dentro).
 */
async function sessaoAdmin() {
  const sessao = await verifySession();
  if (!sessao || !isAdmin(sessao.role)) return null;
  return sessao;
}

async function executar<T extends object>(
  rotulo: string,
  fn: () => Promise<Resultado<T>>,
): Promise<Resultado<T>> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[importacao] ${rotulo}:`, e);
    return { ok: false, error: 'Não foi possível concluir agora. Tente de novo.' };
  }
}

function revalidar(id: string) {
  revalidatePath('/ativos');
  revalidatePath('/ativos/importar');
  revalidatePath(`/ativos/importar/${id}`);
}

export async function aplicarImportacaoAction(
  raw: AplicarImportacaoInput,
): Promise<Resultado<{ resultado: ResultadoAplicacao }>> {
  const sessao = await sessaoAdmin();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = AplicarImportacaoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Seleção inválida. Recarregue a página.' };

  const { id, ...selecao } = parsed.data;
  return executar('aplicar', async () => {
    await dbConnect();
    const r = await aplicarImportacao(id, selecao, sessao.userId);
    revalidar(id);
    return r;
  });
}

export async function descartarImportacaoAction(raw: DescartarImportacaoInput): Promise<Resultado> {
  const sessao = await sessaoAdmin();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = DescartarImportacaoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Importação inválida.' };

  return executar('descartar', async () => {
    await dbConnect();
    const r = await descartarImportacao(parsed.data.id, sessao.userId);
    if (r.ok) revalidar(parsed.data.id);
    return r;
  });
}
