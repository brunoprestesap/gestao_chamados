import type { AllowedEmitEvents } from '@/lib/realtime-emit';
import { ATRIBUICAO_MOTIVO_LABELS } from '@/shared/chamados/atribuicao-automatica.constants';
import {
  atribuidoPeloSistema,
  tituloDeAtribuicaoAoTecnico,
  tituloDeChamadoValidado,
} from '@/shared/chamados/aviso-atribuicao';
import type { ServerToClientEvents, TicketNewPayload } from '@/shared/socket';
import { textoSemPontuacaoFinal } from '@/shared/texto';

const APP_URL =
  process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3000';

interface TemplatePayload {
  ticketId?: string;
  ticketNumber?: string;
  title?: string;
  /** Só em `ticket:new`: o chamado já nasceu `validado` pela IA (spec 0007, AC-13). */
  jaValidado?: boolean;
  /** Só em `ticket:new`: o que a atribuição automática fez (spec 0008, AC-13). */
  atribuicao?: TicketNewPayload['atribuicao'];
  /** Só em `ticket:assigned`: quem atribuiu; `ATRIBUIDO_POR_SISTEMA` é a atribuição automática (spec 0008, AC-11). */
  assignedBy?: { id: string; name?: string };
}

/** Texto digitado por gente (título, local, nome) entra em HTML: nunca cru. */
function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * O payload como o corpo HTML o lê: tudo o que pode ter sido digitado por
 * alguém sai escapado daqui, uma vez só, na fronteira. O assunto é texto puro e
 * lê o payload original.
 *
 * O título chega sem pontuação no fim, porque todo corpo fecha a frase dele com
 * um ponto ("…: {título}."): um título que já termina em ponto gerava "5..". A
 * pontuação sai do texto cru, antes do escape, para não cortar uma entidade
 * como `&quot;`.
 */
function paraHtml(p: TemplatePayload): TemplatePayload {
  return {
    ...p,
    ticketNumber: p.ticketNumber === undefined ? undefined : escapeHtml(p.ticketNumber),
    title: p.title === undefined ? undefined : escapeHtml(textoSemPontuacaoFinal(p.title)),
    atribuicao:
      p.atribuicao?.resultado === 'atribuido'
        ? { ...p.atribuicao, tecnicoNome: escapeHtml(p.atribuicao.tecnicoNome) }
        : p.atribuicao,
  };
}

type TemplatePayloadByEvent = {
  [K in AllowedEmitEvents]: {
    ticketId?: string;
    ticketNumber?: string;
    title?: string;
  } & Partial<Parameters<ServerToClientEvents[K]>[0]>;
};

interface EmailContent {
  subject: string;
  html: string;
}

const SUBJECT_MAP: Record<string, (p: TemplatePayload) => string> = {
  'ticket:assigned': (p) =>
    tituloDeAtribuicaoAoTecnico(p.ticketNumber, atribuidoPeloSistema(p.assignedBy)),
  'ticket:new': (p) => {
    if (!p.jaValidado) return `Novo chamado aberto: ${p.ticketNumber ? `#${p.ticketNumber}` : ''}`;
    return tituloDeChamadoValidado(p.ticketNumber, p.atribuicao);
  },
  'ticket:execution_registered': (p) =>
    `Chamado ${p.ticketNumber ? `#${p.ticketNumber}` : ''} \u2014 servi\u00e7o registrado`,
  'ticket:closed': (p) => `Chamado ${p.ticketNumber ? `#${p.ticketNumber}` : ''} encerrado`,
  'ticket:rejected': (p) => `Chamado ${p.ticketNumber ? `#${p.ticketNumber}` : ''} recusado`,
  'sla:warning': (p) =>
    `ALERTA: SLA do chamado ${p.ticketNumber ? `#${p.ticketNumber}` : ''} pr\u00f3ximo do vencimento`,
  'sla:breach': (p) =>
    `URGENTE: SLA do chamado ${p.ticketNumber ? `#${p.ticketNumber}` : ''} estourou`,
  'ticket:comment_added': (p) =>
    `Novo coment\u00e1rio no chamado ${p.ticketNumber ? `#${p.ticketNumber}` : ''}`,
  'ticket:attachment_added': (p) =>
    `Novo anexo no chamado ${p.ticketNumber ? `#${p.ticketNumber}` : ''}`,
  'ticket:material_observation': (p) =>
    `Chamado ${p.ticketNumber ? `#${p.ticketNumber}` : ''} — material necessário`,
  'ticket:paused': (p) => `Chamado ${p.ticketNumber ? `#${p.ticketNumber}` : ''} pausado`,
  'ticket:resumed': (p) =>
    `Atendimento retomado no chamado ${p.ticketNumber ? `#${p.ticketNumber}` : ''}`,
};

const BODY_MAP: Record<string, (p: TemplatePayload) => string> = {
  'ticket:assigned': (p) =>
    `Você recebeu um novo chamado${p.ticketNumber ? ` <strong>#${p.ticketNumber}</strong>` : ''}${p.title ? `: ${p.title}` : ''}.${atribuidoPeloSistema(p.assignedBy) ? ' Ele foi atribuído automaticamente pelo Sigma.' : ''}`,
  'ticket:new': (p) => {
    const numero = p.ticketNumber ? ` <strong>#${p.ticketNumber}</strong>` : '';
    if (!p.jaValidado) {
      return `Um novo chamado${numero} foi aberto${p.title ? `: ${p.title}` : ''}.`;
    }
    const aberto = `O chamado${numero} foi aberto e validado automaticamente pela IA${p.title ? `: ${p.title}` : ''}. A prioridade e o SLA já estão definidos`;
    if (p.atribuicao?.resultado === 'atribuido') {
      return `${aberto} e o chamado foi atribuído a ${p.atribuicao.tecnicoNome}.`;
    }
    if (p.atribuicao?.resultado === 'sem_tecnico') {
      return `${aberto}; falta atribuir um técnico (${ATRIBUICAO_MOTIVO_LABELS[p.atribuicao.motivo]}).`;
    }
    return `${aberto}; falta atribuir um técnico.`;
  },
  'ticket:execution_registered': (p) =>
    `O chamado${p.ticketNumber ? ` <strong>#${p.ticketNumber}</strong>` : ''} teve um servi\u00e7o registrado e aguarda encerramento.`,
  'ticket:closed': (p) =>
    `O chamado${p.ticketNumber ? ` <strong>#${p.ticketNumber}</strong>` : ''} foi encerrado. Voc\u00ea pode avali\u00e1-lo na plataforma.`,
  'ticket:rejected': (p) =>
    `O chamado${p.ticketNumber ? ` <strong>#${p.ticketNumber}</strong>` : ''} foi recusado na triagem. Verifique os detalhes na plataforma.`,
  'sla:warning': (p) =>
    `O SLA do chamado${p.ticketNumber ? ` <strong>#${p.ticketNumber}</strong>` : ''} est\u00e1 pr\u00f3ximo do vencimento. A\u00e7\u00e3o imediata \u00e9 recomendada.`,
  'sla:breach': (p) =>
    `O SLA do chamado${p.ticketNumber ? ` <strong>#${p.ticketNumber}</strong>` : ''} <strong>estourou</strong>. Aten\u00e7\u00e3o urgente necess\u00e1ria.`,
  'ticket:comment_added': (p) =>
    `Um novo coment\u00e1rio foi adicionado ao chamado${p.ticketNumber ? ` <strong>#${p.ticketNumber}</strong>` : ''}.`,
  'ticket:attachment_added': (p) =>
    `Um novo anexo foi adicionado ao chamado${p.ticketNumber ? ` <strong>#${p.ticketNumber}</strong>` : ''}.`,
  'ticket:material_observation': (p) =>
    `O técnico registrou uma observação de material necessário no chamado${p.ticketNumber ? ` <strong>#${p.ticketNumber}</strong>` : ''}. O chamado continua em atendimento.`,
  'ticket:paused': (p) =>
    `O chamado${p.ticketNumber ? ` <strong>#${p.ticketNumber}</strong>` : ''} foi pausado.`,
  'ticket:resumed': (p) =>
    `O atendimento do chamado${p.ticketNumber ? ` <strong>#${p.ticketNumber}</strong>` : ''} foi retomado.`,
};

function buildHtml(recipientName: string, bodyHtml: string, ticketUrl: string | null): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background-color:#f4f6fb;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="580" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5,#3b82f6);padding:24px 32px;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">Sigma</h1>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Sistema Integrado de Manuten\u00e7\u00e3o</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;color:#374151;font-size:15px;">Ol\u00e1, <strong>${recipientName}</strong>.</p>
            <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">${bodyHtml}</p>
            ${
              ticketUrl
                ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
              <tr>
                <td style="background:linear-gradient(135deg,#4f46e5,#3b82f6);border-radius:8px;">
                  <a href="${ticketUrl}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Ver Chamado</a>
                </td>
              </tr>
            </table>`
                : ''
            }
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
            <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
              Este e-mail foi enviado automaticamente pelo Sigma. N\u00e3o responda esta mensagem.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function renderNotificationEmail<T extends AllowedEmitEvents>(
  type: T,
  payload: TemplatePayloadByEvent[T],
  recipientName: string,
): EmailContent {
  const segura = paraHtml(payload);
  const subjectFn =
    SUBJECT_MAP[type] ??
    (() => `Notifica\u00e7\u00e3o sobre o chamado ${payload.ticketNumber ?? ''}`);
  const bodyFn =
    BODY_MAP[type] ??
    (() =>
      `Voc\u00ea tem uma nova notifica\u00e7\u00e3o sobre o chamado${segura.ticketNumber ? ` #${segura.ticketNumber}` : ''}.`);

  const subject = subjectFn(payload).trim();
  const bodyHtml = bodyFn(segura);

  const ticketUrl = payload.ticketId
    ? escapeHtml(`${APP_URL}/meus-chamados/${payload.ticketId}`)
    : null;

  return {
    subject,
    html: buildHtml(escapeHtml(recipientName), bodyHtml, ticketUrl),
  };
}
