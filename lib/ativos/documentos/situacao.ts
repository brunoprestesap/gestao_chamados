import { toLocalDateYYYYMMDD } from '@/lib/sla-timezone';
import {
  type LimiteAlerta,
  LIMITES_POR_URGENCIA,
  type SituacaoCalculada,
} from '@/shared/ativos/documento.constants';

/**
 * Datas sem hora dos documentos (spec 0013). `emitidoEm` e `validadeAte` são
 * gravadas como meia noite UTC do dia; "hoje" é o dia de America/Belem. Os dias
 * restantes saem da diferença entre os dois `YYYY-MM-DD`, nunca de
 * `validadeAte - new Date()` (o erro clássico de um dia).
 */
export const FUSO_DOCUMENTOS = 'America/Belem';

const MS_DIA = 24 * 60 * 60 * 1000;

/** Hoje em Belém, como `YYYY-MM-DD`. */
export function hojeEmBelem(agora: Date = new Date()): string {
  return toLocalDateYYYYMMDD(agora, FUSO_DOCUMENTOS);
}

/**
 * O último instante de hoje em Belém (23:59:59.999, UTC−3 fixo, sem horário
 * de verão). Fecha as janelas dos indicadores da ficha (spec 0014, AC-20).
 */
export function fimDoDiaEmBelem(agora: Date = new Date()): Date {
  return new Date(`${hojeEmBelem(agora)}T23:59:59.999-03:00`);
}

/** `YYYY-MM-DD` → meia noite UTC daquele dia. */
export function dataSemHora(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Data gravada (meia noite UTC) → `YYYY-MM-DD`, lido em UTC. */
export function paraYmd(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** Soma dias a um `YYYY-MM-DD`. */
export function somarDias(ymd: string, dias: number): string {
  return paraYmd(new Date(dataSemHora(ymd).getTime() + dias * MS_DIA));
}

/**
 * Soma meses de calendário a um `YYYY-MM-DD`. Quando o dia não existe no mês
 * de destino, cai no último dia dele (30/08 + 6 meses = 28/02 ou 29/02).
 */
export function somarMeses(ymd: string, meses: number): string {
  const [a, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const total = a * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = total - ano * 12;
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return paraYmd(new Date(Date.UTC(ano, mes, Math.min(d, ultimoDia))));
}

/** Soma anos a um `YYYY-MM-DD` (29/02 cai em 28/02 no ano que não é bissexto). */
export function somarAnos(ymd: string, anos: number): string {
  return somarMeses(ymd, anos * 12);
}

/**
 * Anos completos de `inicio` até `hoje`, pela mesma conta de `somarAnos`: o
 * aniversário que `somarAnos` dá conta como completo (spec 0015, AC-2).
 */
export function anosCompletos(inicio: string, hoje: string): number {
  let anos = Number(hoje.slice(0, 4)) - Number(inicio.slice(0, 4));
  if (anos > 0 && somarAnos(inicio, anos) > hoje) anos -= 1;
  return Math.max(0, anos);
}

/** Dias de `hoje` até `validadeAte` (negativo quando já passou). */
export function diasRestantes(validadeAte: Date, hoje: string): number {
  return Math.round(
    (dataSemHora(paraYmd(validadeAte)).getTime() - dataSemHora(hoje).getTime()) / MS_DIA,
  );
}

export function situacaoDoDocumento(
  validadeAte: Date | null | undefined,
  hoje: string,
): SituacaoCalculada {
  if (!validadeAte) return { tipo: 'sem_validade' };
  const dias = diasRestantes(validadeAte, hoje);
  if (dias < 0) return { tipo: 'vencido', dias };
  if (dias === 0) return { tipo: 'vence_hoje' };
  if (dias <= 90) return { tipo: 'vence_em', dias };
  return { tipo: 'em_dia', dias };
}

/** Limites já alcançados, em ordem de urgência (o mais urgente primeiro). */
export function limitesAlcancados(
  validadeAte: Date | null | undefined,
  hoje: string,
): LimiteAlerta[] {
  if (!validadeAte) return [];
  const dias = diasRestantes(validadeAte, hoje);
  return LIMITES_POR_URGENCIA.filter((limite) =>
    limite === 'vencido' ? dias < 0 : dias <= Number(limite),
  );
}

/** Texto curto da situação, para ficha e painel. */
export function rotuloSituacao(s: SituacaoCalculada): string {
  switch (s.tipo) {
    case 'sem_validade':
      return 'Sem validade';
    case 'vencido':
      return 'Vencido';
    case 'vence_hoje':
      return 'Vence hoje';
    case 'vence_em':
      return s.dias === 1 ? 'Vence em 1 dia' : `Vence em ${s.dias} dias`;
    case 'em_dia':
      return 'Em dia';
  }
}

/** Data gravada → `DD/MM/AAAA`. */
export function formatarDataDocumento(data: Date | null | undefined): string {
  if (!data) return '';
  const [a, m, d] = paraYmd(data).split('-');
  return `${d}/${m}/${a}`;
}
