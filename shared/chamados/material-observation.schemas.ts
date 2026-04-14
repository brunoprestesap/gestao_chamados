import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido');

export const MaterialObservationSchema = z.object({
  ticketId: objectId,
  description: z
    .string()
    .min(10, 'A observação deve ter no mínimo 10 caracteres')
    .max(2000, 'A observação deve ter no máximo 2000 caracteres')
    .transform((v) => v.trim()),
});

export type MaterialObservationInput = z.infer<typeof MaterialObservationSchema>;
