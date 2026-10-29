/**
 * Regras puras do fechamento do IMR do contrato (spec 0023): estado do mês,
 * soma, faixa e reincidência. Os pontos de cada indicador vêm de `apurarMes`
 * (I3, I4) ou do fechamento (I1, I2); aqui só se soma e se compara.
 */

import { mesAnterior } from '@/shared/contratos/janela';
import {
  faixaDoTotal,
  type IndicadorImr,
  type PontosImr,
  type Reincidencia,
} from '@/shared/imr-contrato/imr-contrato.constants';
import type { EstadoDoMes } from '@/shared/imr-contrato/imr-contrato.types';

/**
 * O mês está fechado quando existe fechamento e a maior versão não tem
 * reabertura. Cada versão fechada vira um intervalo, do `fechadoEm` à
 * reabertura dela, em que marcação nenhuma vale (AC-9, AC-11).
 */
export function estadoDoMes(
  fechamentos: readonly { versao: number; fechadoEm: Date }[],
  reaberturas: readonly { versaoReaberta: number; em: Date }[],
): EstadoDoMes {
  const reabertaEm = new Map(reaberturas.map((r) => [r.versaoReaberta, r.em]));
  const ordenados = [...fechamentos].sort((a, b) => a.versao - b.versao);
  const maiorVersao = ordenados.at(-1)?.versao ?? 0;
  return {
    fechado: maiorVersao > 0 && !reabertaEm.has(maiorVersao),
    maiorVersao,
    intervalos: ordenados.map((f) => ({ de: f.fechadoEm, ate: reabertaEm.get(f.versao) ?? null })),
  };
}

/** Soma sempre de quatro indicadores, no máximo 100 (AC-17), e a faixa dela (AC-10). */
export function somaEFaixa(p: { i1: number; i2: number; i3: number; i4: number }) {
  const total = p.i1 + p.i2 + p.i3 + p.i4;
  const { fator, percentual } = faixaDoTotal(total);
  return { total, faixa: { fator, percentual } };
}

/**
 * Reincidência de zero (AC-12). Na prévia, I1 e I2 ainda não existem e ficam
 * de fora. `anterior` é o fechamento vigente do mês anterior; null quando o
 * mês anterior não está fechado.
 */
export function avaliarReincidencia(params: {
  competencia: string;
  vigenciaInicio: string;
  atual: PontosImr;
  anterior: { i1: number; i2: number; i3: number; i4: number } | null;
}): Reincidencia {
  if (mesAnterior(params.competencia) < params.vigenciaInicio.slice(0, 7)) {
    return { avaliada: false, motivo: 'primeiro_mes' };
  }
  const { anterior, atual } = params;
  if (!anterior) return { avaliada: false, motivo: 'mes_anterior_aberto' };
  const zerados = ([1, 2, 3, 4] as const).filter((n): n is IndicadorImr => {
    const chave = `i${n}` as const;
    return atual[chave] === 0 && anterior[chave] === 0;
  });
  return { avaliada: true, zerados };
}

/**
 * A reincidência como a foto guarda (`reincidenciaZero`, `reincidenciaAvaliada`)
 * de volta ao tipo da tela; o motivo do "não avaliada" sai da vigência gravada.
 */
export function reincidenciaDaFoto(f: {
  competencia: string;
  reincidenciaZero: IndicadorImr[];
  reincidenciaAvaliada: boolean;
  parametros: { vigencia: { inicio: string } };
}): Reincidencia {
  if (f.reincidenciaAvaliada) return { avaliada: true, zerados: f.reincidenciaZero };
  return {
    avaliada: false,
    motivo:
      mesAnterior(f.competencia) < f.parametros.vigencia.inicio.slice(0, 7)
        ? 'primeiro_mes'
        : 'mes_anterior_aberto',
  };
}

/** O mês só fecha depois do último dia dele, no dia de Belém (AC-10). */
export function mesTerminou(competencia: string, hojeYmd: string): boolean {
  return competencia < hojeYmd.slice(0, 7);
}
