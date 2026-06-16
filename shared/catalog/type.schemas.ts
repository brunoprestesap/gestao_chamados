import { z } from 'zod';

/**
 * Tipo de serviço (ServiceType) — usado no create/update via API REST.
 */
export const TypeCreateSchema = z.object({
  name: z
    .string()
    .min(1, 'Informe o nome do tipo')
    .transform((v) => v.trim()),
  isActive: z.boolean().default(true),
});

/** Update: tudo opcional, mantendo as regras quando o campo existir. */
export const TypeUpdateSchema = TypeCreateSchema.partial();

export type TypeCreateInput = z.infer<typeof TypeCreateSchema>;
export type TypeUpdateInput = z.infer<typeof TypeUpdateSchema>;
