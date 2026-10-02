import type { PacoteVistoria } from '@/shared/vistoria/vistoria.schemas';

import { abrirBanco, type PacoteGuardado } from './banco';

/** O pacote fica guardado por pessoa; sair do sistema apaga o dela (AC-15). */

export async function salvarPacote(userId: string, pacote: PacoteVistoria): Promise<void> {
  const db = await abrirBanco();
  await db.put('pacote', { userId, pacote, salvoEm: new Date().toISOString() });
}

export async function lerPacote(userId: string): Promise<PacoteGuardado | undefined> {
  const db = await abrirBanco();
  return db.get('pacote', userId);
}

export async function apagarPacote(userId: string): Promise<void> {
  const db = await abrirBanco();
  await db.delete('pacote', userId);
}
