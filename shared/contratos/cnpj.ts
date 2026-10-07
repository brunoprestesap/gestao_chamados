/**
 * CNPJ do contrato (spec 0016, AC-2): aceito com ou sem máscara, gravado só
 * com os 14 dígitos e conferido pelos dígitos verificadores, sem consulta
 * externa. Pega erro de digitação num documento que vai para o processo.
 */

/** Só os dígitos do texto digitado. */
export function somenteDigitosCnpj(texto: string): string {
  return texto.replace(/\D/g, '');
}

function digitoVerificador(base: string): number {
  const pesos =
    base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = base.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i]!, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** 14 dígitos com os dois verificadores certos; recusa a sequência repetida (`00000000000000`). */
export function cnpjValido(texto: string): boolean {
  const d = somenteDigitosCnpj(texto);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv1 = digitoVerificador(d.slice(0, 12));
  const dv2 = digitoVerificador(d.slice(0, 12) + dv1);
  return d.endsWith(`${dv1}${dv2}`);
}

/** `00.000.000/0000-00`; texto que não tem 14 dígitos volta como veio. */
export function formatarCnpj(texto: string): string {
  const d = somenteDigitosCnpj(texto);
  if (d.length !== 14) return texto;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
