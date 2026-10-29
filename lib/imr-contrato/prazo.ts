/**
 * Prazos do IMR do contrato (spec 0023, AC-2 e AC-6). A conta em dias úteis de
 * Belém mora em `lib/dias-uteis/prazo.ts`, que a cotação de material também
 * usa; aqui ficam o prazo de resposta e os limites do mês.
 */

import {
  type CalendarioDiasUteis,
  diaEmBelem,
  instanteEmBelem,
  prazoEmDiasUteis,
} from '@/lib/dias-uteis/prazo';

export { diaEmBelem, instanteEmBelem, prazoEmDiasUteis };
export type CalendarioImr = CalendarioDiasUteis;

/** Prazo do indicador 3: fim do expediente do primeiro dia útil depois da abertura (AC-2). */
export function prazoDeResposta(createdAt: Date, cal: CalendarioImr): Date | null {
  return prazoEmDiasUteis(createdAt, 1, cal);
}

/** Início do mês `YYYY-MM` e do mês seguinte, em Belém. */
export function limitesDoMesEmBelem(competencia: string): { inicio: Date; fim: Date } {
  const [ano, mes] = competencia.split('-').map(Number) as [number, number];
  const seguinte = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, '0')}`;
  return {
    inicio: instanteEmBelem(`${competencia}-01`, '00:00'),
    fim: instanteEmBelem(`${seguinte}-01`, '00:00'),
  };
}
