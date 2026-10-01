/**
 * Tipos compartilhados entre socket-server e frontend (socket.io-client).
 * Eventos servidor -> cliente e payloads.
 */

import type { AtribuicaoMotivo } from '@/shared/chamados/atribuicao-automatica.constants';
import type { FinalPriority } from '@/shared/chamados/chamado.constants';

export interface TicketAssignedPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  assignedBy: { id: string; name?: string };
  assignedTo: { id: string; name?: string };
  at: string;
}

/**
 * Quem consta como autor de uma atribuição feita pelo próprio Sigma (spec 0008,
 * AC-11). O `id` não é de nenhum usuário: quem lê o payload compara com ele
 * para escolher o texto "atribuído a você automaticamente".
 */
export const ATRIBUIDO_POR_SISTEMA = { id: 'sistema', name: 'Atribuição automática' } as const;

/** Payload quando a gestão classifica um chamado aberto (notificação para o Solicitante). */
export interface TicketClassifiedPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  classifiedBy: { id: string; name?: string };
  finalPriority: string;
  at: string;
}

/** Payload quando um solicitante abre um novo chamado (notificação para Preposto/Admin). */
export interface TicketNewPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  openedBy: { id: string; name?: string };
  /** Nasceu `validado` sozinho pela IA (spec 0007, AC-13): não precisa de triagem. */
  jaValidado?: boolean;
  /**
   * O que a atribuição automática fez (spec 0008, AC-13). Ausente quando o
   * passo estava desligado ou não chegou a rodar: o texto da 0007 vale. Só
   * vai para a sala `managers`; solicitante e técnico nunca recebem o motivo.
   */
  atribuicao?:
    | { resultado: 'atribuido'; tecnicoNome: string }
    | { resultado: 'sem_tecnico'; motivo: AtribuicaoMotivo };
  at: string;
}

/** Payload quando um técnico registra execução (notificação para Preposto, Admin e Solicitante). */
export interface TicketExecutionRegisteredPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  executedBy: { id: string; name?: string };
  /**
   * Só no payload do solicitante (spec 0010, AC-9): até quando ele avalia ou
   * recusa, em ISO, e a frase já formatada no fuso do `BusinessCalendar`. Os
   * gestores recebem o payload sem estes campos.
   */
  prazoAvaliacaoAte?: string;
  prazoAvaliacaoTexto?: string;
  at: string;
}

/**
 * Payload do encerramento (spec 0010, AC-9b). Só a sala do solicitante recebe,
 * para as telas abertas se atualizarem: pela avaliação dele ou pelo cron no
 * fim do prazo. Nenhuma pessoa encerra mais, então `closedBy` é sempre nulo.
 */
export interface TicketClosedPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  closedBy: null;
  motivo: 'avaliacao' | 'automatico';
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

/** Payload quando SLA de um chamado atinge 80% do prazo (alerta de proximidade). */
export interface SlaWarningPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  priority: string;
  type: 'response' | 'resolution';
  dueAt: string;
  remainingPercent: number;
  at: string;
}

/** Payload quando SLA de um chamado estoura (breach). */
export interface SlaBreachPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  priority: string;
  type: 'response' | 'resolution';
  dueAt: string;
  breachedAt: string;
  at: string;
}

/** Payload quando técnico registra observação de material necessário. */
export interface TicketMaterialObservationPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  observedBy: { id: string; name?: string };
  observation: string;
  at: string;
}

/** Payload quando o solicitante recusa o serviço concluído, dentro do prazo (chamado volta para retrabalho). */
export interface TicketServiceRefusedPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  refusedBy: { id: string; name?: string };
  reason: string;
  at: string;
}

/** Payload quando Preposto/Admin reabre um chamado concluído, dentro do prazo (spec 0010). */
export interface TicketReopenedPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  reopenedBy: { id: string; name?: string };
  fromStatus: 'concluído';
  reason: string;
  at: string;
}

/** Payload quando técnico envia cotação para aprovação do gestor. */
export interface TicketQuoteSubmittedPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  cotacaoId: string;
  valorEstimado: number;
  submittedBy: { id: string; name?: string };
  at: string;
}

/** Payload quando gestor aprova uma cotação (SLA retoma). */
export interface TicketQuoteApprovedPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  cotacaoId: string;
  pausedMinutes: number;
  reviewedBy: { id: string; name?: string };
  at: string;
}

/** Payload quando gestor recusa uma cotação (SLA retoma; contratada pode enviar nova). */
export interface TicketQuoteRejectedPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  cotacaoId: string;
  pausedMinutes: number;
  observacao: string;
  reviewedBy: { id: string; name?: string };
  at: string;
}

/**
 * Payload quando a gestão corrige prioridade ou serviço de um chamado cujo
 * técnico continua o mesmo (spec 0009, AC-14). Sem motivo: o técnico vê o que
 * mudou, não o porquê. Quando o técnico troca, este evento não sai — vale
 * `ticket:assigned` por `notificarAtribuicao` (AC-15).
 */
export interface TicketCorrectedPayload {
  ticketId: string;
  ticketNumber?: string;
  title?: string;
  campo: 'prioridade' | 'servico';
  finalPriority?: FinalPriority;
  correctedBy: { id: string; name?: string };
  at: string;
}

export interface ServerToClientEvents {
  'ticket:assigned': (payload: TicketAssignedPayload) => void;
  'ticket:classified': (payload: TicketClassifiedPayload) => void;
  'ticket:new': (payload: TicketNewPayload) => void;
  'ticket:execution_registered': (payload: TicketExecutionRegisteredPayload) => void;
  'ticket:closed': (payload: TicketClosedPayload) => void;
  'ticket:comment_added': (payload: TicketCommentAddedPayload) => void;
  'ticket:attachment_added': (payload: TicketAttachmentAddedPayload) => void;
  'ticket:paused': (payload: TicketPausedPayload) => void;
  'ticket:resumed': (payload: TicketResumedPayload) => void;
  'ticket:rejected': (payload: TicketRejectedPayload) => void;
  'ticket:service_refused': (payload: TicketServiceRefusedPayload) => void;
  'ticket:material_observation': (payload: TicketMaterialObservationPayload) => void;
  'ticket:quote_submitted': (payload: TicketQuoteSubmittedPayload) => void;
  'ticket:quote_approved': (payload: TicketQuoteApprovedPayload) => void;
  'ticket:quote_rejected': (payload: TicketQuoteRejectedPayload) => void;
  'ticket:reopened': (payload: TicketReopenedPayload) => void;
  'ticket:corrected': (payload: TicketCorrectedPayload) => void;
  'sla:warning': (payload: SlaWarningPayload) => void;
  'sla:breach': (payload: SlaBreachPayload) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientToServerEvents {
  // vazio por enquanto; eventos do cliente para o servidor podem ser adicionados aqui
}
