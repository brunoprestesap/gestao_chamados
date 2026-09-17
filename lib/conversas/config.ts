import 'server-only';

import {
  CONVERSA_PREVIA_MAX,
  CONVERSA_TEXTO_MAX,
  CONVERSA_TEXTO_MIN,
} from '@/shared/conversas/conversa.schemas';

/**
 * Limites, prazos e tetos da conversa (spec 0002). Um valor novo entra aqui,
 * não espalhado pelo código. Nada disso é variável de ambiente: muda com deploy.
 */

/** Quantos dias um rascunho vive sem virar chamado. Depois disso o TTL o apaga. */
export const CONVERSA_RASCUNHO_DIAS = 30;
export const CONVERSA_RASCUNHO_MS = CONVERSA_RASCUNHO_DIAS * 24 * 60 * 60 * 1000;

/**
 * Teto de mensagens enquanto a conversa é rascunho. Depois do vínculo ele não
 * vale mais: mensagem de `ia` ou `sistema` nunca é barrada por ele.
 */
export const CONVERSA_MENSAGENS_MAX = 30;

/** Rascunhos ativos por usuário. */
export const CONVERSA_RASCUNHOS_MAX = 5;

/**
 * Janela da reserva da confirmação. Passado isso, uma reserva sem chamado é
 * tratada como abandonada e desfeita pelo reparo.
 */
export const CONVERSA_RESERVA_MS = 2 * 60 * 1000;

/** Itens devolvidos por fonte na linha do tempo, sempre os mais recentes. */
export const LINHA_DO_TEMPO_MAX = 300;

/**
 * Tentativas de achar um número de chamado livre. `generateTicketNumber()` lê o
 * maior existente sem lock, então duas aberturas ao mesmo tempo podem colidir.
 */
export const TICKET_NUMBER_TENTATIVAS = 3;

export { CONVERSA_PREVIA_MAX, CONVERSA_TEXTO_MAX, CONVERSA_TEXTO_MIN };
