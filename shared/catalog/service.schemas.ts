import { z } from 'zod';

import { PRIORITIES, SERVICE_CODE_ERROR, SERVICE_CODE_REGEX } from './service.constants';

/**
 * Campo numérico para RHF + Input (string -> number) e também para backend.
 * - "" -> 0 (ou você pode preferir undefined; aqui seguimos seu modal: 0)
 */
const numberFromInput = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? 0 : Number(v)),
  z.number().min(0),
);

export const ServiceCreateSchema = z.object({
  code: z
    .string()
    .transform((v) => v.trim().toUpperCase())
    .refine((v) => SERVICE_CODE_REGEX.test(v), SERVICE_CODE_ERROR),

  name: z
    .string()
    .min(1, 'Informe o nome do serviço')
    .transform((v) => v.trim().toUpperCase()),

  typeId: z.string().min(1, 'Selecione o tipo'),
  subtypeId: z.string().min(1, 'Selecione o subtipo'),

  description: z
    .string()
    .optional()
    .transform((v) => v?.trim()),
  priorityDefault: z.enum(PRIORITIES),
  estimatedHours: numberFromInput,

  materials: z
    .string()
    .optional()
    .transform((v) => v?.trim()),
  procedure: z
    .string()
    .optional()
    .transform((v) => v?.trim()),

  isActive: z.boolean(),
});

/**
 * Update: tudo opcional, mas mantendo as mesmas regras quando o campo existir.
 */
export const ServiceUpdateSchema = ServiceCreateSchema.partial();

/**
 * Query (listagem)
 */
export const ServiceListQuerySchema = z.object({
  q: z.string().optional().default(''),
  typeId: z.string().optional().default(''),
  subtypeId: z.string().optional().default(''),
});
