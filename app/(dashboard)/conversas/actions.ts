'use server';

import { revalidatePath } from 'next/cache';

import {
  type ConfirmacaoFalha,
  confirmarAbertura,
  revisarAbertura,
  type RevisarFalha,
} from '@/lib/assistente';
import { descartarRascunho } from '@/lib/conversas';
import { requireSession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import type { ConfirmarAberturaInput } from '@/shared/conversas/abertura.schemas';
import type { ConversaFalha } from '@/shared/conversas/conversa.constants';
import { type CartaoPayload, objectIdSchema } from '@/shared/conversas/conversa.schemas';

import { cursorDe, lerChamadosDaLateral } from './_lib/lateral';
import type { CursorLateral, ItemLateral } from './_types';

/**
 * As ações da tela de conversas (specs 0003 e 0004). Nenhuma lança exceção: o
 * `Carregar mais` devolve lista vazia em qualquer falha, e as outras devolvem
 * o motivo para a tela traduzir em uma frase.
 */

export type CarregarMaisResultado = {
  itens: ItemLateral[];
  temMais: boolean;
  cursor: CursorLateral | null;
};

const VAZIO: CarregarMaisResultado = { itens: [], temMais: false, cursor: null };

/** Os 20 chamados seguintes, a partir do cursor composto da última linha. */
export async function carregarMaisConversasAction(
  antesDe: CursorLateral,
): Promise<CarregarMaisResultado> {
  try {
    const sessao = await requireSession();
    await dbConnect();

    const { itens, temMais } = await lerChamadosDaLateral(
      { userId: sessao.userId, role: sessao.role },
      antesDe,
    );

    return { itens, temMais, cursor: cursorDe(itens) };
  } catch (err) {
    console.error(
      '[conversas] carregarMais falhou:',
      err instanceof Error ? err.name : 'erro desconhecido',
    );
    return VAZIO;
  }
}

/** Descarta o rascunho. A conversa e as mensagens somem na hora (AC-12). */
export async function descartarRascunhoAction(
  conversaId: string,
): Promise<{ ok: true } | { ok: false; reason: ConversaFalha }> {
  const sessao = await requireSession();
  await dbConnect();

  const resultado = await descartarRascunho(
    { userId: sessao.userId, role: sessao.role },
    conversaId,
  );
  if (!resultado.ok) return resultado;

  revalidatePath('/conversas');
  return { ok: true };
}

export type RevisarAberturaResultado =
  | { ok: true; mensagemId: string; cartao: CartaoPayload; substituiId: string | null }
  | { ok: false; reason: RevisarFalha };

/**
 * `Revisar e abrir` (spec 0004, AC-7): monta o cartão a partir da proposta
 * guardada, sem chamar o modelo. Só o dono age no próprio rascunho.
 */
export async function revisarAberturaAction(conversaId: string): Promise<RevisarAberturaResultado> {
  const sessao = await requireSession();
  if (!objectIdSchema.safeParse(conversaId).success) return { ok: false, reason: 'nao_encontrada' };

  await dbConnect();
  return revisarAbertura({ userId: sessao.userId, role: sessao.role }, conversaId);
}

export type ConfirmarAberturaResultado =
  | { ok: true; chamadoId: string; ticketNumber: string }
  | { ok: false; reason: ConfirmacaoFalha };

/**
 * `Confirmar` no cartão resumo (spec 0004, AC-10 e AC-11): o chamado nasce
 * `aberto`, para a triagem do Preposto. Do navegador vêm só a conversa, o
 * cartão, a unidade, o local e, no modo manual, o tipo; o resto é lido do
 * banco. Clique duplo devolve o mesmo chamado, sem gravar nada de novo.
 */
export async function confirmarAberturaAction(
  entrada: ConfirmarAberturaInput,
): Promise<ConfirmarAberturaResultado> {
  const sessao = await requireSession();
  await dbConnect();

  const resultado = await confirmarAbertura({ userId: sessao.userId, role: sessao.role }, entrada);
  if (!resultado.ok) return resultado;

  revalidatePath('/conversas');
  revalidatePath('/meus-chamados');
  revalidatePath('/gestao');

  return { ok: true, chamadoId: resultado.chamadoId, ticketNumber: resultado.ticketNumber };
}
