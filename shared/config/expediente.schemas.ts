import { z } from 'zod';

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
