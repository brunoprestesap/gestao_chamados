'use client';

import { ArrowDownWideNarrow, Search, X, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ROTULO_ABA_FILA, TEXTO_FILA as T } from '@/shared/material/mensagens';

import { hrefFila } from './endereco';

type Aba = keyof typeof ROTULO_ABA_FILA;

/**
 * Abas, busca e "Só urgentes" da fila (spec 0021, AC-3). Tudo muda o
 * endereço; o servidor relê a fila. Trocar aba ou filtro volta à página 1.
 */
export function BarraFila({
  aba,
  abas,
  contagens,
  q,
  urgente,
  ordemDeTramite,
  children,
}: {
  aba: Aba;
  abas: readonly Aba[];
  contagens: Partial<Record<Aba, number>>;
  q: string;
  urgente: boolean;
  ordemDeTramite: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [busca, setBusca] = useState(q);
  const ir = (p: { aba?: Aba; q?: string; urgente?: boolean }) =>
    iniciar(() =>
      router.push(hrefFila({ aba: p.aba ?? aba, q: p.q ?? q, urgente: p.urgente ?? urgente }), {
        scroll: false,
      }),
    );

  return (
    <Tabs value={aba} onValueChange={(v) => ir({ aba: v as Aba })} className="gap-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 p-3 sm:p-4">
        <div className="max-w-full overflow-x-auto">
          <TabsList aria-label="Abas da fila" className="h-auto">
            {abas.map((a) => (
              <TabsTrigger key={a} value={a} className="h-8 gap-2 px-3">
                {ROTULO_ABA_FILA[a]}
                <span
                  className={cn(
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
                    a === aba
                      ? 'bg-indigo-600 text-white dark:bg-indigo-400 dark:text-indigo-950'
                      : 'bg-muted-foreground/15 text-foreground/80',
                  )}
                >
                  {contagens[a] ?? 0}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <form
            role="search"
            className="flex min-w-0 flex-1 items-center gap-1 sm:flex-none"
            onSubmit={(e) => {
              e.preventDefault();
              ir({ q: busca.trim() });
            }}
          >
            <label htmlFor="busca-fila" className="sr-only">
              {T.buscaRotulo}
            </label>
            <div className="relative min-w-0 flex-1 sm:w-64">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="busca-fila"
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={T.buscaPlaceholder}
                maxLength={100}
                className="h-9 rounded-xl pl-9"
              />
            </div>
            <Button type="submit" variant="outline" size="icon" aria-label={T.buscar}>
              <Search aria-hidden="true" />
            </Button>
            {q && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={T.limparBusca}
                onClick={() => {
                  setBusca('');
                  ir({ q: '' });
                }}
              >
                <X aria-hidden="true" />
              </Button>
            )}
          </form>
          <Button
            type="button"
            variant="outline"
            aria-pressed={urgente}
            onClick={() => ir({ urgente: !urgente })}
            className={cn(
              'rounded-xl',
              urgente &&
                'border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-100',
            )}
          >
            <Zap aria-hidden="true" />
            {T.soUrgentes}
          </Button>
          <span className="inline-flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
            <ArrowDownWideNarrow aria-hidden="true" className="size-3.5" />
            {ordemDeTramite ? T.ordemTramite : T.ordemTodas}
          </span>
        </div>
      </div>

      <TabsContent
        value={aba}
        aria-busy={pendente}
        className={cn('transition-opacity', pendente && 'opacity-60')}
      >
        {children}
      </TabsContent>
    </Tabs>
  );
}
