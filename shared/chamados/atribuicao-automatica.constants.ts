/**
 * Atribuição automática ao técnico (spec 0008). Só constantes e tipos puros:
 * o passo em si vive em `lib/chamados/atribuicao-automatica.ts`.
 */

/** O que fica gravado em `Chamado.atribuicaoAutomatica.resultado`. */
export const ATRIBUICAO_RESULTADOS = ['atribuido', 'sem_tecnico'] as const;
export type AtribuicaoResultadoGravado = (typeof ATRIBUICAO_RESULTADOS)[number];

/** Por que o chamado ficou sem técnico automático. `erro` cobre qualquer falha do passo. */
export const ATRIBUICAO_MOTIVOS = ['sem_especialidade', 'sem_vaga', 'erro'] as const;
export type AtribuicaoMotivo = (typeof ATRIBUICAO_MOTIVOS)[number];

/** O motivo em português, para o texto que os gestores leem (AC-13 e AC-15). */
export const ATRIBUICAO_MOTIVO_LABELS: Record<AtribuicaoMotivo, string> = {
  sem_especialidade: 'nenhum técnico ativo com a especialidade',
  sem_vaga: 'todos os técnicos no limite de carga',
  erro: 'falha na atribuição automática',
};

/** Nome vazio nunca sai em branco no histórico, no chat nem no aviso dos gestores. */
export const TECNICO_NOME_GENERICO = 'um técnico';

export function rotuloDoTecnico(nome: string | null | undefined): string {
  return nome?.trim() || TECNICO_NOME_GENERICO;
}

/** Quantos candidatos o passo tenta, em ordem, antes de desistir com `sem_vaga` (AC-8). */
export const ATRIBUICAO_TENTATIVAS_MAX = 3;

/**
 * O resultado do passo, como `confirmarAbertura` o recebe. `nao_tentada` vale
 * para "chave desligada", "corrida perdida para um gestor" e "falha antes de
 * conhecer a chave": em todos, o chamado segue como na spec 0007.
 */
export type AtribuicaoResultado =
  | { resultado: 'atribuido'; tecnicoId: string; tecnicoNome: string }
  | { resultado: 'sem_tecnico'; motivo: AtribuicaoMotivo }
  | { resultado: 'nao_tentada' };

/**
 * O que a lista da gestão traz de `Chamado.atribuicaoAutomatica` (spec 0008,
 * AC-15). `tecnicoNome` é o do técnico que a regra escolheu, resolvido pelo
 * `tecnicoId` gravado, e não o técnico de hoje: o Preposto pode ter trocado.
 * Só endpoints de gestão devolvem isto; solicitante e técnico nunca o recebem.
 */
export type AtribuicaoAutomaticaGestao = {
  resultado: AtribuicaoResultadoGravado;
  motivo: AtribuicaoMotivo | null;
  tecnicoNome: string | null;
  em: string;
};

/** A frase que o detalhe mostra ao Preposto e ao Admin (AC-15). */
export function textoDaAtribuicaoAutomatica(atribuicao: AtribuicaoAutomaticaGestao): string {
  if (atribuicao.resultado === 'atribuido') {
    return `Atribuído automaticamente a ${rotuloDoTecnico(atribuicao.tecnicoNome)}`;
  }
  return atribuicao.motivo
    ? `Sem técnico automático: ${ATRIBUICAO_MOTIVO_LABELS[atribuicao.motivo]}`
    : 'Sem técnico automático';
}
