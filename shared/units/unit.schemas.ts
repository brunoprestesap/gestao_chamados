import { z } from 'zod';

const phoneTrim = z
  .string()
  .optional()
  .transform((v) => (v ?? '').trim())
  .transform((v) => (v.length ? v : undefined));

const emailTrim = z
  .string()
  .optional()
  .transform((v) => (v ?? '').trim().toLowerCase())
  .transform((v) => (v.length ? v : undefined));

export const UnitCreateSchema = z.object({
  name: z
    .string()
    .min(1, 'Informe o nome da unidade')
    .transform((v) => v.trim()),
  floor: z
    .string()
    .min(1, 'Informe o andar')
    .transform((v) => v.trim()),
  responsibleName: z
    .string()
    .min(1, 'Informe o nome do responsável')
    .transform((v) => v.trim()),
  responsibleEmail: emailTrim.refine(
    (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    'Email inválido',
  ),
  responsiblePhone: phoneTrim,
  isActive: z.boolean().default(true),
});

export const UnitUpdateSchema = UnitCreateSchema.partial();

export const UnitListQuerySchema = z.object({
  q: z.string().optional().default(''),
});
