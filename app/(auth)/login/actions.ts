// app/(auth)/login/actions.ts
'use server';

import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { dbConnect } from '@/lib/db';
import { encrypt } from '@/lib/session';
import { UserModel } from '@/models/user.model';
import { LoginSchema } from '@/shared/auth/auth.schemas';

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? 'session';
const COOKIE_SECURE = process.env.AUTH_COOKIE_SECURE === 'true';

export async function loginAction(formData: FormData) {
  const raw = {
    username: String(formData.get('username') ?? ''),
    password: String(formData.get('password') ?? ''),
  };

  const parsed = LoginSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Credenciais inválidas' as const };

  const username = parsed.data.username.trim().toLowerCase();
  const password = parsed.data.password;

  await dbConnect();

  const user = await UserModel.findOne({ username }).lean();
  if (!user || !user.isActive || !user.passwordHash) {
    return { ok: false, error: 'Usuário ou senha inválidos' as const };
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return { ok: false, error: 'Usuário ou senha inválidos' as const };

  const token = await encrypt({
    userId: String(user._id),
    username: user.username,
    role: user.role,
    unitId: user.unitId ? String(user.unitId) : null,
    isActive: user.isActive,
  });

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return { ok: true } as const;
}

export async function logoutAction() {
  (await cookies()).delete(COOKIE_NAME);
  redirect('/login');
}
