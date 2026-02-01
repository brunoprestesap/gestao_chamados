/**
 * Gera o prefixo XXXX para preview no frontend.
 * Deve ser igual à lógica do backend (lib/service-code.ts).
 */
export function getCodePrefixFromSubtypeName(name: string): string {
  const normalized = String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);
  return normalized.padEnd(4, 'X').slice(0, 4);
}
