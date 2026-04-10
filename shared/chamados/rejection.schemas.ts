import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido');

export const RejectTicketSchema = z.object({
  chamadoId: objectId.min(1, 'ID do chamado é obrigatório'),
  rejectionReason: z
    .string()
    .min(10, 'A justificativa deve ter pelo menos 10 caracteres.')
    .max(1000, 'A justificativa não pode exceder 1000 caracteres.')
    .transform((v) => v.trim()),
  rejectionGuidance: z
    .string()
    .optional()
    .default('')
    .transform((v) => (v ?? '').trim())
    .refine((v) => v.length <= 1000, 'A orientação não pode exceder 1000 caracteres'),
});

export type RejectTicketInput = z.infer<typeof RejectTicketSchema>;
