import { z } from 'zod';

import { MENSAGENS_CUSTO, QUANTIDADE_MAXIMA, VALOR_MAXIMO_REAIS } from './custo.constants';

/**
 * O número tem no máximo `casas` casas decimais, com tolerância para o erro
 * de ponto flutuante (spec 0018, AC-1): `0.1 * 3` passa com 1 casa. A folga
 * é 1e-6 (não 1e-9) porque perto do teto (9.999.999,99 × 100) o próprio
 * double já erra na casa de 1e-7.
 */
export function temAteCasas(valor: number, casas: number): boolean {
  const escala = 10 ** casas;
  return Math.abs(valor * escala - Math.round(valor * escala)) < 1e-6;
}

const idSchema = z.string().regex(/^[a-f\d]{24}$/i);

const descricaoSchema = z
  .string({ error: MENSAGENS_CUSTO.descricaoInvalida })
  .trim()
  .min(3, MENSAGENS_CUSTO.descricaoInvalida)
  .max(200, MENSAGENS_CUSTO.descricaoInvalida);

const quantidadeSchema = z
  .number({ error: MENSAGENS_CUSTO.quantidadeInvalida })
  .positive(MENSAGENS_CUSTO.quantidadeInvalida)
  .max(QUANTIDADE_MAXIMA, MENSAGENS_CUSTO.quantidadeInvalida)
  .refine((v) => temAteCasas(v, 3), MENSAGENS_CUSTO.quantidadeInvalida);

const valorUnitarioSchema = z
  .number({ error: MENSAGENS_CUSTO.valorUnitarioInvalido })
  .positive(MENSAGENS_CUSTO.valorUnitarioInvalido)
  .max(VALOR_MAXIMO_REAIS, MENSAGENS_CUSTO.valorUnitarioInvalido)
  .refine((v) => temAteCasas(v, 2), MENSAGENS_CUSTO.valorUnitarioInvalido);

export const MaterialItemSchema = z.object({
  descricao: descricaoSchema,
  quantidade: quantidadeSchema,
  valorUnitario: valorUnitarioSchema,
});
export type MaterialItemInput = z.infer<typeof MaterialItemSchema>;

export const AdicionarMaterialSchema = MaterialItemSchema.extend({
  chamadoId: idSchema,
});
export type AdicionarMaterialInput = z.infer<typeof AdicionarMaterialSchema>;

export const EditarMaterialSchema = MaterialItemSchema.extend({
  chamadoId: idSchema,
  itemId: idSchema,
});
export type EditarMaterialInput = z.infer<typeof EditarMaterialSchema>;

export const RemoverMaterialSchema = z.object({
  chamadoId: idSchema,
  itemId: idSchema,
});
export type RemoverMaterialInput = z.infer<typeof RemoverMaterialSchema>;

export const ValorFinalCotacaoSchema = z.object({
  cotacaoId: idSchema,
  valorFinal: z
    .number({ error: MENSAGENS_CUSTO.valorFinalInvalido })
    .min(0, MENSAGENS_CUSTO.valorFinalInvalido)
    .max(VALOR_MAXIMO_REAIS, MENSAGENS_CUSTO.valorFinalInvalido)
    .refine((v) => temAteCasas(v, 2), MENSAGENS_CUSTO.valorFinalInvalido)
    .nullable(),
});
export type ValorFinalCotacaoInput = z.infer<typeof ValorFinalCotacaoSchema>;
