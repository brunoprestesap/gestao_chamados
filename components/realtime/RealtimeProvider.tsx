'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { toast } from 'sonner';

import { playNotificationSound } from '@/lib/notification-sound';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  TicketAssignedPayload,
  TicketNewPayload,
  TicketExecutionRegisteredPayload,
  TicketClosedPayload,
} from '@/shared/socket';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001';

/** Rota do chamado para o técnico: chamados atribuídos a ele. */
function getAssignedTicketUrl(payload: TicketAssignedPayload): string {
  return `/chamados-atribuidos/${payload.ticketId}`;
}

/** Rota para Preposto/Admin: gestão (lista de chamados para classificar/atribuir). */
function getNewTicketManagementUrl(_payload: TicketNewPayload): string {
  return '/gestao';
}

/** Rota do chamado (detalhe) para Preposto, Admin e Solicitante. */
function getExecutionTicketUrl(payload: TicketExecutionRegisteredPayload): string {
  return `/meus-chamados/${payload.ticketId}`;
}

/** Rota do chamado (detalhe) para o Solicitante quando o chamado é encerrado. */
function getClosedTicketUrl(payload: TicketClosedPayload): string {
  return `/meus-chamados/${payload.ticketId}`;
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const socketRef = useRef<TypedSocket | null>(null);

  useEffect(() => {
    if (socketRef.current != null) {
      return;
    }
    const socket: TypedSocket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      timeout: 5000,
    });

    socket.on('connect', () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[RealtimeProvider] connected');
      }
    });

    socket.on('disconnect', (reason) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[RealtimeProvider] disconnect', reason);
      }
    });

    socket.on('connect_error', (err) => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[RealtimeProvider] connect_error', err.message);
      }
    });

    socket.on('ticket:assigned', (payload: TicketAssignedPayload) => {
      playNotificationSound();
      const numero = payload.ticketNumber ? `#${payload.ticketNumber}` : '';
      const tituloChamado = (payload.title ?? '').trim();
      const atribuidoPor = payload.assignedBy?.name ?? 'Preposto';
      const url = getAssignedTicketUrl(payload);

      toast.success(`Novo chamado ${numero} atribuído a você`, {
        description: (
          <div className="mt-1 flex flex-col gap-0.5 text-left">
            {tituloChamado && (
              <p className="line-clamp-2 text-sm font-medium text-foreground">{tituloChamado}</p>
            )}
            <p className="text-xs text-muted-foreground">Atribuído por: {atribuidoPor}</p>
          </div>
        ),
        duration: 6000,
        action: {
          label: 'Abrir',
          onClick: () => {
            router.push(url);
          },
        },
      });
    });

    socket.on('ticket:new', (payload: TicketNewPayload) => {
      playNotificationSound();
      const numero = payload.ticketNumber ? `#${payload.ticketNumber}` : '';
      const tituloChamado = (payload.title ?? '').trim();
      const abertoPor = payload.openedBy?.name ?? 'Solicitante';
      const url = getNewTicketManagementUrl(payload);

      toast.success(`Novo chamado ${numero} aberto`, {
        description: (
          <div className="mt-1 flex flex-col gap-0.5 text-left">
            {tituloChamado && (
              <p className="line-clamp-2 text-sm font-medium text-foreground">{tituloChamado}</p>
            )}
            <p className="text-xs text-muted-foreground">Aberto por: {abertoPor}</p>
          </div>
        ),
        duration: 6000,
        action: {
          label: 'Ver gestão',
          onClick: () => {
            router.push(url);
          },
        },
      });
    });

    socket.on('ticket:execution_registered', (payload: TicketExecutionRegisteredPayload) => {
      playNotificationSound();
      const numero = payload.ticketNumber ? `#${payload.ticketNumber}` : '';
      const tituloChamado = (payload.title ?? '').trim();
      const executadoPor = payload.executedBy?.name ?? 'Técnico';
      const url = getExecutionTicketUrl(payload);

      toast.success(`Execução registrada no chamado ${numero}`, {
        description: (
          <div className="mt-1 flex flex-col gap-0.5 text-left">
            {tituloChamado && (
              <p className="line-clamp-2 text-sm font-medium text-foreground">{tituloChamado}</p>
            )}
            <p className="text-xs text-muted-foreground">Registrado por: {executadoPor}</p>
          </div>
        ),
        duration: 6000,
        action: {
          label: 'Ver chamado',
          onClick: () => {
            router.push(url);
          },
        },
      });
    });

    socket.on('ticket:closed', (payload: TicketClosedPayload) => {
      playNotificationSound();
      const numero = payload.ticketNumber ? `#${payload.ticketNumber}` : '';
      const tituloChamado = (payload.title ?? '').trim();
      const encerradoPor = payload.closedBy?.name ?? 'Preposto';
      const url = getClosedTicketUrl(payload);

      toast.success(`Chamado ${numero} encerrado`, {
        description: (
          <div className="mt-1 flex flex-col gap-0.5 text-left">
            {tituloChamado && (
              <p className="line-clamp-2 text-sm font-medium text-foreground">{tituloChamado}</p>
            )}
            <p className="text-xs text-muted-foreground">Encerrado por: {encerradoPor}</p>
          </div>
        ),
        duration: 6000,
        action: {
          label: 'Ver chamado',
          onClick: () => {
            router.push(url);
          },
        },
      });
    });

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [router]);

  return <>{children}</>;
}
