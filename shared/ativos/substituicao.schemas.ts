import { z } from 'zod';

import {
  ERRO_MOTIVO_DISPENSA,
  MOTIVO_DISPENSA_MAX,
  MOTIVO_DISPENSA_MIN,
} from './substituicao.constants';

const ativoId = z.string().regex(/^[a-f\d]{24}$/i, 'Ativo inválido.');

/** Dispensar um candidato (spec 0015, AC-11). O `em` lido vem do banco, nunca daqui. */
export const DispensarSubstituicaoSchema = z.object({
  ativoId,
  motivo: z
    .string({ error: ERRO_MOTIVO_DISPENSA })
    .transform((v) => v.trim())
    .refine(
      (v) => v.length >= MOTIVO_DISPENSA_MIN && v.length <= MOTIVO_DISPENSA_MAX,
      ERRO_MOTIVO_DISPENSA,
    ),
});
export type DispensarSubstituicaoInput = z.input<typeof DispensarSubstituicaoSchema>;

/** Voltar a sinalizar (spec 0015, AC-15). */
export const DesfazerDispensaSubstituicaoSchema = z.object({ ativoId });
export type DesfazerDispensaSubstituicaoInput = z.input<typeof DesfazerDispensaSubstituicaoSchema>;
