import { z } from 'zod';

import { DECISAO_CORRECAO_MOTIVO_MAX } from '@/shared/conversas/conversa.schemas';

import { CHAMADO_STATUSES, type ChamadoStatus, FINAL_PRIORITY_VALUES } from './chamado.constants';
import {
  GRAU_URGENCIA_OPTIONS,
  NATUREZA_OPTIONS,
  TIPO_SERVICO_OPTIONS,
} from './new-ticket.schemas';
import { REVISAO_IA_RECORTES } from './revisao-ia.constants';

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
  subtypeId: objectId.min(1, 'Selecione o subtipo de serviço'),
  catalogServiceId: objectId.min(1, 'Selecione o serviço do catálogo'),
});

export const ChamadoListQuerySchema = z.object({
  q: z.string().optional().default(''),
  status: z
    .string()
    .optional()
    .default('all')
    .transform((v) => {
      if (!v || v === 'all') return 'all' as const;
      const statuses = v
        .split(',')
        .filter((s): s is ChamadoStatus => (CHAMADO_STATUSES as readonly string[]).includes(s));
      return statuses.length === 0 ? ('all' as const) : statuses;
    }),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  // Ausente: nada muda. Valor fora de REVISAO_IA_RECORTES: falha o parse (400, spec 0009 AC-1).
  revisaoIa: z.enum(REVISAO_IA_RECORTES).optional(),
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
  subtypeId: objectId.min(1, 'Selecione o subtipo de serviço'),
  catalogServiceId: objectId.min(1, 'Selecione o serviço do catálogo'),
});

export type ClassificarChamadoInput = z.infer<typeof ClassificarChamadoSchema>;

/**
 * Correção da prioridade de um chamado `validado` ou `em atendimento` (spec
 * 0007, AC-11; janela alargada e motivo obrigatório pela spec 0009, AC-7): só
 * troca a prioridade final, nunca o serviço catalogado nem a natureza do
 * atendimento — o formulário de classificação continua sendo o único lugar
 * que muda esses dois. `motivo` vai só para a `DecisaoIa` e para o histórico
 * `correcao_gestao` (spec 0009, AC-13); nunca para `classificationNotes`.
 */
export const UpdateTicketPrioritySchema = z.object({
  chamadoId: objectId.min(1, 'ID do chamado é obrigatório'),
  finalPriority: z.enum(FINAL_PRIORITY_VALUES, {
    message: 'Selecione a prioridade final',
  }),
  motivo: z
    .string()
    .trim()
    .min(10, 'Explique o motivo da correção em pelo menos 10 caracteres')
    .max(
      DECISAO_CORRECAO_MOTIVO_MAX,
      `O motivo passa de ${DECISAO_CORRECAO_MOTIVO_MAX} caracteres`,
    ),
});

export type UpdateTicketPriorityInput = z.infer<typeof UpdateTicketPrioritySchema>;

/**
 * Correção do serviço catalogado de um chamado `validado` ou `em atendimento`
 * que já tem serviço (spec 0009, AC-11): muda `catalogServiceId`, `subtypeId`
 * e `tipoServico`; nunca prioridade nem SLA. `novoTecnicoId` só é aceito (e só
 * é exigido pela ação) quando o técnico atual não tem a especialidade do
 * serviço novo. `motivo` é opcional, mas com o mesmo mínimo de uma correção
 * quando informado.
 */
export const CorrigirServicoSchema = z.object({
  chamadoId: objectId.min(1, 'ID do chamado é obrigatório'),
  catalogServiceId: objectId.min(1, 'Selecione o serviço do catálogo'),
  novoTecnicoId: objectId.optional(),
  motivo: z
    .string()
    .optional()
    .default('')
    .transform((v) => (v ?? '').trim())
    .refine((v) => v === '' || v.length >= 10, 'Explique o motivo em pelo menos 10 caracteres')
    .refine(
      (v) => v.length <= DECISAO_CORRECAO_MOTIVO_MAX,
      `O motivo passa de ${DECISAO_CORRECAO_MOTIVO_MAX} caracteres`,
    ),
});

export type CorrigirServicoInput = z.infer<typeof CorrigirServicoSchema>;
