'use client';

import { FileText, SendHorizonal } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';

import { cn } from '@/lib/utils';
import { CONVERSA_TEXTO_MAX } from '@/shared/conversas/conversa.schemas';

import {
  COMPOSER_DICA,
  FORMULARIO_HREF,
  FORMULARIO_ROTULO,
  LIMITE_MENSAGENS_AVISO,
} from '../_constants';

/** O teto de caracteres como se escreve em português: `2.000`, não `2000`. */
const TETO_TEXTO = CONVERSA_TEXTO_MAX.toLocaleString('pt-BR');

/**
 * A caixa de mensagem (spec 0003, AC-9). Enter envia, Shift e Enter quebram a
 * linha, os dois contadores ficam à vista e, no teto de mensagens, a caixa sai
 * do caminho e dá lugar ao link do formulário.
 *
 * O texto vive em quem usa o componente, não aqui: é assim que os exemplos da
 * tela de boas vindas conseguem preencher a caixa.
 */

type Props = {
  texto: string;
  onTexto: (texto: string) => void;
  placeholder: string;
  enviando: boolean;
  /** `Conversa.mensagensCount` atual, para o contador `x de 30`. */
  contagem: number;
  mensagensMax: number;
  noLimite: boolean;
  onEnviar: (texto: string) => void;
  campoRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** A tela de boas vindas abre com a caixa pronta para digitar (AC-3). */
  focoInicial?: boolean;
};

export function Composer({
  texto,
  onTexto,
  placeholder,
  enviando,
  contagem,
  mensagensMax,
  noLimite,
  onEnviar,
  campoRef,
  focoInicial = false,
}: Props) {
  const campoId = useId();
  const contadorId = useId();

  const excedeu = texto.length > CONVERSA_TEXTO_MAX;
  const podeEnviar = texto.trim().length > 0 && !excedeu && !enviando;

  function submeter() {
    if (!podeEnviar) return;
    onEnviar(texto);
    onTexto('');
    campoRef?.current?.focus();
  }

  if (noLimite) {
    return (
      <div className="border-t border-border/60 bg-card px-4 py-4 md:px-5">
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900 sm:flex-row sm:items-center dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="flex-1 leading-relaxed">{LIMITE_MENSAGENS_AVISO}</p>
          <Link
            href={FORMULARIO_HREF}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-amber-300 bg-card px-4 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none dark:border-amber-700 dark:text-amber-100 dark:hover:bg-amber-900/40"
          >
            <FileText aria-hidden="true" className="size-4" />
            {FORMULARIO_ROTULO}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border/60 bg-card px-4 pt-3 pb-4 md:px-5">
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          submeter();
        }}
        className="flex flex-col gap-2"
      >
        <label htmlFor={campoId} className="sr-only">
          Mensagem para o assistente
        </label>

        <div
          className={cn(
            'flex items-end gap-2 rounded-2xl border bg-background py-1.5 pr-1.5 pl-4 transition-colors',
            'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
            excedeu ? 'border-destructive' : 'border-input',
          )}
        >
          <textarea
            id={campoId}
            ref={campoRef}
            rows={1}
            value={texto}
            autoFocus={focoInicial}
            onChange={(evento) => onTexto(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === 'Enter' && !evento.shiftKey) {
                evento.preventDefault();
                submeter();
              }
            }}
            placeholder={placeholder}
            aria-describedby={contadorId}
            aria-invalid={excedeu || undefined}
            className="field-sizing-content max-h-40 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-base leading-relaxed text-foreground placeholder:text-muted-foreground focus-visible:outline-none md:text-sm"
          />

          <button
            type="submit"
            disabled={!podeEnviar}
            aria-label="Enviar mensagem"
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-500/20 transition-all hover:from-indigo-500 hover:to-blue-500 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
          >
            <SendHorizonal aria-hidden="true" className="size-[18px]" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline">{COMPOSER_DICA}</span>
          <span
            id={contadorId}
            className={cn('ml-auto', excedeu && 'font-semibold text-destructive')}
          >
            {contagem} de {mensagensMax} mensagens · {texto.length} / {TETO_TEXTO}
          </span>
        </div>
      </form>
    </div>
  );
}
