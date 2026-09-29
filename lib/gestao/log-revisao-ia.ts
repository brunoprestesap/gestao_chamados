import 'server-only';

import type { DecisaoCampo } from '@/shared/conversas/conversa.constants';

/**
 * Uma linha por confirmação ou correção, sem texto de motivo (spec 0009,
 * AC-17). `direcao` só faz sentido na correção de prioridade.
 */
export type RevisaoIaOperacao =
  | 'confirmar'
  | 'corrigir_prioridade'
  | 'corrigir_servico'
  | 'reatribuir';
export type RevisaoIaDirecao = 'sobe' | 'desce';
export type RevisaoIaResultado = 'ok' | 'recusada' | `parcial:${string}`;

export function logRevisaoIa(params: {
  chamadoId: string;
  campo: DecisaoCampo | null;
  operacao: RevisaoIaOperacao;
  direcao?: RevisaoIaDirecao;
  resultado: RevisaoIaResultado;
}): void {
  console.warn(
    '[revisao-ia]',
    JSON.stringify({
      chamadoId: params.chamadoId,
      campo: params.campo,
      operacao: params.operacao,
      ...(params.direcao ? { direcao: params.direcao } : {}),
      resultado: params.resultado,
    }),
  );
}
