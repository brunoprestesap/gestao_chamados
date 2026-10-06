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

/** Palavras que, logo antes de um número, dizem que ele é o código do equipamento. */
const PALAVRAS_DE_CODIGO = 'tombamento|tombo|patrimonio|etiqueta|codigo';

// `MNT-` com dígitos, em qualquer lugar; ou um número de quatro dígitos ou
// mais logo depois de uma das palavras, com `nº`, `n.`, `:` ou `#` no meio.
const RE_INTERNO = /\bmnt-\d+(?!\d)/g;
const RE_COM_PALAVRA = new RegExp(
  String.raw`\b(?:${PALAVRAS_DE_CODIGO})\b(?:\s*(?:n\s*[º°]|n\.|:|#))*\s*(\d{4,})(?!\d)`,
  'g',
);

/**
 * Os códigos de ativo citados num relato (spec 0014, AC-1), já normalizados,
 * na ordem em que aparecem e sem repetição. Número solto, sem uma das
 * palavras antes, não conta (`ramal 11997` não é tombamento). Não confere no
 * banco: quem chama só aceita o código que existir e puder receber chamado.
 */
export function codigosNoTexto(texto: string): string[] {
  // Sem acento e em minúsculas; os índices continuam valendo para a ordem,
  // porque as duas buscas rodam sobre o mesmo texto já normalizado.
  const limpo = texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const achados: { indice: number; codigo: string }[] = [];
  for (const m of limpo.matchAll(RE_INTERNO)) {
    achados.push({ indice: m.index, codigo: normalizarCodigo(m[0]) });
  }
  for (const m of limpo.matchAll(RE_COM_PALAVRA)) {
    achados.push({ indice: m.index, codigo: normalizarCodigo(m[1]!) });
  }
  achados.sort((a, b) => a.indice - b.indice);

  return [...new Set(achados.map((a) => a.codigo))];
}
