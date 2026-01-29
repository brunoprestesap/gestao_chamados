export const CHAMADO_HISTORY_ACTIONS = [
  'abertura',
  'alteracao_status',
  'atribuicao_tecnico',
  'reatribuicao_tecnico',
  'comentario',
  'anexo',
  'cancelamento',
  'classificacao',
  'execucao_registrada',
  'encerramento',
  'avaliado',
] as const;

export type ChamadoHistoryAction = (typeof CHAMADO_HISTORY_ACTIONS)[number];

export const CHAMADO_HISTORY_ACTION_LABELS: Record<ChamadoHistoryAction, string> = {
  abertura: 'Abertura do Chamado',
  alteracao_status: 'Alteração de Status',
  atribuicao_tecnico: 'Atribuição de Técnico',
  reatribuicao_tecnico: 'Reatribuição de Técnico',
  comentario: 'Comentário Adicionado',
  anexo: 'Anexo Adicionado',
  cancelamento: 'Cancelamento do Chamado',
  classificacao: 'Classificação do Chamado',
  execucao_registrada: 'Execução do Serviço Registrada',
  encerramento: 'Encerramento do Chamado',
  avaliado: 'Avaliado',
};
