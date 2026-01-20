import { z } from 'zod';

import { USER_ROLES } from '@/shared/auth/auth.constants';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido');

export const UserCreateSchema = z.object({
  name: z
    .string()
    .min(1, 'Informe o nome')
    .transform((v) => v.trim()),
  email: z.string().trim().toLowerCase().email('Email inválido'),
  role: z.enum(USER_ROLES),
  unitId: objectId.optional().nullable(),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  isActive: z.boolean().default(true),
});

export const UserUpdateSchema = z.object({
  name: z
    .string()
    .min(1)
    .transform((v) => v.trim())
    .optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  role: z.enum(USER_ROLES).optional(),
  unitId: objectId.optional().nullable(),
  password: z.string().min(6).optional(), // opcional no update
  isActive: z.boolean().optional(),
});

export const UserListQuerySchema = z.object({
  q: z.string().optional().default(''),
  role: z.enum(USER_ROLES).optional(),
  unitId: objectId.optional(),
});
