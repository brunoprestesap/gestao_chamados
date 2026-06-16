import { z } from 'zod';

/**
 * Subtipo de serviço (ServiceSubType) — usado no create/update via API REST.
 * O par (typeId, name) é único (índice no model).
 */
export const SubtypeCreateSchema = z.object({
  typeId: z.string().min(1, 'Selecione o tipo'),
  name: z
    .string()
    .min(1, 'Informe o nome do subtipo')
    .transform((v) => v.trim()),
  isActive: z.boolean().default(true),
});

/**
 * Update: tudo opcional. Na prática edita `name`/`isActive`; o `typeId`
 * é mantido fixo na UI (trocar o tipo de um subtipo existente está fora do escopo).
 */
export const SubtypeUpdateSchema = SubtypeCreateSchema.partial();

export type SubtypeCreateInput = z.infer<typeof SubtypeCreateSchema>;
export type SubtypeUpdateInput = z.infer<typeof SubtypeUpdateSchema>;
