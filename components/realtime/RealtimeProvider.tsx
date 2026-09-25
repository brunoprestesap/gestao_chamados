'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { toast } from 'sonner';

import { playNotificationSound } from '@/lib/notification-sound';
import { ATRIBUICAO_MOTIVO_LABELS } from '@/shared/chamados/atribuicao-automatica.constants';
import {
  atribuidoPeloSistema,
  tituloDeAtribuicaoAoTecnico,
  tituloDeChamadoValidado,
} from '@/shared/chamados/aviso-atribuicao';
import { PAUSE_REASON_LABELS } from '@/shared/chamados/pause-reason.constants';
import {
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SlaBreachPayload,
  type SlaWarningPayload,
  type TicketAssignedPayload,
  type TicketClosedPayload,
  type TicketExecutionRegisteredPayload,
  type TicketNewPayload,
  type TicketPausedPayload,
} from '@/shared/socket';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001';

/** Rota do chamado para o técnico: chamados atribuídos a ele. */
function getAssignedTicketUrl(payload: TicketAssignedPayload): string {
  return `/chamados-atribuidos/${payload.ticketId}`;
}

/** Rota para o solicitante: a própria conversa, que `abrirConversa` resolve pelo id do chamado. */
function getAssignedTicketUrlSolicitante(payload: TicketAssignedPayload): string {
  return `/conversas/${payload.ticketId}`;
}

/** Rota para Preposto/Admin: gestão (lista de chamados para classificar/atribuir). */
function getNewTicketManagementUrl(payload: TicketNewPayload): string {
  void payload;
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

function emitNotificationEvent() {
  window.dispatchEvent(new CustomEvent('notification:new'));
}

export function RealtimeProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const routerRef = useRef(router);
  const socketRef = useRef<TypedSocket | null>(null);
  const userIdRef = useRef(userId);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    if (socketRef.current != null) {
      return;
    }
    const socket: TypedSocket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      timeout: 5000,
    });

    socket.on('connect', () => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[RealtimeProvider] connected');
      }
    });

    socket.on('disconnect', (reason) => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[RealtimeProvider] disconnect', reason);
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
      const souOTecnico = payload.assignedTo?.id === userIdRef.current;

      if (souOTecnico) {
        // Atribuição feita pelo próprio Sigma (spec 0008, AC-11): sem "Atribuído por: Preposto".
        const automatica = atribuidoPeloSistema(payload.assignedBy);
        const atribuidoPor = payload.assignedBy?.name ?? 'Preposto';
        const url = getAssignedTicketUrl(payload);

        toast.success(
          automatica
            ? tituloDeAtribuicaoAoTecnico(payload.ticketNumber, true)
            : `Novo chamado ${numero} atribuído a você`,
          {
            description: (
              <div className="mt-1 flex flex-col gap-0.5 text-left">
                {tituloChamado && (
                  <p className="line-clamp-2 text-sm font-medium text-foreground">
                    {tituloChamado}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {automatica
                    ? 'Atribuído automaticamente pelo Sigma'
                    : `Atribuído por: ${atribuidoPor}`}
                </p>
              </div>
            ),
            duration: 6000,
            action: {
              label: 'Abrir',
              onClick: () => {
                routerRef.current.push(url);
              },
            },
          },
        );
        emitNotificationEvent();
        return;
      }

      // Solicitante: mesmo evento, texto e link próprios (spec 0005, AC-2).
      const tecnico = payload.assignedTo?.name ?? 'Um técnico';
      const url = getAssignedTicketUrlSolicitante(payload);

      toast.success(`Técnico atribuído ao chamado ${numero}`, {
        description: (
          <div className="mt-1 flex flex-col gap-0.5 text-left">
            {tituloChamado && (
              <p className="line-clamp-2 text-sm font-medium text-foreground">{tituloChamado}</p>
            )}
            <p className="text-xs text-muted-foreground">Técnico responsável: {tecnico}</p>
          </div>
        ),
        duration: 6000,
        action: {
          label: 'Abrir',
          onClick: () => {
            routerRef.current.push(url);
          },
        },
      });
      emitNotificationEvent();
    });

    socket.on('ticket:classified', () => {
      // Silencioso: só atualiza a conversa aberta, sem som nem toast (spec 0005, AC-1).
      emitNotificationEvent();
    });

    socket.on('ticket:comment_added', () => {
      // Silencioso: só atualiza a conversa aberta, sem som nem toast (spec 0005, AC-5).
      emitNotificationEvent();
    });

    socket.on('ticket:paused', (payload: TicketPausedPayload) => {
      // Só a pausa por aguardando solicitante atualiza a conversa; a pausa por
      // cotação usa o mesmo evento e fica fora desta fatia (spec 0005, AC-3).
      if (payload.reason !== PAUSE_REASON_LABELS.aguardando_solicitante) return;
      emitNotificationEvent();
    });

    socket.on('ticket:new', (payload: TicketNewPayload) => {
      playNotificationSound();
      const numero = payload.ticketNumber ? `#${payload.ticketNumber}` : '';
      const tituloChamado = (payload.title ?? '').trim();
      const abertoPor = payload.openedBy?.name ?? 'Solicitante';
      const url = getNewTicketManagementUrl(payload);

      // O resultado da atribuição automática (spec 0008, AC-13). Sem ele, vale o texto da 0007.
      const atribuicao = payload.jaValidado ? payload.atribuicao : undefined;
      const tituloToast = payload.jaValidado
        ? tituloDeChamadoValidado(payload.ticketNumber, atribuicao)
        : `Novo chamado ${numero} aberto`;
      toast.success(tituloToast, {
        description: (
          <div className="mt-1 flex flex-col gap-0.5 text-left">
            {tituloChamado && (
              <p className="line-clamp-2 text-sm font-medium text-foreground">{tituloChamado}</p>
            )}
            <p className="text-xs text-muted-foreground">Aberto por: {abertoPor}</p>
            {atribuicao?.resultado === 'sem_tecnico' && (
              <p className="text-xs text-muted-foreground">
                Motivo: {ATRIBUICAO_MOTIVO_LABELS[atribuicao.motivo]}
              </p>
            )}
          </div>
        ),
        duration: 6000,
        action: {
          label: 'Ver gestão',
          onClick: () => {
            routerRef.current.push(url);
          },
        },
      });
      emitNotificationEvent();
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
            routerRef.current.push(url);
          },
        },
      });
      emitNotificationEvent();
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
            routerRef.current.push(url);
          },
        },
      });
      emitNotificationEvent();
    });

    socket.on('sla:warning', (payload: SlaWarningPayload) => {
      playNotificationSound();
      const numero = payload.ticketNumber ? `#${payload.ticketNumber}` : '';
      const titulo = (payload.title ?? '').trim();

      toast.warning(`SLA do chamado ${numero} próximo do vencimento`, {
        description: (
          <div className="mt-1 flex flex-col gap-0.5 text-left">
            {titulo && <p className="line-clamp-2 text-sm font-medium text-foreground">{titulo}</p>}
            <p className="text-xs text-muted-foreground">
              Restam ~{Math.round(payload.remainingPercent)}% do prazo
            </p>
          </div>
        ),
        duration: 8000,
        action: {
          label: 'Ver gestão',
          onClick: () => {
            routerRef.current.push('/gestao');
          },
        },
      });
      emitNotificationEvent();
    });

    socket.on('sla:breach', (payload: SlaBreachPayload) => {
      playNotificationSound();
      const numero = payload.ticketNumber ? `#${payload.ticketNumber}` : '';
      const titulo = (payload.title ?? '').trim();
      const tipoLabel = payload.type === 'response' ? 'resposta' : 'resolução';

      toast.error(`SLA de ${tipoLabel} do chamado ${numero} estourou`, {
        description: (
          <div className="mt-1 flex flex-col gap-0.5 text-left">
            {titulo && <p className="line-clamp-2 text-sm font-medium text-foreground">{titulo}</p>}
            <p className="text-xs text-muted-foreground">Prioridade: {payload.priority}</p>
          </div>
        ),
        duration: 10000,
        action: {
          label: 'Ver gestão',
          onClick: () => {
            routerRef.current.push('/gestao');
          },
        },
      });
      emitNotificationEvent();
    });

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  return <>{children}</>;
}
