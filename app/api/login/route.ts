// app/api/login/route.ts
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';

import { dbConnect } from '@/lib/db';
import { signJwt } from '@/lib/jwt';
import { UserModel } from '@/models/user.model';
import { LoginSchema } from '@/shared/auth/auth.schemas';

function getAuthEnv() {
  const secret = process.env.AUTH_SECRET;
  const cookieName = process.env.AUTH_COOKIE_NAME || 'session';
  if (!secret) throw new Error('AUTH_SECRET não definido no .env.local');
  return { secret, cookieName };
}

export async function POST(req: Request) {
  const raw = await req.json().catch(() => ({}));
  const parsed = LoginSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { username, password } = parsed.data;

  await dbConnect();

  const user = await UserModel.findOne({ username }).lean();
  if (!user || !user.isActive || !user.passwordHash) {
    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });

  const { secret, cookieName } = getAuthEnv();

  const token = signJwt(
    {
      user: {
        id: String(user._id),
        username: user.username,
        name: user.name ?? user.username,
        role: user.role,
        unitId: user.unitId ? String(user.unitId) : null,
        isActive: user.isActive,
      },
    },
    secret,
    60 * 60 * 24 * 7, // 7 dias
  );

  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return res;
}
