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
  'observacao_material',
  'encerramento',
  'avaliado',
  'aguardando_solicitante',
  'retomada_atendimento',
  'pausa_terceiros',
  'retomada_terceiros',
  'recusa',
  'recusa_servico',
  'cotacao_enviada',
  'cotacao_aprovada',
  'cotacao_recusada',
  'reabertura',
  'decisao_ia',
  'correcao_ia',
  'confirmacao_ia',
  'correcao_gestao',
  'encerramento_por_avaliacao',
  'encerramento_automatico',
] as const;

export type ChamadoHistoryAction = (typeof CHAMADO_HISTORY_ACTIONS)[number];

/**
 * Ações que carregam confiança, motivo ou detalhe da correção: só Preposto e
 * Admin recebem (spec 0009, AC-13). Solicitante e técnico veem o efeito (a
 * entrada neutra `classificacao`, o novo valor no chamado), nunca isto.
 */
export const ACOES_SO_DA_GESTAO: readonly ChamadoHistoryAction[] = [
  'correcao_ia',
  'confirmacao_ia',
  'correcao_gestao',
];

/**
 * Quem praticou a ação. `ia` e `sistema` não têm usuário; só `usuario` exige
 * `userId`, e o schema do `ChamadoHistory` cobra isso por função (spec 0002).
 */
export const CHAMADO_HISTORY_ACTOR_TYPES = ['usuario', 'ia', 'sistema'] as const;
export type ChamadoHistoryActorType = (typeof CHAMADO_HISTORY_ACTOR_TYPES)[number];

/** Nome mostrado quando a entrada não tem usuário. */
export const CHAMADO_HISTORY_ACTOR_LABELS: Record<ChamadoHistoryActorType, string | null> = {
  usuario: null,
  ia: 'IA',
  sistema: 'Sistema',
};

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
  observacao_material: 'Observação de Material',
  encerramento: 'Encerramento do Chamado',
  avaliado: 'Avaliado',
  aguardando_solicitante: 'Aguardando Solicitante',
  retomada_atendimento: 'Atendimento Retomado',
  pausa_terceiros: 'Pausa — Aguardando Terceiros',
  retomada_terceiros: 'Retomada — Terceiros Resolvido',
  recusa: 'Recusa do Chamado',
  recusa_servico: 'Recusa de Serviço pelo Solicitante',
  cotacao_enviada: 'Cotação Enviada para Aprovação',
  cotacao_aprovada: 'Cotação Aprovada',
  cotacao_recusada: 'Cotação Recusada',
  reabertura: 'Reabertura do Chamado',
  decisao_ia: 'Decisão da IA',
  correcao_ia: 'Correção de Decisão da IA',
  confirmacao_ia: 'Confirmação de Decisão da IA',
  correcao_gestao: 'Correção pela Gestão',
  encerramento_por_avaliacao: 'Encerrado pela Avaliação',
  encerramento_automatico: 'Encerrado Automaticamente (prazo vencido)',
};
