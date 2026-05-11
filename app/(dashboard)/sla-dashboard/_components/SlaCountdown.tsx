'use client';

import { Pause } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

interface Props {
  /** Tempo restante em ms (positivo = no prazo, valor da API já vem ajustado). */
  remainingMs: number;
  /** Percentual do SLA consumido (0-100+). */
  percentUsed: number;
  /** Status do SLA calculado no server. */
  slaStatus: 'no_prazo' | 'proximo_vencimento' | 'atrasado';
  /** Se o SLA está pausado. */
  isPaused?: boolean;
}

function formatCountdown(ms: number, isOverdue: boolean): string {
  const abs = Math.abs(ms);
  const totalMin = Math.round(abs / 60_000);

  if (totalMin < 60) {
    return `${isOverdue ? '-' : ''}${totalMin}min`;
  }

  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const h = hours % 24;
    const base = h > 0 ? `${days}d ${h}h` : `${days}d`;
    return `${isOverdue ? '-' : ''}${base}`;
  }

  const base = mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  return `${isOverdue ? '-' : ''}${base}`;
}

export function SlaCountdown({ remainingMs, slaStatus, isPaused }: Props) {
  const [localRemaining, setLocalRemaining] = useState(remainingMs);

  // Reseta quando prop muda (novo fetch)
  useEffect(() => {
    setLocalRemaining(remainingMs);
  }, [remainingMs]);

  // Decrementa localmente a cada 60s entre polls
  useEffect(() => {
    if (isPaused) return;
    const id = setInterval(() => {
      setLocalRemaining((prev) =>
        slaStatus === 'atrasado' ? prev - 60_000 : Math.max(0, prev - 60_000),
      );
    }, 60_000);
    return () => clearInterval(id);
  }, [isPaused, slaStatus]);

  const isOverdue = slaStatus === 'atrasado';
  const text = formatCountdown(localRemaining, isOverdue);

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          'text-sm font-semibold tabular-nums',
          slaStatus === 'no_prazo' && 'text-emerald-600 dark:text-emerald-400',
          slaStatus === 'proximo_vencimento' && 'text-amber-600 dark:text-amber-400',
          slaStatus === 'atrasado' && 'animate-pulse text-red-600 dark:text-red-400',
        )}
      >
        {text}
      </span>
      {isPaused && <Pause className="h-3.5 w-3.5 text-muted-foreground" aria-label="SLA pausado" />}
    </div>
  );
}

/** Barra de progresso visual do SLA consumido. */
export function SlaProgressBar({
  percentUsed,
  slaStatus,
}: {
  percentUsed: number;
  slaStatus: 'no_prazo' | 'proximo_vencimento' | 'atrasado';
}) {
  const clamped = Math.min(100, Math.max(0, percentUsed));

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
      <div
        className={cn(
          'h-full rounded-full transition-all duration-500',
          slaStatus === 'no_prazo' && 'bg-emerald-500',
          slaStatus === 'proximo_vencimento' && 'bg-amber-500',
          slaStatus === 'atrasado' && 'bg-red-500',
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
