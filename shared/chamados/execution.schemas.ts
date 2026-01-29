import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido');

export const RegisterExecutionSchema = z.object({
  ticketId: objectId.min(1, 'ID do chamado é obrigatório'),
  serviceDescription: z
    .string()
    .min(1, 'Descreva o serviço executado')
    .transform((v) => (v ?? '').trim()),
  materialsUsed: z
    .string()
    .optional()
    .default('')
    .transform((v) => (v ?? '').trim() || undefined),
  notes: z
    .string()
    .optional()
    .default('')
    .transform((v) => (v ?? '').trim() || undefined),
  evidencePhotos: z.array(z.string()).optional().default([]),
});

export type RegisterExecutionInput = z.infer<typeof RegisterExecutionSchema>;
