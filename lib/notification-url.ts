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
    default:
      return '/meus-chamados';
  }
}
