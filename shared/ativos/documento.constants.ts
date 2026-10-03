/**
 * Constantes dos documentos do ativo (spec 0013). Servidor e cliente leem
 * daqui, então nada neste arquivo toca o banco.
 */

export const DOCUMENTO_SITUACOES = ['vigente', 'substituido', 'excluido'] as const;
export type DocumentoSituacao = (typeof DOCUMENTO_SITUACOES)[number];

/** Limites de aviso, do menos para o mais urgente. */
export const LIMITES_ALERTA = ['90', '60', '30', 'vencido'] as const;
export type LimiteAlerta = (typeof LIMITES_ALERTA)[number];

/** Ordem de urgência: o primeiro alcançado desta lista é o que vai no aviso. */
export const LIMITES_POR_URGENCIA: readonly LimiteAlerta[] = ['vencido', '30', '60', '90'];

export const MAX_TAMANHO_DOCUMENTO = 20 * 1024 * 1024;
export const MAX_TAMANHO_DOCUMENTO_TEXTO = '20 MB';

export const MIME_DOCUMENTO_ACEITOS = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/** Atributo `accept` do campo de arquivo. */
export const ACCEPT_DOCUMENTO =
  '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';

/** Os cinco tipos que a carga cria se ainda não existirem (AC-1). */
export const TIPOS_DOCUMENTO_INICIAIS: readonly { chave: string; nome: string }[] = [
  { chave: 'pmoc', nome: 'PMOC' },
  { chave: 'avcb', nome: 'AVCB' },
  { chave: 'art', nome: 'ART' },
  { chave: 'laudo_spda', nome: 'Laudo de SPDA' },
  { chave: 'garantia', nome: 'Garantia' },
];

/** Situação calculada na leitura (nunca gravada). */
export type SituacaoCalculada =
  | { tipo: 'sem_validade' }
  | { tipo: 'vencido'; dias: number }
  | { tipo: 'vence_hoje' }
  | { tipo: 'vence_em'; dias: number }
  | { tipo: 'em_dia'; dias: number };

/** Filtro de situação do painel (AC-9). */
export const FILTROS_SITUACAO = [
  'vencido',
  'ate_30',
  'ate_60',
  'ate_90',
  'em_dia',
  'sem_validade',
] as const;
export type FiltroSituacao = (typeof FILTROS_SITUACAO)[number];

export const FILTRO_SITUACAO_LABELS: Record<FiltroSituacao, string> = {
  vencido: 'Vencido',
  ate_30: 'Vence em até 30 dias',
  ate_60: 'Vence em até 60 dias',
  ate_90: 'Vence em até 90 dias',
  em_dia: 'Em dia',
  sem_validade: 'Sem validade',
};

export const ERRO_CONFLITO_DOCUMENTO =
  'Outro documento deste tipo acabou de ser cadastrado. Recarregue a página.';
