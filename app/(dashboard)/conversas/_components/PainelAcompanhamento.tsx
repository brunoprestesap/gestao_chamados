'use client';

import { AlertCircle, ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { STATUS_BADGE } from '@/app/(dashboard)/meus-chamados/_constants';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ChamadoStatus } from '@/shared/chamados/chamado.constants';

import {
  ACOMPANHAMENTO_DICA,
  ACOMPANHAMENTO_MARCOS,
  ACOMPANHAMENTO_SAINDO,
  ACOMPANHAMENTO_SAIR,
  ACOMPANHAMENTO_SAIR_FALHA,
  ACOMPANHAMENTO_SELO,
} from '../_constants';
import type { AcompanhamentoLido } from '../_types';
import { deixarDeAcompanharAction } from '../actions';
import { dataEHora, iso } from './tempo';

/**
 * A vista de quem acompanha o chamado de outra pessoa (spec 0017, AC-14 e
 * AC-16). Só leitura: número, serviço, local, equipamento, status, quando abriu,
 * desde quando a pessoa acompanha e os marcos de mudança de status. Sem caixa
 * de comentário e sem nada de quem abriu o chamado.
 */

export function PainelAcompanhamento({ acompanhamento }: { acompanhamento: AcompanhamentoLido }) {
  const router = useRouter();
  const titulo = useRef<HTMLHeadingElement>(null);
  const [saindo, setSaindo] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const status = acompanhamento.statusChave as ChamadoStatus;

  useEffect(() => {
    titulo.current?.focus();
  }, []);

  async function sair() {
    if (saindo) return;
    setSaindo(true);
    setFalha(null);
    try {
      const resultado = await deixarDeAcompanharAction({ chamadoId: acompanhamento.chamadoId });
      // `nao_encontrada` é quem já tinha saído: o destino é o mesmo.
      if (resultado.ok || resultado.reason === 'nao_encontrada') {
        router.push('/conversas');
        router.refresh();
        return;
      }
      setFalha(ACOMPANHAMENTO_SAIR_FALHA);
    } catch {
      setFalha(ACOMPANHAMENTO_SAIR_FALHA);
    }
    setSaindo(false);
  }

  const detalhes: { rotulo: string; valor: string }[] = [
    { rotulo: 'Serviço', valor: acompanhamento.rotuloServico },
    ...(acompanhamento.localExato ? [{ rotulo: 'Local', valor: acompanhamento.localExato }] : []),
    ...(acompanhamento.ativoCodigo
      ? [{ rotulo: 'Equipamento', valor: acompanhamento.ativoCodigo }]
      : []),
  ];

  return (
    <section
      aria-label={`Chamado ${acompanhamento.ticketNumber} que você acompanha`}
      className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border/60 px-3 py-3 md:px-5">
        <Link
          href="/conversas"
          aria-label="Voltar para a lista de conversas"
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:hidden"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2
              ref={titulo}
              tabIndex={-1}
              className="truncate text-sm font-semibold text-foreground focus-visible:outline-none md:text-base"
            >
              #{acompanhamento.ticketNumber}
            </h2>
            <Badge variant="outline" className={cn('shrink-0', STATUS_BADGE[status])}>
              {acompanhamento.situacao}
            </Badge>
            <Badge
              variant="outline"
              className="shrink-0 border-primary/20 bg-primary/10 text-primary"
            >
              <Eye aria-hidden="true" className="mr-1 size-3" />
              {ACOMPANHAMENTO_SELO}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            aberto em{' '}
            <time dateTime={iso(acompanhamento.abertoEm)}>
              {dataEHora(acompanhamento.abertoEm)}
            </time>
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-5 md:px-7 md:py-6">
        <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          {ACOMPANHAMENTO_DICA} Você acompanha desde{' '}
          <time dateTime={iso(acompanhamento.acompanhaDesde)}>
            {dataEHora(acompanhamento.acompanhaDesde)}
          </time>
          .
        </p>

        <dl className="grid grid-cols-1 gap-3 rounded-xl border border-border/60 px-4 py-3 sm:grid-cols-2">
          {detalhes.map((d) => (
            <div key={d.rotulo} className="min-w-0">
              <dt className="text-xs font-medium text-muted-foreground">{d.rotulo}</dt>
              <dd className="text-sm break-words text-foreground">{d.valor}</dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="marcos-titulo" className="flex flex-col gap-3">
          <h3 id="marcos-titulo" className="text-sm font-semibold text-foreground">
            {ACOMPANHAMENTO_MARCOS}
          </h3>
          {acompanhamento.marcos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              O chamado ainda não mudou de situação desde que foi aberto.
            </p>
          ) : (
            <ol className="flex flex-col gap-2">
              {acompanhamento.marcos.map((marco) => (
                <li
                  key={marco.id}
                  className="flex flex-wrap items-baseline gap-x-2 rounded-xl border border-border/50 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-foreground">{marco.rotulo}</span>
                  <time dateTime={iso(marco.em)} className="text-xs text-muted-foreground">
                    {dataEHora(marco.em)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <footer className="flex shrink-0 flex-col gap-2 border-t border-border/60 px-4 py-3 md:px-5">
        {falha ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
          >
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {falha}
          </p>
        ) : null}
        <button
          type="button"
          onClick={sair}
          disabled={saindo}
          className="inline-flex h-11 items-center justify-center gap-2 self-end rounded-xl border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
        >
          {saindo ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <EyeOff aria-hidden="true" className="size-4" />
          )}
          {saindo ? ACOMPANHAMENTO_SAINDO : ACOMPANHAMENTO_SAIR}
        </button>
      </footer>
    </section>
  );
}
