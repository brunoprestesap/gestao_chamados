/**
 * Normalizadores dos dados patrimoniais do SICAM (spec 0012, parte 2). A carga
 * da 0011 e o importador usam os mesmos: sem isso, os ativos da carga
 * apareceriam como "alterados" em massa na primeira importação.
 *
 * Imports relativos, sem o alias `@/` e sem `server-only`: a carga roda pelo
 * `tsx`, fora do Next.
 */

/** Valor que estava no arquivo mas não se leu (data ou número). */
export const ILEGIVEL: unique symbol = Symbol('ilegivel');
export type Ilegivel = typeof ILEGIVEL;

/** Campo vazio vira ausente; o resto só perde os espaços das pontas. */
export function texto(v: string | undefined | null): string | undefined {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : undefined;
}

/** Texto com os espaços repetidos trocados por um só (descrição e comparação). */
export function textoCompacto(v: string | undefined | null): string | undefined {
  return texto((v ?? '').replace(/\s+/g, ' '));
}

function meioDiaUtc(ano: number, mes: number, dia: number): Date | Ilegivel {
  const d = new Date(Date.UTC(ano, mes - 1, dia, 12));
  // Recusa 31-FEV e afins, que o `Date.UTC` empurraria para o mês seguinte.
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return ILEGIVEL;
  }
  return d;
}

/** `AAAA-MM-DD` (o CSV limpo da carga) vira Date ao meio dia UTC. */
export function lerDataIso(v: string | undefined | null): Date | undefined | Ilegivel {
  const t = texto(v);
  if (!t) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return ILEGIVEL;
  return meioDiaUtc(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** Meses do export, em português e nas abreviações em inglês do Oracle. */
const MESES: Record<string, number> = {
  JAN: 1,
  FEV: 2,
  FEB: 2,
  MAR: 3,
  ABR: 4,
  APR: 4,
  MAI: 5,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AGO: 8,
  AUG: 8,
  SET: 9,
  SEP: 9,
  OUT: 10,
  OCT: 10,
  NOV: 11,
  DEZ: 12,
  DEC: 12,
};

/**
 * `DD-MMM-AA` do export do SICAM vira Date ao meio dia UTC (não muda de dia
 * no fuso de Belém). Século cortado em 40: `94` vira 1994, `26` vira 2026.
 */
export function lerDataSicam(v: string | undefined | null): Date | undefined | Ilegivel {
  const t = texto(v);
  if (!t) return undefined;
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/.exec(t);
  if (!m) return ILEGIVEL;
  const mes = MESES[m[2].toUpperCase()];
  if (!mes) return ILEGIVEL;
  const aa = Number(m[3]);
  return meioDiaUtc(aa > 40 ? 1900 + aa : 2000 + aa, mes, Number(m[1]));
}

/** `8700,9`, `1.234,56` ou `8700.9` vira number. */
export function lerNumero(v: string | undefined | null): number | undefined | Ilegivel {
  const t = texto(v);
  if (!t) return undefined;
  // Com vírgula, o ponto é separador de milhar (`1.234,56`); sem vírgula, é decimal.
  const limpo = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  if (!/^-?\d+(\.\d+)?$/.test(limpo)) return ILEGIVEL;
  return Number(limpo);
}

export type TipoCampoPatrimonial = 'texto' | 'data' | 'numero';

/** Os 11 campos de `camposPatrimoniais` que vêm do SICAM e entram na comparação. */
export const CAMPOS_PATRIMONIAIS = [
  { campo: 'lotacao', tipo: 'texto', rotulo: 'lotação' },
  { campo: 'setor', tipo: 'texto', rotulo: 'setor' },
  { campo: 'responsavelMatricula', tipo: 'texto', rotulo: 'matrícula do responsável' },
  { campo: 'responsavelNome', tipo: 'texto', rotulo: 'nome do responsável' },
  { campo: 'dataTombo', tipo: 'data', rotulo: 'data do tombo' },
  { campo: 'garantiaInicio', tipo: 'data', rotulo: 'início da garantia' },
  { campo: 'garantiaFim', tipo: 'data', rotulo: 'fim da garantia' },
  { campo: 'valorHistorico', tipo: 'numero', rotulo: 'valor histórico' },
  { campo: 'codigoMaterial', tipo: 'texto', rotulo: 'código do material' },
  { campo: 'fornecedor', tipo: 'texto', rotulo: 'fornecedor' },
  { campo: 'numeroSerie', tipo: 'texto', rotulo: 'número de série' },
] as const satisfies readonly { campo: string; tipo: TipoCampoPatrimonial; rotulo: string }[];

export type CampoPatrimonial = (typeof CAMPOS_PATRIMONIAIS)[number]['campo'];

export type CamposPatrimoniaisSicam = {
  lotacao?: string;
  setor?: string;
  responsavelMatricula?: string;
  responsavelNome?: string;
  dataTombo?: Date;
  garantiaInicio?: Date;
  garantiaFim?: Date;
  valorHistorico?: number;
  codigoMaterial?: string;
  fornecedor?: string;
  numeroSerie?: string;
};

const TIPO_DO_CAMPO = new Map<string, TipoCampoPatrimonial>(
  CAMPOS_PATRIMONIAIS.map((c) => [c.campo, c.tipo]),
);

export function rotuloCampoPatrimonial(campo: string): string {
  return CAMPOS_PATRIMONIAIS.find((c) => c.campo === campo)?.rotulo ?? campo;
}

function chaveComparavel(tipo: TipoCampoPatrimonial, v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (tipo === 'data') {
    const d = v instanceof Date ? v : new Date(String(v));
    // Pelo dia: as duas pontas estão ao meio dia UTC.
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
  }
  if (tipo === 'numero') {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? String(n) : undefined;
  }
  return textoCompacto(String(v));
}

/**
 * Os dois valores são o mesmo depois de normalizados: texto sem espaços
 * sobrando, data pelo dia, número pelo valor.
 */
export function mesmoValorPatrimonial(campo: string, a: unknown, b: unknown): boolean {
  const tipo = TIPO_DO_CAMPO.get(campo) ?? 'texto';
  return chaveComparavel(tipo, a) === chaveComparavel(tipo, b);
}
