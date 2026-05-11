import { z } from 'zod';

import {
  GRAU_URGENCIA_OPTIONS,
  NATUREZA_OPTIONS,
  TIPO_SERVICO_OPTIONS,
} from './new-ticket.schemas';

export const TEMPLATE_SCOPE_OPTIONS = ['global', 'personal'] as const;

const zodObjectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'ID inválido')
  .optional();

export const CreateTemplateSchema = z.object({
  name: z
    .string()
    .min(3, 'Nome deve ter pelo menos 3 caracteres')
    .max(100, 'Nome deve ter no máximo 100 caracteres'),
  scope: z.enum(TEMPLATE_SCOPE_OPTIONS),

  // Campos opcionais do chamado
  descricao: z.string().max(2000, 'Descrição muito longa').optional(),
  tipoServico: z.enum(TIPO_SERVICO_OPTIONS).optional(),
  naturezaAtendimento: z.enum(NATUREZA_OPTIONS).optional(),
  grauUrgencia: z.enum(GRAU_URGENCIA_OPTIONS).optional(),
  unitId: zodObjectId,
  subtypeId: zodObjectId,
  catalogServiceId: zodObjectId,
});

export type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;

export const TemplateListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  scope: z.enum(TEMPLATE_SCOPE_OPTIONS),
  createdByUserId: z.string(),
  descricao: z.string().optional(),
  tipoServico: z.string().optional(),
  naturezaAtendimento: z.string().optional(),
  grauUrgencia: z.string().optional(),
  unitId: z.string().optional(),
  subtypeId: z.string().optional(),
  catalogServiceId: z.string().optional(),
  usageCount: z.number(),
});

export type TemplateListItem = z.infer<typeof TemplateListItemSchema>;
