// Mock de next/cache para ambiente de testes unitários.
// Substitui next/cache via alias no vitest.config.ts para evitar o erro
// "Invariant: static generation store missing in revalidatePath"
// que ocorre quando next/cache é usado fora do runtime do Next.js.

export function revalidatePath(..._args: unknown[]): void {
  // no-op em testes
}

export function revalidateTag(..._args: unknown[]): void {
  // no-op em testes
}

export function unstable_cache<T>(fn: T): T {
  return fn;
}
