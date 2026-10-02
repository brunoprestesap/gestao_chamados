import { PREFIXO_PROVISORIO } from '@/shared/vistoria/vistoria.constants';

/**
 * Identificadores gerados no aparelho (spec 0012, parte 1). `crypto.randomUUID`
 * só existe em contexto seguro, e a produção ainda está em HTTP; por isso o
 * UUID v4 é montado à mão sobre `crypto.getRandomValues`, que existe sempre.
 */
export function gerarClientOpId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // versão 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Sem letras e dígitos que se confundem (0 e O, 1 e I) ao ler a tela em campo. */
const ALFABETO_PROVISORIO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Código provisório do interno cadastrado sem sinal (AC-12): `PROV-` mais 6
 * caracteres. Só para a tela; o servidor gera o `MNT-####` definitivo.
 */
export function gerarCodigoProvisorio(): string {
  const b = crypto.getRandomValues(new Uint8Array(6));
  const sufixo = Array.from(b, (x) => ALFABETO_PROVISORIO[x % ALFABETO_PROVISORIO.length]).join('');
  return `${PREFIXO_PROVISORIO}${sufixo}`;
}
