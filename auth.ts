import bcrypt from 'bcryptjs';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { dbConnect } from '@/lib/db';
import { UserModel } from '@/models/user.model';
import { LoginSchema } from '@/shared/auth/auth.schemas';

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },

  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        username: { label: 'Matrícula', type: 'text' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = LoginSchema.safeParse(credentials ?? {});
        if (!parsed.success) return null;

        const username = parsed.data.username.trim().toLowerCase();
        const password = parsed.data.password;

        await dbConnect();

        const user = await UserModel.findOne({ username }).lean();
        if (!user) return null;
        if (!user.isActive) return null;
        if (!user.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: String(user._id),
          name: user.name ?? username,
          username: user.username, // já deve estar normalizado no banco
          role: user.role,
          unitId: user.unitId ? String(user.unitId) : null,
          isActive: user.isActive,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
        token.unitId = user.unitId ?? null;
        token.isActive = user.isActive ?? true;
      }
      return token;
    },

    async session({ session, token }) {
      session.user.id = token.id;
      session.user.username = token.username;
      session.user.role = token.role;
      session.user.unitId = token.unitId ?? null;
      session.user.isActive = token.isActive ?? true;
      return session;
    },
  },

  pages: { signIn: '/login' },
});
