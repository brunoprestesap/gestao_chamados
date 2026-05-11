import { z } from 'zod';

import {
  GRAU_URGENCIA_OPTIONS,
  NATUREZA_OPTIONS,
  TIPO_SERVICO_OPTIONS,
} from './new-ticket.schemas';

export const RECURRENCE_TYPES = ['weekly', 'monthly', 'custom'] as const;
export type RecurrenceType = (typeof RECURRENCE_TYPES)[number];

export const RECURRENCE_TYPE_LABELS: Record<RecurrenceType, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  custom: 'Personalizado',
};

export const DAY_OF_WEEK_LABELS: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
};

const objectIdRegex = /^[a-f\d]{24}$/i;

export const CreateRecurringTicketSchema = z
  .object({
    name: z
      .string()
      .transform((v) => v.trim())
      .refine((v) => v.length > 0, 'Nome do agendamento é obrigatório')
      .refine((v) => v.length <= 150, 'Máximo de 150 caracteres'),
    titulo: z
      .string()
      .transform((v) => v.trim())
      .refine((v) => v.length > 0, 'Título do chamado é obrigatório'),
    descricao: z
      .string()
      .transform((v) => v.trim())
      .refine((v) => v.length > 0, 'Descrição é obrigatória'),
    unitId: z.string().regex(objectIdRegex, 'Selecione a unidade'),
    tipoServico: z.enum(TIPO_SERVICO_OPTIONS, { error: 'Selecione o tipo de serviço' }),
    naturezaAtendimento: z.enum(NATUREZA_OPTIONS, { error: 'Selecione a natureza' }),
    grauUrgencia: z.enum(GRAU_URGENCIA_OPTIONS).default('Normal'),
    subtypeId: z.string().regex(objectIdRegex, 'Selecione o subtipo de serviço'),
    catalogServiceId: z.string().regex(objectIdRegex, 'Selecione o serviço do catálogo'),
    solicitanteId: z.string().regex(objectIdRegex, 'Selecione o solicitante'),
    recurrenceType: z.enum(RECURRENCE_TYPES, { error: 'Selecione o tipo de recorrência' }),
    dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
    dayOfMonth: z.coerce.number().int().min(1).max(28).optional(),
    intervalDays: z.coerce.number().int().min(1).optional(),
  })
  .refine((d) => d.recurrenceType !== 'weekly' || d.dayOfWeek !== undefined, {
    message: 'Selecione o dia da semana',
    path: ['dayOfWeek'],
  })
  .refine((d) => d.recurrenceType !== 'monthly' || d.dayOfMonth !== undefined, {
    message: 'Selecione o dia do mês (1-28)',
    path: ['dayOfMonth'],
  })
  .refine(
    (d) => d.recurrenceType !== 'custom' || (d.intervalDays !== undefined && d.intervalDays >= 1),
    {
      message: 'Informe o intervalo em dias',
      path: ['intervalDays'],
    },
  );

export type CreateRecurringTicketInput = z.input<typeof CreateRecurringTicketSchema>;
export type CreateRecurringTicketValues = z.infer<typeof CreateRecurringTicketSchema>;

export const UpdateRecurringTicketSchema = z
  .object({
    id: z.string().regex(objectIdRegex, 'ID inválido'),
  })
  .and(CreateRecurringTicketSchema);

export type UpdateRecurringTicketInput = z.input<typeof UpdateRecurringTicketSchema>;
export type UpdateRecurringTicketValues = z.infer<typeof UpdateRecurringTicketSchema>;
