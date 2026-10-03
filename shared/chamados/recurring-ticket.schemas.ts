import { z } from 'zod';

import { FINAL_PRIORITY_VALUES } from './chamado.constants';
import {
  GRAU_URGENCIA_OPTIONS,
  NATUREZA_OPTIONS,
  TIPO_SERVICO_OPTIONS,
} from './new-ticket.schemas';

/**
 * Escopo do modelo recorrente (spec 0013): `template` gera um chamado `aberto`
 * por rodada, como sempre; `categoria_ativo` gera um chamado `validado` por
 * ativo Tier A em operação da categoria.
 */
export const ESCOPOS_RECORRENTE = ['template', 'categoria_ativo'] as const;
export type EscopoRecorrente = (typeof ESCOPOS_RECORRENTE)[number];

export const ESCOPO_RECORRENTE_LABELS: Record<EscopoRecorrente, string> = {
  template: 'Chamado único',
  categoria_ativo: 'Por categoria de ativo',
};

export const SITUACOES_LOTE = ['em_andamento', 'concluido'] as const;
export type SituacaoLote = (typeof SITUACOES_LOTE)[number];

/** Lote `em_andamento` há mais que isso aparece como "interrompido" (AC-21). */
export const LOTE_INTERROMPIDO_MS = 60 * 60 * 1000;

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
    // Spec 0013: os três campos só valem no escopo por categoria.
    escopo: z.enum(ESCOPOS_RECORRENTE).default('template'),
    categoriaAtivoId: z
      .union([z.literal(''), z.string().regex(objectIdRegex, 'Categoria inválida')])
      .optional()
      .nullable()
      .transform((v) => v || undefined),
    localizacaoId: z
      .union([z.literal(''), z.string().regex(objectIdRegex, 'Local inválido')])
      .optional()
      .nullable()
      .transform((v) => v || undefined),
    finalPriority: z
      .union([z.literal(''), z.enum(FINAL_PRIORITY_VALUES)])
      .optional()
      .nullable()
      .transform((v) => v || undefined),
  })
  .refine((d) => d.escopo !== 'categoria_ativo' || d.categoriaAtivoId !== undefined, {
    message: 'Selecione a categoria de ativo',
    path: ['categoriaAtivoId'],
  })
  .refine((d) => d.escopo !== 'categoria_ativo' || d.finalPriority !== undefined, {
    message: 'Selecione a prioridade',
    path: ['finalPriority'],
  })
  // O escopo `template` nunca carrega os campos novos.
  .transform((d) =>
    d.escopo === 'template'
      ? { ...d, categoriaAtivoId: undefined, localizacaoId: undefined, finalPriority: undefined }
      : d,
  )
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
