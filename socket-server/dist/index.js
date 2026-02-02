/**
 * Socket server (processo separado, ex.: porta 3001).
 * CORS: origin http://localhost:3000 (em produção troque para o host real).
 * Autenticação: cookie de sessão do app (AUTH_SECRET + AUTH_COOKIE_NAME).
 * POST /emit: emite evento para uma room; protegido por x-internal-secret e IP localhost.
 *
 * Em produção: /emit aceita apenas 127.0.0.1 / ::1. Não logue secrets.
 */
import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { verifyHandshakeSession } from './auth.js';
const ALLOWED_EVENTS = new Set(['ticket:assigned']);
const ROOM_REGEX = /^user:[a-zA-Z0-9_-]+$/;
const PORT = Number(process.env.SOCKET_PORT ?? 3001);
const INTERNAL_SECRET = process.env.SOCKET_INTERNAL_SECRET ?? '';
const CORS_ORIGIN = process.env.SOCKET_CORS_ORIGIN ?? 'http://localhost:3000';
const app = express();
const httpServer = createServer(app);
app.use(cors({
    origin: CORS_ORIGIN,
    credentials: true,
}));
app.use(express.json());
const io = new Server(httpServer, {
    cors: {
        origin: CORS_ORIGIN,
        credentials: true,
    },
    transports: ['websocket', 'polling'],
});
io.use(async (socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie;
    const session = await verifyHandshakeSession(cookieHeader);
    if (!session) {
        return next(new Error('Unauthorized'));
    }
    socket.data.userId = session.userId;
    next();
});
io.on('connection', (socket) => {
    const userId = socket.data.userId;
    const room = `user:${userId}`;
    socket.join(room);
    console.log(`[socket-server] user ${userId} joined room ${room}`);
    socket.on('disconnect', () => {
        console.log(`[socket-server] user ${userId} disconnected`);
    });
});
function isLocalhost(ip) {
    const normalized = ip.replace(/^::ffff:/, '');
    return normalized === '127.0.0.1' || normalized === '::1';
}
app.post('/emit', (req, res) => {
    const secret = req.headers['x-internal-secret'];
    if (!INTERNAL_SECRET || typeof secret !== 'string' || secret !== INTERNAL_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ??
        req.socket.remoteAddress ??
        '';
    if (!isLocalhost(clientIp)) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const body = req.body;
    if (!body?.room || typeof body.room !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid room' });
    }
    if (!body?.event || typeof body.event !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid event' });
    }
    if (!ALLOWED_EVENTS.has(body.event)) {
        return res.status(400).json({ error: 'Event not allowed' });
    }
    if (!ROOM_REGEX.test(body.room)) {
        return res.status(400).json({ error: 'Invalid room format' });
    }
    io.to(body.room).emit(body.event, body.payload);
    res.json({ ok: true });
});
httpServer.listen(PORT, () => {
    console.log(`[socket-server] listening on port ${PORT}`);
    if (!INTERNAL_SECRET) {
        console.warn('[socket-server] SOCKET_INTERNAL_SECRET não definido; POST /emit rejeitará todas as requisições.');
    }
    console.log(`[socket-server] CORS origin: ${CORS_ORIGIN} (troque SOCKET_CORS_ORIGIN para o host real em produção)`);
});
