'use server';

import { Types } from 'mongoose';
import { revalidatePath } from 'next/cache';

import { corrigirDocumento, excluirDocumento } from '@/lib/ativos/documentos/gravar';
import type { Resultado } from '@/lib/ativos/erros';
import { canManage, verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { DocumentoAtivoModel } from '@/models/DocumentoAtivo';
import { ERRO_SEM_PERMISSAO } from '@/shared/ativos/ativo.constants';
import {
  type CorrigirDocumentoInput,
  CorrigirDocumentoSchema,
  type ExcluirDocumentoInput,
  ExcluirDocumentoSchema,
} from '@/shared/ativos/documento.schemas';

/**
 * Correção e exclusão de documento (spec 0013, AC-5 e AC-6): só Admin e
 * Preposto. Como as outras actions de ativos, confere a sessão sem
 * `requireManager()`, cujo `redirect()` lançaria aqui dentro.
 */
async function sessaoGestao() {
  const sessao = await verifySession();
  if (!sessao || !canManage(sessao.role)) return null;
  return sessao;
}

async function revalidarDoDocumento(id: string) {
  revalidatePath('/ativos/documentos');
  const doc = await DocumentoAtivoModel.findById(id)
    .select('ativoId')
    .lean<{ ativoId?: Types.ObjectId | null }>();
  if (doc?.ativoId) revalidatePath(`/ativos/${String(doc.ativoId)}`);
  else revalidatePath('/ativos/[id]', 'page');
}

export async function corrigirDocumentoAction(raw: CorrigirDocumentoInput): Promise<Resultado> {
  const sessao = await sessaoGestao();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = CorrigirDocumentoSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  try {
    await dbConnect();
    const r = await corrigirDocumento(parsed.data, sessao.userId);
    if (!r.ok) return { ok: false, error: r.error };
    await revalidarDoDocumento(parsed.data.id);
    return { ok: true };
  } catch (e) {
    console.error('[documentos] corrigir:', e);
    return { ok: false, error: 'Não foi possível salvar agora. Tente de novo.' };
  }
}

export async function excluirDocumentoAction(raw: ExcluirDocumentoInput): Promise<Resultado> {
  const sessao = await sessaoGestao();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = ExcluirDocumentoSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  try {
    await dbConnect();
    const r = await excluirDocumento(parsed.data.id, parsed.data.motivo, sessao.userId);
    if (!r.ok) return { ok: false, error: r.error };
    await revalidarDoDocumento(parsed.data.id);
    return { ok: true };
  } catch (e) {
    console.error('[documentos] excluir:', e);
    return { ok: false, error: 'Não foi possível excluir agora. Tente de novo.' };
  }
}
