'use server';

import { revalidatePath } from 'next/cache';

import { criarCategoria, desativarCategoria, editarCategoria } from '@/lib/ativos/categoria';
import type { Resultado } from '@/lib/ativos/erros';
import { isAdmin, verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ERRO_SEM_PERMISSAO } from '@/shared/ativos/ativo.constants';
import {
  type CategoriaAtivoFormInput,
  CategoriaAtivoFormSchema,
  EditarCategoriaAtivoSchema,
  IdSchema,
} from '@/shared/ativos/ativo.schemas';

/**
 * Categorias de ativo (spec 0011, AC-3): só Admin. `verifySession()` em vez de
 * `requireAdmin()`, para devolver `ok: false` em vez de lançar o redirect.
 */
async function sessaoAdmin() {
  const sessao = await verifySession();
  return sessao && isAdmin(sessao.role) ? sessao : null;
}

function revalidar() {
  revalidatePath('/configuracoes/categorias-ativo');
  revalidatePath('/ativos');
}

async function executar<T extends object>(
  rotulo: string,
  fn: () => Promise<Resultado<T>>,
): Promise<Resultado<T>> {
  try {
    await dbConnect();
    const r = await fn();
    if (r.ok) revalidar();
    return r;
  } catch (e) {
    console.error(`[categorias-ativo] ${rotulo}:`, e);
    return { ok: false, error: 'Não foi possível salvar agora. Tente de novo.' };
  }
}

export async function criarCategoriaAtivoAction(
  raw: CategoriaAtivoFormInput,
): Promise<Resultado<{ id: string }>> {
  if (!(await sessaoAdmin())) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = CategoriaAtivoFormSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  return executar('criar', () => criarCategoria(parsed.data));
}

export async function editarCategoriaAtivoAction(
  raw: CategoriaAtivoFormInput & { id: string },
): Promise<Resultado> {
  if (!(await sessaoAdmin())) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = EditarCategoriaAtivoSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const { id, ...dados } = parsed.data;
  return executar('editar', () => editarCategoria(id, dados));
}

export async function desativarCategoriaAtivoAction(raw: { id: string }): Promise<Resultado> {
  if (!(await sessaoAdmin())) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = IdSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  return executar('desativar', () => desativarCategoria(parsed.data.id));
}
