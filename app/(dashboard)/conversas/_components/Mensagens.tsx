'use client';

import { AlertTriangle, FileText, Sparkles, TriangleAlert } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/utils';
import type { ConversaAutor } from '@/shared/conversas/conversa.constants';

import { FORMULARIO_HREF, FORMULARIO_ROTULO, RESPONDENDO_TEXTO } from '../_constants';
import type { MensagemNaTela } from '../_types';
import { chaveDoDia, hora, iso, rotuloDoDia } from './tempo';

/**
 * As mensagens da conversa (spec 0003). Três formas: a bolha do solicitante, a
 * bolha do assistente e o cartão do sistema, que é o aviso do Sigma quando a
 * IA não respondeu e por isso sempre oferece o formulário.
 */

function Separador({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3" role="presentation">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">{children}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function AvatarAssistente() {
  return (
    <span
      aria-hidden="true"
      className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
    >
      <Sparkles className="size-[17px]" />
    </span>
  );
}

export function BolhaSolicitante({ texto, em }: { texto: string; em: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <p className="max-w-[84%] rounded-[1.25rem] rounded-br-md bg-gradient-to-br from-indigo-600 to-blue-600 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-white md:max-w-[62%]">
        {texto}
      </p>
      <time dateTime={iso(em)} className="pr-1 text-xs text-muted-foreground">
        {hora(em)}
      </time>
    </div>
  );
}

export function BolhaAssistente({
  texto,
  em,
  emConstrucao = false,
}: {
  texto: string;
  em?: string;
  emConstrucao?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <AvatarAssistente />
      <div className="flex max-w-[84%] flex-col gap-1 md:max-w-[62%]">
        <p
          // Enquanto o texto cresce, o leitor de tela não o acompanha pedaço a
          // pedaço: quem avisa é a região ao vivo, uma vez só (AC-8).
          aria-hidden={emConstrucao || undefined}
          className="rounded-[1.25rem] rounded-bl-md border border-border/70 bg-card px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground"
        >
          {texto}
          {emConstrucao ? (
            <span className="ml-0.5 inline-block h-4 w-0.5 -translate-y-px animate-pulse bg-primary align-middle" />
          ) : null}
        </p>
        {em ? (
          <time dateTime={iso(em)} className="pl-1 text-xs text-muted-foreground">
            {hora(em)} · assistente
          </time>
        ) : null}
      </div>
    </div>
  );
}

export function CartaoSistema({ texto, em }: { texto: string; em?: string }) {
  return (
    <div className="flex w-full max-w-[42rem] gap-3 self-center rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200"
      >
        <TriangleAlert className="size-4" />
      </span>
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm leading-relaxed text-amber-900 dark:text-amber-100">{texto}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={FORMULARIO_HREF}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-amber-300 bg-card px-4 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none dark:border-amber-700 dark:text-amber-100 dark:hover:bg-amber-900/40"
          >
            <FileText aria-hidden="true" className="size-4" />
            {FORMULARIO_ROTULO}
          </Link>
          {em ? (
            <time dateTime={iso(em)} className="text-xs text-amber-800/80 dark:text-amber-200/80">
              {hora(em)} · sistema
            </time>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function BolhaNaoEnviada({
  texto,
  frase,
  onTentarDeNovo,
  enviando,
}: {
  texto: string;
  frase: string | null;
  onTentarDeNovo: () => void;
  enviando: boolean;
}) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      <p
        className={cn(
          'max-w-[84%] rounded-[1.25rem] rounded-br-md px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap md:max-w-[62%]',
          frase
            ? 'border border-dashed border-destructive/50 bg-card text-foreground'
            : 'bg-gradient-to-br from-indigo-600 to-blue-600 text-white opacity-70',
        )}
      >
        {texto}
      </p>

      {frase ? (
        <div className="flex max-w-[84%] flex-col items-end gap-1.5 md:max-w-[62%]">
          <p className="flex items-center gap-1.5 text-right text-xs text-destructive">
            <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
            {frase}
          </p>
          <button
            type="button"
            onClick={onTentarDeNovo}
            disabled={enviando}
            className="inline-flex h-11 items-center rounded-xl border border-input bg-card px-4 text-xs font-semibold text-foreground transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        <span className="pr-1 text-xs text-muted-foreground">Enviando…</span>
      )}
    </div>
  );
}

export function Respondendo() {
  return (
    <div className="flex items-center gap-2 pl-11 text-xs text-muted-foreground">
      <span aria-hidden="true" className="flex gap-1">
        <span className="size-1.5 animate-pulse rounded-full bg-primary/80" />
        <span className="size-1.5 animate-pulse rounded-full bg-primary/50 [animation-delay:150ms]" />
        <span className="size-1.5 animate-pulse rounded-full bg-primary/30 [animation-delay:300ms]" />
      </span>
      {RESPONDENDO_TEXTO}
    </div>
  );
}

/**
 * Região ao vivo educada: o leitor de tela ouve que o assistente começou a
 * responder e, quando termina, ouve a resposta inteira uma vez só (AC-8).
 */
export function RegiaoAoVivo({ texto }: { texto: string }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {texto}
    </div>
  );
}

function Mensagem({ mensagem }: { mensagem: MensagemNaTela }) {
  const autor: ConversaAutor = mensagem.autor;
  if (autor === 'solicitante') return <BolhaSolicitante texto={mensagem.texto} em={mensagem.em} />;
  if (autor === 'sistema') return <CartaoSistema texto={mensagem.texto} em={mensagem.em} />;
  return <BolhaAssistente texto={mensagem.texto} em={mensagem.em} />;
}

/** Verdadeiro quando este item abre um dia novo em relação ao anterior. */
export function viraDia(em: string, anterior: { em: string } | undefined): boolean {
  return !anterior || chaveDoDia(em) !== chaveDoDia(anterior.em);
}

/** As mensagens em ordem, com um separador a cada virada de dia. */
export function ListaMensagens({ mensagens }: { mensagens: MensagemNaTela[] }) {
  return (
    <>
      {mensagens.map((mensagem, indice) => (
        <div key={mensagem.id} className="flex flex-col gap-4">
          {viraDia(mensagem.em, mensagens[indice - 1]) ? (
            <Separador>{rotuloDoDia(mensagem.em)}</Separador>
          ) : null}
          <Mensagem mensagem={mensagem} />
        </div>
      ))}
    </>
  );
}
