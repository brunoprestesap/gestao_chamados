/**
 * Valida a sessão a partir do cookie usado pelo app (AUTH_SECRET + AUTH_COOKIE_NAME).
 * O login do app usa lib/session (encrypt com jose); aqui verificamos com jose.
 *
 * Para usar NextAuth em vez disso: instale next-auth no socket-server e use
 * getToken({ req: handshake, secret: process.env.NEXTAUTH_SECRET }) e garanta
 * que o login do app defina o cookie do NextAuth.
 *
 * Opcional futuro: validar issuer/audience no payload do JWT se o app passar a emitir
 * (ex.: payload.iss / payload.aud) para restringir tokens a este serviço.
 */

import { parse as parseCookie } from 'cookie';
import { jwtVerify } from 'jose';

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? 'session';
const SECRET = process.env.AUTH_SECRET;

export type SessionPayload = {
  userId: string;
  username: string;
  role: string;
  unitId?: string | null;
  isActive: boolean;
};

export async function verifyHandshakeSession(
  cookieHeader: string | undefined,
): Promise<SessionPayload | null> {
  if (!SECRET) {
    console.warn('[socket-server] AUTH_SECRET não definido; conexões não autenticadas.');
    return null;
  }
  const cookies = parseCookie(cookieHeader ?? '');
  const token = cookies[COOKIE_NAME] ?? null;
  if (!token || typeof token !== 'string') return null;
  try {
    const secretKey = new TextEncoder().encode(SECRET);
    const { payload } = await jwtVerify(token, secretKey);
    const p = payload as unknown as SessionPayload;
    if (!p?.userId || !p.isActive) return null;
    return p;
  } catch {
    return null;
  }
}
