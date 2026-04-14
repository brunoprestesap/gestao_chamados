/**
 * Normalizadores de DTO reutilizáveis entre rotas de API.
 * Centraliza conversões Mongoose → JSON para evitar duplicação.
 */

// ---------------------------------------------------------------------------
// Material Observations
// ---------------------------------------------------------------------------

export type MaterialObservationNormalized = {
  _id: string | null;
  description: string;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
};

export function normalizeMaterialObservations(
  raw: unknown,
): MaterialObservationNormalized[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(
    (o: {
      _id?: unknown;
      description?: string;
      createdByUserId?: unknown;
      createdByName?: string;
      createdAt?: Date;
    }) => ({
      _id: o._id ? String(o._id) : null,
      description: o.description ?? '',
      createdByUserId: o.createdByUserId ? String(o.createdByUserId) : '',
      createdByName: o.createdByName ?? '',
      createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : '',
    }),
  );
}
