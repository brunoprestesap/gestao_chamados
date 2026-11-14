import 'server-only';

import { redirect } from 'next/navigation';
import { cache } from 'react';

import { auth } from '@/auth';
import { dbConnect } from '@/lib/db';
import { UserModel } from '@/models/user.model';
import type { UserRole } from '@/shared/auth/auth.constants';

export type Role = UserRole;

export type SessionLike = {
  userId: string;
  username: string;
  role: Role;
  unitId?: string | null;
  isActive: boolean;
  /** O órgão de quem está logado (spec 0025). */
  orgaoId: string;
};

export const verifySession = cache(async (): Promise<SessionLike | null> => {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return null;
  // Sem órgão no JWT não há sessão válida (spec 0025, AC-10).
  if (!session.user.orgaoId) return null;

  // Revalida o usuário contra o banco. O JWT vive 7 dias e o `isActive`/`role`
  // ficam congelados no token desde o login; sem esta checagem fresca, um usuário
  // desativado (ou rebaixado) por um admin manteria acesso até o token expirar.
  // `verifySession` é memoizado por request (React.cache), então é 1 query/request.
  // O plugin de órgão filtra esta leitura pelo órgão do JWT (spec 0025, AC-9):
  // usuário de outro órgão volta `null` e vale como deslogado.
  await dbConnect();
  const dbUser = await UserModel.findById(session.user.id).select('role isActive').lean();
  if (!dbUser || dbUser.isActive === false) return null;

  return {
    userId: session.user.id,
    username: session.user.username ?? '',
    role: (dbUser.role ?? session.user.role) as Role,
    unitId: session.user.unitId ?? null,
    isActive: true,
    orgaoId: session.user.orgaoId,
  };
});

export async function requireSession() {
  const session = await verifySession();
  if (!session) redirect('/login');
  return session;
}

export function canManage(role?: Role) {
  return role === 'Admin' || role === 'Preposto';
}

export function isTechnician(role?: Role) {
  return role === 'Técnico';
}

export function isPreposto(role?: Role) {
  return role === 'Preposto';
}

export async function requireManager() {
  const session = await requireSession();
  if (!canManage(session.role)) redirect('/dashboard');
  return session;
}

export async function requireTechnician() {
  const session = await requireSession();
  if (!isTechnician(session.role)) redirect('/dashboard');
  return session;
}

export function isAdmin(role?: Role) {
  return role === 'Admin';
}

export async function requireAdmin() {
  const session = await requireSession();
  if (!isAdmin(session.role)) redirect('/dashboard');
  return session;
}
