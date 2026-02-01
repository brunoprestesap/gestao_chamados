import { z } from 'zod';

export const HOLIDAY_SCOPES = ['NACIONAL', 'ESTADUAL', 'MUNICIPAL', 'INSTITUCIONAL'] as const;
export type HolidayScope = (typeof HOLIDAY_SCOPES)[number];

/** Formato YYYY-MM-DD para evitar timezone shifting */
const dateYYYYMMDD = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD');

export const HolidayCreateSchema = z.object({
  date: dateYYYYMMDD,
  name: z.string().min(1, 'Informe o nome do feriado').transform((v) => v.trim()),
  scope: z.enum(HOLIDAY_SCOPES).default('INSTITUCIONAL'),
  isActive: z.boolean().default(true),
});

export const HolidayUpdateSchema = z.object({
  date: dateYYYYMMDD.optional(),
  name: z.string().min(1).transform((v) => v.trim()).optional(),
  scope: z.enum(HOLIDAY_SCOPES).optional(),
  isActive: z.boolean().optional(),
});

export const HolidayListQuerySchema = z.object({
  q: z.string().optional().default(''),
  year: z.string().optional(),
});
