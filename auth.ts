import bcrypt from 'bcryptjs';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';

import { authConfig } from '@/auth.config';
import { dbConnect } from '@/lib/db';
import { authenticateWithLdap, isLdapConfigured, type LdapUserProfile } from '@/lib/ldap';
import { UnitModel } from '@/models/unit';
import { UserModel } from '@/models/user.model';
import type { UserRole } from '@/shared/auth/auth.constants';

const AUTH_DEBUG = process.env.LDAP_DEBUG === 'true';

function authDebug(...args: unknown[]) {
  if (AUTH_DEBUG) console.warn('[Auth:debug]', ...args);
}

/** Workaround: next-auth@5 beta — default export não é reconhecido como callable pelo TS (moduleResolution: bundler). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const initAuth = NextAuth as (config: any) => any;

const CredentialsSchema = z.object({
  username: z
    .string()
    .min(1)
    .transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1),
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
        secure: process.env.AUTH_COOKIE_SECURE === 'true',
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
        console.error('[Auth] ── authorize() chamado ──', {
          hasCredentials: !!credentials,
          ldapDebug: process.env.LDAP_DEBUG,
          ldapUrl: process.env.LDAP_URL ? '(definido)' : '(vazio)',
          ldapBaseDn: process.env.LDAP_BASE_DN ? '(definido)' : '(vazio)',
          ldapBindDn: process.env.LDAP_BIND_DN ? '(definido)' : '(vazio)',
        });

        const parsed = CredentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          console.error('[Auth] Validação Zod falhou:', parsed.error.flatten());
          return null;
        }

        authDebug(`Tentativa de login: "${parsed.data.username}"`);

        await dbConnect();
        let user = await UserModel.findOne({ username: parsed.data.username }).lean();

        authDebug(
          user
            ? `Usuário encontrado no MongoDB (id: ${String(user._id)}, role: ${user.role}, ativo: ${user.isActive})`
            : 'Usuário NÃO encontrado no MongoDB',
        );

        // ── Fase 1: Tentar autenticação LDAP ──
        let authenticated = false;
        let ldapProfile: LdapUserProfile | null = null;

        if (isLdapConfigured()) {
          authDebug('LDAP configurado, tentando autenticação LDAP...');
          const ldapResult = await authenticateWithLdap(parsed.data.username, parsed.data.password);

          authDebug('Resultado LDAP:', ldapResult.status);

          if (ldapResult.status === 'success') {
            authenticated = true;
            ldapProfile = ldapResult.profile;
          } else if (ldapResult.status === 'invalid_credentials') {
            // Se o usuário tem senha local (passwordHash), permite fallback
            // (pode ser colisão de username entre app e AD)
            if (user?.passwordHash) {
              authDebug('Senha inválida no LDAP, mas usuário tem senha local → tentando fallback');
            } else {
              authDebug(
                'Senha inválida no LDAP → negando acesso (usuário LDAP-only, sem fallback)',
              );
              return null;
            }
          }
          // 'not_found' ou 'error' → continua para autenticação local
        } else {
          authDebug('LDAP não configurado, usando apenas autenticação local');
        }

        // ── Fase 2: Auto-provisionar usuário LDAP ──
        if (authenticated && !user && ldapProfile) {
          authDebug('Provisionando novo usuário a partir do LDAP...');

          const unitId = ldapProfile.department
            ? ((
                await UnitModel.findOne({
                  name: { $regex: `^${ldapProfile.department}$`, $options: 'i' },
                  isActive: true,
                }).lean()
              )?._id ?? null)
            : null;

          authDebug(
            ldapProfile.department
              ? `Department AD: "${ldapProfile.department}" → Unit MongoDB: ${unitId ? String(unitId) : 'não encontrada'}`
              : 'Sem department no AD',
          );

          const doc = new UserModel({
            username: parsed.data.username,
            name: ldapProfile.displayName ?? parsed.data.username,
            email: ldapProfile.email ?? undefined,
            role: 'Solicitante',
            ...(unitId ? { unitId } : {}),
            isActive: true,
          });
          await doc.save();

          user = await UserModel.findById(doc._id).lean();
          authDebug(`Usuário provisionado com sucesso (id: ${String(doc._id)})`);
        }

        // Usuário deve existir e estar ativo
        if (!user || !user.isActive) {
          authDebug('Acesso negado: usuário inexistente ou inativo');
          return null;
        }

        // ── Fase 3: Fallback para senha local ──
        if (!authenticated && user.passwordHash) {
          authDebug('Tentando autenticação local (bcrypt)...');
          authenticated = await bcrypt.compare(parsed.data.password, user.passwordHash);
          authDebug(authenticated ? 'Autenticação local OK' : 'Senha local inválida');
        }

        if (!authenticated) {
          authDebug('Acesso negado: nenhum método de autenticação teve sucesso');
          return null;
        }

        authDebug(`Login bem-sucedido: "${user.username}" (role: ${user.role})`);

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
