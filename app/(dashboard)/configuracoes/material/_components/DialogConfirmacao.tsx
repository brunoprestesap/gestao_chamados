'use client';

import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ROTULO_FECHAR_DIALOGO } from '@/shared/material/mensagens';

/**
 * A confirmação do cadastro (spec 0021, AC-21): revogar designação, desativar
 * faixa e inativar ou reativar empenho dizem o efeito antes de agir. Sem
 * motivo: o servidor continua o mesmo. Montado só enquanto aberto.
 */
export function DialogConfirmacao({
  titulo,
  efeito,
  rotuloConfirmar,
  destrutiva = false,
  pendente,
  onFechar,
  onConfirmar,
}: {
  titulo: string;
  efeito: string;
  rotuloConfirmar: string;
  destrutiva?: boolean;
  pendente: boolean;
  onFechar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && !pendente && onFechar()}>
      <DialogContent className="sm:max-w-md sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{efeito}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pendente}>
            {ROTULO_FECHAR_DIALOGO}
          </Button>
          <Button
            variant={destrutiva ? 'destructive' : 'gradiente'}
            onClick={onConfirmar}
            disabled={pendente}
            className="gap-2"
          >
            {pendente && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {rotuloConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
