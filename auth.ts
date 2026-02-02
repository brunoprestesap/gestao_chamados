import bcrypt from 'bcrypt';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';

import { authConfig } from '@/auth.config';
import client from '@/lib/db';

/** Workaround: next-auth@5 beta — default export não é reconhecido como callable pelo TS (moduleResolution: bundler). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const initAuth = NextAuth as (config: any) => any;

type DbUser = {
  _id: any;
  email: string;
  name?: string;
  passwordHash: string;
  role: 'user' | 'admin';
};

async function getUserByEmail(email: string): Promise<DbUser | null> {
  await client.connect();
  return client.db().collection<DbUser>('users').findOne({ email });
}

export const { auth, signIn, signOut, handlers } = initAuth({
  ...authConfig,

  // Credentials normalmente usa JWT strategy (role vai no token)
  session: { strategy: 'jwt' },

  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);
        if (!parsed.success) return null;

        const user = await getUserByEmail(parsed.data.email);
        if (!user) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name ?? user.email,
          role: user.role,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({
      token,
      user,
    }: {
      token: { id?: string; role?: string; [k: string]: unknown };
      user?: { id: string; role?: string; [k: string]: unknown };
    }) {
      // Primeira vez (login): `user` existe
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({
      session,
      token,
    }: {
      session: {
        user?: { id?: string; role?: string; [k: string]: unknown };
        [k: string]: unknown;
      };
      token: { id?: string; role?: string; [k: string]: unknown };
    }) {
      // Encaminha do token -> session
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
});
