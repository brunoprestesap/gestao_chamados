'use server';

import { revalidatePath } from 'next/cache';

import { descartarRascunho } from '@/lib/conversas';
import { requireSession } from '@/lib/dal';
import { dbConnect } from '@/lib/db';
import type { ConversaFalha } from '@/shared/conversas/conversa.constants';

import { cursorDe, lerChamadosDaLateral } from './_lib/lateral';
import type { CursorLateral, ItemLateral } from './_types';

/**
 * As duas ações da tela de conversas (spec 0003). Nenhuma lança exceção: o
 * `Carregar mais` devolve lista vazia em qualquer falha, e o descarte devolve
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
