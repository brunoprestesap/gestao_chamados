'use client';

import { BadgeCheck, Loader2, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  ATIVO_STATUS_LABELS,
  ATIVO_STATUSES,
  type AtivoStatus,
  STATUS_QUE_EXIGEM_OBSERVACAO,
  type StatusCadastro,
} from '@/shared/ativos/ativo.constants';

import { alterarStatusAtivoAction, validarAtivoAction } from '../actions';

/** Mudar status e validar o cadastro, na ficha (spec 0011, AC-6 e AC-7). Só gestão. */
export function AcoesGestaoAtivo({
  id,
  status,
  statusCadastro,
  temLocal,
}: {
  id: string;
  status: AtivoStatus;
  statusCadastro: StatusCadastro;
  temLocal: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [novoStatus, setNovoStatus] = useState<AtivoStatus>(status);
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();
  const [validando, iniciarValidacao] = useTransition();

  const exigeObservacao = STATUS_QUE_EXIGEM_OBSERVACAO.includes(novoStatus);

  function abrir() {
    setNovoStatus(status);
    setObservacao('');
    setErro(null);
    setAberto(true);
  }

  function salvarStatus() {
    setErro(null);
    iniciar(async () => {
      const r = await alterarStatusAtivoAction({ id, status: novoStatus, observacao });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      toast.success('Status do ativo atualizado.');
      setAberto(false);
      router.refresh();
    });
  }

  function validar() {
    iniciarValidacao(async () => {
      const r = await validarAtivoAction({ id });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success('Cadastro validado.');
      router.refresh();
    });
  }

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border/50 pt-4">
      <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Gestão
      </span>
      <Button variant="outline" size="sm" onClick={abrir}>
        <RefreshCw className="h-4 w-4" aria-hidden />
        Mudar status
      </Button>
      {statusCadastro !== 'validado' && (
        <Button
          variant="outline"
          size="sm"
          onClick={validar}
          disabled={validando || !temLocal}
          title={temLocal ? undefined : 'Defina o local do ativo antes de validar.'}
        >
          {validando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <BadgeCheck className="h-4 w-4" aria-hidden />
          )}
          Validar cadastro
        </Button>
      )}
      {statusCadastro !== 'validado' && !temLocal && (
        <span className="text-xs text-muted-foreground">
          Para validar, defina o local em Editar.
        </span>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mudar status do ativo</DialogTitle>
            <DialogDescription>
              A mudança fica na linha do tempo do cadastro, com o seu nome.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="status-ativo">Novo status</Label>
              <Select
                value={novoStatus}
                onValueChange={(v) => v && setNovoStatus(v as AtivoStatus)}
              >
                <SelectTrigger id="status-ativo" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ATIVO_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ATIVO_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="obs-status-ativo">
                Observação{exigeObservacao ? ' (obrigatória)' : ' (opcional)'}
              </Label>
              <Textarea
                id="obs-status-ativo"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={3}
                aria-required={exigeObservacao}
                placeholder={
                  exigeObservacao ? 'Explique o motivo, por exemplo o laudo ou o defeito.' : ''
                }
              />
            </div>
            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              onClick={salvarStatus}
              disabled={
                salvando || novoStatus === status || (exigeObservacao && !observacao.trim())
              }
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
