/**
 * Enums, limites e textos da vistoria em campo (spec 0012, parte 1). Servidor
 * e celular leem daqui, então nada neste arquivo toca o banco nem o IndexedDB.
 */

export const CAMPANHA_STATUSES = ['aberta', 'encerrada'] as const;
export type CampanhaStatus = (typeof CAMPANHA_STATUSES)[number];

export const CAMPANHA_STATUS_LABELS: Record<CampanhaStatus, string> = {
  aberta: 'Aberta',
  encerrada: 'Encerrada',
};

/** Quem conferiu: Técnico é da contratada; Admin e Preposto são servidores. */
export const PAPEIS_AUTOR = ['servidor', 'contratada'] as const;
export type PapelAutor = (typeof PAPEIS_AUTOR)[number];

export const PAPEL_AUTOR_LABELS: Record<PapelAutor, string> = {
  servidor: 'Servidor',
  contratada: 'Contratada',
};

/** Resultado de cada operação devolvido por `POST /api/vistoria/sincronizar`. */
export const ESTADOS_RESULTADO = ['aceita', 'ja_conferido', 'recusada'] as const;
export type EstadoResultado = (typeof ESTADOS_RESULTADO)[number];

/** Estado da operação guardada no aparelho. */
export const ESTADOS_OPERACAO = ['pendente', 'enviada', 'ja_conferido', 'recusada'] as const;
export type EstadoOperacao = (typeof ESTADOS_OPERACAO)[number];

export const ESTADO_OPERACAO_LABELS: Record<EstadoOperacao, string> = {
  pendente: 'Aguardando envio',
  enviada: 'Enviado',
  ja_conferido: 'Já conferido',
  recusada: 'Recusado',
};

/** Máximo de operações num lote da sincronização (AC-6). */
export const LIMITE_LOTE_VISTORIA = 50;

/** Operações já resolvidas saem do aparelho depois disto (dias). */
export const DIAS_GUARDA_RESOLVIDAS = 7;

export const NOME_CAMPANHA_MAX = 80;

/** Campos técnicos que a conferência pode escrever no ativo. */
export const CAMPOS_TECNICOS = ['fabricante', 'modelo', 'numeroSerie'] as const;
export type CampoTecnico = (typeof CAMPOS_TECNICOS)[number];

export const CAMPO_TECNICO_LABELS: Record<CampoTecnico, string> = {
  fabricante: 'fabricante',
  modelo: 'modelo',
  numeroSerie: 'número de série',
};

export const ERRO_SEM_CAMPANHA = 'Nenhuma campanha aberta';
export const ERRO_CAMPANHA_ENCERRADA = 'Campanha encerrada';
export const ERRO_CAMPANHA_INEXISTENTE = 'Campanha inexistente';
export const ERRO_ATIVO_INEXISTENTE = 'Ativo inexistente';
export const ERRO_ATIVO_NAO_VISTORIAVEL = 'Ativo baixado ou fora dos tiers A e B';
export const ERRO_LOCAL_INVALIDO = 'Local inexistente ou desativado';
export const ERRO_OPERACAO_INVALIDA = 'Operação inválida';

/** Tiers que o cadastro em campo aceita: só o que recebe chamado (AC-11). */
export const TIERS_CADASTRO_CAMPO = ['A', 'B'] as const;
export type TierCadastroCampo = (typeof TIERS_CADASTRO_CAMPO)[number];

/** Prefixo do código provisório do interno cadastrado sem sinal (AC-12). Nunca vai ao servidor. */
export const PREFIXO_PROVISORIO = 'PROV-';

/** Cadastro patrimoniado de um tombo que o servidor já tinha (AC-13). */
export function avisoJaExistia(codigo: string): string {
  return `O ativo ${codigo} já existia; registrado como conferência`;
}

export function erroCampanhaJaAberta(nome: string): string {
  return `Já existe uma campanha aberta: ${nome}`;
}

/** Quem usa o campo, o pacote e a sincronização (o Solicitante não). */
export const PERFIS_VISTORIA = ['Admin', 'Preposto', 'Técnico'] as const;

export function podeVistoriar(role?: string): boolean {
  return (PERFIS_VISTORIA as readonly string[]).includes(role ?? '');
}
