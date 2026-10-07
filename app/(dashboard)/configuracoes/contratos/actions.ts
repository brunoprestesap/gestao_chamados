'use server';

import { revalidatePath } from 'next/cache';

import type { Resultado } from '@/lib/ativos/erros';
import { alterarSituacaoContrato, criarContrato, editarContrato } from '@/lib/contratos/cadastro';
import { isAdmin, verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ERRO_SEM_PERMISSAO } from '@/shared/ativos/ativo.constants';
import {
  type AlterarSituacaoContratoInput,
  AlterarSituacaoContratoSchema,
  type CriarContratoInput,
  CriarContratoSchema,
  type EditarContratoInput,
  EditarContratoSchema,
} from '@/shared/contratos/contrato.schemas';

/** Cadastro de contratos (spec 0016, AC-1 a AC-4): só Admin, com `ok: false` em vez de redirect. */
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
      revalidatePath('/configuracoes/contratos');
      revalidatePath('/relatorios/contrato');
    }
    return r;
  } catch (e) {
    console.error(`[contratos] ${rotulo}:`, e);
    return { ok: false, error: 'Não foi possível salvar agora. Tente de novo.' };
  }
}

export async function criarContratoAction(
  raw: CriarContratoInput,
): Promise<Resultado<{ id: string }>> {
  if (!(await sessaoAdmin())) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = CriarContratoSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  return executar('criar', () => criarContrato(parsed.data));
}

export async function editarContratoAction(raw: EditarContratoInput): Promise<Resultado> {
  if (!(await sessaoAdmin())) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = EditarContratoSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const { id, ...dados } = parsed.data;
  return executar('editar', () => editarContrato(id, dados));
}

export async function alterarSituacaoContratoAction(
  raw: AlterarSituacaoContratoInput,
): Promise<Resultado> {
  if (!(await sessaoAdmin())) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = AlterarSituacaoContratoSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  return executar('situacao', () => alterarSituacaoContrato(parsed.data.id, parsed.data.isActive));
}
