import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { signJwt, verifyJwt } from '@/lib/jwt';

const SECRET = 'test-secret-key-32bytes-minimum!';

describe('signJwt', () => {
  it('gera token com 3 partes separadas por ponto', () => {
    const token = signJwt({ sub: 'user123' }, SECRET, 3600);
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
  });

  it('inclui payload no token', () => {
    const token = signJwt({ sub: 'user123', role: 'Admin' }, SECRET, 3600);
    const [, payloadPart] = token.split('.');
    const payload = JSON.parse(
      Buffer.from(payloadPart.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    );
    expect(payload.sub).toBe('user123');
    expect(payload.role).toBe('Admin');
    expect(payload.iat).toBeTypeOf('number');
    expect(payload.exp).toBeTypeOf('number');
  });

  it('exp = iat + expiresInSec', () => {
    const token = signJwt({}, SECRET, 7200);
    const [, payloadPart] = token.split('.');
    const payload = JSON.parse(
      Buffer.from(payloadPart.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    );
    expect(payload.exp - payload.iat).toBe(7200);
  });
});

describe('verifyJwt', () => {
  it('verifica token válido e retorna payload', () => {
    const token = signJwt({ sub: 'user123', role: 'Admin' }, SECRET, 3600);
    const payload = verifyJwt(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('user123');
    expect(payload!.role).toBe('Admin');
  });

  it('rejeita token com secret diferente', () => {
    const token = signJwt({ sub: 'user123' }, SECRET, 3600);
    const payload = verifyJwt(token, 'wrong-secret-key-32bytes-nope!!');
    expect(payload).toBeNull();
  });

  it('rejeita token expirado', () => {
    // Gera token que expirou 1h atrás
    const now = Math.floor(Date.now() / 1000);
    vi.spyOn(Date, 'now').mockReturnValue((now - 7200) * 1000); // 2h atrás
    const token = signJwt({ sub: 'user123' }, SECRET, 3600); // expira em 1h → expirou 1h atrás
    vi.restoreAllMocks();

    const payload = verifyJwt(token, SECRET);
    expect(payload).toBeNull();
  });

  it('rejeita token com formato inválido (< 3 partes)', () => {
    expect(verifyJwt('abc.def', SECRET)).toBeNull();
    expect(verifyJwt('onlyonepart', SECRET)).toBeNull();
  });

  it('rejeita token com assinatura adulterada', () => {
    const token = signJwt({ sub: 'user123' }, SECRET, 3600);
    const parts = token.split('.');
    parts[2] = parts[2].split('').reverse().join(''); // adultera assinatura
    const tampered = parts.join('.');
    expect(verifyJwt(tampered, SECRET)).toBeNull();
  });

  it('preserva campos extras no payload', () => {
    const token = signJwt({ userId: '42', unitId: 'dept-a', custom: true }, SECRET, 3600);
    const payload = verifyJwt(token, SECRET);
    expect(payload!.userId).toBe('42');
    expect(payload!.unitId).toBe('dept-a');
    expect(payload!.custom).toBe(true);
  });

  it('token com expiresInSec = 0 expira imediatamente', () => {
    const token = signJwt({ sub: 'user123' }, SECRET, 0);
    // exp === iat, e verifyJwt verifica exp < now (que é >= iat)
    // Dependendo do timing pode ou não passar — mas com 0s, exp === now
    // Na prática, Date.now() avança, então exp < now
    // Vamos forçar 1 segundo de atraso com mock
    const now = Math.floor(Date.now() / 1000);
    vi.spyOn(Date, 'now').mockReturnValue((now + 1) * 1000);
    const payload = verifyJwt(token, SECRET);
    vi.restoreAllMocks();
    expect(payload).toBeNull();
  });
});
