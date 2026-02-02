import { z } from 'zod';

import { FINAL_PRIORITY_VALUES } from '@/shared/chamados/chamado.constants';

/** 1 dia útil = 10 horas (08h–18h) */
export const BUSINESS_MINUTES_PER_DAY = 10 * 60;
/** Limite máximo: 30 dias úteis em minutos */
export const MAX_BUSINESS_MINUTES = 30 * BUSINESS_MINUTES_PER_DAY;
/** Limite máximo em minutos corridos (ex.: 30 dias * 24h) */
export const MAX_REAL_MINUTES = 30 * 24 * 60;

export const SlaTimeUnit = z.enum(['Horas', 'Dias']);
export type SlaTimeUnit = z.infer<typeof SlaTimeUnit>;

/** Converte valor + unidade para minutos: Horas → minutos; Dias → businessMinutesPerDay por dia */
export function toMinutes(
  value: number,
  unit: SlaTimeUnit,
  businessMinutesPerDay: number = BUSINESS_MINUTES_PER_DAY,
): number {
  if (unit === 'Horas') return Math.round(value * 60);
  return Math.round(value * businessMinutesPerDay);
}

const positiveNumber = z.number().min(0.01, 'Valor deve ser maior que zero');

/** Schema para um item de configuração por prioridade (formulário) */
export const SlaConfigItemSchema = z
  .object({
    priority: z.enum(FINAL_PRIORITY_VALUES),
    responseValue: positiveNumber,
    responseUnit: SlaTimeUnit,
    resolutionValue: positiveNumber,
    resolutionUnit: SlaTimeUnit,
    businessHoursOnly: z.boolean(),
  })
  .refine(
    (data) => {
      const responseMin = toMinutes(data.responseValue, data.responseUnit);
      const resolutionMin = toMinutes(data.resolutionValue, data.resolutionUnit);
      if (data.businessHoursOnly) {
        return responseMin <= MAX_BUSINESS_MINUTES && resolutionMin <= MAX_BUSINESS_MINUTES;
      }
      return responseMin <= MAX_REAL_MINUTES && resolutionMin <= MAX_REAL_MINUTES;
    },
    { message: 'Valores excedem o limite máximo permitido' },
  )
  .refine(
    (data) => {
      if (data.priority === 'EMERGENCIAL') return true;
      return data.businessHoursOnly !== false || true;
    },
    { message: 'EMERGENCIAL pode usar 24x7 (desmarcar horário comercial)' },
  );

export type SlaConfigItem = z.infer<typeof SlaConfigItemSchema>;

/** Payload para salvar todas as prioridades */
export const SlaConfigSaveSchema = z.object({
  configs: z.array(SlaConfigItemSchema).length(4),
});

export type SlaConfigSaveInput = z.infer<typeof SlaConfigSaveSchema>;
