'use client';

import { FileText, MessagesSquare, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useTransition } from 'react';

import { STATUS_BADGE } from '@/app/(dashboard)/meus-chamados/_constants';
import { cn } from '@/lib/utils';
import type { ChamadoStatus } from '@/shared/chamados/chamado.constants';

import {
  FORMULARIO_HREF,
  FORMULARIO_ROTULO,
  LISTA_VAZIA_TEXTO,
  LISTA_VAZIA_TITULO,
} from '../_constants';
import type { CursorLateral, ItemLateral } from '../_types';
import { carregarMaisConversasAction } from '../actions';
import { iso, quando } from './tempo';

/**
 * A lateral (spec 0003, AC-2): os rascunhos ativos em cima, os chamados
 * embaixo, 20 por vez. Rascunhos não paginam, porque o teto deles é 5.
 */

const MARCA_RASCUNHO =
  'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800';

const MARCA_CONFIRMANDO =
  'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-200 dark:border-indigo-800';

function classeDaMarca(item: ItemLateral): string {
  if (item.tipo === 'rascunho') return item.confirmando ? MARCA_CONFIRMANDO : MARCA_RASCUNHO;
  const chave = item.statusChave as ChamadoStatus | null;
  return (chave && STATUS_BADGE[chave]) || MARCA_RASCUNHO;
}

function Linha({ item, ativo }: { item: ItemLateral; ativo: boolean }) {
  return (
    <li>
      <Link
        href={item.href}
        aria-current={ativo ? 'page' : undefined}
        className={cn(
          'flex flex-col gap-1.5 rounded-2xl border p-3 transition-colors',
          'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
          ativo
            ? 'border-primary/30 bg-primary/5'
            : 'border-transparent hover:border-border/60 hover:bg-accent/60',
        )}
      >
        <span className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold',
              classeDaMarca(item),
            )}
          >
            {item.situacao}
          </span>
          <time dateTime={iso(item.em)} className="ml-auto text-xs text-muted-foreground">
            {quando(item.em)}
          </time>
        </span>

        <span className="line-clamp-2 text-sm leading-snug font-semibold text-foreground">
          {item.titulo}
        </span>
        <span className="truncate text-xs text-muted-foreground">{item.apoio}</span>
      </Link>
    </li>
  );
}

function Bloco({
  titulo,
  itens,
  ativo,
}: {
  titulo: string;
  itens: ItemLateral[];
  ativo: (item: ItemLateral) => boolean;
}) {
  if (itens.length === 0) return null;

  return (
    <li>
      <h3 className="px-2 py-1.5 text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase">
        {titulo}
      </h3>
      <ul className="flex flex-col gap-1">
        {itens.map((item) => (
          <Linha key={`${item.tipo}-${item.id}`} item={item} ativo={ativo(item)} />
        ))}
      </ul>
    </li>
  );
}

type Props = {
  rascunhos: ItemLateral[];
  chamados: ItemLateral[];
  temMais: boolean;
  cursor: CursorLateral | null;
  /** Quem manda no tamanho e em aparecer ou não é o quadro da tela. */
  className?: string;
};

export function ListaLateral({ rascunhos, chamados, temMais, cursor, className }: Props) {
  const caminho = usePathname();
  // A primeira página vem do servidor a cada renderização, então ela não é
  // guardada aqui: o estado local é só o que foi carregado a mais. É isso que
  // faz a recarga em tempo real atualizar a lista sem sincronizar nada.
  const [extras, setExtras] = useState<ItemLateral[]>([]);
  const [fim, setFim] = useState<{ cursor: CursorLateral | null; temMais: boolean } | null>(null);
  const [carregando, iniciar] = useTransition();

  const doServidor = new Set(chamados.map((item) => item.id));
  const pagina = [...chamados, ...extras.filter((item) => !doServidor.has(item.id))];
  const proximo = fim ? fim.cursor : cursor;
  const ainda = fim ? fim.temMais : temMais;

  const ehAtivo = (item: ItemLateral) => caminho === item.href;
  const vazia = rascunhos.length === 0 && pagina.length === 0;

  // A ação nunca lança: em qualquer falha ela devolve lista vazia, que aqui
  // vira simplesmente o fim da lista. É a troca que a spec escolheu.
  function carregarMais() {
    if (!proximo) return;
    iniciar(async () => {
      const resultado = await carregarMaisConversasAction(proximo);
      setExtras((atuais) => {
        const vistos = new Set([...doServidor, ...atuais.map((item) => item.id)]);
        return [...atuais, ...resultado.itens.filter((item) => !vistos.has(item.id))];
      });
      setFim({ cursor: resultado.cursor, temMais: resultado.temMais });
    });
  }

  return (
    <section
      aria-label="Suas conversas"
      className={cn(
        'min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm md:shrink-0',
        className,
      )}
    >
      <div className="flex shrink-0 flex-col gap-2 border-b border-border/60 p-3">
        <Link
          href="/conversas"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition-all hover:from-indigo-500 hover:to-blue-500 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Plus aria-hidden="true" className="size-[17px]" />
          Nova conversa
        </Link>
        <Link
          href={FORMULARIO_HREF}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-input bg-card text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <FileText aria-hidden="true" className="size-4" />
          {FORMULARIO_ROTULO}
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {vazia ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-5 py-10 text-center">
            <span
              aria-hidden="true"
              className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary"
            >
              <MessagesSquare className="size-5" />
            </span>
            <p className="text-sm font-semibold text-foreground">{LISTA_VAZIA_TITULO}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{LISTA_VAZIA_TEXTO}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            <Bloco titulo="Rascunhos" itens={rascunhos} ativo={ehAtivo} />
            <Bloco titulo="Chamados" itens={pagina} ativo={ehAtivo} />
          </ul>
        )}
      </div>

      {ainda && proximo ? (
        <div className="shrink-0 border-t border-border/60 p-3">
          <button
            type="button"
            onClick={carregarMais}
            disabled={carregando}
            className="h-11 w-full rounded-xl border border-input bg-card text-xs font-semibold text-primary transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
          >
            {carregando ? 'Carregando…' : 'Carregar mais'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
