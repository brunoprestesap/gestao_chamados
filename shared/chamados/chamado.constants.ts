export const CHAMADO_STATUSES = [
  'aberto',
  'validado',
  'em atendimento',
  'aguardando_solicitante',
  'aguardando_terceiros',
  'concluído',
  'encerrado',
  'cancelado',
  'recusado',
] as const;
export type ChamadoStatus = (typeof CHAMADO_STATUSES)[number];

export const CHAMADO_STATUS_LABELS: Record<ChamadoStatus, string> = {
  aberto: 'Aberto',
  validado: 'Validado',
  'em atendimento': 'Em atendimento',
  aguardando_solicitante: 'Aguardando Solicitante',
  aguardando_terceiros: 'Aguardando Terceiros',
  concluído: 'Concluído',
  encerrado: 'Encerrado',
  cancelado: 'Cancelado',
  recusado: 'Recusado',
};

/** Prioridade final na classificação */
export const FINAL_PRIORITY_VALUES = ['BAIXA', 'NORMAL', 'ALTA', 'EMERGENCIAL'] as const;

/**
 * O que aparece no lugar do serviço quando o chamado nasceu sem ele: só o
 * chamado aberto pela conversa, sem IA, pode (spec 0004, AC-9). O Preposto
 * escolhe o serviço na classificação.
 */
export const SERVICO_A_DEFINIR = 'A definir na triagem';
export type FinalPriority = (typeof FINAL_PRIORITY_VALUES)[number];

/** Natureza do atendimento (persistida: solicitada e aprovada) — NUNCA usar solicitada para SLA */
export const ATTENDANCE_NATURE_VALUES = ['PADRAO', 'URGENTE'] as const;
export type AttendanceNature = (typeof ATTENDANCE_NATURE_VALUES)[number];

/** Converte valor do formulário (Padrão/Urgente) para valor persistido (PADRAO/URGENTE) */
export function toAttendanceNature(formValue: 'Padrão' | 'Urgente'): AttendanceNature {
  return formValue === 'Urgente' ? 'URGENTE' : 'PADRAO';
}

/** Label para exibição da natureza (PADRAO/URGENTE → Padrão/Urgente) */
export const ATTENDANCE_NATURE_LABELS: Record<AttendanceNature, string> = {
  PADRAO: 'Padrão',
  URGENTE: 'Urgente',
};
