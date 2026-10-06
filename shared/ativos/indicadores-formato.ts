/**
 * Tempo dos indicadores de equipamento (spec 0014), na mesma escala do IMR:
 * horas abaixo de um dia, dias acima. Ausente vira "—", nunca zero (AC-19).
 */
export function formatarTempoIndicador(ms: number | null): string {
  if (ms === null) return '—';
  const horas = ms / (1000 * 60 * 60);
  if (horas >= 24) return `${Math.round((horas / 24) * 100) / 100} dia(s)`;
  return `${Math.round(horas * 100) / 100} hora(s)`;
}
