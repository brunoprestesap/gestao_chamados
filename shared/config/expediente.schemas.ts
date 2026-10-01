import { z } from 'zod';

import {
  PRAZO_AVALIACAO_HORAS_MAX,
  PRAZO_AVALIACAO_HORAS_MIN,
} from '@/shared/chamados/janela-avaliacao';

const WEEKDAY_VALUES = [0, 1, 2, 3, 4, 5, 6] as const;

const timezoneSchema = z.string().min(1, 'Timezone é obrigatória');
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:mm inválido');
const weekdaysSchema = z
  .array(z.number().min(0).max(6))
  .min(1, 'Selecione pelo menos 1 dia útil')
  .refine(
    (arr) => arr.every((d) => (WEEKDAY_VALUES as readonly number[]).includes(d)),
    'Dias inválidos',
  );

export const ExpedienteConfigSchema = z
  .object({
    timezone: timezoneSchema,
    workdayStart: timeSchema,
    workdayEnd: timeSchema,
    weekdays: weekdaysSchema,
    // Spec 0010, AC-13. Opcional para o cliente antigo não perder o salvamento;
    // ausente, o PUT mantém o valor gravado.
    prazoAvaliacaoHoras: z
      .number({ message: 'Informe o prazo para avaliar em horas' })
      .int('O prazo para avaliar deve ser um número inteiro de horas')
      .min(PRAZO_AVALIACAO_HORAS_MIN, 'O prazo para avaliar deve ter pelo menos 1 hora')
      .max(PRAZO_AVALIACAO_HORAS_MAX, 'O prazo para avaliar deve ter no máximo 720 horas')
      .optional(),
  })
  .refine(
    (data) => {
      const [sh, sm] = data.workdayStart.split(':').map(Number);
      const [eh, em] = data.workdayEnd.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      return endMin > startMin;
    },
    { message: 'Horário de fim deve ser maior que o de início', path: ['workdayEnd'] },
  );

export type ExpedienteConfig = z.infer<typeof ExpedienteConfigSchema>;

/** Timezones IANA comuns no Brasil */
export const IANA_TIMEZONES_BR = [
  'America/Belem',
  'America/Fortaleza',
  'America/Manaus',
  'America/Sao_Paulo',
  'America/Cuiaba',
  'America/Noronha',
] as const;
