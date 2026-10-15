/**
 * Cotação e fornecimento de material (spec 0019). Situações, ações, papéis e
 * as constantes que tela, servidor e PDF dividem. Puro: usado no cliente e no
 * servidor.
 */

export const SITUACOES_COTACAO = [
  'rascunho',
  'enviada',
  'em_analise',
  'em_aprovacao',
  'devolvida',
  'autorizada',
  'executada',
  'atestada',
  'reprovada',
  'cancelada',
] as const;
export type SituacaoCotacao = (typeof SITUACOES_COTACAO)[number];

/** De `rascunho` até `autorizada`: no máximo uma por chamado (AC-3). */
export const SITUACOES_EM_TRAMITE: readonly SituacaoCotacao[] = [
  'rascunho',
  'enviada',
  'em_analise',
  'em_aprovacao',
  'devolvida',
  'autorizada',
];

export function estaEmTramite(s: SituacaoCotacao): boolean {
  return SITUACOES_EM_TRAMITE.includes(s);
}

/** Situações que seguram reserva no empenho (invariante do saldo). */
export const SITUACOES_COM_RESERVA: readonly SituacaoCotacao[] = [
  'autorizada',
  'executada',
  'atestada',
];

/** Situações cujo valor executado entra no custo do chamado e do ativo (AC-17). */
export const SITUACOES_NO_CUSTO: readonly SituacaoCotacao[] = ['executada', 'atestada'];

/** Situações que o rascunho ainda pode editar. */
export const SITUACOES_EDITAVEIS: readonly SituacaoCotacao[] = ['rascunho', 'devolvida'];

export const ACOES_COTACAO = [
  'criar',
  'salvar',
  'enviar',
  'assumir',
  'devolver',
  'reprovar',
  'encaminhar',
  'aprovar',
  'alterar',
  'executar',
  'cancelar',
] as const;
export type AcaoCotacao = (typeof ACOES_COTACAO)[number];

/** Papéis por designação (`DesignacaoMaterial`). */
export const PAPEIS_DESIGNACAO = ['responsavel_tecnico', 'fiscal', 'gestor', 'aprovador'] as const;
export type PapelDesignacao = (typeof PAPEIS_DESIGNACAO)[number];

/** Papéis que aparecem na trilha: os designados, o técnico atribuído e o sistema. */
export const PAPEIS_EVENTO = [...PAPEIS_DESIGNACAO, 'tecnico', 'sistema'] as const;
export type PapelEvento = (typeof PAPEIS_EVENTO)[number];

/** Lado TRF1: só Admin ativo recebe essas designações (AC-19). */
export const PAPEIS_TRF1: readonly PapelDesignacao[] = ['fiscal', 'gestor', 'aprovador'];

/** Perfis que podem receber cada papel (AC-19). */
export const PERFIS_POR_PAPEL: Record<PapelDesignacao, readonly string[]> = {
  responsavel_tecnico: ['Preposto', 'Técnico'],
  fiscal: ['Admin'],
  gestor: ['Admin'],
  aprovador: ['Admin'],
};

/** A taxa de administração sobre material é zero, sem campo de edição (AC-20, CA-18). */
export const TAXA_ADMINISTRACAO_MATERIAL = 0;

export const ORIGENS_ITEM = ['anexo_v', 'sinapi', 'ambas', 'orcamento'] as const;
export type OrigemItem = (typeof ORIGENS_ITEM)[number];

export const BASES_APLICADAS = ['anexo_v', 'sinapi', 'orcamento'] as const;
export type BaseAplicada = (typeof BASES_APLICADAS)[number];

export const TIPOS_ARQUIVO_COTACAO = ['orcamento', 'evidencia', 'nota_fiscal'] as const;
export type TipoArquivoCotacao = (typeof TIPOS_ARQUIVO_COTACAO)[number];

export const TIPOS_MOVIMENTO_EMPENHO = ['reforco', 'anulacao'] as const;
export type TipoMovimentoEmpenho = (typeof TIPOS_MOVIMENTO_EMPENHO)[number];

export const MAX_ITENS_COTACAO = 50;
export const MAX_ORCAMENTOS_COTACAO = 10;
/** Até 10 arquivos ativos por tipo em cada cotação. */
export const MAX_ARQUIVOS_POR_TIPO = 10;
export const MAX_TAMANHO_ARQUIVO_COTACAO = 20 * 1024 * 1024;
/** Cada item do caminho 3 precisa de preço em ao menos 3 orçamentos (AC-4). */
export const MIN_ORCAMENTOS_POR_ITEM = 3;
/** Reserva órfã mais velha que isto é liberada pela conciliação (AC-8). */
export const CONCILIACAO_TOLERANCIA_MS = 10 * 60 * 1000;
/** O responsável técnico vê as encerradas dos últimos 90 dias (AC-15). */
export const DIAS_ENCERRADAS_VISIVEIS_RT = 90;

/** Motivos de código fixo, gravados no evento no lugar de texto livre. */
export const MOTIVOS_FIXOS = [
  'alteracao_pos_autorizacao',
  'chamado_cancelado',
  'chamado_recusado',
  'conciliacao',
] as const;
export type MotivoFixo = (typeof MOTIVOS_FIXOS)[number];

/** Parâmetros padrão da `MaterialConfig` (fatia 1 só usa a raiz da contratada na trilha). */
export const MATERIAL_CONFIG_PADRAO = {
  percentualSinapi: 10,
  janelaDias: 90,
  parcelaRelevantePercentual: 20,
  raizCnpjContratada: '03543374',
} as const;
