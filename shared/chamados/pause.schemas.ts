import { z } from 'zod';

import { PAUSE_REASONS } from './pause-reason.constants';

// ---------------------------------------------------------------------------
// Schema unificado de pausa (novo — suporta múltiplos motivos)
// ---------------------------------------------------------------------------

/** Base object (sem refine) — usado em formulários client-side */
export const PauseTicketBaseSchema = z.object({
  ticketId: z.string().min(1, 'ID do chamado é obrigatório'),
  reason: z.enum(PAUSE_REASONS, {
    error: 'Selecione um motivo de pausa',
  }),
  details: z
    .string()
    .max(1000, 'Detalhes devem ter no máximo 1000 caracteres')
    .optional()
    .default(''),
});

export const PauseTicketSchema = PauseTicketBaseSchema.refine(
  (data) => {
    if (data.reason === 'outro') {
      return !!data.details && data.details.trim().length >= 10;
    }
    return true;
  },
  {
    message: 'Detalhes obrigatórios quando motivo é "Outro" (mín. 10 caracteres)',
    path: ['details'],
  },
);

export type PauseTicketInput = z.infer<typeof PauseTicketSchema>;

export const ResumeTicketSchema = z.object({
  ticketId: z.string().min(1, 'ID do chamado é obrigatório'),
});

export type ResumeTicketInput = z.infer<typeof ResumeTicketSchema>;

// ---------------------------------------------------------------------------
// Schemas legados (mantidos para compatibilidade de imports)
// ---------------------------------------------------------------------------

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
