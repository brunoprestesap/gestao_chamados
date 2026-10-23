'use client';

import { Check } from 'lucide-react';
import { type ReactNode, useId } from 'react';

import { cn } from '@/lib/utils';
import {
  type PassoMontagem,
  PASSOS_MONTAGEM,
  ROTULO_PASSO_MONTAGEM,
  TEXTO_EDITOR as T,
} from '@/shared/material/mensagens';

/**
 * Os 4 passos da montagem (spec 0021, AC-12), com navegação livre: cada passo
 * é um botão, e o atual leva `aria-current="step"`. O visto marca o passo que
 * já passou na ordem, não um passo "concluído": o que falta está na lista
 * "Pronta para enviar?".
 */
export function PassosMontagem({
  passo,
  onPasso,
}: {
  passo: PassoMontagem;
  onPasso: (p: PassoMontagem) => void;
}) {
  const atual = PASSOS_MONTAGEM.indexOf(passo);
  return (
    <nav aria-label={T.passos}>
      <ol className="grid grid-cols-2 gap-1.5 rounded-2xl border border-border/50 bg-card p-1.5 sm:grid-cols-4">
        {PASSOS_MONTAGEM.map((p, n) => {
          const eAtual = n === atual;
          const antes = n < atual;
          return (
            <li key={p}>
              <button
                type="button"
                aria-current={eAtual ? 'step' : undefined}
                onClick={() => onPasso(p)}
                className={cn(
                  'flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                  eAtual
                    ? 'bg-indigo-50 font-semibold text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-100'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold',
                    antes && 'border-indigo-600 bg-indigo-600 text-white',
                    eAtual && 'border-indigo-600 bg-card text-indigo-800 dark:text-indigo-100',
                    !antes && !eAtual && 'border-border',
                  )}
                >
                  {antes ? <Check className="size-3.5" strokeWidth={3} /> : n + 1}
                </span>
                {ROTULO_PASSO_MONTAGEM[p]}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** O cartão de um passo: título, ajuda, um canto à direita e o conteúdo. */
export function SecaoDoPasso({
  titulo,
  ajuda,
  canto,
  children,
}: {
  titulo: string;
  ajuda?: string;
  canto?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="overflow-hidden rounded-2xl border border-border/50 bg-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="min-w-0 space-y-1">
          <h2 id={id} tabIndex={-1} className="text-base font-semibold focus:outline-none">
            {titulo}
          </h2>
          {ajuda && <p className="text-sm text-muted-foreground">{ajuda}</p>}
        </div>
        {canto}
      </div>
      {children}
    </section>
  );
}
