// app/lib/dal.ts
import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import type { Role } from './session';
import { decrypt } from './session';

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? 'session';

export const verifySession = cache(async () => {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const session = await decrypt(token);

  if (!session?.userId || !session.isActive) return null;
  return session;
});

export async function requireSession() {
  const session = await verifySession();
  if (!session) redirect('/login');
  return session;
}

export function canManage(role?: Role) {
  return role === 'Admin' || role === 'Preposto';
}

export async function requireManager() {
  const session = await requireSession();
  if (!canManage(session.role)) redirect('/dashboard');
  return session;
}
