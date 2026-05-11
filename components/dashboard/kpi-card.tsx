import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export function KpiCard({
  title,
  value,
  helper,
  icon: Icon,
  accentClassName,
  valueClassName,
}: {
  title: string;
  value: string | number;
  helper?: string;
  icon: LucideIcon;
  accentClassName?: string;
  valueClassName?: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card p-5 shadow-sm transition-all duration-200 hover:shadow-lg hover:shadow-black/[0.04] hover:-translate-y-0.5">
      {/* Gradient accent stripe at top */}
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-60 transition-opacity group-hover:opacity-100',
          accentClassName,
        )}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
          <p className={cn('mt-2 text-2xl font-bold tracking-tight tabular-nums', valueClassName)}>
            {value}
          </p>
          {helper ? <p className="mt-1.5 text-xs text-muted-foreground/70">{helper}</p> : null}
        </div>

        <div
          className={cn(
            'grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted/60 text-muted-foreground transition-all duration-200 group-hover:scale-105 group-hover:bg-muted',
            accentClassName,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
