import { z } from 'zod';

export const USER_ROLES = ['Admin', 'Preposto', 'Solicitante', 'Técnico'] as const;
export type UserRole = (typeof USER_ROLES)[number];

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID inválido');
const objectIdArray = z.array(objectId).default([]);

export const UsernameSchema = z
  .string()
  .min(3, 'Informe a matrícula')
  .transform((v) => v.trim().toLowerCase());

export const UserCreateSchema = z.object({
  username: UsernameSchema,
  name: z
    .string()
    .min(1, 'Informe o nome')
    .transform((v) => v.trim()),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Email inválido')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  role: z.enum(USER_ROLES),
  unitId: objectId.optional().nullable(),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  isActive: z.boolean().default(true),
  // Campos específicos para Técnico
  specialties: objectIdArray.optional(),
  maxAssignedTickets: z.number().int().min(1).default(5).optional(),
});

export const UserUpdateSchema = z.object({
  username: UsernameSchema.optional(),
  name: z
    .string()
    .min(1)
    .transform((v) => v.trim())
    .optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),
  role: z.enum(USER_ROLES).optional(),
  unitId: objectId.optional().nullable(),
  password: z.string().min(6).optional(),
  isActive: z.boolean().optional(),
  // Campos específicos para Técnico
  specialties: objectIdArray.optional(),
  maxAssignedTickets: z.number().int().min(1).optional(),
});

export const UserListQuerySchema = z.object({
  q: z.string().optional().default(''),
  role: z.enum(USER_ROLES).optional(),
  unitId: objectId.optional(),
  status: z.enum(['all', 'active', 'inactive']).optional().default('all'),
});
