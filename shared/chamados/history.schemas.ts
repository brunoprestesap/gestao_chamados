import { z } from 'zod';

import { CHAMADO_STATUSES } from './chamado.constants';
import { CHAMADO_HISTORY_ACTIONS } from './history.constants';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido');

export const ChamadoHistoryCreateSchema = z.object({
  chamadoId: objectId.min(1, 'ID do chamado é obrigatório'),
  userId: objectId.min(1, 'ID do usuário é obrigatório'),
  action: z.enum(CHAMADO_HISTORY_ACTIONS, {
    error: 'Tipo de ação inválido',
  }),
  statusAnterior: z.enum(CHAMADO_STATUSES).nullable().optional(),
  statusNovo: z.enum(CHAMADO_STATUSES).nullable().optional(),
  observacoes: z
    .string()
    .optional()
    .default('')
    .transform((v) => (v ?? '').trim()),
});

export type ChamadoHistoryCreate = z.infer<typeof ChamadoHistoryCreateSchema>;
