import { z } from 'zod';

export const SubmitCotacaoSchema = z.object({
  ticketId: z.string().min(1, 'ID do chamado é obrigatório'),
  valorEstimado: z
    .number({ error: 'Informe o valor estimado' })
    .positive('Valor deve ser maior que zero')
    .max(9_999_999.99, 'Valor máximo excedido'),
  descricao: z
    .string()
    .min(10, 'Descreva o material/serviço com no mínimo 10 caracteres')
    .max(2000, 'Descrição deve ter no máximo 2000 caracteres'),
  prazoEntregaDias: z
    .number()
    .int('Informe um número inteiro de dias')
    .min(0, 'Prazo não pode ser negativo')
    .max(365, 'Prazo máximo de 365 dias')
    .optional(),
  observacoes: z
    .string()
    .max(1000, 'Observações devem ter no máximo 1000 caracteres')
    .optional(),
  anexoId: z.string().min(1).optional(),
});

export type SubmitCotacaoInput = z.infer<typeof SubmitCotacaoSchema>;

export const ApproveCotacaoSchema = z.object({
  cotacaoId: z.string().min(1, 'ID da cotação é obrigatório'),
  observacao: z
    .string()
    .max(1000, 'Observação deve ter no máximo 1000 caracteres')
    .optional(),
});

export type ApproveCotacaoInput = z.infer<typeof ApproveCotacaoSchema>;

export const RejectCotacaoSchema = z.object({
  cotacaoId: z.string().min(1, 'ID da cotação é obrigatório'),
  observacao: z
    .string()
    .min(5, 'Informe o motivo da recusa (mín. 5 caracteres)')
    .max(1000, 'Motivo deve ter no máximo 1000 caracteres'),
});

export type RejectCotacaoInput = z.infer<typeof RejectCotacaoSchema>;
