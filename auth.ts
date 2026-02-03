import bcrypt from 'bcryptjs';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';

import { authConfig } from '@/auth.config';
import { dbConnect } from '@/lib/db';
import { UserModel } from '@/models/user.model';
import type { UserRole } from '@/shared/auth/auth.constants';

/** Workaround: next-auth@5 beta — default export não é reconhecido como callable pelo TS (moduleResolution: bundler). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const initAuth = NextAuth as (config: any) => any;

const CredentialsSchema = z.object({
  username: z
    .string()
    .min(1)
    .transform((v) => v.trim().toLowerCase()),
  password: z.string().min(6),
});

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? 'session';
const SEVEN_DAYS = 60 * 60 * 24 * 7;

export const { auth, signIn, signOut, handlers } = initAuth({
  ...authConfig,

  trustHost: true,

  session: {
    strategy: 'jwt',
    maxAge: SEVEN_DAYS,
  },

  cookies: {
    sessionToken: {
      name: COOKIE_NAME,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SEVEN_DAYS,
        secure: process.env.NODE_ENV === 'production' || process.env.AUTH_COOKIE_SECURE === 'true',
      },
    },
  },

  providers: [
    Credentials({
      credentials: {
        username: { label: 'Matrícula', type: 'text' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = CredentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        await dbConnect();
        const user = await UserModel.findOne({ username: parsed.data.username }).lean();
        if (!user || !user.isActive || !user.passwordHash) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        return {
          id: String(user._id),
          username: user.username,
          name: user.name ?? user.username,
          email: user.email ?? null,
          role: user.role as UserRole,
          unitId: user.unitId ? String(user.unitId) : null,
          isActive: user.isActive,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({
      token,
      user,
    }: {
      token: {
        userId?: string;
        username?: string;
        role?: UserRole;
        unitId?: string | null;
        isActive?: boolean;
        id?: string;
        [k: string]: unknown;
      };
      user?: {
        id: string;
        username?: string;
        role?: UserRole;
        unitId?: string | null;
        isActive?: boolean;
      };
    }) {
      if (user) {
        token.userId = user.id;
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
        token.unitId = user.unitId ?? null;
        token.isActive = user.isActive;
      }
      return token;
    },
    async session({
      session,
      token,
    }: {
      session: {
        user: {
          id?: string;
          username?: string;
          role?: UserRole;
          unitId?: string | null;
          isActive?: boolean;
          [k: string]: unknown;
        };
        [k: string]: unknown;
      };
      token: {
        userId?: string;
        username?: string;
        role?: UserRole;
        unitId?: string | null;
        isActive?: boolean;
        id?: string;
      };
    }) {
      if (session.user) {
        session.user.id = token.userId ?? token.id ?? '';
        session.user.username = token.username ?? '';
        session.user.role = token.role ?? 'Solicitante';
        session.user.unitId = token.unitId ?? null;
        session.user.isActive = token.isActive ?? true;
      }
      return session;
    },
  },
});
