import { cn } from '@/lib/utils';
import type { SituacaoCotacao } from '@/shared/material/material.constants';
import { ROTULO_SITUACAO } from '@/shared/material/mensagens';

/**
 * O selo da situação (spec 0021, AC-1): o mesmo na fila, no detalhe, no
 * cartão e na trilha. Os pontos diferem também na claridade, não só no tom,
 * e o rótulo vem sempre escrito.
 */

const COR: Record<SituacaoCotacao, { fundo: string; ponto: string }> = {
  rascunho: {
    fundo: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-200',
    ponto: 'bg-slate-400',
  },
  enviada: {
    fundo: 'bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-200',
    ponto: 'bg-sky-500',
  },
  em_analise: {
    fundo: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200',
    ponto: 'bg-amber-400',
  },
  em_aprovacao: {
    fundo: 'bg-violet-100 text-violet-900 dark:bg-violet-500/15 dark:text-violet-200',
    ponto: 'bg-violet-600',
  },
  devolvida: {
    fundo: 'bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-200',
    ponto: 'bg-orange-500',
  },
  autorizada: {
    fundo: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-500/20 dark:text-indigo-200',
    ponto: 'bg-indigo-800 dark:bg-indigo-300',
  },
  executada: {
    fundo: 'bg-teal-100 text-teal-900 dark:bg-teal-500/15 dark:text-teal-200',
    ponto: 'bg-teal-500',
  },
  atestada: {
    fundo: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200',
    ponto: 'bg-emerald-700 dark:bg-emerald-300',
  },
  reprovada: {
    fundo: 'bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-200',
    ponto: 'bg-rose-700 dark:bg-rose-300',
  },
  cancelada: {
    fundo: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-500/15 dark:text-zinc-300',
    ponto: 'bg-zinc-300 dark:bg-zinc-500',
  },
};

export function SituacaoPill({
  situacao,
  className,
}: {
  situacao: SituacaoCotacao;
  className?: string;
}) {
  const cor = COR[situacao];
  return (
    <span
      data-situacao={situacao}
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap',
        cor.fundo,
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', cor.ponto)} />
      {ROTULO_SITUACAO[situacao]}
    </span>
  );
}
