import { z } from 'zod';

export const TIPO_SERVICO_OPTIONS = ['Manutenção Predial', 'Ar-Condicionado'] as const;
export const NATUREZA_OPTIONS = ['Padrão', 'Urgente'] as const;
export const GRAU_URGENCIA_OPTIONS = ['Baixo', 'Normal', 'Alto', 'Crítico'] as const;

export const NewTicketFormSchema = z.object({
  unitId: z.string().min(1, 'Selecione a unidade/setor'),
  localExato: z
    .string()
    .transform((v) => (v ?? '').trim())
    .refine((v) => v.length > 0, 'Informe o local exato'),
  tipoServico: z.enum(TIPO_SERVICO_OPTIONS, {
    errorMap: () => ({ message: 'Selecione o tipo de serviço' }),
  }),
  descricao: z
    .string()
    .transform((v) => (v ?? '').trim())
    .refine((v) => v.length > 0, 'Descreva o problema encontrado'),
  naturezaAtendimento: z.enum(NATUREZA_OPTIONS, {
    errorMap: () => ({ message: 'Selecione a natureza do atendimento' }),
  }),
  grauUrgencia: z
    .enum(GRAU_URGENCIA_OPTIONS, {
      required_error: 'Grau de urgência é obrigatório',
    })
    .default('Normal'),
  telefoneContato: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim() || undefined),
  subtypeId: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined)),
  catalogServiceId: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined)),
});

export type NewTicketFormValues = z.infer<typeof NewTicketFormSchema>;
