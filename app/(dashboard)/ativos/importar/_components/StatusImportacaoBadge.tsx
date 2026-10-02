import { cn } from '@/lib/utils';
import {
  IMPORTACAO_STATUS_LABELS,
  type ImportacaoStatus,
} from '@/shared/ativos/importacao.constants';

const COR: Record<ImportacaoStatus, string> = {
  pendente:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  aplicada:
    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  descartada: 'border-border bg-muted text-muted-foreground',
};

export function StatusImportacaoBadge({ status }: { status: ImportacaoStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        COR[status],
      )}
    >
      {IMPORTACAO_STATUS_LABELS[status]}
    </span>
  );
}
