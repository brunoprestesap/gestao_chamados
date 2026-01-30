export const CHAMADO_STATUSES = [
  'aberto',
  'emvalidacao',
  'validado',
  'em atendimento',
  'fechado',
  'concluído',
  'encerrado',
  'cancelado',
] as const;
export type ChamadoStatus = (typeof CHAMADO_STATUSES)[number];

export const CHAMADO_STATUS_LABELS: Record<ChamadoStatus, string> = {
  aberto: 'Aberto',
  emvalidacao: 'Em validação',
  validado: 'Validado',
  'em atendimento': 'Em atendimento',
  fechado: 'Fechado',
  concluído: 'Concluído',
  encerrado: 'Encerrado',
  cancelado: 'Cancelado',
};

/** Prioridade final na classificação */
export const FINAL_PRIORITY_VALUES = ['BAIXA', 'NORMAL', 'ALTA', 'EMERGENCIAL'] as const;
export type FinalPriority = (typeof FINAL_PRIORITY_VALUES)[number];

/** Natureza do atendimento (persistida: solicitada e aprovada) — NUNCA usar solicitada para SLA */
export const ATTENDANCE_NATURE_VALUES = ['PADRAO', 'URGENTE'] as const;
export type AttendanceNature = (typeof ATTENDANCE_NATURE_VALUES)[number];

/** Converte valor do formulário (Padrão/Urgente) para valor persistido (PADRAO/URGENTE) */
export function toAttendanceNature(
  formValue: 'Padrão' | 'Urgente',
): AttendanceNature {
  return formValue === 'Urgente' ? 'URGENTE' : 'PADRAO';
}

/** Label para exibição da natureza (PADRAO/URGENTE → Padrão/Urgente) */
export const ATTENDANCE_NATURE_LABELS: Record<AttendanceNature, string> = {
  PADRAO: 'Padrão',
  URGENTE: 'Urgente',
};
