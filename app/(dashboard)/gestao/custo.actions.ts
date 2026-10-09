'use server';

import { revalidatePath } from 'next/cache';
import type { z } from 'zod';

import {
  adicionarMaterial,
  editarMaterial,
  informarValorFinalCotacao,
  removerMaterial,
} from '@/lib/chamados/custo';
import { canManage, verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { MENSAGENS_CUSTO } from '@/shared/chamados/custo.constants';
import {
  AdicionarMaterialSchema,
  EditarMaterialSchema,
  RemoverMaterialSchema,
  ValorFinalCotacaoSchema,
} from '@/shared/chamados/custo.schemas';

/**
 * Custo do chamado (spec 0018): só Admin e Preposto. `verifySession` +
 * `canManage` (nunca `requireManager`, cujo redirect viraria erro genérico).
 */

export type CustoActionResult = { ok: true; itemId?: string } | { ok: false; error: string };

async function executar<T>(
  nome: string,
  esquema: z.ZodType<T>,
  raw: unknown,
  fazer: (dados: T, userId: string) => Promise<CustoActionResult>,
): Promise<CustoActionResult> {
  const session = await verifySession();
  if (!session || !canManage(session.role)) {
    return { ok: false, error: MENSAGENS_CUSTO.semPermissao };
  }
  const parsed = esquema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  try {
    await dbConnect();
    const r = await fazer(parsed.data, session.userId);
    if (r.ok) {
      revalidatePath('/gestao');
      revalidatePath('/ativos', 'layout');
    }
    return r;
  } catch (e) {
    console.error(`${nome}:`, e);
    return { ok: false, error: MENSAGENS_CUSTO.falhaInesperada };
  }
}

export async function adicionarMaterialAction(raw: unknown): Promise<CustoActionResult> {
  return executar('adicionarMaterialAction', AdicionarMaterialSchema, raw, adicionarMaterial);
}

export async function editarMaterialAction(raw: unknown): Promise<CustoActionResult> {
  return executar('editarMaterialAction', EditarMaterialSchema, raw, editarMaterial);
}

export async function removerMaterialAction(raw: unknown): Promise<CustoActionResult> {
  return executar('removerMaterialAction', RemoverMaterialSchema, raw, removerMaterial);
}

export async function informarValorFinalCotacaoAction(raw: unknown): Promise<CustoActionResult> {
  return executar(
    'informarValorFinalCotacaoAction',
    ValorFinalCotacaoSchema,
    raw,
    informarValorFinalCotacao,
  );
}
