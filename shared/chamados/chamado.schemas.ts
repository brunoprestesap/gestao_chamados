import { z } from 'zod';

import { CHAMADO_STATUSES, FINAL_PRIORITY_VALUES, type ChamadoStatus } from './chamado.constants';
import {
  GRAU_URGENCIA_OPTIONS,
  NATUREZA_OPTIONS,
  TIPO_SERVICO_OPTIONS,
} from './new-ticket.schemas';

export type { ChamadoStatus } from './chamado.constants';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido');

export const ChamadoCreateSchema = z.object({
  // Título pode ser gerado automaticamente ou fornecido
  titulo: z
    .string()
    .min(1, 'Informe o título')
    .transform((v) => v.trim())
    .optional(),
  descricao: z
    .string()
    .transform((v) => (v ?? '').trim())
    .refine((v) => v.length > 0, 'Descreva o problema encontrado'),
  // Campos do formulário
  unitId: objectId.min(1, 'Selecione a unidade/setor'),
  localExato: z
    .string()
    .transform((v) => (v ?? '').trim())
    .refine((v) => v.length > 0, 'Informe o local exato'),
  tipoServico: z.enum(TIPO_SERVICO_OPTIONS),
  naturezaAtendimento: z.enum(NATUREZA_OPTIONS),
  grauUrgencia: z.enum(GRAU_URGENCIA_OPTIONS).default('Normal'),
  telefoneContato: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim() || undefined),
  subtypeId: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined))
    .refine((v) => v === undefined || /^[a-f\d]{24}$/i.test(v), 'ID inválido'),
  catalogServiceId: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined))
    .refine((v) => v === undefined || /^[a-f\d]{24}$/i.test(v), 'ID inválido'),
});

export const ChamadoListQuerySchema = z.object({
  q: z.string().optional().default(''),
  status: z
    .enum(['all', ...CHAMADO_STATUSES])
    .optional()
    .default('all'),
});

export type ChamadoListQuery = z.infer<typeof ChamadoListQuerySchema>;

export const ClassificarChamadoSchema = z.object({
  chamadoId: objectId.min(1, 'ID do chamado é obrigatório'),
  naturezaAtendimento: z.enum(NATUREZA_OPTIONS, {
    message: 'Selecione a natureza do atendimento',
  }),
  finalPriority: z.enum(FINAL_PRIORITY_VALUES, {
    message: 'Selecione a prioridade final',
  }),
  classificationNotes: z
    .string()
    .optional()
    .default('')
    .transform((v) => (v ?? '').trim()),
});

export type ClassificarChamadoInput = z.infer<typeof ClassificarChamadoSchema>;
