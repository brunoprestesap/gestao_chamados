export type SubtypeOption = { id: string; name: string };
export type CatalogServiceOption = { id: string; code: string; name: string };

export async function fetchServiceTypes(): Promise<{ id: string; name: string }[]> {
  const res = await fetch('/api/catalog/types', { cache: 'no-store' });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => ({}))) as {
    items?: { _id?: string; id?: string; name: string }[];
  };
  return (data.items ?? []).map((t) => ({ id: String(t._id ?? t.id ?? ''), name: t.name }));
}

export async function fetchSubtypes(typeId: string): Promise<SubtypeOption[]> {
  const res = await fetch(`/api/catalog/subtypes?typeId=${typeId}`, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => ({}))) as {
    items?: { _id?: string; id?: string; name: string }[];
  };
  return (data.items ?? []).map((s) => ({ id: String(s._id ?? s.id ?? ''), name: s.name }));
}

export async function fetchCatalogServices(
  typeId: string,
  subtypeId?: string,
): Promise<CatalogServiceOption[]> {
  const params = new URLSearchParams({ typeId });
  if (subtypeId) params.set('subtypeId', subtypeId);
  const res = await fetch(`/api/catalog/services?${params}`, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => ({}))) as {
    items?: { _id?: string; id?: string; code: string; name: string }[];
  };
  return (data.items ?? []).map((s) => ({
    id: String(s._id ?? s.id ?? ''),
    code: s.code,
    name: s.name,
  }));
}
