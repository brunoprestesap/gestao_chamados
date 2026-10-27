/**
 * Os atalhos de período do relatório de material (spec 0021, AC-23): do
 * primeiro dia do mês, do trimestre ou do ano corrente até hoje, em
 * `YYYY-MM-DD`. O `hoje` vem de fora, já no dia de Belém (`hojeEmBelem`).
 * Puro, para o servidor e o navegador.
 */

export const ATALHOS_PERIODO = ['mes', 'trimestre', 'ano'] as const;
export type AtalhoPeriodo = (typeof ATALHOS_PERIODO)[number];

export type Periodo = { inicio: string; fim: string };

/** O período de cada atalho para o dia `hoje` (`YYYY-MM-DD`). */
export function periodosDosAtalhos(hoje: string): Record<AtalhoPeriodo, Periodo> {
  const [ano, mes] = hoje.split('-').map(Number) as [number, number];
  const mesDoTrimestre = Math.floor((mes - 1) / 3) * 3 + 1;
  const doMes = (m: number) => `${ano}-${String(m).padStart(2, '0')}-01`;
  return {
    mes: { inicio: doMes(mes), fim: hoje },
    trimestre: { inicio: doMes(mesDoTrimestre), fim: hoje },
    ano: { inicio: `${ano}-01-01`, fim: hoje },
  };
}

/**
 * O atalho que corresponde exatamente ao período, ou `null` para "Outro período".
 * No primeiro mês do trimestre (e em janeiro) dois ou três atalhos dão as mesmas
 * datas: vale o `escolhido` (o `atalho` do endereço) quando as datas são as dele.
 */
export function atalhoDoPeriodo(
  p: Periodo,
  hoje: string,
  escolhido?: string | null,
): AtalhoPeriodo | null {
  const atalhos = periodosDosAtalhos(hoje);
  const bate = (a: AtalhoPeriodo) => atalhos[a].inicio === p.inicio && atalhos[a].fim === p.fim;
  const preferido = ATALHOS_PERIODO.find((a) => a === escolhido);
  if (preferido && bate(preferido)) return preferido;
  return ATALHOS_PERIODO.find(bate) ?? null;
}
