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

export function normalizeMaterialObservations(raw: unknown): MaterialObservationNormalized[] {
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

/** Item de material fora de cotação (spec 0018): só sai em endpoint de gestão. */
export type MaterialForaCotacaoNormalized = {
  _id: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  criadoPorUserId: string;
  criadoPorNome: string;
  criadoEm: string;
};

export function normalizeMateriaisForaCotacao(
  raw: unknown,
  nomes: ReadonlyMap<string, string>,
): MaterialForaCotacaoNormalized[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(
    (i: {
      _id?: unknown;
      descricao?: string;
      quantidade?: number;
      valorUnitario?: number;
      criadoPorUserId?: unknown;
      criadoEm?: Date;
    }) => ({
      _id: String(i._id),
      descricao: i.descricao ?? '',
      quantidade: i.quantidade ?? 0,
      valorUnitario: i.valorUnitario ?? 0,
      criadoPorUserId: i.criadoPorUserId ? String(i.criadoPorUserId) : '',
      criadoPorNome: i.criadoPorUserId ? (nomes.get(String(i.criadoPorUserId)) ?? '') : '',
      criadoEm: i.criadoEm ? new Date(i.criadoEm).toISOString() : '',
    }),
  );
}
