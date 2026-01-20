import { z } from 'zod';

export const LoginSchema = z.object({
  username: z
    .string()
    .min(3, 'Informe a matrícula')
    .transform((v) => v.trim().toLowerCase()),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
});

export type LoginDTO = z.infer<typeof LoginSchema>;
