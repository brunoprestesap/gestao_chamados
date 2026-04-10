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

/** Payload quando alguém adiciona um comentário ao chamado. */
export interface TicketCommentAddedPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  commentBy: { id: string; name?: string };
  visibility: 'publico' | 'interno';
  at: string;
}

/** Payload quando alguém adiciona um anexo ao chamado. */
export interface TicketAttachmentAddedPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  addedBy: { id: string; name?: string };
  filename: string;
  mimeType: string;
  at: string;
}

/** Payload quando técnico pausa SLA aguardando solicitante. */
export interface TicketPausedPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  pausedBy: { id: string; name?: string };
  reason: string;
  at: string;
}

/** Payload quando atendimento é retomado após aguardar solicitante. */
export interface TicketResumedPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  resumedBy: { id: string; name?: string };
  pausedMinutes: number;
  at: string;
}

/** Payload quando Preposto/Admin recusa um chamado na triagem (notificação para o Solicitante). */
export interface TicketRejectedPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  rejectedBy: { id: string; name?: string };
  rejectionReason: string;
  rejectionGuidance?: string;
  at: string;
}

export interface ServerToClientEvents {
  'ticket:assigned': (payload: TicketAssignedPayload) => void;
  'ticket:new': (payload: TicketNewPayload) => void;
  'ticket:execution_registered': (payload: TicketExecutionRegisteredPayload) => void;
  'ticket:closed': (payload: TicketClosedPayload) => void;
  'ticket:comment_added': (payload: TicketCommentAddedPayload) => void;
  'ticket:attachment_added': (payload: TicketAttachmentAddedPayload) => void;
  'ticket:paused': (payload: TicketPausedPayload) => void;
  'ticket:resumed': (payload: TicketResumedPayload) => void;
  'ticket:rejected': (payload: TicketRejectedPayload) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientToServerEvents {
  // vazio por enquanto; eventos do cliente para o servidor podem ser adicionados aqui
}
