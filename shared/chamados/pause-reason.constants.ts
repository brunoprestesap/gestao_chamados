export const PAUSE_REASONS = [
  'aguardando_solicitante',
  'aguardando_fornecedor',
  'aguardando_peca',
  'aguardando_aprovacao',
  'aguardando_acesso',
  'outro',
] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];

export const PAUSE_REASON_LABELS: Record<PauseReason, string> = {
  aguardando_solicitante: 'Aguardando Solicitante',
  aguardando_fornecedor: 'Aguardando Fornecedor',
  aguardando_peca: 'Aguardando Peça/Material',
  aguardando_aprovacao: 'Aguardando Aprovação',
  aguardando_acesso: 'Aguardando Acesso ao Local',
  outro: 'Outro Motivo',
};
