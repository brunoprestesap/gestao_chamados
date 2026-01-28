import { z } from 'zod';

import { CHAMADO_STATUSES, type ChamadoStatus } from './chamado.constants';
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
  tipoServico: z.enum(TIPO_SERVICO_OPTIONS, {
    errorMap: () => ({ message: 'Selecione o tipo de serviço' }),
  }),
  naturezaAtendimento: z.enum(NATUREZA_OPTIONS, {
    errorMap: () => ({ message: 'Selecione a natureza do atendimento' }),
  }),
  grauUrgencia: z.enum(GRAU_URGENCIA_OPTIONS).default('Normal'),
  telefoneContato: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim() || undefined),
  subtypeId: objectId.optional(),
  catalogServiceId: objectId.optional(),
});

export const ChamadoListQuerySchema = z.object({
  q: z.string().optional().default(''),
  status: z
    .enum(['all', ...CHAMADO_STATUSES])
    .optional()
    .default('all'),
});

export type ChamadoListQuery = z.infer<typeof ChamadoListQuerySchema>;
