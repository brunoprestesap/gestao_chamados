import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido');

export const SubmitEvaluationSchema = z.object({
  ticketId: objectId.min(1, 'ID do chamado é obrigatório'),
  rating: z
    .number()
    .int()
    .min(1, 'Avaliação deve ser entre 1 e 5')
    .max(5, 'Avaliação deve ser entre 1 e 5'),
  comment: z
    .string()
    .optional()
    .default('')
    .transform((v) => (v ?? '').trim())
    .refine((v) => v.length <= 2000, 'Comentário deve ter no máximo 2000 caracteres'),
});

export type SubmitEvaluationInput = z.infer<typeof SubmitEvaluationSchema>;
