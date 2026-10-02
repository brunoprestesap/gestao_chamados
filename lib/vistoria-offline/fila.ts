import { DIAS_GUARDA_RESOLVIDAS, type EstadoOperacao } from '@/shared/vistoria/vistoria.constants';
import type { ResultadoOperacao } from '@/shared/vistoria/vistoria.schemas';

import { abrirBanco, type OperacaoGuardada } from './banco';

/**
 * A fila de operações no aparelho (spec 0012, AC-6 e AC-15). Toda leitura é
 * filtrada pelo `userId`: outra pessoa no mesmo aparelho não vê nem envia a
 * fila alheia.
 */

const ESTADO_DO_RESULTADO: Record<ResultadoOperacao['estado'], EstadoOperacao> = {
  aceita: 'enviada',
  ja_conferido: 'ja_conferido',
  recusada: 'recusada',
};

export async function guardarOperacao(op: OperacaoGuardada): Promise<void> {
  const db = await abrirBanco();
  await db.put('operacoes', op);
}

/** As operações da pessoa, em ordem de criação. */
export async function listarOperacoes(userId: string): Promise<OperacaoGuardada[]> {
  const db = await abrirBanco();
  const todas = await db.getAllFromIndex('operacoes', 'userId', userId);
  return todas.sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
}

export async function listarPendentes(userId: string): Promise<OperacaoGuardada[]> {
  return (await listarOperacoes(userId)).filter((o) => o.estado === 'pendente');
}

export async function contarPendentes(userId: string): Promise<number> {
  return (await listarPendentes(userId)).length;
}

/** Grava a resposta do servidor em cada operação. Só mexe em operações da própria pessoa. */
export async function registrarResultados(
  userId: string,
  resultados: ResultadoOperacao[],
): Promise<void> {
  const db = await abrirBanco();
  const tx = db.transaction('operacoes', 'readwrite');
  const agora = new Date().toISOString();
  for (const r of resultados) {
    const op = await tx.store.get(r.clientOpId);
    if (!op || op.userId !== userId) continue;
    await tx.store.put({
      ...op,
      estado: ESTADO_DO_RESULTADO[r.estado],
      resultado: r,
      resolvidaEm: agora,
    });
  }
  await tx.done;
}

/** A pessoa descarta uma operação que não quer mais enviar (em geral, uma recusada). */
export async function descartarOperacao(userId: string, clientOpId: string): Promise<void> {
  const db = await abrirBanco();
  const op = await db.get('operacoes', clientOpId);
  if (op && op.userId === userId) await db.delete('operacoes', clientOpId);
}

/** Enviadas e "já conferido" saem depois de 7 dias; pendentes e recusadas ficam. */
export async function limparResolvidasAntigas(userId: string, agora = new Date()): Promise<void> {
  const limite = agora.getTime() - DIAS_GUARDA_RESOLVIDAS * 86_400_000;
  const db = await abrirBanco();
  for (const op of await db.getAllFromIndex('operacoes', 'userId', userId)) {
    const resolvida = op.estado === 'enviada' || op.estado === 'ja_conferido';
    if (resolvida && op.resolvidaEm && new Date(op.resolvidaEm).getTime() < limite) {
      await db.delete('operacoes', op.clientOpId);
    }
  }
}
