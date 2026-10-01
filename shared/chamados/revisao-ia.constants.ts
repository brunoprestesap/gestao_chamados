/**
 * O recorte "Revisão da IA" da lista de Gestão (spec 0009, AC-1 a AC-3).
 * Um chamado do canal `chat` pode ter decisões da IA para revisar; o Preposto
 * separa o que ainda não foi olhado do que aguarda triagem, do que já foi
 * corrigido e do que ficou sem técnico automático.
 */
export const REVISAO_IA_RECORTES = ['sem_revisao', 'triagem', 'corrigidos', 'sem_tecnico'] as const;
export type RevisaoIaRecorte = (typeof REVISAO_IA_RECORTES)[number];

export const REVISAO_IA_RECORTE_LABELS: Record<RevisaoIaRecorte, string> = {
  sem_revisao: 'Decidido pela IA, sem revisão',
  triagem: 'Aguardando triagem',
  corrigidos: 'Corrigidos pela gestão',
  sem_tecnico: 'Sem técnico automático',
};

/** Frase mostrada quando o recorte não tem nenhum chamado (AC-3). */
export const REVISAO_IA_RECORTE_VAZIO: Record<RevisaoIaRecorte, string> = {
  sem_revisao: 'Nenhum chamado decidido pela IA aguardando revisão.',
  triagem: 'Nenhum chamado aguardando triagem com sugestão da IA.',
  corrigidos: 'Nenhum chamado corrigido pela gestão ainda.',
  sem_tecnico: 'Nenhum chamado validado ficou sem técnico automático.',
};
