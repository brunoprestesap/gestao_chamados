'use client';

import { ArrowLeft, ArrowUpRight, Lock } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

import { STATUS_BADGE } from '@/app/(dashboard)/meus-chamados/_constants';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CHAMADO_STATUS_LABELS, type ChamadoStatus } from '@/shared/chamados/chamado.constants';

import { LEITURA_EXPLICACAO } from '../_constants';
import type { ItemLeitura, LeituraChamado } from '../_types';
import { BolhaAssistente, BolhaSolicitante, CartaoSistema, viraDia } from './Mensagens';
import { dataEHora, hora, iso, rotuloDoDia } from './tempo';

/**
 * O chamado aberto em modo leitura (spec 0003, AC-10): mensagens, comentários e
 * histórico em ordem, sem caixa de envio. Chamado aberto pelo formulário, sem
 * conversa ligada, abre exatamente igual, só sem as mensagens.
 */

function chaveDoStatus(rotulo: string): ChamadoStatus | null {
  const par = Object.entries(CHAMADO_STATUS_LABELS).find(([, valor]) => valor === rotulo);
  return (par?.[0] as ChamadoStatus | undefined) ?? null;
}

function Marco({ texto, em }: { texto: string; em: string }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      <p className="rounded-full bg-muted px-3 py-1.5 text-center text-xs text-muted-foreground">
        {texto} · <time dateTime={iso(em)}>{hora(em)}</time>
      </p>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  );
}

function Comentario({
  nome,
  texto,
  em,
  interno,
}: {
  nome: string;
  texto: string;
  em: string;
  interno: boolean;
}) {
  const iniciais = nome
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0] ?? '')
    .join('')
    .toUpperCase();

  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-xl bg-emerald-100 text-xs font-bold text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100"
      >
        {iniciais || '?'}
      </span>
      <div className="flex max-w-[84%] flex-col gap-1 md:max-w-[62%]">
        <p className="rounded-[1.25rem] rounded-bl-md border border-border/70 bg-card px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
          {texto}
        </p>
        <p className="pl-1 text-xs text-muted-foreground">
          <time dateTime={iso(em)}>{hora(em)}</time> · {nome}
          {interno ? ' · comentário interno' : ''}
        </p>
      </div>
    </div>
  );
}

function Item({ item }: { item: ItemLeitura }) {
  if (item.fonte === 'historico') return <Marco texto={item.texto} em={item.em} />;

  if (item.fonte === 'comentario') {
    return (
      <Comentario nome={item.autorNome} texto={item.texto} em={item.em} interno={item.interno} />
    );
  }

  if (item.autor === 'solicitante') return <BolhaSolicitante texto={item.texto} em={item.em} />;
  if (item.autor === 'sistema') return <CartaoSistema texto={item.texto} em={item.em} />;
  return <BolhaAssistente texto={item.texto} em={item.em} />;
}

export function PainelChamado({ leitura }: { leitura: LeituraChamado }) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const detalhe = `/meus-chamados/${leitura.chamadoId}`;
  const status = chaveDoStatus(leitura.situacao);

  useEffect(() => {
    titulo.current?.focus();
  }, []);

  return (
    <section
      aria-label={`Conversa do chamado ${leitura.ticketNumber || 'sem número'}`}
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
          <div className="flex min-w-0 items-center gap-2">
            <h2
              ref={titulo}
              tabIndex={-1}
              className="truncate text-sm font-semibold text-foreground focus-visible:outline-none md:text-base"
            >
              {leitura.titulo}
            </h2>
            <Badge
              variant="outline"
              className={cn('shrink-0', status ? STATUS_BADGE[status] : undefined)}
            >
              {leitura.situacao}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {leitura.ticketNumber ? `#${leitura.ticketNumber} · ` : ''}aberto em{' '}
            <time dateTime={iso(leitura.abertoEm)}>{dataEHora(leitura.abertoEm)}</time>
          </p>
        </div>

        <Link
          href={detalhe}
          className="hidden h-11 shrink-0 items-center gap-2 rounded-xl border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:inline-flex"
        >
          Abrir detalhe do chamado
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </Link>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 md:px-7 md:py-6">
        {leitura.truncado ? (
          <p className="rounded-xl bg-muted px-4 py-2.5 text-center text-xs text-muted-foreground">
            Esta conversa é longa e só a parte mais recente aparece aqui. O histórico completo está
            na página do chamado.
          </p>
        ) : null}

        {leitura.itens.length === 0 ? (
          <p className="my-auto text-center text-sm text-muted-foreground">
            Este chamado ainda não tem mensagens nem comentários.
          </p>
        ) : (
          leitura.itens.map((item, indice) => (
            <div key={`${item.fonte}-${item.id}`} className="flex flex-col gap-4">
              {viraDia(item.em, leitura.itens[indice - 1]) ? (
                <div className="flex items-center gap-3" role="presentation">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">{rotuloDoDia(item.em)}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              ) : null}
              <Item item={item} />
            </div>
          ))
        )}
      </div>

      <footer className="flex shrink-0 flex-col gap-3 border-t border-border/60 bg-muted/40 px-4 py-4 sm:flex-row sm:items-center md:px-5">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground"
        >
          <Lock className="size-4" />
        </span>
        <p className="flex-1 text-xs leading-relaxed text-muted-foreground">{LEITURA_EXPLICACAO}</p>
        <Link
          href={detalhe}
          className="inline-flex h-11 shrink-0 items-center rounded-xl bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Ir para os comentários
        </Link>
      </footer>
    </section>
  );
}
