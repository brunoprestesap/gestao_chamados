export function normalizeTypeName(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function buildTypeIdByTipo(types: { id: string; name: string }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of types) {
    const n = normalizeTypeName(t.name);
    if (n.includes('manutencao') && n.includes('predial')) m.set('Manutenção Predial', t.id);
    if (
      n.includes('ar-condicionado') ||
      n.includes('ar condicionado') ||
      n.includes('arcondicionado')
    )
      m.set('Ar-Condicionado', t.id);
  }
  return m;
}

export const NATUREZA_DESCRIPTIONS: Record<'Padrão' | 'Urgente', string> = {
  Padrão: 'Atendimento em horário comercial (08h-18h, seg-sex). Prazo: 3 dias úteis.',
  Urgente: 'Atendimento a qualquer horário. Apenas Fiscal/Gestor pode autorizar.',
};

export const FORM_GRID_CLASS = 'grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5';
export const FORM_GRID_GRAU_CLASS = 'grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6';
export const FORM_ITEM_MIN_CLASS = 'min-w-0';
export const SELECT_TRIGGER_FULL_CLASS = 'w-full min-w-0';
export const GRAU_SELECT_TRIGGER_CLASS =
  'w-full min-w-0 overflow-hidden [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate';

export const CARD_BASE_CLASS =
  'rounded-lg border p-3 text-left transition hover:bg-muted/50 active:scale-[0.99] sm:p-4';
export const CARD_SELECTED_CLASS = 'border-primary bg-primary/5 ring-2 ring-primary/30';
export const CARD_UNSELECTED_CLASS = 'border-input';

export function optionalSelectValue(value: string): string {
  return value || 'none';
}

export function optionalSelectOnChange(onChange: (v: string) => void): (v: string) => void {
  return (v) => onChange(v === 'none' ? '' : v);
}
