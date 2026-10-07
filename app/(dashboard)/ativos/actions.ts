'use server';

import { revalidatePath } from 'next/cache';

import { alterarStatusAtivo, criarAtivo, editarAtivo, validarAtivo } from '@/lib/ativos/cadastro';
import type { Resultado } from '@/lib/ativos/erros';
import {
  criarLocalizacao,
  desativarLocalizacao,
  editarLocalizacao,
} from '@/lib/ativos/localizacao';
import { desfazerDispensaSubstituicao, dispensarSubstituicao } from '@/lib/ativos/substituicao';
import { canManage, verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import { ERRO_SEM_PERMISSAO } from '@/shared/ativos/ativo.constants';
import {
  type AlterarStatusAtivoInput,
  AlterarStatusAtivoSchema,
  type CriarAtivoInput,
  CriarAtivoSchema,
  type CriarLocalizacaoInput,
  CriarLocalizacaoSchema,
  type EditarAtivoInput,
  EditarAtivoSchema,
  type EditarLocalizacaoInput,
  EditarLocalizacaoSchema,
  IdSchema,
} from '@/shared/ativos/ativo.schemas';
import {
  type DesfazerDispensaSubstituicaoInput,
  DesfazerDispensaSubstituicaoSchema,
  type DispensarSubstituicaoInput,
  DispensarSubstituicaoSchema,
} from '@/shared/ativos/substituicao.schemas';

/**
 * Escrita de ativo e de localização (spec 0011): só Admin e Preposto. Usa
 * `verifySession()` e confere o papel, devolvendo `ok: false`; não usa
 * `requireManager()`, porque o `redirect()` dele lança e viraria erro genérico
 * aqui dentro (AC-17).
 */
async function sessaoGestao() {
  const sessao = await verifySession();
  if (!sessao || !canManage(sessao.role)) return null;
  return sessao;
}

function primeiroErro(issues: { message: string }[]): string {
  return issues[0]?.message ?? 'Dados inválidos. Verifique os campos.';
}

async function executar<T extends object>(
  rotulo: string,
  fn: () => Promise<Resultado<T>>,
): Promise<Resultado<T>> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[ativos] ${rotulo}:`, e);
    return { ok: false, error: 'Não foi possível salvar agora. Tente de novo.' };
  }
}

function revalidarAtivo(id?: string) {
  revalidatePath('/ativos');
  if (id) revalidatePath(`/ativos/${id}`);
}

// ── Localização ─────────────────────────────────────────────────────────────

export async function criarLocalizacaoAction(
  raw: CriarLocalizacaoInput,
): Promise<Resultado<{ id: string }>> {
  const sessao = await sessaoGestao();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = CriarLocalizacaoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: primeiroErro(parsed.error.issues) };

  return executar('criar localização', async () => {
    await dbConnect();
    const r = await criarLocalizacao(parsed.data);
    if (r.ok) revalidatePath('/ativos/localizacoes');
    return r;
  });
}

export async function editarLocalizacaoAction(raw: EditarLocalizacaoInput): Promise<Resultado> {
  const sessao = await sessaoGestao();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = EditarLocalizacaoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: primeiroErro(parsed.error.issues) };

  return executar('editar localização', async () => {
    await dbConnect();
    const { unitId, ...resto } = parsed.data;
    const r = await editarLocalizacao({
      ...resto,
      ...(unitId !== undefined && { unitId: unitId || null }),
    });
    if (r.ok) revalidarAtivo();
    if (r.ok) revalidatePath('/ativos/localizacoes');
    return r;
  });
}

export async function desativarLocalizacaoAction(raw: { id: string }): Promise<Resultado> {
  const sessao = await sessaoGestao();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = IdSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: primeiroErro(parsed.error.issues) };

  return executar('desativar localização', async () => {
    await dbConnect();
    const r = await desativarLocalizacao(parsed.data.id);
    if (r.ok) revalidatePath('/ativos/localizacoes');
    return r;
  });
}

// ── Ativo ───────────────────────────────────────────────────────────────────

export async function criarAtivoAction(
  raw: CriarAtivoInput,
): Promise<Resultado<{ id: string; codigo: string }>> {
  const sessao = await sessaoGestao();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = CriarAtivoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: primeiroErro(parsed.error.issues) };

  return executar('criar ativo', async () => {
    await dbConnect();
    const r = await criarAtivo(parsed.data, sessao.userId);
    if (r.ok) revalidarAtivo(r.id);
    return r;
  });
}

export async function editarAtivoAction(raw: EditarAtivoInput): Promise<Resultado> {
  const sessao = await sessaoGestao();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = EditarAtivoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: primeiroErro(parsed.error.issues) };

  return executar('editar ativo', async () => {
    await dbConnect();
    const r = await editarAtivo(parsed.data, sessao.userId);
    if (r.ok) revalidarAtivo(parsed.data.id);
    return r;
  });
}

export async function alterarStatusAtivoAction(raw: AlterarStatusAtivoInput): Promise<Resultado> {
  const sessao = await sessaoGestao();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = AlterarStatusAtivoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: primeiroErro(parsed.error.issues) };

  return executar('alterar status do ativo', async () => {
    await dbConnect();
    const r = await alterarStatusAtivo(parsed.data, sessao.userId);
    if (r.ok) revalidarAtivo(parsed.data.id);
    return r;
  });
}

export async function validarAtivoAction(raw: { id: string }): Promise<Resultado> {
  const sessao = await sessaoGestao();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = IdSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: primeiroErro(parsed.error.issues) };

  return executar('validar ativo', async () => {
    await dbConnect();
    const r = await validarAtivo(parsed.data.id, sessao.userId);
    if (r.ok) revalidarAtivo(parsed.data.id);
    return r;
  });
}

// ── Substituição (spec 0015) ────────────────────────────────────────────────

/** A ficha, a lista e o IMR mostram a situação de substituição (AC-11). */
function revalidarSubstituicao(id: string) {
  revalidarAtivo(id);
  revalidatePath('/relatorios/imr');
}

/**
 * Dispensa um candidato por 6 meses. A regra é do papel (`canManage`), não da
 * tela: o Preposto que chama pelo IMR passa (AC-17).
 */
export async function dispensarSubstituicaoAction(
  raw: DispensarSubstituicaoInput,
): Promise<Resultado> {
  const sessao = await sessaoGestao();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = DispensarSubstituicaoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: primeiroErro(parsed.error.issues) };

  return executar('dispensar substituição', async () => {
    await dbConnect();
    const r = await dispensarSubstituicao({ ...parsed.data, userId: sessao.userId });
    revalidarSubstituicao(parsed.data.ativoId);
    return r;
  });
}

/** Voltar a sinalizar: desfaz a dispensa vigente (AC-15). */
export async function desfazerDispensaSubstituicaoAction(
  raw: DesfazerDispensaSubstituicaoInput,
): Promise<Resultado> {
  const sessao = await sessaoGestao();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const parsed = DesfazerDispensaSubstituicaoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: primeiroErro(parsed.error.issues) };

  return executar('desfazer dispensa de substituição', async () => {
    await dbConnect();
    const r = await desfazerDispensaSubstituicao({ ...parsed.data, userId: sessao.userId });
    revalidarSubstituicao(parsed.data.ativoId);
    return r;
  });
}
