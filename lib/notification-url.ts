/** Id vindo do `data` da notificação: só texto hexadecimal entra na URL. */
function texto(v: unknown): string {
  return typeof v === 'string' && /^[a-f\d]{24}$/i.test(v) ? v : '';
}

export function getNotificationUrl(type: string, data?: Record<string, unknown> | null): string {
  const rawId = data?.ticketId;
  const ticketId = typeof rawId === 'string' && rawId.length > 0 ? rawId : '';

  switch (type) {
    case 'ticket:assigned':
      return ticketId ? `/chamados-atribuidos/${ticketId}` : '/chamados-atribuidos';
    case 'ticket:new':
      return '/gestao';
    case 'ticket:execution_registered':
    case 'ticket:closed':
      return ticketId ? `/meus-chamados/${ticketId}` : '/meus-chamados';
    case 'sla:warning':
    case 'sla:breach':
      return '/gestao';
    case 'documento:vencimento': {
      // Spec 0013, AC-12: documento de ativo vai à ficha; de local, ao painel filtrado pelo prédio.
      const ativoId = texto(data?.ativoId);
      if (ativoId) return `/ativos/${ativoId}`;
      const predioId = texto(data?.predioId);
      return predioId ? `/ativos/documentos?predio=${predioId}` : '/ativos/documentos';
    }
    case 'preventiva:lote':
      return '/gestao/recurring';
    case 'interesse:fim': {
      // Spec 0017, AC-17: a vista de acompanhamento do chamado em `/conversas`.
      const chamadoId = texto(data?.chamadoId);
      return chamadoId ? `/conversas/${chamadoId}` : '/conversas';
    }
    default:
      return '/meus-chamados';
  }
}
