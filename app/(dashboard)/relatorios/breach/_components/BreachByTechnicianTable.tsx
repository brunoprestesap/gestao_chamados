'use client';

import type { BreachByTechnician } from '@/lib/sla-breach-report';
import { cn } from '@/lib/utils';

function formatDelay(minutes: number | null): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function rateColor(rate: number): string {
  if (rate > 30) return 'text-red-600 dark:text-red-400';
  if (rate > 15) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

function barColor(rate: number): string {
  if (rate > 30) return 'bg-red-500';
  if (rate > 15) return 'bg-amber-500';
  return 'bg-emerald-500';
}

export function BreachByTechnicianTable({ data }: { data: BreachByTechnician[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhum breach associado a técnicos no período.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/30 text-xs text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium">Técnico</th>
            <th className="px-3 py-2.5 text-right font-medium">Total</th>
            <th className="px-3 py-2.5 text-right font-medium">Resp.</th>
            <th className="px-3 py-2.5 text-right font-medium">Resol.</th>
            <th className="px-3 py-2.5 text-right font-medium">Atraso Médio</th>
            <th className="px-3 py-2.5 text-right font-medium">Taxa</th>
            <th className="hidden w-24 px-3 py-2.5 font-medium md:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {data.map((t) => (
            <tr
              key={t.technicianId}
              className={cn(
                'transition-colors hover:bg-accent/40',
                t.breachRate > 30 && 'bg-red-50/50 dark:bg-red-900/10',
              )}
            >
              <td className="px-4 py-3 font-medium">{t.technicianName}</td>
              <td className="px-3 py-3 text-right tabular-nums">{t.totalChamados}</td>
              <td className="px-3 py-3 text-right tabular-nums">{t.responseBreaches}</td>
              <td className="px-3 py-3 text-right tabular-nums">{t.resolutionBreaches}</td>
              <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                {formatDelay(t.avgDelayMinutes)}
              </td>
              <td
                className={cn(
                  'px-3 py-3 text-right font-semibold tabular-nums',
                  rateColor(t.breachRate),
                )}
              >
                {t.breachRate}%
              </td>
              <td className="hidden px-3 py-3 md:table-cell">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                  <div
                    className={cn('h-full rounded-full transition-all', barColor(t.breachRate))}
                    style={{ width: `${Math.min(100, t.breachRate)}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
