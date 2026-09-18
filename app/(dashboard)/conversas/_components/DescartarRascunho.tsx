'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { FALHA_REDE, fraseDaFalha } from '../_constants';
import { descartarRascunhoAction } from '../actions';

/**
 * Descarte do rascunho, com confirmação (spec 0003, AC-12). Descartar durante
 * uma confirmação em andamento falha com frase própria, e a tela continua onde
 * está em vez de fingir que sumiu.
 */

export function DescartarRascunho({ conversaId }: { conversaId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function descartar() {
    setErro(null);
    iniciar(async () => {
      try {
        const resultado = await descartarRascunhoAction(conversaId);
        if (!resultado.ok) {
          setErro(fraseDaFalha(resultado.reason));
          return;
        }
        setAberto(false);
        // Depois do descarte a tela volta para a lista.
        router.replace('/conversas');
        router.refresh();
      } catch {
        setErro(FALHA_REDE);
      }
    });
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(proximo) => {
        setAberto(proximo);
        if (!proximo) setErro(null);
      }}
    >
      {/* Ícone e texto no computador; só o ícone, com nome acessível, no celular. */}
      <Button
        type="button"
        variant="outline"
        onClick={() => setAberto(true)}
        className="size-11 shrink-0 rounded-xl px-0 md:w-auto md:px-4"
      >
        <Trash2 aria-hidden="true" className="size-4" />
        <span className="sr-only md:not-sr-only">Descartar</span>
      </Button>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Descartar esta conversa?</DialogTitle>
          <DialogDescription>
            A conversa e todas as mensagens dela somem agora, e isso não tem volta. Nenhum chamado
            foi aberto, então nada fica pendente para a manutenção.
          </DialogDescription>
        </DialogHeader>

        {erro ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {erro}
          </p>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pendente}>
              Manter conversa
            </Button>
          </DialogClose>
          <Button type="button" variant="destructive" onClick={descartar} disabled={pendente}>
            {pendente ? 'Descartando…' : 'Descartar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
