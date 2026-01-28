// app/lib/session.ts
import 'server-only';

import { jwtVerify, SignJWT } from 'jose';

export type Role = 'Admin' | 'Preposto' | 'Solicitante' | 'Técnico';

export type SessionPayload = {
  userId: string;
  username: string; // matrícula
  role: Role;
  unitId?: string | null;
  isActive: boolean;
};

const secretStr = process.env.AUTH_SECRET;
if (!secretStr) throw new Error('AUTH_SECRET não definido no .env.local');

const secret = new TextEncoder().encode(secretStr);

export async function encrypt(payload: SessionPayload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

export async function decrypt(token?: string) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
