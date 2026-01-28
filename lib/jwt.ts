// src/lib/jwt.ts
import crypto from 'crypto';

function base64url(input: Buffer | string) {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signHmac(data: string, secret: string) {
  return base64url(crypto.createHmac('sha256', secret).update(data).digest());
}

export function signJwt(payload: Record<string, unknown>, secret: string, expiresInSec: number) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const body = {
    ...payload,
    iat: now,
    exp: now + expiresInSec,
  };

  const headerPart = base64url(JSON.stringify(header));
  const payloadPart = base64url(JSON.stringify(body));
  const data = `${headerPart}.${payloadPart}`;
  const sig = signHmac(data, secret);

  return `${data}.${sig}`;
}

export function verifyJwt<T extends Record<string, any>>(token: string, secret: string): T | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerPart, payloadPart, sig] = parts;
  const data = `${headerPart}.${payloadPart}`;
  const expected = signHmac(data, secret);

  // timing-safe
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  const payloadJson = Buffer.from(
    payloadPart.replace(/-/g, '+').replace(/_/g, '/'),
    'base64',
  ).toString('utf8');
  const payload = JSON.parse(payloadJson) as T;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) return null;

  return payload;
}
