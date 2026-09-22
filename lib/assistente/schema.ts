import 'server-only';

import { z } from 'zod';

import { FINAL_PRIORITY_VALUES } from '@/shared/chamados/chamado.constants';
import { DECISAO_MOTIVO_MAX, LOCAL_EXATO_MAX } from '@/shared/conversas/conversa.schemas';

/**
 * A única forma de resposta que a abertura aceita (spec 0004, AC-1). O objeto
 * final é validado por aqui antes de qualquer gravação: texto parcial nunca é
 * gravado, e objeto reprovado vira mensagem de reserva.
 *
 * A extração vem antes da `resposta` de propósito: o modelo decide primeiro e
 * responde coerente com o que decidiu (por exemplo, pergunta exatamente o que
 * ficou nulo). Só a `resposta` vai para a tela.
 */

export const RESPOSTA_ASSISTENTE_MAX = 600;

/** Os códigos do catálogo são `AAAA-NNNN`; a folga cobre o que o modelo inventar. */
export const SERVICO_CODIGO_MAX = 20;

export const respostaAberturaSchema = z.object({
  servicoCodigo: z.string().max(SERVICO_CODIGO_MAX).nullable(),
  servicoConfianca: z.number().min(0).max(1),
  servicoMotivo: z.string().max(DECISAO_MOTIVO_MAX),
  prioridade: z.enum(FINAL_PRIORITY_VALUES).nullable(),
  prioridadeConfianca: z.number().min(0).max(1),
  prioridadeMotivo: z.string().max(DECISAO_MOTIVO_MAX),
  localExato: z.string().max(LOCAL_EXATO_MAX).nullable(),
  localForaDoPerfil: z.boolean(),
  completo: z.boolean(),
  resposta: z.string().min(1).max(RESPOSTA_ASSISTENTE_MAX),
});

export type RespostaAbertura = z.infer<typeof respostaAberturaSchema>;
