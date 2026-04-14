'use client';

import { Package } from 'lucide-react';

import { useInstitutionalTimezone } from '@/components/config/expediente-provider';
import type { MaterialObservationNormalized } from '@/lib/dto-normalizers';
import { formatDateTime } from '@/lib/utils';

interface Props {
  observations: MaterialObservationNormalized[];
}

export function MaterialObservationsList({ observations }: Props) {
  const timezone = useInstitutionalTimezone();
  const tzOpt = { timeZone: timezone };

  if (observations.length === 0) return null;

  return (
    <div className="space-y-3">
      {observations.map((obs, idx) => (
        <div
          key={obs._id ?? String(idx)}
          className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-800/50 dark:bg-amber-950/30"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
              <Package className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                {obs.description}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium">{obs.createdByName || 'Técnico'}</span>{' '}
                &middot; {formatDateTime(obs.createdAt, tzOpt)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
