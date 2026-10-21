/**
 * O endereço da fila (spec 0021, AC-3): aba, busca, "Só urgentes" e página
 * vão todos no `?`, para o filtro sobreviver ao recarregar. Página 1 e
 * filtros vazios ficam fora, para o endereço continuar curto.
 */
export function hrefFila(p: { aba: string; q?: string; urgente?: boolean; pagina?: number }) {
  const params = new URLSearchParams({ aba: p.aba });
  if (p.q) params.set('q', p.q);
  if (p.urgente) params.set('urgente', '1');
  if (p.pagina && p.pagina > 1) params.set('pagina', String(p.pagina));
  return `/cotacoes?${params.toString()}`;
}
