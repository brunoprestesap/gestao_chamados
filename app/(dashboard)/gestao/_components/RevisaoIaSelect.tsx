'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  REVISAO_IA_RECORTE_LABELS,
  REVISAO_IA_RECORTES,
  type RevisaoIaRecorte,
} from '@/shared/chamados/revisao-ia.constants';

const TODOS = 'todos';

interface RevisaoIaSelectProps {
  value: RevisaoIaRecorte | null;
  onValueChange: (v: RevisaoIaRecorte | null) => void;
  className?: string;
}

/**
 * O recorte "Revisão da IA" da lista de Gestão (spec 0009, AC-1 a AC-3): um
 * `Select` só, "Todos" mais os quatro recortes.
 */
export function RevisaoIaSelect({ value, onValueChange, className }: RevisaoIaSelectProps) {
  return (
    <Select
      value={value ?? TODOS}
      onValueChange={(v) => onValueChange(v === TODOS ? null : (v as RevisaoIaRecorte))}
    >
      <SelectTrigger
        className={cn('h-11 w-full justify-between rounded-xl font-normal', className)}
        aria-label="Revisão da IA"
      >
        <SelectValue placeholder="Revisão da IA" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>Todos</SelectItem>
        {REVISAO_IA_RECORTES.map((recorte) => (
          <SelectItem key={recorte} value={recorte}>
            {REVISAO_IA_RECORTE_LABELS[recorte]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
