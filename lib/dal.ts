import 'server-only';

import { redirect } from 'next/navigation';
import { cache } from 'react';

import { auth } from '@/auth';

import type { UserRole } from '@/shared/auth/auth.constants';

export type Role = UserRole;

export type SessionLike = {
  userId: string;
  username: string;
  role: Role;
  unitId?: string | null;
  isActive: boolean;
};

export const verifySession = cache(async (): Promise<SessionLike | null> => {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) return null;

  return {
    userId: session.user.id,
    username: session.user.username ?? '',
    role: session.user.role as Role,
    unitId: session.user.unitId ?? null,
    isActive: session.user.isActive,
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
