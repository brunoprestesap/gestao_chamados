'use client';

import { CircleAlert, CircleCheck } from 'lucide-react';
import { useId } from 'react';

import { cn } from '@/lib/utils';
import { formatarReais } from '@/shared/chamados/custo';
import {
  TEXTO_EDITOR as T,
  textoDoControleSemRotulo,
  TITULO_CONTROLE,
} from '@/shared/material/mensagens';

import { linhaPassa, type LinhaPronta, type ResultadoPronta } from './formulario';

/**
 * A lista "Pronta para enviar?" (spec 0021, AC-15): ao vivo, sem ida ao
 * servidor, cada linha junta os códigos de `impedimentosDeEnvio` que confere,
 * e embaixo vai o total pelo menor preço de cada item.
 */
export function ProntaParaEnviar({
  linhas,
  resultado,
  total,
}: {
  linhas: readonly LinhaPronta[];
  resultado: ResultadoPronta;
  total: { totalCentavos: number; semPreco: number };
}) {
  const id = useId();
  const passam = linhas.filter((l) => linhaPassa(l, resultado)).length;
  const pct = linhas.length ? Math.round((passam / linhas.length) * 100) : 0;
  return (
    <div className="space-y-5">
      <section
        aria-labelledby={id}
        className="space-y-3.5 rounded-2xl border border-border/50 bg-card p-5"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 id={id} className="text-base font-semibold">
            {T.prontaTitulo}
          </h2>
          <span className="text-sm text-muted-foreground">
            {T.prontaContagem(passam, linhas.length)}
          </span>
        </div>
        <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <ul className="space-y-2.5 text-sm">
          {linhas.map((l) => {
            const passa = linhaPassa(l, resultado);
            return (
              <li
                key={l.chave}
                className={cn('flex gap-2.5', !passa && 'text-amber-900 dark:text-amber-200')}
              >
                {passa ? (
                  <CircleCheck
                    className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                ) : (
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                )}
                <div className="min-w-0 space-y-1">
                  <p>
                    <span className="sr-only">{passa ? T.linhaPronta : T.linhaFalta} </span>
                    {l.rotulo}
                  </p>
                  {l.erro && <p className="text-xs">{l.erro}</p>}
                  {l.codigos.map((c) => (
                    <p key={c} className="text-xs">
                      <span className="font-semibold">{TITULO_CONTROLE[c]}.</span>{' '}
                      {textoDoControleSemRotulo(c)}
                    </p>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">{T.prontaServidor}</p>
      </section>

      <section
        aria-labelledby={`${id}-total`}
        className="space-y-1 rounded-2xl border border-border/50 bg-card p-5"
      >
        <h2 id={`${id}-total`} className="text-sm font-normal text-muted-foreground">
          {T.totalAteAgora}
        </h2>
        <p className="text-2xl font-bold tabular-nums">{formatarReais(total.totalCentavos)}</p>
        <p className="text-xs text-muted-foreground">
          {T.totalAjuda}
          {total.semPreco > 0 && ` · ${T.itensSemPreco(total.semPreco)}`}
        </p>
      </section>
    </div>
  );
}
