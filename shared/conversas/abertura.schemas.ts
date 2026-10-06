import { z } from 'zod';

import { TIPO_SERVICO_OPTIONS } from '@/shared/chamados/new-ticket.schemas';

import { LOCAL_EXATO_MAX, objectIdSchema } from './conversa.schemas';

/**
 * O que o navegador pode mandar para abrir o chamado pelo cartão resumo (spec
 * 0004, AC-17): a conversa, o cartão, a unidade, o local, só no modo manual o
 * tipo de serviço e, desde a spec 0014, o equipamento escolhido.
 * `strictObject` recusa qualquer campo a mais, então serviço, prioridade,
 * confiança e metadado do modelo nunca entram por aqui:
 * os valores da IA são lidos da proposta guardada no banco.
 */

export const localExatoSchema = z
  .string()
  .trim()
  .min(1, 'Informe o local exato')
  .max(LOCAL_EXATO_MAX, `O local passa de ${LOCAL_EXATO_MAX} caracteres`);

export const confirmarAberturaSchema = z.strictObject({
  conversaId: objectIdSchema,
  cartaoId: objectIdSchema,
  unitId: objectIdSchema,
  localExato: localExatoSchema,
  tipoServico: z.enum(TIPO_SERVICO_OPTIONS).optional(),
  // O equipamento escolhido no cartão (spec 0014, AC-8). Valor torto vira
  // `null` em vez de recusar a abertura: o servidor confere contra os
  // candidatos do cartão e, na dúvida, abre sem ativo.
  ativoId: objectIdSchema.nullable().optional().catch(null),
});

export type ConfirmarAberturaInput = z.input<typeof confirmarAberturaSchema>;
export type ConfirmarAberturaValues = z.infer<typeof confirmarAberturaSchema>;
