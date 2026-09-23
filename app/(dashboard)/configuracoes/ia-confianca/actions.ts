'use server';

import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/lib/dal';
import { salvarConfig } from '@/lib/ia-confianca/config';
import {
  type SalvarIaAutonomiaConfigInput,
  salvarIaAutonomiaConfigSchema,
} from '@/shared/ia-confianca/ia-confianca.schemas';

export type SalvarIaAutonomiaConfigResult = { ok: true } | { ok: false; error: string };

/** Salva o limite de confiança, a amostra mínima de cada campo e o interruptor global (AC-5, AC-8, AC-10). */
export async function salvarIaAutonomiaConfigAction(
  raw: SalvarIaAutonomiaConfigInput,
): Promise<SalvarIaAutonomiaConfigResult> {
  try {
    const session = await requireAdmin();

    const parsed = salvarIaAutonomiaConfigSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
    }

    await salvarConfig(parsed.data, session.userId);
    revalidatePath('/configuracoes/ia-confianca');

    return { ok: true };
  } catch (err) {
    console.error('salvarIaAutonomiaConfigAction:', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro ao salvar configuração. Tente novamente.',
    };
  }
}
