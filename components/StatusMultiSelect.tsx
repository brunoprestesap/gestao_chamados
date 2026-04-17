'use client';

import { ChevronsUpDown, X } from 'lucide-react';
import { useCallback } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  CHAMADO_STATUS_LABELS,
  CHAMADO_STATUSES,
  type ChamadoStatus,
} from '@/shared/chamados/chamado.constants';

interface StatusMultiSelectProps {
  value: ChamadoStatus[];
  onValueChange: (v: ChamadoStatus[]) => void;
  className?: string;
}

export function StatusMultiSelect({ value, onValueChange, className }: StatusMultiSelectProps) {
  const toggle = useCallback(
    (status: ChamadoStatus) => {
      const next = value.includes(status)
        ? value.filter((s) => s !== status)
        : [...value, status];
      // If all selected, reset to empty (= all)
      onValueChange(next.length === CHAMADO_STATUSES.length ? [] : next);
    },
    [value, onValueChange],
  );

  const clear = useCallback(() => onValueChange([]), [onValueChange]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-11 justify-between rounded-xl font-normal',
            value.length === 0 && 'text-muted-foreground',
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
            {value.length === 0 && 'Todos os status'}
            {value.length === 1 && (
              <Badge variant="secondary" className="max-w-[160px] truncate text-xs font-normal">
                {CHAMADO_STATUS_LABELS[value[0]]}
              </Badge>
            )}
            {value.length === 2 &&
              value.map((s) => (
                <Badge
                  key={s}
                  variant="secondary"
                  className="max-w-[90px] truncate text-xs font-normal"
                >
                  {CHAMADO_STATUS_LABELS[s]}
                </Badge>
              ))}
            {value.length > 2 && (
              <Badge variant="secondary" className="text-xs font-normal">
                {value.length} status
              </Badge>
            )}
          </span>
          <ChevronsUpDown className="ml-1 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[260px] p-0">
        {/* Header with clear button */}
        {value.length > 0 && (
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              {value.length} selecionado{value.length > 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3" />
              Limpar
            </button>
          </div>
        )}

        {/* Checkbox list */}
        <div className="max-h-[min(360px,var(--radix-popover-content-available-height,360px))] overflow-y-auto p-1.5">
          {CHAMADO_STATUSES.map((s) => (
            <label
              key={s}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-accent"
            >
              <Checkbox
                checked={value.includes(s)}
                onCheckedChange={() => toggle(s)}
              />
              {CHAMADO_STATUS_LABELS[s]}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
