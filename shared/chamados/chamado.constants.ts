export const CHAMADO_STATUSES = ['aberto', 'em atendimento', 'fechado', 'concluído'] as const;
export type ChamadoStatus = (typeof CHAMADO_STATUSES)[number];

export const CHAMADO_STATUS_LABELS: Record<ChamadoStatus, string> = {
  aberto: 'Aberto',
  'em atendimento': 'Em atendimento',
  fechado: 'Fechado',
  concluído: 'Concluído',
};
