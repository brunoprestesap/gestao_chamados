/**
 * Tipos compartilhados entre socket-server e frontend (socket.io-client).
 * Eventos servidor -> cliente e payloads.
 */

export interface TicketAssignedPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  assignedBy: { id: string; name?: string };
  assignedTo: { id: string; name?: string };
  at: string;
}

/** Payload quando um solicitante abre um novo chamado (notificação para Preposto/Admin). */
export interface TicketNewPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  openedBy: { id: string; name?: string };
  at: string;
}

/** Payload quando um técnico registra execução (notificação para Preposto, Admin e Solicitante). */
export interface TicketExecutionRegisteredPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  executedBy: { id: string; name?: string };
  at: string;
}

/** Payload quando Preposto/Admin encerra um chamado (notificação para o Solicitante). */
export interface TicketClosedPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  closedBy: { id: string; name?: string };
  at: string;
}

export interface ServerToClientEvents {
  'ticket:assigned': (payload: TicketAssignedPayload) => void;
  'ticket:new': (payload: TicketNewPayload) => void;
  'ticket:execution_registered': (payload: TicketExecutionRegisteredPayload) => void;
  'ticket:closed': (payload: TicketClosedPayload) => void;
}

export interface ClientToServerEvents {
  // vazio por enquanto; eventos do cliente para o servidor podem ser adicionados aqui
}
