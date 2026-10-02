/**
 * Enums e textos do importador do SICAM (spec 0012, parte 2). Servidor e
 * cliente leem daqui; nada neste arquivo toca o banco.
 */

export const IMPORTACAO_STATUSES = ['pendente', 'aplicada', 'descartada'] as const;
export type ImportacaoStatus = (typeof IMPORTACAO_STATUSES)[number];

export const IMPORTACAO_STATUS_LABELS: Record<ImportacaoStatus, string> = {
  pendente: 'Pendente',
  aplicada: 'Aplicada',
  descartada: 'Descartada',
};

export const GRUPOS_IMPORTACAO = ['novo', 'alterado', 'sumido'] as const;
export type GrupoImportacao = (typeof GRUPOS_IMPORTACAO)[number];

/** Quantas importações a lista de `/ativos/importar` mostra por página (AC-25). */
export const IMPORTACOES_POR_PAGINA = 20;

/** Acima desta fração de sumidos, o arquivo pode estar incompleto (AC-22). */
export const LIMITE_SUMIDOS = 0.2;

export const ERRO_IMPORTACAO_FECHADA = 'Esta importação não está mais pendente.';
export const ERRO_CATEGORIA_INVALIDA = 'Escolha uma categoria ativa para cada ativo novo marcado.';
export const ERRO_MUITOS_SUMIDOS =
  'Muitos sumidos marcados: confirme que o arquivo está completo antes de aplicar.';
export const ERRO_ARQUIVO_GRANDE = 'Arquivo maior que 10 MB';

export const MOTIVO_NAO_MARCADO = 'Não marcado na revisão';
export const MOTIVO_JA_EXISTIA = 'Já existia um ativo com este código';
export const MOTIVO_MUDOU = 'O ativo mudou depois da revisão';
export const MOTIVO_NAO_ENCONTRADO = 'O ativo não foi encontrado';
export const MOTIVO_BAIXADO = 'O ativo foi baixado depois da revisão';

export const OBSERVACAO_IMPORTACAO = 'Importação SICAM';
