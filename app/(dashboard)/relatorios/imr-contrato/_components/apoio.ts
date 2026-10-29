import { formatarDataHoraBelem } from '@/shared/contratos/formato';
import type { PapelImr } from '@/shared/imr-contrato/imr-contrato.constants';

/** Tipos e formatos divididos pelas peças da tela do IMR do contrato (spec 0023). */

export type MesImr = { contratoId: string; competencia: string };

type Lancado = { pontos: number; observacao: string | null };

/** Prévia ao vivo do mês aberto, ou a foto gravada de uma versão (AC-1). */
export type VistaImr =
  | { tipo: 'previa' }
  | {
      tipo: 'foto';
      versao: number;
      /** A versão vigente do mês fechado; false numa versão reaberta. */
      vigente: boolean;
      fechadoPorNome: string;
      papel: PapelImr;
      fechadoEm: Date;
      i1: Lancado;
      i2: Lancado;
      total: number;
      faixa: { fator: number; percentual: number };
    };

export function dataHora(d: Date): string {
  return formatarDataHoraBelem(d.toISOString());
}
