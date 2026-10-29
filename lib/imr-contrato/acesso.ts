import 'server-only';

import { papeisDe } from '@/lib/material/papeis';
import type { PapelImr } from '@/shared/imr-contrato/imr-contrato.constants';

/**
 * O papel com que alguém escreve no IMR do contrato (spec 0023): `fiscal` se
 * tiver, senão `gestor`, pela designação vigente. Admin sem designação só lê
 * (AC-14): devolve null.
 */
export async function papelNoImr(userId: string, role: string): Promise<PapelImr | null> {
  const papeis = await papeisDe(userId, role);
  if (papeis.tem('fiscal')) return 'fiscal';
  if (papeis.tem('gestor')) return 'gestor';
  return null;
}
