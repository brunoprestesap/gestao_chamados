import { formatarReais } from '../chamados/custo';
import type { AtivoStatus } from './ativo.constants';

/**
 * Candidatos à substituição (spec 0015). Servidor e cliente leem daqui, então
 * nada neste arquivo toca o banco. A situação (candidato, dispensado) nunca é
 * gravada: é calculada a cada leitura por `avaliarSubstituicao`.
 */

export const CRITERIOS_SUBSTITUICAO = ['idade', 'corretivos', 'reincidencia', 'custo'] as const;
export type CriterioSubstituicao = (typeof CRITERIOS_SUBSTITUICAO)[number];

export const CRITERIO_SUBSTITUICAO_LABELS: Record<CriterioSubstituicao, string> = {
  idade: 'idade',
  corretivos: 'corretivos',
  reincidencia: 'reincidência',
  custo: 'custo',
};

/** Limites usados quando a categoria deixa o campo vazio (AC-6). */
export const LIMITE_CORRETIVOS_12M_PADRAO = 4;
export const LIMITE_REINCIDENCIA_90D_PADRAO = 3;
export const LIMITE_CATEGORIA_MIN = 1;
export const LIMITE_CATEGORIA_MAX = 99;

/**
 * Critério de custo (spec 0018, AC-15 e AC-16): custo corretivo em 12 meses
 * contra um percentual do `valorHistorico`. Vazio na categoria usa 50%.
 */
export const LIMITE_CUSTO_PERCENTUAL_12M_PADRAO = 50;
export const LIMITE_CUSTO_PERCENTUAL_MIN = 1;
export const LIMITE_CUSTO_PERCENTUAL_MAX = 999;

/** Quanto tempo a dispensa vale, em meses de calendário (AC-11). */
export const MESES_DISPENSA_SUBSTITUICAO = 6;

/** Fora da conta mesmo sendo Tier A ou B (AC-1). */
export const STATUS_FORA_DA_SUBSTITUICAO: readonly AtivoStatus[] = ['baixado', 'aguardando_baixa'];

export const MOTIVO_DISPENSA_MIN = 10;
export const MOTIVO_DISPENSA_MAX = 500;

export type SituacaoCalculadaSubstituicao = 'fora' | 'candidato' | 'dispensado';

export type MotivoSubstituicao =
  | { criterio: 'idade'; anos: number; vidaUtilAnos: number }
  | { criterio: 'corretivos'; quantidade: number; limite: number }
  | { criterio: 'reincidencia'; quantidade: number; limite: number }
  | { criterio: 'custo'; custoCentavos: number; percentual: number; limite: number };

export type IdadeNaoAvaliada = 'sem_vida_util' | 'sem_data';

export const NOTA_IDADE_NAO_AVALIADA: Record<IdadeNaoAvaliada, string> = {
  sem_vida_util: 'Idade não avaliada: a categoria não tem vida útil',
  sem_data: 'Idade não avaliada: o ativo não tem data de instalação nem de tombo',
};

export const NOTA_CUSTO_NAO_AVALIADO = 'Custo não avaliado: o ativo não tem valor histórico.';

/** "1 ano", "14 anos", "1 corretivo", "5 corretivos". */
export function plural(n: number, singular: string, varios: string): string {
  return `${n} ${n === 1 ? singular : varios}`;
}

/** Texto curto de um motivo, igual na ficha e no IMR (AC-8). */
export function textoDoMotivo(m: MotivoSubstituicao): string {
  switch (m.criterio) {
    case 'idade':
      return `${plural(m.anos, 'ano', 'anos')}, vida útil ${m.vidaUtilAnos}`;
    case 'corretivos':
      return `${plural(m.quantidade, 'corretivo', 'corretivos')} em 12 meses, limite ${m.limite}`;
    case 'reincidencia':
      return `${m.quantidade} em 90 dias, limite ${m.limite}`;
    case 'custo':
      return `Custo em 12 meses: ${formatarReais(m.custoCentavos)} (${m.percentual}% do valor histórico; limite ${m.limite}%)`;
  }
}

/**
 * `YYYY-MM-DD` → `DD/MM/AAAA`, sem passar por fuso: o mesmo texto de data na
 * ficha e no histórico da dispensa.
 */
export function formatarDia(ymd: string): string {
  const [a, m, d] = ymd.split('-');
  return `${d}/${m}/${a}`;
}

/** Os critérios em texto, para o histórico: "idade, corretivos". */
export function textoDosCriterios(criterios: readonly CriterioSubstituicao[]): string {
  return criterios.map((c) => CRITERIO_SUBSTITUICAO_LABELS[c]).join(', ');
}

export const ERRO_NAO_CANDIDATO = 'Este ativo não é mais candidato à substituição.';
export const ERRO_ATIVO_MUDOU = 'O ativo mudou enquanto você confirmava. Tente de novo.';
export const ERRO_SEM_DISPENSA_VIGENTE = 'Este ativo não tem dispensa em vigor.';
export const ERRO_MOTIVO_DISPENSA = `Motivo deve ter de ${MOTIVO_DISPENSA_MIN} a ${MOTIVO_DISPENSA_MAX} caracteres.`;
export const ERRO_LIMITE_CORRETIVOS = 'Limite de corretivos inválido.';
export const ERRO_LIMITE_REINCIDENCIA = 'Limite de reincidência inválido.';
export const ERRO_LIMITE_CUSTO = 'Limite de custo inválido.';

export function erroJaDispensado(nome: string): string {
  return `Este ativo já foi dispensado por ${nome}.`;
}
