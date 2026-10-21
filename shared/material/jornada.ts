import type { SituacaoCotacao } from './material.constants';

/**
 * A jornada visual da cotação (spec 0021): as 7 etapas do caminho normal e
 * onde cada situação fica nela. Devolvida, reprovada e cancelada são desvios,
 * marcados na etapa em que ocorreram (o `de` do último evento que mudou a
 * situação). Puro: usado no cliente e no servidor.
 */

export const ETAPAS_JORNADA = [
  'rascunho',
  'enviada',
  'em_analise',
  'em_aprovacao',
  'autorizada',
  'executada',
  'atestada',
] as const satisfies readonly SituacaoCotacao[];
export type EtapaJornada = (typeof ETAPAS_JORNADA)[number];

export const DESVIOS_JORNADA = ['devolvida', 'reprovada', 'cancelada'] as const;
export type DesvioJornada = (typeof DESVIOS_JORNADA)[number];

export type PosicaoJornada = {
  /** Índice em `ETAPAS_JORNADA` da etapa atual (ou da etapa em que o desvio ocorreu). */
  indice: number;
  desvio: DesvioJornada | null;
};

function ehDesvio(s: SituacaoCotacao): s is DesvioJornada {
  return (DESVIOS_JORNADA as readonly string[]).includes(s);
}

/**
 * A posição da situação na jornada. `de` é a situação de onde a cotação veio
 * no último evento que mudou a situação; sem ele, o desvio cai na etapa mais
 * provável (a devolvida volta da análise, o resto fica no começo).
 */
export function posicaoNaJornada(
  situacao: SituacaoCotacao,
  de?: SituacaoCotacao | null,
): PosicaoJornada {
  if (!ehDesvio(situacao)) {
    return { indice: ETAPAS_JORNADA.indexOf(situacao as EtapaJornada), desvio: null };
  }
  const daOrigem = de ? ETAPAS_JORNADA.indexOf(de as EtapaJornada) : -1;
  // Cancelar uma devolvida marca o desvio onde a devolução tinha parado: na análise.
  const indice = daOrigem >= 0 ? daOrigem : situacao === 'devolvida' || de === 'devolvida' ? 2 : 0;
  return { indice, desvio: situacao };
}
