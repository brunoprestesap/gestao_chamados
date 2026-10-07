/**
 * Meses e janela do relatório por contrato (spec 0016, AC-5 e AC-6). Funções
 * puras sobre strings `YYYY-MM-DD` e `YYYY-MM`, sem fuso: o "hoje" chega
 * pronto (`hojeEmBelem()`), e cada string vira data por meia noite UTC.
 */

export const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DATA_YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export type Vigencia = { vigenciaInicio: string; vigenciaFim: string };

/** `YYYY-MM-DD` → meia noite UTC daquele dia. */
export function dataDoYmd(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Primeiro e último dia do mês `YYYY-MM`; o último por `Date.UTC(ano, mes, 0)` (certo em ano bissexto). */
export function limitesDoMes(mes: string): { primeiro: string; ultimo: string } {
  const [ano, m] = mes.split('-').map(Number) as [number, number];
  const ultimo = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);
  return { primeiro: `${mes}-01`, ultimo };
}

function mesAnterior(mes: string): string {
  const [ano, m] = mes.split('-').map(Number) as [number, number];
  return m === 1 ? `${ano - 1}-12` : `${ano}-${String(m - 1).padStart(2, '0')}`;
}

/**
 * Os meses que cruzam a vigência e não estão depois do mês de `hoje`
 * (`YYYY-MM-DD` em Belém), do mais recente para o mais antigo (AC-5).
 */
export function mesesPermitidos(vigencia: Vigencia, hoje: string): string[] {
  const ultimoMes = [vigencia.vigenciaFim.slice(0, 7), hoje.slice(0, 7)].sort()[0]!;
  const primeiroMes = vigencia.vigenciaInicio.slice(0, 7);
  const meses: string[] = [];
  for (let mes = ultimoMes; mes >= primeiroMes; mes = mesAnterior(mes)) meses.push(mes);
  return meses;
}

export type JanelaDoMes = {
  mes: string;
  /** Início e fim reais, já cortados pela vigência. */
  inicioYmd: string;
  fimYmd: string;
  /** Meia noite UTC de `inicioYmd` e de `fimYmd`; o servidor fecha com `startOfDay`/`endOfDay`. */
  dataInicio: Date;
  dataFim: Date;
};

/**
 * A janela do mês dentro da vigência (AC-6): `max(primeiro dia, vigenciaInicio)`
 * a `min(último dia, vigenciaFim)`. Quem chama confere antes que o mês está em
 * `mesesPermitidos`, então o intervalo nunca é vazio.
 */
export function janelaDoMes(mes: string, vigenciaInicio: string, vigenciaFim: string): JanelaDoMes {
  const { primeiro, ultimo } = limitesDoMes(mes);
  const inicioYmd = primeiro > vigenciaInicio ? primeiro : vigenciaInicio;
  const fimYmd = ultimo < vigenciaFim ? ultimo : vigenciaFim;
  return { mes, inicioYmd, fimYmd, dataInicio: dataDoYmd(inicioYmd), dataFim: dataDoYmd(fimYmd) };
}

/** Os meses (`YYYY-MM`) que cruzam o intervalo, do primeiro ao último. */
export function mesesDoIntervalo(inicio: string, fim: string): string[] {
  if (inicio > fim) return [];
  return mesesPermitidos({ vigenciaInicio: inicio, vigenciaFim: fim }, fim).reverse();
}

/** `YYYY-MM-DD` → `dd/mm/aaaa`. */
export function formatarYmd(ymd: string): string {
  const [a, m, d] = ymd.split('-');
  return `${d}/${m}/${a}`;
}

/** `YYYY-MM` → `mm/aaaa`. */
export function formatarMes(mes: string): string {
  const [a, m] = mes.split('-');
  return `${m}/${a}`;
}
