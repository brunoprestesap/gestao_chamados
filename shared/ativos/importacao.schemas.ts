import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Registro inválido.');
const codigo = z.string().trim().min(1).max(60);

/** O que a revisão manda ao aplicar (spec 0012, AC-22 a AC-24). */
export const AplicarImportacaoSchema = z.object({
  id: objectId,
  novos: z.array(z.object({ codigo, categoriaId: objectId })).max(20000),
  alterados: z.array(codigo).max(20000),
  sumidos: z.array(codigo).max(20000),
  confirmaMuitosSumidos: z.boolean().optional(),
});
export type AplicarImportacaoInput = z.input<typeof AplicarImportacaoSchema>;

export const DescartarImportacaoSchema = z.object({ id: objectId });
export type DescartarImportacaoInput = z.input<typeof DescartarImportacaoSchema>;
