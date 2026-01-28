import {
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  Loader2,
  type LucideIcon,
  XCircle,
} from 'lucide-react';

import {
  CHAMADO_STATUSES,
  CHAMADO_STATUS_LABELS,
  type ChamadoStatus,
} from '@/shared/chamados/chamado.constants';

export { CHAMADO_STATUS_LABELS };
export type { ChamadoStatus };

export const STATUS_OPTIONS: { value: 'all' | ChamadoStatus; label: string }[] = [
  { value: 'all', label: 'Todos os status' },
  ...CHAMADO_STATUSES.map((s) => ({ value: s, label: CHAMADO_STATUS_LABELS[s] })),
];

export const STATUS_ICONS: Record<ChamadoStatus, LucideIcon> = {
  aberto: CircleDot,
  emvalidacao: ClipboardCheck,
  'em atendimento': Loader2,
  fechado: XCircle,
  concluído: CheckCircle2,
  cancelado: XCircle,
};

export const STATUS_ACCENT: Record<ChamadoStatus, string> = {
  aberto: 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20',
  emvalidacao: 'border-l-sky-500 bg-sky-50/50 dark:bg-sky-950/20',
  'em atendimento': 'border-l-violet-500 bg-violet-50/50 dark:bg-violet-950/20',
  fechado: 'border-l-slate-400 bg-slate-50/50 dark:bg-slate-900/30',
  concluído: 'border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20',
  cancelado: 'border-l-red-500 bg-red-50/50 dark:bg-red-950/20',
};

export const STATUS_BADGE: Record<ChamadoStatus, string> = {
  aberto:
    'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800',
  emvalidacao:
    'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-200 dark:border-sky-800',
  'em atendimento':
    'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/40 dark:text-violet-200 dark:border-violet-800',
  fechado:
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700',
  concluído:
    'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800',
  cancelado:
    'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-800',
};
