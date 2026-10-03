'use client';

import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
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
import { Textarea } from '@/components/ui/textarea';

import { corrigirDocumentoAction, excluirDocumentoAction } from '../actions';

export type DocumentoEditavel = {
  id: string;
  tipoNome: string;
  numero: string | null;
  emitidoPor: string | null;
  emitidoEm: string;
  validadeAte: string | null;
};

/**
 * Corrigir (só vigente) e excluir com motivo (spec 0013, AC-5 e AC-6). Só gestão.
 * `vigente` diz se o documento é o vigente do tipo: excluir o vigente não devolve
 * o substituído anterior, e o diálogo avisa antes.
 */
export function AcoesDocumento({
  documento,
  vigente,
}: {
  documento: DocumentoEditavel;
  vigente: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const [modo, setModo] = useState<'corrigir' | 'excluir' | null>(null);
  const [numero, setNumero] = useState('');
  const [emitidoPor, setEmitidoPor] = useState('');
  const [emitidoEm, setEmitidoEm] = useState('');
  const [validadeAte, setValidadeAte] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  function abrirCorrigir() {
    setNumero(documento.numero ?? '');
    setEmitidoPor(documento.emitidoPor ?? '');
    setEmitidoEm(documento.emitidoEm);
    setValidadeAte(documento.validadeAte ?? '');
    setErro(null);
    setModo('corrigir');
  }

  function abrirExcluir() {
    setMotivo('');
    setErro(null);
    setModo('excluir');
  }

  function salvar() {
    setErro(null);
    iniciar(async () => {
      const r =
        modo === 'corrigir'
          ? await corrigirDocumentoAction({
              id: documento.id,
              numero,
              emitidoPor,
              emitidoEm,
              validadeAte,
            })
          : await excluirDocumentoAction({ id: documento.id, motivo });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      toast.success(modo === 'corrigir' ? 'Documento corrigido.' : 'Documento excluído.');
      setModo(null);
      router.refresh();
    });
  }

  const id = (s: string) => `${uid}-${s}`;

  return (
    <div className="flex shrink-0 gap-1">
      {vigente && (
        <Button
          variant="ghost"
          size="sm"
          onClick={abrirCorrigir}
          aria-label={`Corrigir ${documento.tipoNome}`}
        >
          <Pencil className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Corrigir</span>
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={abrirExcluir}
        aria-label={`Excluir ${documento.tipoNome}`}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Excluir</span>
      </Button>

      <Dialog open={modo !== null} onOpenChange={(v) => !v && !salvando && setModo(null)}>
        <DialogContent className="sm:max-w-md">
          {modo === 'corrigir' ? (
            <DialogHeader>
              <DialogTitle>Corrigir {documento.tipoNome}</DialogTitle>
              <DialogDescription>
                O arquivo não muda. Arquivo errado se resolve cadastrando um novo, que substitui
                este.
              </DialogDescription>
            </DialogHeader>
          ) : (
            <DialogHeader>
              <DialogTitle>Excluir {documento.tipoNome}</DialogTitle>
              <DialogDescription>
                {vigente
                  ? 'O documento some das telas e dos avisos. O anterior do mesmo tipo não volta a valer: se a categoria exige este tipo, ele passa a aparecer como faltando.'
                  : 'O documento substituído some das telas. O arquivo continua guardado.'}
              </DialogDescription>
            </DialogHeader>
          )}

          {modo === 'corrigir' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={id('emitido')}>Emitido em</Label>
                <Input
                  id={id('emitido')}
                  type="date"
                  value={emitidoEm}
                  aria-required
                  onChange={(e) => setEmitidoEm(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={id('validade')}>Validade até (opcional)</Label>
                <Input
                  id={id('validade')}
                  type="date"
                  value={validadeAte}
                  min={emitidoEm || undefined}
                  onChange={(e) => setValidadeAte(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={id('numero')}>Número</Label>
                <Input
                  id={id('numero')}
                  value={numero}
                  maxLength={80}
                  onChange={(e) => setNumero(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={id('emissor')}>Emitido por</Label>
                <Input
                  id={id('emissor')}
                  value={emitidoPor}
                  maxLength={120}
                  onChange={(e) => setEmitidoPor(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor={id('motivo')}>Motivo (obrigatório)</Label>
              <Textarea
                id={id('motivo')}
                value={motivo}
                maxLength={500}
                rows={3}
                aria-required
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Por exemplo: cadastrado no equipamento errado."
              />
            </div>
          )}

          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setModo(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              variant={modo === 'excluir' ? 'destructive' : 'default'}
              disabled={salvando || (modo === 'excluir' ? !motivo.trim() : !emitidoEm)}
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {modo === 'excluir' ? 'Excluir' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
