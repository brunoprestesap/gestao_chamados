import { formatarTempoIndicador } from '@/shared/ativos/indicadores-formato';

/**
 * Textos do relatório por contrato (spec 0016) usados igual na tela e no PDF.
 * Ausente vira "—", nunca zero (AC-14).
 */

export const TEXTO_SEM_CHAMADOS = 'Nenhum chamado deste contrato no período.';
export const SELO_PARCIAL = 'Mês em andamento, números parciais';
export const SELO_INFORMATIVO = 'Indicadores informativos, sem efeito contratual';

export { formatarTempoIndicador as formatarTempo };

export function formatarPercentual(valor: number | null): string {
  return valor === null ? '—' : `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

/** ISO → `dd/mm/aaaa hh:mm` no fuso de Belém. */
export function formatarDataHoraBelem(iso: string): string {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Belem',
  }).formatToParts(new Date(iso));
  const p = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((x) => x.type === tipo)?.value ?? '';
  return `${p('day')}/${p('month')}/${p('year')} ${p('hour')}:${p('minute')}`;
}

/** Nome do arquivo do PDF: tudo que não for letra, dígito ou hífen no número vira `-` (AC-16). */
export function nomeDoArquivoPdf(numero: string, mes: string): string {
  return `relatorio-contrato-${numero.replace(/[^A-Za-z0-9-]/g, '-')}-${mes}.pdf`;
}
