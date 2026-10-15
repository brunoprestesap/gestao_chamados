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
import { ERRO_SEM_PERMISSAO } from '@/shared/ativos/ativo.constants';
import {
  CriarDesignacaoSchema,
  CriarEmpenhoSchema,
  CriarFaixaSchema,
  DesativarFaixaSchema,
  MovimentoEmpenhoSchema,
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

export async function alterarSituacaoEmpenhoAction(raw: unknown): Promise<Resultado> {
  if (!(await sessaoAdmin())) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const p = SituacaoEmpenhoSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return executar('situação do empenho', () =>
    alterarSituacaoEmpenho(p.data.empenhoId, p.data.ativo),
  );
}

export async function criarFaixaAction(raw: unknown): Promise<Resultado> {
  const sessao = await sessaoAdmin();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const p = CriarFaixaSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return executar('criar faixa', () => criarFaixa(sessao.userId, p.data));
}

export async function desativarFaixaAction(raw: unknown): Promise<Resultado> {
  if (!(await sessaoAdmin())) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const p = DesativarFaixaSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return executar('desativar faixa', () => desativarFaixa(p.data.faixaId));
}

export async function criarDesignacaoAction(raw: unknown): Promise<Resultado> {
  const sessao = await sessaoAdmin();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const p = CriarDesignacaoSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return executar('criar designação', () => criarDesignacao(sessao.userId, p.data));
}

export async function revogarDesignacaoAction(raw: unknown): Promise<Resultado> {
  const sessao = await sessaoAdmin();
  if (!sessao) return { ok: false, error: ERRO_SEM_PERMISSAO };
  const p = RevogarDesignacaoSchema.safeParse(raw);
  if (!p.success) return primeiroErro(p.error.issues);
  return executar('revogar designação', () =>
    revogarDesignacao(sessao.userId, p.data.designacaoId),
  );
}
