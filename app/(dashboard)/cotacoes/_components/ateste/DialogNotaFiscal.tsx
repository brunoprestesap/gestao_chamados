'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
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
import type { CotacaoDTO } from '@/lib/material/serializar';
import { TEXTO_ATESTE as T } from '@/shared/material/mensagens';

import { registrarNotaFiscalAction } from '../../actions';
import { enviarArquivo } from '../apoio';

/** O dia de `quando` no relógio de Belém, `YYYY-MM-DD`, para os limites do campo de data. */
export function diaEmBelem(quando: Date | string = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Belem' }).format(new Date(quando));
}

const dataCurta = (dia: string) => dia.split('-').reverse().join('/');

/**
 * O registro da nota fiscal pela contratada (spec 0019, AC-22), montado só
 * enquanto aberto. A nota não se troca depois de gravada, então passa por
 * uma conferência antes de registrar.
 *
 * Quem saiu da página com o diálogo aberto deixou um anexo sem nota: ao
 * abrir, o mais recente volta como anexo, e os outros saem, para nenhum
 * arquivo ficar preso ocupando o limite de 10.
 */
export function DialogNotaFiscal({
  cotacao: c,
  removidos,
  onSoltar,
  onFechar,
  onAlterado,
}: {
  cotacao: CotacaoDTO;
  /** Anexos já removidos nesta tela, até a página recarregar a lista do servidor. */
  removidos: ReadonlySet<string>;
  onSoltar: (arquivoId: string) => void;
  onFechar: () => void;
  onAlterado: () => void;
}) {
  const [inicio] = useState(() => {
    const soltos = (c.arquivos ?? []).filter(
      (a) =>
        a.tipo === 'nota_fiscal' &&
        a.meu &&
        a.id !== c.notaFiscal?.arquivoId &&
        !removidos.has(a.id),
    );
    return { reaproveitado: soltos.at(-1), sobras: soltos.slice(0, -1) };
  });
  const [nf, setNf] = useState({
    numero: '',
    data: '',
    arquivoId: inicio.reaproveitado?.id ?? '',
    nomeArquivo: inicio.reaproveitado?.nomeOriginal ?? '',
  });
  const [conferindo, setConferindo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const sobrasSoltas = useRef(false);

  useEffect(() => {
    if (sobrasSoltas.current) return;
    sobrasSoltas.current = true;
    for (const a of inicio.sobras) onSoltar(a.id);
  }, [inicio, onSoltar]);

  async function anexar(arquivos: FileList | null) {
    const a = arquivos?.[0];
    if (!a) return;
    setEnviando(true);
    const anterior = nf.arquivoId;
    const r = await enviarArquivo(c.id, 'nota_fiscal', a);
    setEnviando(false);
    if (!r.ok) {
      toast.error(`${a.name}: ${r.error}`);
      return;
    }
    setNf((atual) => ({ ...atual, arquivoId: r.arquivoId, nomeArquivo: a.name }));
    if (anterior) onSoltar(anterior);
  }

  /** O arquivo enviado e ainda não ligado à nota sai ao desistir. */
  function fechar() {
    if (nf.arquivoId) onSoltar(nf.arquivoId);
    onFechar();
  }

  function registrar() {
    iniciar(async () => {
      const r = await registrarNotaFiscalAction({
        id: c.id,
        versao: c.versao,
        numero: nf.numero,
        data: nf.data,
        arquivoId: nf.arquivoId,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(T.okNota);
      onFechar();
      onAlterado();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pendente && fechar()}>
      <DialogContent className="sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>{T.tituloNota(c.numero)}</DialogTitle>
          <DialogDescription>{T.descricaoNota}</DialogDescription>
        </DialogHeader>
        {conferindo ? (
          <div
            role="status"
            className="space-y-1 rounded-xl border border-amber-300/60 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-100"
          >
            <p>
              Confira antes de registrar: nota nº{' '}
              <span className="font-semibold">{nf.numero.trim()}</span>, emitida em{' '}
              <span className="font-semibold">{dataCurta(nf.data)}</span>, arquivo{' '}
              <span className="font-semibold">{nf.nomeArquivo}</span>.
            </p>
            <p>{T.semTroca}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="nf-numero">{T.numero}</Label>
              <Input
                id="nf-numero"
                value={nf.numero}
                onChange={(e) => setNf({ ...nf, numero: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nf-data">{T.dataEmissao}</Label>
              <Input
                id="nf-data"
                type="date"
                min={c.autorizadoEm ? diaEmBelem(c.autorizadoEm) : undefined}
                max={diaEmBelem()}
                value={nf.data}
                onChange={(e) => setNf({ ...nf, data: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nf-arquivo">{T.arquivo}</Label>
              <Input
                id="nf-arquivo"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                disabled={enviando}
                onChange={(e) => void anexar(e.target.files)}
              />
              {enviando && <p className="text-xs text-muted-foreground">{T.enviando}</p>}
              {nf.nomeArquivo && !enviando && (
                <p className="text-xs text-muted-foreground">{T.anexado(nf.nomeArquivo)}</p>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          {conferindo ? (
            <>
              <Button variant="outline" onClick={() => setConferindo(false)} disabled={pendente}>
                {T.corrigir}
              </Button>
              <Button variant="gradiente" disabled={pendente} onClick={registrar}>
                {pendente && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {T.confirmarRegistrar}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={fechar} disabled={pendente}>
                {T.cancelar}
              </Button>
              <Button
                variant="gradiente"
                disabled={enviando || !nf.numero.trim() || !nf.data || !nf.arquivoId}
                onClick={() => setConferindo(true)}
              >
                {T.conferir}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
