import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido');

export const CloseTicketSchema = z.object({
  ticketId: objectId.min(1, 'ID do chamado é obrigatório'),
  closureNotes: z
    .string()
    .optional()
    .default('')
    .transform((v) => (v ?? '').trim())
    .refine((v) => v.length <= 2000, 'Observações devem ter no máximo 2000 caracteres'),
});

export type CloseTicketInput = z.infer<typeof CloseTicketSchema>;
