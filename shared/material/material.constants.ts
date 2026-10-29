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
  'receber_provisorio',
  'receber_definitivo',
  'registrar_nf',
  'cancelar',
  // Fatia 4: referências do fiscal, recusa da urgência e o complemento da pesquisa.
  'referencia_acrescentada',
  'referencia_retirada',
  'urgencia_recusada',
  'pesquisa_completada',
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

/** Com que papel o PDF da cotação foi emitido (AC-23): o da designação, ou `admin` sem ela. */
export const PAPEIS_EMISSAO_PDF = ['fiscal', 'gestor', 'aprovador', 'admin'] as const;
export type PapelEmissaoPdf = (typeof PAPEIS_EMISSAO_PDF)[number];

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
/** Prazo do ateste: 5 dias corridos para cada recebimento, no fuso de Belém (AC-21). */
export const PRAZO_ATESTE_DIAS = 5;
/**
 * Urgência aceita com a pesquisa ainda incompleta tantos dias corridos depois
 * da autorização: a rodada diária avisa os gestores, uma vez por autorização.
 */
export const PRAZO_PESQUISA_URGENCIA_DIAS = 5;
/** O responsável técnico vê as encerradas dos últimos 90 dias (AC-15). */
export const DIAS_ENCERRADAS_VISIVEIS_RT = 90;

/** Motivos de código fixo, gravados no evento no lugar de texto livre. */
export const MOTIVOS_FIXOS = [
  'alteracao_pos_autorizacao',
  'chamado_cancelado',
  'chamado_recusado',
  'conciliacao',
] as const;

/** Motivo gravado no histórico do código SINAPI quando a mudança veio do CSV (AC-24). */
export const MOTIVO_CODIGO_PELA_IMPORTACAO = 'importacao';
export type MotivoFixo = (typeof MOTIVOS_FIXOS)[number];

// ---------------------------------------------------------------------------
// Fatia 3: Anexo V e SINAPI
// ---------------------------------------------------------------------------

export const TIPOS_IMPORTACAO_MATERIAL = ['anexo_v', 'sinapi'] as const;
export type TipoImportacaoMaterial = (typeof TIPOS_IMPORTACAO_MATERIAL)[number];

export const ESTADOS_IMPORTACAO_MATERIAL = [
  'pendente',
  'aplicando',
  'aplicada',
  'descartada',
] as const;
export type EstadoImportacaoMaterial = (typeof ESTADOS_IMPORTACAO_MATERIAL)[number];

/** CSV do Anexo V ou do SINAPI: até 10 MB e 20.000 linhas (AC-24, AC-25). */
export const TAMANHO_MAXIMO_IMPORTACAO_MATERIAL = 10 * 1024 * 1024;
export const MAX_LINHAS_IMPORTACAO_MATERIAL = 20_000;
/** A importação pendente que ninguém aplicou nem descartou some em 7 dias. */
export const DIAS_IMPORTACAO_PENDENTE = 7;
/** Quantas linhas de cada grupo a revisão guarda para mostrar (as contagens são todas). */
export const MAX_LINHAS_REVISAO_POR_GRUPO = 500;
/** O cabeçalho do CSV é procurado nas primeiras 20 linhas. */
export const LINHAS_PROCURA_CABECALHO = 20;
/** Linhas inválidas listadas na recusa do arquivo. */
export const MAX_ERROS_LISTADOS = 20;
/** Uma aplicação parada há mais que isto pode ser retomada por outro clique. */
export const RETOMADA_APLICACAO_MS = 5 * 60 * 1000;

export const MAX_ITEM_ANEXO_V = 200;

/** Colunas do layout próprio do Anexo V (_Importação e classificação_). */
export const COLUNAS_ANEXO_V = {
  obrigatorias: ['ITEM', 'DESCRICAO', 'UNIDADE', 'QUANTIDADE', 'PRECO'],
  opcionais: ['CODIGO_SINAPI'],
} as const;

/** Colunas do layout próprio do SINAPI (UF AP, não desonerado). */
export const COLUNAS_SINAPI = {
  obrigatorias: ['CODIGO', 'DESCRICAO', 'UNIDADE', 'PRECO'],
  opcionais: [],
} as const;

/** UF e regime do SINAPI são constantes, gravadas em cada insumo (AC-25). */
export const SINAPI_UF = 'AP';
export const SINAPI_REGIME = 'nao_desonerado';
/** A Caixa publica com atraso: o painel só acusa quando o mês mais recente é anterior a hoje menos 2. */
export const SINAPI_MESES_DE_ATRASO_ACEITOS = 2;

/** Busca dos caminhos 1 e 2: ao menos 3 letras, até 20 resultados. */
export const BUSCA_PRECO_MIN_LETRAS = 3;
export const BUSCA_PRECO_MAX_RESULTADOS = 20;

/** Justificativa da base em `ambas`, conferência, motivo de anomalia e de código: 10 a 500. */
export const TEXTO_CURTO_MIN = 10;
export const TEXTO_CURTO_MAX = 500;

/** Motivo de devolver, reprovar e cancelar: 5 a 2000 caracteres. */
export const MOTIVO_MIN = 5;
export const MOTIVO_MAX = 2000;

/** As duas bases que o fiscal escolhe num item `ambas` (AC-27). */
export const BASES_DE_AMBAS = ['anexo_v', 'sinapi'] as const;
export type BaseDeAmbas = (typeof BASES_DE_AMBAS)[number];

// ---------------------------------------------------------------------------
// Fatia 4: controles do caminho 3 e urgência
// ---------------------------------------------------------------------------

/** `envio` sustenta o preço; `complemento` só entra pela pesquisa da urgência (AC-35). */
export const FASES_ORCAMENTO = ['envio', 'complemento'] as const;
export type FaseOrcamento = (typeof FASES_ORCAMENTO)[number];

/** Referência de preço do caminho 3 (AC-32): insumo SINAPI pela tabela, ou fonte livre. */
export const TIPOS_REFERENCIA = ['sinapi', 'livre'] as const;
export type TipoReferencia = (typeof TIPOS_REFERENCIA)[number];

/** Quem registrou a referência: a contratada no rascunho, o fiscal na análise. */
export const PAPEIS_REFERENCIA = ['responsavel_tecnico', 'fiscal'] as const;
export type PapelReferencia = (typeof PAPEIS_REFERENCIA)[number];

export const DECISOES_URGENCIA = ['aceita', 'recusada'] as const;
export type DecisaoUrgencia = (typeof DECISOES_URGENCIA)[number];

/** Até 5 referências por item e por papel, contando as retiradas do fiscal. */
export const MAX_REFERENCIAS_POR_PAPEL = 5;
/** Fonte da referência livre: 10 a 200 caracteres. */
export const FONTE_REFERENCIA_MIN = 10;
export const FONTE_REFERENCIA_MAX = 200;
/** A data da referência livre não é futura nem passa de 12 meses antes de hoje (Belém). */
export const MESES_MAX_REFERENCIA = 12;
/** Cada item do caminho 3 precisa de 3 raízes de CNPJ distintas (AC-31). */
export const MIN_RAIZES_POR_ITEM = 3;
/** Na urgência, basta 1 orçamento com preço por item até a pesquisa completar (AC-35). */
export const MIN_ORCAMENTOS_URGENCIA = 1;

// ---------------------------------------------------------------------------
// Fatia 5: advertências, projeção, parâmetros e relatório
// ---------------------------------------------------------------------------

/** As ações que refazem fracionamento, reincidência, consumo e item parecido (AC-36 a AC-40). */
export const ACOES_COM_ADVERTENCIAS_DO_ATO: readonly AcaoCotacao[] = [
  'assumir',
  'encaminhar',
  'aprovar',
];

/** As situações das "outras cotações" do fracionamento, da reincidência e do consumo. */
export const SITUACOES_JA_AUTORIZADAS: readonly SituacaoCotacao[] = [
  'autorizada',
  'executada',
  'atestada',
];

/** Reincidência: duas outras cotações autorizadas no mesmo ativo dentro da janela (AC-37). */
export const MIN_COTACOES_REINCIDENCIA = 2;
/** Item parecido: Jaccard das palavras igual ou acima disto (AC-40). */
export const JACCARD_ITEM_PARECIDO = 0.6;
/** Item parecido: até 20 insumos do mês mais recente, pelo índice de texto. */
export const ITEM_PARECIDO_MAX_SINAPI = 20;
/** Palavras de até 2 letras não contam na semelhança. */
export const ITEM_PARECIDO_MIN_LETRAS = 3;

/** Projeção (AC-38): olha até 90 dias para trás e exige ao menos 30 de histórico. */
export const PROJECAO_DIAS_MAX = 90;
export const PROJECAO_DIAS_MIN = 30;
export const SITUACOES_PROJECAO = ['estimada', 'historico_insuficiente', 'sem_consumo'] as const;
export type SituacaoProjecao = (typeof SITUACOES_PROJECAO)[number];

/** Os parâmetros editáveis pelo Admin (AC-42), com os limites de cada um. */
export const CAMPOS_PARAMETROS = [
  'percentualSinapi',
  'janelaDias',
  'parcelaRelevantePercentual',
  'prazoFornecimentoDiasUteis',
  'raizCnpjContratada',
] as const;
export type CampoParametro = (typeof CAMPOS_PARAMETROS)[number];
export const LIMITES_PARAMETROS = {
  percentualSinapi: { min: 0, max: 100 },
  janelaDias: { min: 1, max: 365 },
  parcelaRelevantePercentual: { min: 1, max: 100 },
  // Spec 0023 (AC-6): prazo de fornecimento do indicador 4 do IMR do contrato.
  prazoFornecimentoDiasUteis: { min: 1, max: 30 },
} as const;

/** O período do relatório de material vai até 366 dias (AC-41). */
export const RELATORIO_MATERIAL_MAX_DIAS = 366;
/** Custo de material por equipamento: os 20 de maior valor. */
export const RELATORIO_MATERIAL_MAX_ATIVOS = 20;

/** Parâmetros padrão da `MaterialConfig` (fatia 1 só usa a raiz da contratada na trilha). */
export const MATERIAL_CONFIG_PADRAO = {
  percentualSinapi: 10,
  janelaDias: 90,
  parcelaRelevantePercentual: 20,
  prazoFornecimentoDiasUteis: 5,
  raizCnpjContratada: '03543374',
} as const;
