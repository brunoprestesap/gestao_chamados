export const CHAMADO_HISTORY_ACTIONS = [
  'abertura',
  'alteracao_status',
  'atribuicao_tecnico',
  'comentario',
  'anexo',
  'cancelamento',
  'classificacao',
] as const;

export type ChamadoHistoryAction = (typeof CHAMADO_HISTORY_ACTIONS)[number];

export const CHAMADO_HISTORY_ACTION_LABELS: Record<ChamadoHistoryAction, string> = {
  abertura: 'Abertura do Chamado',
  alteracao_status: 'Alteração de Status',
  atribuicao_tecnico: 'Atribuição de Técnico',
  comentario: 'Comentário Adicionado',
  anexo: 'Anexo Adicionado',
  cancelamento: 'Cancelamento do Chamado',
  classificacao: 'Classificação do Chamado',
};
