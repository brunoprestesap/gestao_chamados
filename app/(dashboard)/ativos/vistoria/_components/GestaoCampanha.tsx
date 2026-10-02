'use client';

import { Flag, Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NOME_CAMPANHA_MAX } from '@/shared/vistoria/vistoria.constants';

import { abrirCampanhaAction, encerrarCampanhaAction } from '../actions';

/** Abrir campanha (spec 0012, AC-1): só Admin e Preposto veem. */
export function AbrirCampanha() {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        iniciar(async () => {
          const r = await abrirCampanhaAction({ nome });
          if (!r.ok) {
            setErro(r.error);
            return;
          }
          toast.success('Campanha aberta.');
          setNome('');
          router.refresh();
        });
      }}
    >
      <div className="min-w-0 flex-1 space-y-2">
        <Label htmlFor="nome-campanha">Nome da campanha</Label>
        <Input
          id="nome-campanha"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={NOME_CAMPANHA_MAX}
          placeholder="Ex.: Vistoria inicial"
          className="h-11 rounded-xl"
          aria-invalid={!!erro}
          aria-describedby={erro ? 'erro-campanha' : undefined}
        />
      </div>
      <Button
        type="submit"
        disabled={pendente || !nome.trim()}
        className="h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 text-white shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-blue-700"
      >
        {pendente ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Plus className="h-4 w-4" aria-hidden />
        )}
        Abrir campanha
      </Button>
      {erro && (
        <p id="erro-campanha" role="alert" className="text-sm text-destructive sm:basis-full">
          {erro}
        </p>
      )}
    </form>
  );
}

/** Encerrar campanha (AC-1): pede confirmação, porque encerrada não reabre. */
export function EncerrarCampanha({ id, nome }: { id: string; nome: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();

  return (
    <>
      <Button variant="outline" className="rounded-xl" onClick={() => setAberto(true)}>
        <Flag className="h-4 w-4" aria-hidden />
        Encerrar campanha
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encerrar &ldquo;{nome}&rdquo;?</DialogTitle>
            <DialogDescription>
              Campanha encerrada não reabre. Conferências feitas no campo antes deste momento e
              ainda guardadas nos celulares continuam sendo aceitas quando sincronizarem.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              disabled={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await encerrarCampanhaAction({ id });
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success('Campanha encerrada.');
                  setAberto(false);
                  router.refresh();
                })
              }
            >
              {pendente && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Encerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
