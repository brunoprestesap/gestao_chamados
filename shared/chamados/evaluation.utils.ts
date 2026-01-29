/**
 * Avaliação é considerada "real" somente quando há rating 1..5.
 * Objeto vazio, { notes: '' } ou rating inválido = não avaliado.
 */

export type EvaluationLike =
  | {
      rating?: number | null;
      notes?: string | null;
      createdAt?: unknown;
      createdByUserId?: unknown;
    }
  | null
  | undefined;

export function hasValidEvaluation(e: EvaluationLike): boolean {
  const r = e?.rating;
  return typeof r === 'number' && r >= 1 && r <= 5;
}
