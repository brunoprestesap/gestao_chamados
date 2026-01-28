export const CHAMADO_STATUSES = [
  'aberto',
  'emvalidacao',
  'em atendimento',
  'fechado',
  'concluído',
  'cancelado',
] as const;
export type ChamadoStatus = (typeof CHAMADO_STATUSES)[number];

export const CHAMADO_STATUS_LABELS: Record<ChamadoStatus, string> = {
  aberto: 'Aberto',
  emvalidacao: 'Em validação',
  'em atendimento': 'Em atendimento',
  fechado: 'Fechado',
  concluído: 'Concluído',
  cancelado: 'Cancelado',
};

/** Prioridade final na classificação */
export const FINAL_PRIORITY_VALUES = ['BAIXA', 'NORMAL', 'ALTA', 'EMERGENCIAL'] as const;
export type FinalPriority = (typeof FINAL_PRIORITY_VALUES)[number];
