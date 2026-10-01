import { z } from 'zod';

export const TIPO_SERVICO_OPTIONS = ['Manutenção Predial', 'Ar-Condicionado', 'Elevador'] as const;
export const NATUREZA_OPTIONS = ['Padrão', 'Urgente'] as const;
export const GRAU_URGENCIA_OPTIONS = ['Baixo', 'Normal', 'Alto', 'Crítico'] as const;

export const NewTicketFormSchema = z.object({
  unitId: z.string().min(1, 'Selecione a unidade/setor'),
  localExato: z
    .string()
    .transform((v) => (v ?? '').trim())
    .refine((v) => v.length > 0, 'Informe o local exato'),
  tipoServico: z.enum(TIPO_SERVICO_OPTIONS, {
    error: 'Selecione o tipo de serviço',
  }),
  descricao: z
    .string()
    .transform((v) => (v ?? '').trim())
    .refine((v) => v.length > 0, 'Descreva o problema encontrado'),
  naturezaAtendimento: z.enum(NATUREZA_OPTIONS, {
    error: 'Selecione a natureza do atendimento',
  }),
  grauUrgencia: z
    .enum(GRAU_URGENCIA_OPTIONS, {
      error: 'Grau de urgência é obrigatório',
    })
    .default('Normal'),
  telefoneContato: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim() || undefined),
  subtypeId: z.string().min(1, 'Selecione o subtipo de serviço'),
  catalogServiceId: z.string().min(1, 'Selecione o serviço do catálogo'),
  /** "O problema voltou" (spec 0010, AC-11): o chamado encerrado que deu origem a este. */
  chamadoAnteriorId: z
    .string()
    .regex(/^[a-f\d]{24}$/i, 'Chamado anterior inválido.')
    .optional(),
});

export type NewTicketFormInput = z.input<typeof NewTicketFormSchema>;
export type NewTicketFormValues = z.infer<typeof NewTicketFormSchema>;
