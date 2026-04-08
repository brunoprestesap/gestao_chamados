/**
 * Valida a sessão chamando o endpoint do app Next.js (NextAuth).
 * O app expõe GET /api/session/verify; enviamos o header Cookie do handshake.
 */
const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:3000';
export async function verifyHandshakeSession(cookieHeader) {
    if (!cookieHeader || typeof cookieHeader !== 'string')
        return null;
    try {
        const res = await fetch(`${APP_URL}/api/session/verify`, {
            method: 'GET',
            headers: {
                cookie: cookieHeader,
            },
            cache: 'no-store',
        });
        if (!res.ok)
            return null;
        const data = (await res.json());
        if (!data?.userId || !data.isActive)
            return null;
        return data;
    }
    catch {
        return null;
    }
}
