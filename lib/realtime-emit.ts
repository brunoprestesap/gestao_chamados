/**
 * Emissão de eventos para o socket-server (POST /emit).
 * Usar apenas no server (Server Actions / API). Não expor SOCKET_INTERNAL_SECRET no client.
 * Falha na emissão NÃO deve quebrar o fluxo (ex.: atribuição de chamado).
 */

import type {
  TicketAssignedPayload,
  TicketNewPayload,
  TicketExecutionRegisteredPayload,
  TicketClosedPayload,
} from '@/shared/socket';

const EMIT_URL = process.env.SOCKET_EMIT_URL ?? 'http://127.0.0.1:3001/emit';
const INTERNAL_SECRET = process.env.SOCKET_INTERNAL_SECRET ?? '';
const EMIT_TIMEOUT_MS = 1200;

export type AllowedEmitEvents =
  | 'ticket:assigned'
  | 'ticket:new'
  | 'ticket:execution_registered'
  | 'ticket:closed';

/**
 * Envia evento para uma room no socket-server.
 * room: ex. "user:<technicianId>" ou "managers"
 * Retorna false em falha (timeout, 4xx/5xx, rede); não lança.
 */
export async function emitToRoom(
  room: string,
  event: AllowedEmitEvents,
  payload:
    | TicketAssignedPayload
    | TicketNewPayload
    | TicketExecutionRegisteredPayload
    | TicketClosedPayload,
): Promise<boolean> {
  if (!INTERNAL_SECRET) {
    console.warn('[realtime-emit] SOCKET_INTERNAL_SECRET não definido; emit ignorado.');
    return false;
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EMIT_TIMEOUT_MS);
  try {
    const res = await fetch(EMIT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({ room, event, payload }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      console.warn('[realtime-emit] POST /emit falhou, status:', res.status);
      return false;
    }
    return true;
  } catch (e) {
    clearTimeout(timeoutId);
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg !== 'The operation was aborted.') {
      console.warn('[realtime-emit] erro ao chamar socket-server:', msg);
    }
    return false;
  }
}
