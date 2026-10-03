'use server';

import { revalidatePath } from 'next/cache';

import {
  alternarTipoDocumento,
  criarTipoDocumento,
  renomearTipoDocumento,
} from '@/lib/ativos/documentos/tipos';
import type { Resultado } from '@/lib/ativos/erros';
import { isAdmin, verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ERRO_SEM_PERMISSAO } from '@/shared/ativos/ativo.constants';
import { IdSchema } from '@/shared/ativos/ativo.schemas';
import {
  type CriarTipoDocumentoInput,
  CriarTipoDocumentoSchema,
  type EditarTipoDocumentoInput,
  EditarTipoDocumentoSchema,
} from '@/shared/ativos/documento.schemas';

/** Tipos de documento (spec 0013, AC-1): só Admin, com `ok: false` em vez de redirect. */
async function sessaoAdmin() {
  const sessao = await verifySession();
  return sessao && isAdmin(sessao.role) ? sessao : null;
}

async function executar<T extends object>(
  rotulo: string,
  fn: () => Promise<Resultado<T>>,
): Promise<Resultado<T>> {
  try {
    await dbConnect();
    const r = await fn();
    if (r.ok) {
      revalidatePath('/configuracoes/tipos-documento');
      revalidatePath('/configuracoes/categorias-ativo');
      revalidatePath('/ativos/documentos');
    }
    return r;
  } catch (e) {
    console.error(`[tipos-documento] ${rotulo}:`, e);
    return { ok: false, error: 'Não foi possível salvar agora. Tente de novo.' };
  }
}

export async function criarTipoDocumentoAction(
  raw: CriarTipoDocumentoInput,
): Promise<Resultado<{ id: string }>> {
  if (!(await sessaoAdmin())) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = CriarTipoDocumentoSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  return executar('criar', () => criarTipoDocumento(parsed.data));
}

export async function editarTipoDocumentoAction(raw: EditarTipoDocumentoInput): Promise<Resultado> {
  if (!(await sessaoAdmin())) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = EditarTipoDocumentoSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  return executar('editar', () => renomearTipoDocumento(parsed.data.id, parsed.data.nome));
}

export async function alternarTipoDocumentoAction(raw: {
  id: string;
}): Promise<Resultado<{ isActive: boolean }>> {
  if (!(await sessaoAdmin())) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = IdSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  return executar('alternar', () => alternarTipoDocumento(parsed.data.id));
}
