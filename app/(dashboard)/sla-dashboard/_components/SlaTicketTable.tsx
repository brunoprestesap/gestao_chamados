'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { SlaCountdown, SlaProgressBar } from './SlaCountdown';

interface SlaDashboardItem {
  _id: string;
  ticket_number: string;
  titulo: string;
  status: string;
  tipoServico: string;
  finalPriority: string | null;
  assignedToUserId: string | null;
  assignedToUserName: string | null;
  remainingMs: number;
  totalMs: number;
  percentUsed: number;
  slaStatus: 'no_prazo' | 'proximo_vencimento' | 'atrasado';
  responseDueAt: string | null;
  resolutionDueAt: string | null;
  isPaused: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  validado: 'Validado',
  'em atendimento': 'Em atendimento',
  aguardando_solicitante: 'Aguardando solicitante',
  aguardando_terceiros: 'Aguardando terceiros',
};

const STATUS_COLORS: Record<string, string> = {
  validado:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  'em atendimento':
    'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
  aguardando_solicitante:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  aguardando_terceiros:
    'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
};

const PRIORITY_COLORS: Record<string, string> = {
  EMERGENCIAL:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-200',
  ALTA: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  NORMAL:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  BAIXA:
    'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-200',
};

const SLA_FILTER_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'atrasado', label: 'Atrasados' },
  { value: 'proximo_vencimento', label: 'Risco' },
  { value: 'no_prazo', label: 'No prazo' },
] as const;

export function SlaTicketTable({ items }: { items: SlaDashboardItem[] }) {
  const [filterSla, setFilterSla] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');

  const priorities = useMemo(() => {
    const set = new Set(items.map((i) => i.finalPriority).filter(Boolean) as string[]);
    return ['all', ...Array.from(set)];
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (filterSla !== 'all' && item.slaStatus !== filterSla) return false;
      if (filterPriority !== 'all' && item.finalPriority !== filterPriority) return false;
      return true;
    });
  }, [items, filterSla, filterPriority]);

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm transition-all duration-200 hover:shadow-lg hover:shadow-black/[0.04]">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-60 transition-opacity group-hover:opacity-100" />

      {/* Header + filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-5 pb-3 pt-5">
        <p className="text-[13px] font-medium text-muted-foreground">
          Chamados com SLA Ativo{' '}
          <span className="tabular-nums text-foreground">({filtered.length})</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {/* SLA Status filter */}
          <div className="flex items-center gap-1 rounded-lg border border-border/50 bg-muted/30 p-0.5">
            {SLA_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilterSla(opt.value)}
                className={cn(
                  'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                  filterSla === opt.value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Priority filter */}
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="rounded-lg border border-border/50 bg-muted/30 px-2 py-1 text-xs font-medium text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {priorities.map((p) => (
              <option key={p} value={p}>
                {p === 'all' ? 'Prioridade' : p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/30 text-xs text-muted-foreground">
              <th className="px-5 py-2.5 text-left font-medium">Chamado</th>
              <th className="px-3 py-2.5 text-left font-medium">Status</th>
              <th className="px-3 py-2.5 text-left font-medium">Prioridade</th>
              <th className="px-3 py-2.5 text-left font-medium">Tipo</th>
              <th className="px-3 py-2.5 text-left font-medium">Tempo</th>
              <th className="hidden px-3 py-2.5 text-left font-medium md:table-cell">Progresso</th>
              <th className="hidden px-3 py-2.5 text-left font-medium lg:table-cell">Técnico</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {filtered.map((item) => (
              <tr
                key={item._id}
                className="transition-colors hover:bg-accent/40"
              >
                <td className="px-5 py-3">
                  <span className="text-sm font-semibold text-primary">
                    {item.ticket_number}
                  </span>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {item.titulo}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px]',
                      STATUS_COLORS[item.status] ?? '',
                    )}
                  >
                    {STATUS_LABELS[item.status] ?? item.status}
                  </Badge>
                </td>
                <td className="px-3 py-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px]',
                      PRIORITY_COLORS[item.finalPriority ?? ''] ?? '',
                    )}
                  >
                    {item.finalPriority ?? '-'}
                  </Badge>
                </td>
                <td className="px-3 py-3">
                  <span className="text-xs text-muted-foreground">{item.tipoServico}</span>
                </td>
                <td className="px-3 py-3">
                  <SlaCountdown
                    remainingMs={item.remainingMs}
                    percentUsed={item.percentUsed}
                    slaStatus={item.slaStatus}
                    isPaused={item.isPaused}
                  />
                </td>
                <td className="hidden w-28 px-3 py-3 md:table-cell">
                  <SlaProgressBar
                    percentUsed={item.percentUsed}
                    slaStatus={item.slaStatus}
                  />
                </td>
                <td className="hidden px-3 py-3 lg:table-cell">
                  <span className="text-xs text-muted-foreground">
                    {item.assignedToUserName ?? '—'}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-muted-foreground">
                  Nenhum chamado encontrado com os filtros selecionados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
