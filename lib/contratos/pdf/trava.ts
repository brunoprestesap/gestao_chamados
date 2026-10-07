import 'server-only';

/**
 * Um PDF por vez no processo (spec 0016, AC-16): o render ocupa a CPU do
 * único processo do Next. Vale enquanto o Next roda em uma instância, como os
 * limites de `lib/llm`.
 */
let ocupada = false;

/** Pega a trava; `false` quando outra geração está em curso. */
export function tentarPegarTrava(): boolean {
  if (ocupada) return false;
  ocupada = true;
  return true;
}

export function soltarTrava(): void {
  ocupada = false;
}
