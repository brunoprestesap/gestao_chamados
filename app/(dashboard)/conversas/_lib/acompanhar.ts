import 'server-only';

import { Types } from 'mongoose';
import { z } from 'zod';

import { registrarInteresse, sairDoInteresse } from '@/lib/chamados/interessados';
import { descartarRascunho, lerProposta, type Viewer } from '@/lib/conversas';
import { ChamadoModel } from '@/models/Chamado';
import {
  CHAMADO_STATUS_EM_ANDAMENTO,
  type ChamadoStatus,
} from '@/shared/chamados/chamado.constants';
import type { AcompanharFalha } from '@/shared/conversas/conversa.constants';
import { objectIdSchema } from '@/shared/conversas/conversa.schemas';

/**
 * "Acompanhar este" no aviso de chamado duplicado (spec 0017, AC-9 a AC-11).
 * A pessoa vira interessada num chamado parecido e o rascunho dela é
 * descartado. O navegador manda só os ids: o chamado precisa estar no cartão
 * atual da própria conversa, e o servidor confere tudo de novo.
 */

export const acompanharSchema = z.strictObject({
  conversaId: objectIdSchema,
  cartaoId: objectIdSchema,
  chamadoId: objectIdSchema,
});
export type AcompanharInput = z.input<typeof acompanharSchema>;

export type { AcompanharFalha };

export type AcompanharResultado =
  | { ok: true; chamadoId: string; rascunhoDescartado: boolean }
  | { ok: false; reason: AcompanharFalha };

function registrarErro(operacao: string, err: unknown): void {
  console.error(
    '[conversas]',
    JSON.stringify({ operacao, error: err instanceof Error ? err.name : 'unknown' }),
  );
}

export async function acompanharChamado(
  viewer: Viewer,
  entrada: unknown,
): Promise<AcompanharResultado> {
  const parsed = acompanharSchema.safeParse(entrada);
  if (!parsed.success) return { ok: false, reason: 'dados_invalidos' };
  const { conversaId, cartaoId, chamadoId } = parsed.data;

  try {
    // 1. O rascunho é do usuário e não está reservado.
    const lida = await lerProposta(viewer, conversaId);
    if (!lida.ok) {
      return { ok: false, reason: lida.reason === 'erro' ? 'erro' : 'nao_encontrada' };
    }
    if (lida.situacao === 'reservada') return { ok: false, reason: 'confirmacao_em_andamento' };
    if (lida.situacao !== 'rascunho') return { ok: false, reason: 'nao_encontrada' };

    // 2. O cartão do clique é o cartão atual.
    const cartao = lida.cartaoAtual;
    if (!cartao || cartao.id !== cartaoId) return { ok: false, reason: 'cartao_desatualizado' };

    // 3. O chamado está nos parecidos desse cartão, e é de outra pessoa que
    // ainda não o enxerga.
    const item = (cartao.payload.duplicados ?? []).find((d) => d.chamadoId === chamadoId);
    if (!item || item.proprio || item.jaTemAcesso) return { ok: false, reason: 'fora_do_cartao' };

    // 4. O chamado ainda está em andamento, lido de novo agora (AC-10).
    const chamado = await ChamadoModel.findById(new Types.ObjectId(chamadoId))
      .select('status solicitanteId assignedToUserId')
      .lean<{
        status: ChamadoStatus;
        solicitanteId: Types.ObjectId;
        assignedToUserId?: Types.ObjectId | null;
      } | null>();
    if (!chamado || !CHAMADO_STATUS_EM_ANDAMENTO.includes(chamado.status)) {
      return { ok: false, reason: 'chamado_encerrado' };
    }
    // O cartão pode ser velho: dono ou técnico atribuído nunca vira interessado.
    if (
      String(chamado.solicitanteId) === viewer.userId ||
      String(chamado.assignedToUserId ?? '') === viewer.userId
    ) {
      return { ok: false, reason: 'fora_do_cartao' };
    }

    // O local só fica visível se o cartão o mostrou neste item (AC-6).
    const { novo } = await registrarInteresse(chamadoId, viewer.userId, item.localExato !== null);

    // O chamado pode ter terminado entre a conferência e a gravação: o
    // interesse recém gravado é desfeito, e o rascunho fica (AC-10).
    const depois = await ChamadoModel.findById(new Types.ObjectId(chamadoId))
      .select('status')
      .lean<{ status: ChamadoStatus } | null>();
    if (!depois || !CHAMADO_STATUS_EM_ANDAMENTO.includes(depois.status)) {
      if (novo) await sairDoInteresse(chamadoId, viewer.userId);
      return { ok: false, reason: 'chamado_encerrado' };
    }

    const descarte = await descartarRascunho(viewer, conversaId);
    if (descarte.ok) return { ok: true, chamadoId, rascunhoDescartado: true };

    // A confirmação do cartão ganhou a corrida (outra aba): ninguém termina
    // com interesse e chamado novo do mesmo rascunho. `sem_permissao` aqui é a
    // conversa que acabou de virar chamado.
    if (descarte.reason === 'confirmacao_em_andamento' || descarte.reason === 'sem_permissao') {
      if (novo) await sairDoInteresse(chamadoId, viewer.userId);
      return { ok: false, reason: 'confirmacao_em_andamento' };
    }

    // Interesse gravado e descarte falhando por outro motivo: a pessoa segue
    // para a vista, e o rascunho fica na lateral (AC-11).
    return { ok: true, chamadoId, rascunhoDescartado: false };
  } catch (err) {
    registrarErro('acompanharChamado', err);
    return { ok: false, reason: 'erro' };
  }
}

export const deixarDeAcompanharSchema = z.strictObject({ chamadoId: objectIdSchema });

export type DeixarDeAcompanharResultado =
  | { ok: true }
  | { ok: false; reason: 'nao_encontrada' | 'erro' };

/** "Deixar de acompanhar" (AC-16): grava `saiuEm` no registro do próprio usuário. */
export async function deixarDeAcompanhar(
  viewer: Viewer,
  entrada: unknown,
): Promise<DeixarDeAcompanharResultado> {
  const parsed = deixarDeAcompanharSchema.safeParse(entrada);
  if (!parsed.success) return { ok: false, reason: 'nao_encontrada' };

  try {
    const existia = await sairDoInteresse(parsed.data.chamadoId, viewer.userId);
    return existia ? { ok: true } : { ok: false, reason: 'nao_encontrada' };
  } catch (err) {
    registrarErro('deixarDeAcompanhar', err);
    return { ok: false, reason: 'erro' };
  }
}
