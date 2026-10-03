import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SituacaoCalculada } from '@/shared/ativos/documento.constants';

const CORES: Record<SituacaoCalculada['tipo'], string> = {
  em_dia:
    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200',
  vence_em:
    'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200',
  vence_hoje:
    'border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-200',
  vencido:
    'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200',
  sem_validade: 'border-border bg-muted/40 text-muted-foreground',
};

/** Situação calculada no servidor (em dia, vence em N dias, vence hoje, vencido, sem validade). */
export function SituacaoDocumentoBadge({
  situacao,
  texto,
}: {
  situacao: SituacaoCalculada;
  texto: string;
}) {
  return (
    <Badge variant="outline" className={cn('rounded-full whitespace-nowrap', CORES[situacao.tipo])}>
      {texto}
    </Badge>
  );
}
