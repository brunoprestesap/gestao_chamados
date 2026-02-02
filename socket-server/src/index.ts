/**
 * Socket server (processo separado, ex.: porta 3001).
 * CORS: origin http://localhost:3000 (em produção troque para o host real).
 * Autenticação: cookie de sessão do app (AUTH_SECRET + AUTH_COOKIE_NAME).
 * POST /emit: emite evento para uma room; protegido por x-internal-secret e IP localhost.
 *
 * Em produção: /emit aceita apenas 127.0.0.1 / ::1. Não logue secrets.
 */

import 'dotenv/config';

import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { verifyHandshakeSession } from './auth.js';

/** Eventos conhecidos (espelham shared/socket.ts do projeto principal). */
type ServerToClientEvents = {
  'ticket:assigned': (payload: unknown) => void;
  'ticket:new': (payload: unknown) => void;
  'ticket:execution_registered': (payload: unknown) => void;
  'ticket:closed': (payload: unknown) => void;
};

/** Dados armazenados no socket (padrão Socket.IO). */
interface SocketData {
  userId: string;
  role?: string;
}

const ALLOWED_EVENTS = new Set<string>([
  'ticket:assigned',
  'ticket:new',
  'ticket:execution_registered',
  'ticket:closed',
]);
const ROOM_REGEX = /^user:[a-zA-Z0-9_-]+$/;
const MANAGERS_ROOM = 'managers';

const PORT = Number(process.env.SOCKET_PORT ?? 3001);
const INTERNAL_SECRET = process.env.SOCKET_INTERNAL_SECRET ?? '';
const CORS_ORIGIN = process.env.SOCKET_CORS_ORIGIN ?? 'http://localhost:3000';

const app = express();
const httpServer = createServer(app);

app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json());

const io = new Server<
  ServerToClientEvents,
  Record<string, never>,
  Record<string, never>,
  SocketData
>(httpServer, {
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
  socket.data.role = session.role;
  next();
});

io.on('connection', (socket) => {
  const userId = socket.data.userId;
  const role = socket.data.role;
  const room = `user:${userId}`;
  socket.join(room);
  if (role === 'Preposto' || role === 'Admin') {
    socket.join(MANAGERS_ROOM);
  }
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[socket-server] user ${userId} joined room ${room}`);
  }
  socket.on('disconnect', () => {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[socket-server] user ${userId} disconnected`);
    }
  });
});

type EmitBody = {
  room: string;
  event: string;
  payload: unknown;
};

function isLocalhost(ip: string): boolean {
  const normalized = ip.replace(/^::ffff:/, '');
  return normalized === '127.0.0.1' || normalized === '::1';
}

app.post('/emit', (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (!INTERNAL_SECRET || typeof secret !== 'string' || secret !== INTERNAL_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    '';
  if (!isLocalhost(clientIp)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const body = req.body as EmitBody;
  if (!body?.room || typeof body.room !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid room' });
  }
  if (!body?.event || typeof body.event !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid event' });
  }
  if (!ALLOWED_EVENTS.has(body.event)) {
    return res.status(400).json({ error: 'Event not allowed' });
  }
  const roomAllowed = body.room === MANAGERS_ROOM || ROOM_REGEX.test(body.room);
  if (!roomAllowed) {
    return res.status(400).json({ error: 'Invalid room format' });
  }
  io.to(body.room).emit(body.event as keyof ServerToClientEvents, body.payload);
  res.json({ ok: true });
});

httpServer.listen(PORT, () => {
  console.warn(`[socket-server] listening on port ${PORT}`);
  if (!INTERNAL_SECRET) {
    console.warn(
      '[socket-server] SOCKET_INTERNAL_SECRET não definido; POST /emit rejeitará todas as requisições.',
    );
  }
  console.warn(
    `[socket-server] CORS origin: ${CORS_ORIGIN} (troque SOCKET_CORS_ORIGIN para o host real em produção)`,
  );
});
