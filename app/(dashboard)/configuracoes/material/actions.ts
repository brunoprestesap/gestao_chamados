'use server';

import { revalidatePath } from 'next/cache';

import type { Resultado } from '@/lib/ativos/erros';
import { isAdmin, verifySession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import {
  alterarSituacaoEmpenho,
  criarDesignacao,
  criarEmpenho,
  criarFaixa,
  desativarFaixa,
  movimentarEmpenho,
  revogarDesignacao,
} from '@/lib/material/cadastro';
import { aplicarImportacao } from '@/lib/material/importacao/aplicar';
import { descartarImportacao } from '@/lib/material/importacao/pendente';
import { salvarParametros } from '@/lib/material/parametros';
import { corrigirCodigoSinapi, marcarAnomalia } from '@/lib/material/tabelas';
import { ERRO_SEM_PERMISSAO } from '@/shared/ativos/ativo.constants';
import {
  CorrigirCodigoSinapiSchema,
  CriarDesignacaoSchema,
  CriarEmpenhoSchema,
  CriarFaixaSchema,
  DesativarFaixaSchema,
  ImportacaoMaterialIdSchema,
  MarcarAnomaliaSchema,
  MovimentoEmpenhoSchema,
  ParametrosSchema,
  RevogarDesignacaoSchema,
  SituacaoEmpenhoSchema,
} from '@/shared/material/cotacao.schemas';

/** Cadastro do material (spec 0019, AC-19): só Admin, com `ok: false` em vez de redirect. */
async function sessaoAdmin() {
  const sessao = await verifySession();
  return sessao && isAdmin(sessao.role) ? sessao : null;
}

async function executar(rotulo: string, fn: () => Promise<Resultado>): Promise<Resultado> {
  try {
    await dbConnect();
    const r = await fn();
    if (r.ok) {
      revalidatePath('/configuracoes/material');
      revalidatePath('/cotacoes');
    }
    return r;
  } catch (e) {
    console.error(`[material] ${rotulo}:`, e);
    return { ok: false, error: 'Não foi possível salvar agora. Tente de novo.' };
  }
}

function primeiroErro(issues: { message: string }[]): Resultado {
  return { ok: false, error: issues[0]?.message ?? 'Dados inválidos.' };
}

/** A recusa de um ato com motivo; `campo` diz à tela que o erro vai no campo de motivo (spec 0022, AC-5). */
export type ResultadoComMotivo = { ok: true } | { ok: false; error: string; campo?: 'motivo' };

function erroDoAto(issues: { message: string; path: PropertyKey[] }[]): ResultadoComMotivo {
  const primeiro = issues[0];
  return {
    ok: false,
    error: primeiro?.message ?? 'Dados inválidos.',
    ...(primeiro?.path[0] === 'motivo' ? { campo: 'motivo' as const } : {}),
  };
}

export async function criarEmpenhoAction(raw: unknown): Promise<Resultado> {
  const sessao = await sessaoAdmin();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const p = CriarEmpenhoSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return executar('criar empenho', () => criarEmpenho(sessao.userId, p.data));
}

export async function movimentarEmpenhoAction(raw: unknown): Promise<Resultado> {
  const sessao = await sessaoAdmin();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const p = MovimentoEmpenhoSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return executar('movimentar empenho', () => movimentarEmpenho(sessao.userId, p.data));
}

export async function alterarSituacaoEmpenhoAction(raw: unknown): Promise<ResultadoComMotivo> {
  const sessao = await sessaoAdmin();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const p = SituacaoEmpenhoSchema.safeParse(raw);
  if (!p.success) return erroDoAto(p.error.issues);
  return executar('situação do empenho', () =>
    alterarSituacaoEmpenho(sessao.userId, p.data.empenhoId, p.data.ativo, p.data.motivo),
  );
}

export async function criarFaixaAction(raw: unknown): Promise<Resultado> {
  const sessao = await sessaoAdmin();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const p = CriarFaixaSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return executar('criar faixa', () => criarFaixa(sessao.userId, p.data));
}

export async function desativarFaixaAction(raw: unknown): Promise<ResultadoComMotivo> {
  const sessao = await sessaoAdmin();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const p = DesativarFaixaSchema.safeParse(raw);
  if (!p.success) return erroDoAto(p.error.issues);
  return executar('desativar faixa', () =>
    desativarFaixa(sessao.userId, p.data.faixaId, p.data.motivo),
  );
}

export async function criarDesignacaoAction(raw: unknown): Promise<Resultado> {
  const sessao = await sessaoAdmin();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const p = CriarDesignacaoSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return executar('criar designação', () => criarDesignacao(sessao.userId, p.data));
}

/**
 * Grava os parâmetros (AC-42), condicional aos valores lidos ao abrir a tela.
 * `aviso` quando a gravação passou e o recálculo da anomalia falhou.
 */
export async function salvarParametrosAction(
  raw: unknown,
): Promise<{ ok: true; aviso?: string } | { ok: false; error: string }> {
  const sessao = await sessaoAdmin();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const p = ParametrosSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  try {
    await dbConnect();
    const r = await salvarParametros(sessao.userId, p.data);
    if (r.ok) revalidatePath('/configuracoes/material');
    return r;
  } catch (e) {
    console.error('[material] salvar parâmetros:', e);
    return { ok: false, error: 'Não foi possível salvar agora. Tente de novo.' };
  }
}

/** Aplica a importação revisada do Anexo V ou do SINAPI (AC-24, AC-25). */
export async function aplicarImportacaoAction(raw: unknown): Promise<Resultado> {
  const sessao = await sessaoAdmin();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const p = ImportacaoMaterialIdSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return executar('aplicar importação', () =>
    aplicarImportacao(p.data.importacaoId, sessao.userId),
  );
}

export async function descartarImportacaoAction(raw: unknown): Promise<Resultado> {
  const sessao = await sessaoAdmin();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const p = ImportacaoMaterialIdSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return executar('descartar importação', () =>
    descartarImportacao(p.data.importacaoId, sessao.userId),
  );
}

/** Marca ou desmarca à mão a conferência obrigatória de um item do Anexo V (AC-29). */
export async function marcarAnomaliaAction(raw: unknown): Promise<Resultado> {
  const sessao = await sessaoAdmin();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const p = MarcarAnomaliaSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return executar('marcar anomalia', () => marcarAnomalia(sessao.userId, p.data));
}

/** Corrige o código SINAPI de um item do Anexo V, com motivo (AC-24). */
export async function corrigirCodigoSinapiAction(raw: unknown): Promise<Resultado> {
  const sessao = await sessaoAdmin();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const p = CorrigirCodigoSinapiSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return executar('corrigir código SINAPI', () => corrigirCodigoSinapi(sessao.userId, p.data));
}

export async function revogarDesignacaoAction(raw: unknown): Promise<ResultadoComMotivo> {
  const sessao = await sessaoAdmin();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const p = RevogarDesignacaoSchema.safeParse(raw);
  if (!p.success) return erroDoAto(p.error.issues);
  return executar('revogar designação', () =>
    revogarDesignacao(sessao.userId, p.data.designacaoId, p.data.motivo),
  );
}
