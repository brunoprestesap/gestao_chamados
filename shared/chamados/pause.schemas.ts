import { z } from 'zod';

export const PauseForRequesterSchema = z.object({
  ticketId: z.string().min(1, 'ID do chamado é obrigatório'),
  reason: z
    .string()
    .min(10, 'Motivo deve ter no mínimo 10 caracteres')
    .max(2000, 'Motivo deve ter no máximo 2000 caracteres'),
});

export type PauseForRequesterInput = z.infer<typeof PauseForRequesterSchema>;

export const ResumeFromRequesterSchema = z.object({
  ticketId: z.string().min(1, 'ID do chamado é obrigatório'),
});

export type ResumeFromRequesterInput = z.infer<typeof ResumeFromRequesterSchema>;
