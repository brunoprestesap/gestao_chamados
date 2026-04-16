import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido');

export const RefuseServiceSchema = z.object({
  ticketId: objectId.min(1, 'ID do chamado é obrigatório'),
  reason: z
    .string()
    .min(10, 'Motivo deve ter no mínimo 10 caracteres')
    .max(2000, 'Motivo deve ter no máximo 2000 caracteres')
    .transform((v) => v.trim()),
});

export type RefuseServiceInput = z.infer<typeof RefuseServiceSchema>;
