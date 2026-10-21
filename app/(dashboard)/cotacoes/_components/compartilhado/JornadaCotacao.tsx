import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  type DesvioJornada,
  type EtapaJornada,
  ETAPAS_JORNADA,
  posicaoNaJornada,
} from '@/shared/material/jornada';
import type { SituacaoCotacao } from '@/shared/material/material.constants';
import { ROTULO_SITUACAO } from '@/shared/material/mensagens';

/**
 * A jornada de 7 etapas da cotação (spec 0021). `mini` são barrinhas
 * decorativas ao lado do selo (a situação já vem escrita nele); `grande` é a
 * lista com a data de cada etapa vencida e o desvio na etapa em que ocorreu.
 */

const COR_DESVIO: Record<DesvioJornada, string> = {
  devolvida: 'bg-orange-500',
  reprovada: 'bg-rose-600',
  cancelada: 'bg-zinc-400',
};

const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Belem',
  });

export function JornadaCotacao({
  situacao,
  situacaoAnterior,
  variante = 'mini',
  datas,
  className,
}: {
  situacao: SituacaoCotacao;
  /** O `de` do último evento que mudou a situação: onde o desvio ocorreu. */
  situacaoAnterior?: SituacaoCotacao | null;
  variante?: 'mini' | 'grande';
  /** Só `grande`: quando cada etapa foi alcançada. */
  datas?: Partial<Record<EtapaJornada, string>>;
  className?: string;
}) {
  const { indice, desvio } = posicaoNaJornada(situacao, situacaoAnterior);

  if (variante === 'mini') {
    return (
      <span aria-hidden="true" className={cn('flex gap-[3px]', className)}>
        {ETAPAS_JORNADA.map((etapa, i) => (
          <span
            key={etapa}
            className={cn(
              'h-1 w-3.5 rounded-sm',
              i < indice || (i === indice && !desvio)
                ? 'bg-indigo-600 dark:bg-indigo-400'
                : i === indice && desvio
                  ? COR_DESVIO[desvio]
                  : 'bg-muted-foreground/20',
            )}
          />
        ))}
      </span>
    );
  }

  return (
    <ol aria-label="Jornada da cotação" className={cn('flex flex-wrap gap-y-3', className)}>
      {ETAPAS_JORNADA.map((etapa, i) => {
        const vencida = i < indice || (i === indice && etapa === 'atestada' && !desvio);
        const atual = i === indice;
        const data = datas?.[etapa];
        return (
          <li
            key={etapa}
            aria-current={atual ? 'step' : undefined}
            className="flex min-w-24 flex-1 flex-col gap-1.5"
          >
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                  vencida && 'bg-indigo-600 text-white dark:bg-indigo-400 dark:text-indigo-950',
                  atual &&
                    !vencida &&
                    !desvio &&
                    'bg-indigo-100 text-indigo-800 ring-2 ring-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-100',
                  atual && desvio && cn(COR_DESVIO[desvio], 'text-white'),
                  !vencida && !atual && 'bg-muted text-muted-foreground',
                )}
              >
                {vencida ? <Check className="size-3" aria-hidden="true" /> : i + 1}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  'h-0.5 flex-1 rounded-full',
                  i < ETAPAS_JORNADA.length - 1 ? 'bg-border' : 'bg-transparent',
                  i < indice && 'bg-indigo-600 dark:bg-indigo-400',
                )}
              />
            </span>
            <span className={cn('text-xs', atual ? 'font-semibold' : 'text-muted-foreground')}>
              {ROTULO_SITUACAO[etapa]}
              {atual && desvio && (
                <span className="block font-semibold text-foreground">
                  {ROTULO_SITUACAO[desvio]}
                </span>
              )}
            </span>
            {data && (
              <span className="text-xs text-muted-foreground tabular-nums">{dataCurta(data)}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
