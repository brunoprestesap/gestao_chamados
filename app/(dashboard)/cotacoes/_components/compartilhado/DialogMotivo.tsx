'use client';

import { useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ROTULO_FECHAR_DIALOGO, TEXTO_CAMPO_MOTIVO as T } from '@/shared/material/mensagens';

/**
 * O diálogo de motivo da cotação (spec 0021, AC-11): devolver, reprovar,
 * cancelar e recusar a urgência. O contador e o mínimo ficam embaixo do campo,
 * e o erro (o da tela e o do servidor) aparece no próprio campo. Abaixo do
 * mínimo, o botão não envia. Montado só enquanto aberto, então abre limpo.
 */
export function DialogMotivo({
  titulo,
  descricao,
  rotuloConfirmar,
  destrutiva = false,
  min,
  max,
  pendente,
  erroServidor,
  onFechar,
  onConfirmar,
}: {
  titulo: string;
  descricao: string;
  rotuloConfirmar: string;
  destrutiva?: boolean;
  min: number;
  max: number;
  pendente: boolean;
  /** A recusa do servidor, mostrada no campo além do toast. */
  erroServidor?: string | null;
  onFechar: () => void;
  onConfirmar: (motivo: string) => void;
}) {
  const id = useId();
  const campo = useRef<HTMLTextAreaElement>(null);
  const [texto, setTexto] = useState('');
  const [tentou, setTentou] = useState(false);
  const [editadoDepoisDoErro, setEditadoDepoisDoErro] = useState(false);

  const curto = texto.trim().length < min;
  const erro =
    tentou && curto ? T.erroMinimo(min) : !editadoDepoisDoErro ? (erroServidor ?? null) : null;

  function confirmar() {
    setTentou(true);
    if (curto) {
      campo.current?.focus();
      return;
    }
    setEditadoDepoisDoErro(false);
    onConfirmar(texto.trim());
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pendente && onFechar()}>
      <DialogContent className="sm:rounded-2xl">
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            confirmar();
          }}
        >
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{descricao}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={id}>{T.rotulo}</Label>
            <Textarea
              id={id}
              ref={campo}
              rows={4}
              value={texto}
              maxLength={max}
              aria-invalid={erro ? true : undefined}
              aria-describedby={cn(`${id}-ajuda`, erro && `${id}-erro`)}
              onChange={(e) => {
                setTexto(e.target.value);
                setEditadoDepoisDoErro(true);
              }}
            />
            {erro && (
              <p
                id={`${id}-erro`}
                role="alert"
                className="text-[13px] font-medium text-rose-700 dark:text-rose-300"
              >
                {erro}
              </p>
            )}
            <p
              id={`${id}-ajuda`}
              className="flex justify-between gap-3 text-xs text-muted-foreground tabular-nums"
            >
              <span>{T.minimo(min)}</span>
              <span>{T.contador(texto.length, max)}</span>
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar} disabled={pendente}>
              {ROTULO_FECHAR_DIALOGO}
            </Button>
            <Button
              type="submit"
              variant={destrutiva ? 'destructive' : 'gradiente'}
              disabled={pendente}
            >
              {rotuloConfirmar}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
