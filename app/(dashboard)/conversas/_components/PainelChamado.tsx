'use client';

import { ArrowLeft, ArrowUpRight, Star } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { AvaliarChamadoDialog } from '@/app/(dashboard)/meus-chamados/_components/AvaliarChamadoDialog';
import { STATUS_BADGE } from '@/app/(dashboard)/meus-chamados/_constants';
import { SeloAberturaChat } from '@/components/chamado/MarcaAberturaChat';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ChamadoStatus } from '@/shared/chamados/chamado.constants';

import type { ItemLeitura, LeituraChamado } from '../_types';
import { ComentarioComposer } from './ComentarioComposer';
import {
  AvisoChamadoAberto,
  BolhaAssistente,
  BolhaSolicitante,
  CartaoLido,
  CartaoSistema,
  viraDia,
} from './Mensagens';
import { dataEHora, hora, iso, rotuloDoDia } from './tempo';

/**
 * O chamado acompanhado pela conversa (spec 0003, AC-10; spec 0005): mensagens,
 * comentários e histórico em ordem, com a caixa de comentário e, quando o
 * chamado está encerrado e ainda não avaliado, o convite para avaliar.
 * Chamado aberto pelo formulário, sem conversa ligada, abre exatamente igual,
 * só sem as mensagens.
 */

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

  if (item.tipo === 'cartao') return <CartaoLido texto={item.texto} em={item.em} />;
  if (item.chamadoAberto) return <AvisoChamadoAberto texto={item.texto} em={item.em} />;
  if (item.autor === 'solicitante') return <BolhaSolicitante texto={item.texto} em={item.em} />;
  if (item.autor === 'sistema') return <CartaoSistema texto={item.texto} em={item.em} />;
  return <BolhaAssistente texto={item.texto} em={item.em} />;
}

export function PainelChamado({ leitura }: { leitura: LeituraChamado }) {
  const router = useRouter();
  const titulo = useRef<HTMLHeadingElement>(null);
  const detalhe = `/meus-chamados/${leitura.chamadoId}`;
  const status = leitura.statusChave as ChamadoStatus;
  const [avaliarAberto, setAvaliarAberto] = useState(false);

  useEffect(() => {
    titulo.current?.focus();
  }, []);

  // Encerrado, ainda não avaliado e só para o solicitante dono (spec 0005, AC-10).
  const podeAvaliar =
    leitura.souSolicitante &&
    leitura.statusChave === 'encerrado' &&
    leitura.avaliacaoRating == null;
  const jaAvaliado = leitura.statusChave === 'encerrado' && leitura.avaliacaoRating != null;

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
            <Badge variant="outline" className={cn('shrink-0', STATUS_BADGE[status])}>
              {leitura.situacao}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {leitura.ticketNumber ? `#${leitura.ticketNumber} · ` : ''}aberto em{' '}
            <time dateTime={iso(leitura.abertoEm)}>{dataEHora(leitura.abertoEm)}</time>
          </p>
          {leitura.marca ? <SeloAberturaChat texto={leitura.marca} className="mt-1" /> : null}
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

      {podeAvaliar ? (
        <div className="mx-4 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 shrink-0 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100 md:mx-5">
          <p className="leading-relaxed">Este chamado foi encerrado. Avalie o atendimento.</p>
          <button
            type="button"
            onClick={() => setAvaliarAberto(true)}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-amber-700 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Star aria-hidden="true" className="size-4" />
            Avaliar atendimento
          </button>
        </div>
      ) : null}

      {jaAvaliado ? (
        <div className="mx-4 mb-3 flex shrink-0 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-2.5 text-sm font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200 md:mx-5">
          <Star
            aria-hidden="true"
            className="size-4 fill-emerald-600 text-emerald-600 dark:fill-emerald-400 dark:text-emerald-400"
          />
          Atendimento avaliado · {leitura.avaliacaoRating}/5
        </div>
      ) : null}

      <ComentarioComposer
        chamadoId={leitura.chamadoId}
        podeComentarInterno={leitura.podeComentarInterno}
      />

      <AvaliarChamadoDialog
        open={avaliarAberto}
        onOpenChange={setAvaliarAberto}
        chamado={{
          _id: leitura.chamadoId,
          ticket_number: leitura.ticketNumber,
          titulo: leitura.titulo,
          assignedToUserId: leitura.assignedToUserId,
        }}
        onSuccess={() => router.refresh()}
      />
    </section>
  );
}
