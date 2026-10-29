/**
 * Prazos em dias úteis de Belém, usados pelo IMR do contrato e pela cotação de
 * material (spec 0023, AC-2 e AC-6). Funções puras: o calendário chega pronto
 * (expediente e feriados lidos uma vez), e Belém é UTC-3 fixo.
 */

export type CalendarioDiasUteis = {
  /** Dias da semana úteis, 0 = domingo. */
  weekdays: readonly number[];
  /** Fim do expediente, `HH:mm`. */
  workdayEnd: string;
  /** Feriados ativos, `YYYY-MM-DD`. */
  feriados: ReadonlySet<string>;
};

const OFFSET_BELEM = '-03:00';

/**
 * Até onde a contagem de dias úteis procura, em dias corridos. Quem lê o
 * calendário para um prazo cobre a mesma janela, para nenhum feriado do
 * caminho ficar de fora.
 */
export const LIMITE_DIAS_CORRIDOS = 400;
const DIA_MS = 24 * 60 * 60 * 1000;
const OFFSET_MS = 3 * 60 * 60 * 1000;

/** O dia (`YYYY-MM-DD`) de um instante em Belém. */
export function diaEmBelem(instante: Date): string {
  return new Date(instante.getTime() - OFFSET_MS).toISOString().slice(0, 10);
}

/** O instante de `HH:mm` do dia `ymd` em Belém. */
export function instanteEmBelem(ymd: string, hhmm: string): Date {
  return new Date(`${ymd}T${hhmm}:00.000${OFFSET_BELEM}`);
}

function diaSeguinte(ymd: string): string {
  return new Date(new Date(`${ymd}T00:00:00.000Z`).getTime() + DIA_MS).toISOString().slice(0, 10);
}

function ehDiaUtil(ymd: string, cal: CalendarioDiasUteis): boolean {
  const semana = new Date(`${ymd}T00:00:00.000Z`).getUTCDay();
  return cal.weekdays.includes(semana) && !cal.feriados.has(ymd);
}

/**
 * O fim do expediente do N-ésimo dia útil depois do dia (Belém) de `inicio`,
 * pulando os dias fora do expediente e os feriados. Sem dia útil na semana,
 * devolve null em vez de girar para sempre.
 */
export function prazoEmDiasUteis(inicio: Date, n: number, cal: CalendarioDiasUteis): Date | null {
  if (cal.weekdays.length === 0) return null;
  let dia = diaEmBelem(inicio);
  let contados = 0;
  // Cobre qualquer N do parâmetro (até 30), mesmo com expediente curto e feriados seguidos.
  for (let i = 0; i < LIMITE_DIAS_CORRIDOS && contados < n; i += 1) {
    dia = diaSeguinte(dia);
    if (ehDiaUtil(dia, cal)) contados += 1;
  }
  return contados < n ? null : instanteEmBelem(dia, cal.workdayEnd);
}
