// app/api/logout/route.ts
import { NextResponse } from 'next/server';

export async function POST() {
  const cookieName = process.env.AUTH_COOKIE_NAME || 'session';

  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookieName, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });

  return res;
}
