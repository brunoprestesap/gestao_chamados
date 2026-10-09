/**
 * Enums e rótulos do módulo de ativos (spec 0011). Servidor e cliente leem
 * daqui, então nada neste arquivo toca o banco.
 */

export const LOCALIZACAO_TIPOS = ['predio', 'andar', 'sala', 'area_tecnica'] as const;
export type LocalizacaoTipo = (typeof LOCALIZACAO_TIPOS)[number];

export const LOCALIZACAO_TIPO_LABELS: Record<LocalizacaoTipo, string> = {
  predio: 'Prédio',
  andar: 'Andar',
  sala: 'Sala',
  area_tecnica: 'Área técnica',
};

export const CRITICIDADES = ['baixa', 'media', 'alta', 'critica'] as const;
export type Criticidade = (typeof CRITICIDADES)[number];

export const CRITICIDADE_LABELS: Record<Criticidade, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
};

export const ORIGENS_CODIGO = ['patrimonio', 'interno'] as const;
export type OrigemCodigo = (typeof ORIGENS_CODIGO)[number];

export const ORIGEM_CODIGO_LABELS: Record<OrigemCodigo, string> = {
  patrimonio: 'Patrimoniado',
  interno: 'Interno (MNT)',
};

export const TIERS_MANUTENCAO = ['A', 'B', 'C', 'D'] as const;
export type TierManutencao = (typeof TIERS_MANUTENCAO)[number];

/** Só estes tiers aparecem no seletor do chamado e podem ser vinculados (AC-14). */
export const TIERS_VINCULAVEIS: readonly TierManutencao[] = ['A', 'B'];

export const ATIVO_STATUSES = [
  'em_operacao',
  'em_manutencao',
  'inoperante',
  'aguardando_baixa',
  'baixado',
] as const;
export type AtivoStatus = (typeof ATIVO_STATUSES)[number];

export const ATIVO_STATUS_LABELS: Record<AtivoStatus, string> = {
  em_operacao: 'Em operação',
  em_manutencao: 'Em manutenção',
  inoperante: 'Inoperante',
  aguardando_baixa: 'Aguardando baixa',
  baixado: 'Baixado',
};

/** Mudar para um destes status exige observação (AC-6). */
export const STATUS_QUE_EXIGEM_OBSERVACAO: readonly AtivoStatus[] = [
  'inoperante',
  'aguardando_baixa',
  'baixado',
];

export const STATUS_CADASTRO = ['importado', 'em_vistoria', 'validado'] as const;
export type StatusCadastro = (typeof STATUS_CADASTRO)[number];

export const STATUS_CADASTRO_LABELS: Record<StatusCadastro, string> = {
  importado: 'Importado',
  em_vistoria: 'Em vistoria',
  validado: 'Validado',
};

export const ATIVO_HISTORY_ACOES = [
  'cadastro',
  'edicao',
  'alteracao_status',
  'alteracao_localizacao',
  'alteracao_categoria',
  'validacao',
  'conferencia',
  'importacao_patrimonial',
  'ausente_sicam',
  'retorno_sicam',
  'documento_cadastrado',
  'documento_substituido',
  'documento_corrigido',
  'documento_excluido',
  'dispensa_substituicao',
  'dispensa_substituicao_desfeita',
] as const;
export type AtivoHistoryAcao = (typeof ATIVO_HISTORY_ACOES)[number];

/**
 * Ações do histórico que só a gestão vê na ficha: a dispensa de substituição
 * diria ao técnico e ao solicitante que o ativo está marcado para troca.
 */
export const ATIVO_HISTORY_ACOES_SO_DA_GESTAO: readonly AtivoHistoryAcao[] = [
  'dispensa_substituicao',
  'dispensa_substituicao_desfeita',
];

export const ATIVO_HISTORY_ACAO_LABELS: Record<AtivoHistoryAcao, string> = {
  cadastro: 'Cadastro',
  edicao: 'Edição de dados',
  alteracao_status: 'Mudança de status',
  alteracao_localizacao: 'Mudança de local',
  alteracao_categoria: 'Mudança de categoria',
  validacao: 'Cadastro validado',
  conferencia: 'Conferido na vistoria',
  importacao_patrimonial: 'Dados do SICAM atualizados',
  ausente_sicam: 'Ausente do SICAM',
  retorno_sicam: 'Voltou ao SICAM',
  documento_cadastrado: 'Documento cadastrado',
  documento_substituido: 'Documento substituído',
  documento_corrigido: 'Documento corrigido',
  documento_excluido: 'Documento excluído',
  dispensa_substituicao: 'Substituição dispensada',
  dispensa_substituicao_desfeita: 'Dispensa de substituição desfeita',
};

export const ATIVO_HISTORY_ACTOR_TYPES = ['usuario', 'sistema'] as const;
export type AtivoHistoryActorType = (typeof ATIVO_HISTORY_ACTOR_TYPES)[number];

/**
 * Nomes das coleções, fixos de propósito: a carga escreve direto pelo mongosh
 * (sem o Mongoose) e precisa acertar os mesmos nomes dos modelos.
 */
export const COLECOES_ATIVOS = {
  localizacoes: 'localizacoes',
  categorias: 'categoriasativo',
  ativos: 'ativos',
  historico: 'ativohistorico',
  contadores: 'contadores',
  importacoes: 'importacoespatrimoniais',
  tiposDocumento: 'tiposdocumento',
  documentos: 'documentosativo',
} as const;

/** Chave do contador dos códigos internos `MNT-####`. */
export const CONTADOR_ATIVO_MNT = 'ativo_mnt';

export const PREFIXO_CODIGO_INTERNO = 'MNT-';

/**
 * Chamado nestes status não muda de equipamento (spec 0011, AC-16). Texto
 * igual ao de `CHAMADO_STATUSES`, sem importar de lá, para a carga continuar
 * sem dependências do app.
 */
export const STATUS_SEM_VINCULO_ATIVO: readonly string[] = ['encerrado', 'cancelado', 'recusado'];

/** Mensagens fixas de erro que mais de uma action devolve. */
export const ERRO_SEM_PERMISSAO = 'Sem permissão para esta ação.';
export const ERRO_LOCAL_REPETIDO = 'Já existe um local com esse nome aqui.';
export function erroCodigoRepetido(codigo: string): string {
  return `Já existe um ativo com o código ${codigo}`;
}

/** Texto mostrado quando o ativo ainda não tem local. */
export const SEM_LOCAL = 'sem local';
