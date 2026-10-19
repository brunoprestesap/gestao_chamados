import 'server-only';

import { hojeEmBelem, somarDias } from '@/lib/ativos/documentos/situacao';
import { PRAZO_ATESTE_DIAS, type SituacaoCotacao } from '@/shared/material/material.constants';

/**
 * Prazo do ateste (spec 0019, AC-21): 5 dias corridos para o recebimento
 * provisório, contados de `executadoEm`, e 5 para o definitivo, contados do
 * provisório, no fuso de Belém. Só mostra o selo de atraso; nada é bloqueado.
 */

export type PrazoAteste = {
  etapa: 'provisorio' | 'definitivo';
  /** Último dia do prazo, `YYYY-MM-DD` em Belém. */
  venceEm: string;
  atrasado: boolean;
};

export function prazoDoAteste(
  cot: {
    situacao: SituacaoCotacao;
    executadoEm?: Date | null;
    recebimentoProvisorio?: { em: Date } | null;
  },
  agora: Date = new Date(),
): PrazoAteste | null {
  if (cot.situacao !== 'executada' || !cot.executadoEm) return null;
  const etapa = cot.recebimentoProvisorio ? 'definitivo' : 'provisorio';
  const inicio = cot.recebimentoProvisorio?.em ?? cot.executadoEm;
  const venceEm = somarDias(hojeEmBelem(inicio), PRAZO_ATESTE_DIAS);
  return { etapa, venceEm, atrasado: hojeEmBelem(agora) > venceEm };
}
