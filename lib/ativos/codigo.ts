import { PREFIXO_CODIGO_INTERNO } from '../../shared/ativos/ativo.constants';

/**
 * Normaliza o código lido ou digitado (spec 0011, AC-11): tira espaços, passa
 * para maiúsculas e, quando só tem dígitos, tira os zeros à esquerda
 * (`' 00011997 '` vira `11997`). `'0000'` vira `'0'`, não texto vazio.
 *
 * Sem `server-only`: o cliente também normaliza (o atalho "Cadastrar este
 * ativo" monta a URL com o código já normalizado). Imports relativos, sem o
 * alias `@/`, porque a carga roda pelo `tsx` fora do Next.
 */
export function normalizarCodigo(entrada: string): string {
  const limpo = entrada.replace(/\s+/g, '').toUpperCase();
  if (/^\d+$/.test(limpo)) {
    return limpo.replace(/^0+(?=\d)/, '');
  }
  return limpo;
}

/** O código interno `MNT-####` (pelo menos quatro dígitos). */
export function formatarCodigoInterno(seq: number): string {
  return `${PREFIXO_CODIGO_INTERNO}${String(seq).padStart(4, '0')}`;
}

export function ehCodigoInterno(codigo: string): boolean {
  return normalizarCodigo(codigo).startsWith(PREFIXO_CODIGO_INTERNO);
}
