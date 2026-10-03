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
