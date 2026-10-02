'use server';

import { revalidatePath } from 'next/cache';

import type { Resultado } from '@/lib/ativos/erros';
import { canManage, verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { abrirCampanha, encerrarCampanha } from '@/lib/vistoria/campanha';
import { ERRO_SEM_PERMISSAO } from '@/shared/ativos/ativo.constants';
import {
  type AbrirCampanhaInput,
  AbrirCampanhaSchema,
  type EncerrarCampanhaInput,
  EncerrarCampanhaSchema,
} from '@/shared/vistoria/vistoria.schemas';

/**
 * Campanha de vistoria (spec 0012, AC-1): só Admin e Preposto. Mesmo padrão
 * das actions de `/ativos`: `verifySession()` e conferência do papel, nunca
 * `requireManager()` (o `redirect()` dele lança aqui dentro).
 */
async function sessaoGestao() {
  const sessao = await verifySession();
  if (!sessao || !canManage(sessao.role)) return null;
  return sessao;
}

async function executar<T extends object>(
  rotulo: string,
  fn: () => Promise<Resultado<T>>,
): Promise<Resultado<T>> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[vistoria] ${rotulo}:`, e);
    return { ok: false, error: 'Não foi possível salvar agora. Tente de novo.' };
  }
}

export async function abrirCampanhaAction(
  raw: AbrirCampanhaInput,
): Promise<Resultado<{ id: string }>> {
  const sessao = await sessaoGestao();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = AbrirCampanhaSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  return executar('abrir campanha', async () => {
    await dbConnect();
    const r = await abrirCampanha(parsed.data.nome, sessao.userId);
    if (r.ok) revalidatePath('/ativos/vistoria');
    return r;
  });
}

export async function encerrarCampanhaAction(raw: EncerrarCampanhaInput): Promise<Resultado> {
  const sessao = await sessaoGestao();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = EncerrarCampanhaSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  return executar('encerrar campanha', async () => {
    await dbConnect();
    const r = await encerrarCampanha(parsed.data.id, sessao.userId);
    if (r.ok) revalidatePath('/ativos/vistoria');
    return r;
  });
}
