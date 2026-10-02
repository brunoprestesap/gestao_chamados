import { CircleSlash } from 'lucide-react';

import { cn } from '@/lib/utils';

/** Selo do ativo que sumiu do último export do SICAM (spec 0012, AC-4). */
export function SeloAusenteSicam({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-400',
        className,
      )}
    >
      <CircleSlash className="h-3 w-3" aria-hidden />
      Ausente do SICAM
    </span>
  );
}
