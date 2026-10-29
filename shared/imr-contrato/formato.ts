/** Rótulos e formatos do IMR do contrato (spec 0023), iguais na tela e no PDF. */

import type { PapelImr } from './imr-contrato.constants';
import type { SituacaoLinha } from './imr-contrato.types';

export const ROTULO_SITUACAO: Record<SituacaoLinha, string> = {
  atraso: 'Atraso',
  nao_atendimento: 'Não atendimento',
  desconsiderada: 'Desconsiderada',
};

export const ROTULO_PAPEL: Record<PapelImr, string> = { fiscal: 'fiscal', gestor: 'gestor' };

/** `0.97` → `0,97`. */
export function formatarFator(f: number): string {
  return f.toFixed(2).replace('.', ',');
}

/** Minutos → `2 h 05 min`. */
export function formatarDuracao(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m} min` : `${h} h ${String(m).padStart(2, '0')} min`;
}
