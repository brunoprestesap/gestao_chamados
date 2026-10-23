'use client';

import { FileImage, FileText, Loader2, Paperclip, Trash2 } from 'lucide-react';
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
import { TEXTO_DIALOGO_EXECUCAO as T } from '@/shared/material/mensagens';

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
 * evidência. O valor sai do servidor. Visual da spec 0021 (fatia 6): a
 * evidência com o ícone do tipo, como no ateste.
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
      toast.success(T.registrada);
      onOpenChange(false);
      onAlterado();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pendente && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>{T.titulo}</DialogTitle>
          <DialogDescription>{T.descricao}</DialogDescription>
        </DialogHeader>

        <section aria-labelledby="exec-itens-titulo" className="space-y-2">
          <h3 id="exec-itens-titulo" className="text-sm font-semibold">
            {T.itens}
          </h3>
          <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
            {itens.map((i) => (
              <li
                key={i.id}
                className="grid items-end gap-2 p-3 sm:grid-cols-[1fr_8rem] sm:items-center"
              >
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-foreground">{i.descricao}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {T.autorizado(formatarQuantidade(i.quantidade), i.unidade)}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`exec-${i.id}`} className="text-xs">
                    {T.aplicado(i.unidade)}
                  </Label>
                  <Input
                    id={`exec-${i.id}`}
                    inputMode="decimal"
                    className="min-h-11 tabular-nums"
                    value={qtd[i.id] ?? ''}
                    onChange={(e) => setQtd((q) => ({ ...q, [i.id]: e.target.value }))}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="evid-titulo" className="space-y-2">
          <div>
            <h3 id="evid-titulo" className="text-sm font-semibold">
              {T.evidencias}
            </h3>
            <p className="text-xs text-muted-foreground">{T.evidenciasAjuda}</p>
          </div>
          {evidencias.length === 0 ? (
            <p className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
              {T.semEvidencias}
            </p>
          ) : (
            <ul className="space-y-2">
              {evidencias.map((a) => {
                const pdf = /\.pdf$/i.test(a.nomeOriginal);
                const Icone = pdf ? FileText : FileImage;
                return (
                  <li
                    key={a.id}
                    className="flex items-center gap-2 rounded-xl border border-border/60 p-1.5 pl-3"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                      <Icone className="size-4" aria-hidden="true" />
                    </span>
                    <a
                      href={`/api/cotacoes/arquivos/${a.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {a.nomeOriginal}
                    </a>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {pdf ? T.pdf : T.foto}
                    </span>
                    {a.meu && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-11 shrink-0"
                        aria-label={T.tirar(a.nomeOriginal)}
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
                );
              })}
            </ul>
          )}
          <Label
            htmlFor="evid-arquivo"
            className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-sm hover:bg-muted has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          >
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Paperclip className="h-4 w-4" aria-hidden="true" />
            )}
            {enviando ? T.enviando : T.anexar}
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
          </Label>
        </section>

        {erro && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {erro}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => onOpenChange(false)}
            disabled={pendente}
          >
            {T.cancelar}
          </Button>
          <Button
            variant="gradiente"
            className="min-h-11"
            onClick={executar}
            disabled={pendente || enviando}
          >
            {pendente && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {T.registrar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
