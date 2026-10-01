/** Resultado das operações de escrita do módulo de ativos: nunca lança para a action. */
export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Erro de índice único (E11000) do MongoDB. */
export function ehChaveDuplicada(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: number }).code === 11000;
}

export function falha(error: string): { ok: false; error: string } {
  return { ok: false, error };
}
