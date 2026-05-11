export const PAUSE_REASONS = [
  'aguardando_solicitante',
  'aguardando_fornecedor',
  'falta_peca_contratada',
  'falta_peca_aprovacao_cliente',
  'aguardando_aprovacao',
  'aguardando_acesso',
  'outro',
  'aguardando_peca',
] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];

export const PAUSE_REASON_LABELS: Record<PauseReason, string> = {
  aguardando_solicitante: 'Aguardando Solicitante',
  aguardando_fornecedor: 'Aguardando Fornecedor',
  falta_peca_contratada: 'Falta de Peça (Responsabilidade da Contratada)',
  falta_peca_aprovacao_cliente: 'Falta de Peça (Aguardando Aprovação do Cliente)',
  aguardando_aprovacao: 'Aguardando Aprovação',
  aguardando_acesso: 'Aguardando Acesso ao Local',
  outro: 'Outro Motivo',
  aguardando_peca: 'Aguardando Peça/Material (legado)',
};

const LEGACY_PAUSE_REASONS = new Set<PauseReason>(['aguardando_peca']);

export const PAUSE_REASONS_SELECTABLE: readonly PauseReason[] = PAUSE_REASONS.filter(
  (r) => !LEGACY_PAUSE_REASONS.has(r),
);
