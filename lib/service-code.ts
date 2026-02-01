/**
 * Gera o prefixo XXXX a partir do nome do subtipo.
 * - Remove acentos
 * - Converte para maiúsculo
 * - Pega os primeiros 4 caracteres (apenas letras/números)
 */
export function getCodePrefixFromSubtypeName(name: string): string {
  const normalized = String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') // apenas letras e números
    .slice(0, 4);

  // Se tiver menos de 4 caracteres, preenche com X (fallback)
  return normalized.padEnd(4, 'X').slice(0, 4);
}

/**
 * Extrai o número sequencial de um código no formato XXXX-NNNN
 */
function extractSequential(code: string): number {
  const match = code.match(/-\d+$/);
  return match ? parseInt(match[0].slice(1), 10) : 0;
}

/**
 * Formata o número com 4 dígitos (zero à esquerda)
 */
export function formatSequential(n: number): string {
  return String(n).padStart(4, '0');
}

/**
 * Monta o código final XXXX-NNNN
 */
export function buildServiceCode(prefix: string, sequential: number): string {
  return `${prefix}-${formatSequential(sequential)}`;
}

export { extractSequential };
