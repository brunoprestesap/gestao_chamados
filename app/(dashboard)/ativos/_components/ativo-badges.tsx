import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  ATIVO_STATUS_LABELS,
  type AtivoStatus,
  type Criticidade,
  CRITICIDADE_LABELS,
  STATUS_CADASTRO_LABELS,
  type StatusCadastro,
} from '@/shared/ativos/ativo.constants';

const STATUS_CLASSE: Record<AtivoStatus, string> = {
  em_operacao:
    'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800',
  em_manutencao:
    'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/40 dark:text-violet-200 dark:border-violet-800',
  inoperante:
    'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-800',
  aguardando_baixa:
    'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800',
  baixado:
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700',
};

const CADASTRO_CLASSE: Record<StatusCadastro, string> = {
  importado:
    'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-200 dark:border-sky-800',
  em_vistoria:
    'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800',
  validado:
    'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800',
};

const CRITICIDADE_CLASSE: Record<Criticidade, string> = {
  baixa: 'border-border text-muted-foreground',
  media: 'border-sky-300 text-sky-800 dark:border-sky-700 dark:text-sky-200',
  alta: 'border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-200',
  critica: 'border-red-300 text-red-800 dark:border-red-700 dark:text-red-200',
};

export function StatusAtivoBadge({ status }: { status: AtivoStatus }) {
  return (
    <Badge variant="outline" className={cn('rounded-full', STATUS_CLASSE[status])}>
      {ATIVO_STATUS_LABELS[status]}
    </Badge>
  );
}

export function StatusCadastroBadge({ status }: { status: StatusCadastro }) {
  return (
    <Badge variant="outline" className={cn('rounded-full', CADASTRO_CLASSE[status])}>
      {STATUS_CADASTRO_LABELS[status]}
    </Badge>
  );
}

export function CriticidadeBadge({ criticidade }: { criticidade: Criticidade }) {
  return (
    <Badge variant="outline" className={cn('rounded-full', CRITICIDADE_CLASSE[criticidade])}>
      Criticidade {CRITICIDADE_LABELS[criticidade].toLowerCase()}
    </Badge>
  );
}
