// auth.config.ts
// next-auth@5 beta não exporta NextAuthConfig de forma que o TS resolva; usamos shape mínima.
export const authConfig = {
  pages: { signIn: '/login' },
} as const;
