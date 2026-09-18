import 'server-only';

import { z } from 'zod';

/**
 * A única forma de resposta que o acolhimento aceita (spec 0003). O objeto
 * final é validado por aqui antes de virar `ConversaMensagem`: texto parcial
 * nunca é gravado, e objeto reprovado vira mensagem de reserva (AC-5, AC-7).
 */

export const RESPOSTA_ASSISTENTE_MAX = 600;

export const respostaAssistenteSchema = z.object({
  resposta: z.string().min(1).max(RESPOSTA_ASSISTENTE_MAX),
});

export type RespostaAssistente = z.infer<typeof respostaAssistenteSchema>;
