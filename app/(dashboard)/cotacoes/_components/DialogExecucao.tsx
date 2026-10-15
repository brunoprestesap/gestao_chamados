'use client';

import { Loader2, Paperclip, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ArquivoDTO, ItemDTO } from '@/lib/material/serializar';
import { formatarQuantidade } from '@/shared/chamados/custo';

import { executarAction, removerArquivoAction } from '../actions';
import { enviarArquivo, numeroBr } from './apoio';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cotacaoId: string;
  versao: number;
  itens: ItemDTO[];
  evidencias: ArquivoDTO[];
  /** Depois de anexar ou remover evidência: só recarrega a lista, sem fechar o diálogo. */
  onArquivos: () => void;
  /** Depois de executar. */
  onAlterado: () => void;
};

/**
 * O técnico registra a aplicação do material (spec 0019, AC-10): a
 * quantidade aplicada de cada item (até a autorizada) e ao menos uma
 * evidência. O valor sai do servidor.
 */
export function DialogExecucao({
  open,
  onOpenChange,
  cotacaoId,
  versao,
  itens,
  evidencias,
  onArquivos,
  onAlterado,
}: Props) {
  const [qtd, setQtd] = useState<Record<string, string>>(() =>
    Object.fromEntries(itens.map((i) => [i.id, formatarQuantidade(i.quantidade)])),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pendente, iniciar] = useTransition();

  async function anexar(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    setEnviando(true);
    for (const a of Array.from(arquivos)) {
      const r = await enviarArquivo(cotacaoId, 'evidencia', a);
      if (!r.ok) toast.error(`${a.name}: ${r.error}`);
    }
    setEnviando(false);
    onArquivos();
  }

  function executar() {
    setErro(null);
    iniciar(async () => {
      const r = await executarAction({
        id: cotacaoId,
        versao,
        quantidades: itens.map((i) => ({
          itemId: i.id,
          quantidadeExecutada: numeroBr(qtd[i.id] ?? ''),
        })),
      });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      toast.success('Execução registrada. O gestor do contrato foi avisado.');
      onOpenChange(false);
      onAlterado();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pendente && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>Registrar execução do material</DialogTitle>
          <DialogDescription>
            Informe quanto foi aplicado de cada item. Aplicar menos que o autorizado devolve a
            diferença ao saldo.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {itens.map((i) => (
            <li
              key={i.id}
              className="grid items-end gap-2 rounded-xl border border-border/60 p-3 sm:grid-cols-[1fr_8rem]"
            >
              <div className="text-sm">
                <p className="font-medium text-foreground">{i.descricao}</p>
                <p className="text-xs text-muted-foreground">
                  Autorizado: {formatarQuantidade(i.quantidade)} {i.unidade}
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`exec-${i.id}`} className="text-xs">
                  Aplicado ({i.unidade})
                </Label>
                <Input
                  id={`exec-${i.id}`}
                  inputMode="decimal"
                  value={qtd[i.id] ?? ''}
                  onChange={(e) => setQtd((q) => ({ ...q, [i.id]: e.target.value }))}
                />
              </div>
            </li>
          ))}
        </ul>

        <section aria-labelledby="evid-titulo" className="space-y-2">
          <h3 id="evid-titulo" className="text-sm font-medium">
            Evidências (foto ou PDF)
          </h3>
          {evidencias.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma evidência anexada ainda.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {evidencias.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <a
                    href={`/api/cotacoes/arquivos/${a.id}`}
                    className="truncate text-primary hover:underline"
                  >
                    {a.nomeOriginal}
                  </a>
                  {a.meu && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover ${a.nomeOriginal}`}
                      onClick={async () => {
                        const r = await removerArquivoAction({ arquivoId: a.id });
                        if (!r.ok) toast.error(r.error);
                        else onArquivos();
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Label
            htmlFor="evid-arquivo"
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm hover:bg-muted"
          >
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Paperclip className="h-4 w-4" aria-hidden="true" />
            )}
            Anexar evidência
          </Label>
          <input
            id="evid-arquivo"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            multiple
            className="sr-only"
            disabled={enviando}
            onChange={(e) => {
              void anexar(e.target.files);
              e.target.value = '';
            }}
          />
        </section>

        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pendente}>
            Cancelar
          </Button>
          <Button onClick={executar} disabled={pendente || enviando}>
            {pendente && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Registrar execução
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
