'use client';

import { FileUp, Loader2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

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
import { Label } from '@/components/ui/label';
import { formatDateTime } from '@/lib/utils';
import { ERRO_ARQUIVO_GRANDE } from '@/shared/ativos/importacao.constants';

const TAMANHO_MAXIMO = 10 * 1024 * 1024;

type Pendente = { id: string; criadaEm: string; autorNome: string };

/**
 * Envio do export bruto do SICAM (spec 0012, AC-17 e AC-21). Com outra
 * importação pendente, pede confirmação antes de trocar.
 */
export function EnviarImportacao() {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pendente, setPendente] = useState<Pendente | null>(null);

  async function enviar(substituirPendente: boolean) {
    if (!arquivo) return;
    setErro(null);
    if (arquivo.size > TAMANHO_MAXIMO) {
      setErro(ERRO_ARQUIVO_GRANDE);
      return;
    }
    setEnviando(true);
    try {
      const corpo = new FormData();
      corpo.set('arquivo', arquivo);
      if (substituirPendente) corpo.set('substituirPendente', 'true');
      const resp = await fetch('/api/ativos/importacoes', { method: 'POST', body: corpo });
      const dados = (await resp.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
        pendente?: Pendente;
      };
      if (resp.status === 409 && dados.pendente) {
        setPendente(dados.pendente);
        return;
      }
      if (!resp.ok || !dados.id) {
        setErro(
          dados.error ??
            (resp.status === 413 ? ERRO_ARQUIVO_GRANDE : 'Não foi possível enviar. Tente de novo.'),
        );
        return;
      }
      setPendente(null);
      router.push(`/ativos/importar/${dados.id}`);
    } catch {
      setErro('Sem conexão com o servidor. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(false);
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="arquivo-sicam">Arquivo do SICAM (CSV, até 10 MB)</Label>
          <label
            htmlFor="arquivo-sicam"
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-center transition hover:border-primary/50 hover:bg-primary/5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <FileUp className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-sm font-medium">
              {arquivo ? arquivo.name : 'Escolha o export do SICAM'}
            </span>
            <span className="text-xs text-muted-foreground">
              {arquivo
                ? `${(arquivo.size / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} KB`
                : 'O arquivo bruto, como sai do sistema. Ele é lido e não fica guardado.'}
            </span>
            <input
              ref={entrada}
              id="arquivo-sicam"
              type="file"
              accept=".csv,.CSV,text/csv"
              className="sr-only"
              aria-invalid={!!erro}
              aria-describedby={erro ? 'erro-arquivo' : undefined}
              onChange={(e) => {
                setErro(null);
                setArquivo(e.target.files?.[0] ?? null);
              }}
            />
          </label>
        </div>
        {erro && (
          <p id="erro-arquivo" role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}
        <Button
          type="submit"
          disabled={!arquivo || enviando}
          className="h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 text-white shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-blue-700"
        >
          {enviando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="h-4 w-4" aria-hidden />
          )}
          Enviar e revisar
        </Button>
      </form>

      <Dialog open={!!pendente} onOpenChange={(aberto) => !aberto && setPendente(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Já existe uma importação pendente</DialogTitle>
            <DialogDescription>
              {pendente &&
                `Existe uma importação pendente de ${formatDateTime(pendente.criadaEm)}, enviada por ${pendente.autorNome}.`}{' '}
              Continuar descarta essa importação e abre a revisão deste arquivo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            {pendente && (
              <Button
                variant="outline"
                onClick={() => router.push(`/ativos/importar/${pendente.id}`)}
              >
                Ver a pendente
              </Button>
            )}
            <Button disabled={enviando} onClick={() => void enviar(true)}>
              {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Descartar a pendente e continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
