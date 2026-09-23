'use client';

import { AlertCircle, Eye, EyeOff, SendHorizonal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import { cn } from '@/lib/utils';

import {
  COMENTARIO_ALTERNAR_DICA,
  COMENTARIO_DICA,
  COMENTARIO_INTERNO_ROTULO,
  COMENTARIO_PLACEHOLDER,
  COMENTARIO_PUBLICO_ROTULO,
  fraseDoComentario,
} from '../_constants';

/**
 * A caixa de comentário do chamado (spec 0005, AC-5 a AC-7). Escreve pela
 * rota nova, sem envio otimista: limpa o campo e chama `router.refresh()`
 * quando o servidor confirma. O alternador público/interno só aparece quando
 * `podeComentarInterno` vem verdadeiro, o mesmo valor que decide quem lê
 * comentário interno em `lerLinhaDoTempo`.
 */

type Props = {
  chamadoId: string;
  podeComentarInterno: boolean;
};

export function ComentarioComposer({ chamadoId, podeComentarInterno }: Props) {
  const router = useRouter();
  const campoId = useId();
  const [texto, setTexto] = useState('');
  const [interno, setInterno] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const podeEnviar = texto.trim().length > 0 && !enviando;

  async function enviar() {
    if (!podeEnviar) return;
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await fetch(`/api/conversas/chamado/${chamadoId}/comentarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texto: texto.trim(),
          visibility: podeComentarInterno && interno ? 'interno' : 'publico',
        }),
      });

      if (!resposta.ok) {
        const corpo = (await resposta.json().catch(() => null)) as { reason?: string } | null;
        setErro(fraseDoComentario(corpo?.reason));
        return;
      }

      setTexto('');
      setInterno(false);
      router.refresh();
    } catch {
      setErro(fraseDoComentario(null));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-border/60 bg-card px-4 pt-3 pb-4 md:px-5">
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          void enviar();
        }}
        className="flex flex-col gap-2"
      >
        <label htmlFor={campoId} className="sr-only">
          {COMENTARIO_PLACEHOLDER}
        </label>

        <div
          className={cn(
            'flex items-end gap-2 rounded-2xl border border-input bg-background py-1.5 pr-1.5 pl-4 transition-colors',
            'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
          )}
        >
          <textarea
            id={campoId}
            rows={1}
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === 'Enter' && !evento.shiftKey) {
                evento.preventDefault();
                void enviar();
              }
            }}
            placeholder={COMENTARIO_PLACEHOLDER}
            disabled={enviando}
            className="field-sizing-content max-h-40 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-base leading-relaxed text-foreground placeholder:text-muted-foreground focus-visible:outline-none md:text-sm"
          />

          <button
            type="submit"
            disabled={!podeEnviar}
            aria-label="Enviar comentário"
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-500/20 transition-all hover:from-indigo-500 hover:to-blue-500 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
          >
            <SendHorizonal aria-hidden="true" className="size-[18px]" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          {podeComentarInterno ? (
            <button
              type="button"
              onClick={() => setInterno((valor) => !valor)}
              title={COMENTARIO_ALTERNAR_DICA}
              aria-pressed={interno}
              className={cn(
                'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                interno
                  ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {interno ? (
                <>
                  <EyeOff aria-hidden="true" className="size-3.5" />
                  {COMENTARIO_INTERNO_ROTULO}
                </>
              ) : (
                <>
                  <Eye aria-hidden="true" className="size-3.5" />
                  {COMENTARIO_PUBLICO_ROTULO}
                </>
              )}
            </button>
          ) : (
            <span className="hidden sm:inline">{COMENTARIO_DICA}</span>
          )}
        </div>

        {erro ? (
          <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertCircle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            {erro}
          </p>
        ) : null}
      </form>
    </div>
  );
}
