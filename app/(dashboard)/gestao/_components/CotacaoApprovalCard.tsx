'use client';

import { CheckCircle2, ClipboardList, Loader2, ThumbsDown } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
  approveCotacaoAction,
  rejectCotacaoAction,
} from '@/app/(dashboard)/chamados-atribuidos/cotacao.actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime } from '@/lib/utils';

export type CotacaoDTO = {
  _id: string;
  status: 'enviada' | 'aprovada' | 'recusada';
  valorEstimado: number;
  descricao: string;
  prazoEntregaDias: number | null;
  observacoes: string | null;
  anexoId: string | null;
  submittedByUserId: string;
  submittedByName: string | null;
  submittedAt: string;
  reviewedByUserId: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewObservacao: string | null;
  createdAt: string;
};

type CotacoesResponse = {
  active: CotacaoDTO | null;
  history: CotacaoDTO[];
};

interface Props {
  ticketId: string;
  canReview: boolean;
  onChange?: () => void;
}

function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

const STATUS_BADGE: Record<CotacaoDTO['status'], string> = {
  enviada: 'bg-amber-100 text-amber-900 border-amber-200',
  aprovada: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  recusada: 'bg-rose-100 text-rose-900 border-rose-200',
};
const STATUS_LABEL: Record<CotacaoDTO['status'], string> = {
  enviada: 'Aguardando Aprovação',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
};

export function CotacaoApprovalCard({ ticketId, canReview, onChange }: Props) {
  const [data, setData] = useState<CotacoesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectObs, setRejectObs] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const fetchCotacoes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chamados/${ticketId}/cotacoes`, { cache: 'no-store' });
      if (!res.ok) {
        setError('Não foi possível carregar as cotações.');
        setData(null);
        return;
      }
      const json = (await res.json()) as CotacoesResponse;
      setData(json);
    } catch {
      setError('Erro de rede ao carregar cotações.');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void fetchCotacoes();
  }, [fetchCotacoes]);

  const handleApprove = useCallback(async () => {
    if (!data?.active) return;
    setApproving(true);
    setError(null);
    try {
      const result = await approveCotacaoAction({ cotacaoId: data.active._id });
      if (result.ok) {
        await fetchCotacoes();
        onChange?.();
      } else {
        setError(result.error);
      }
    } finally {
      setApproving(false);
    }
  }, [data, fetchCotacoes, onChange]);

  const handleReject = useCallback(async () => {
    if (!data?.active) return;
    if (rejectObs.trim().length < 5) {
      setRejectError('Informe o motivo da recusa (mín. 5 caracteres).');
      return;
    }
    setRejecting(true);
    setRejectError(null);
    try {
      const result = await rejectCotacaoAction({
        cotacaoId: data.active._id,
        observacao: rejectObs.trim(),
      });
      if (result.ok) {
        setRejectDialogOpen(false);
        setRejectObs('');
        await fetchCotacoes();
        onChange?.();
      } else {
        setRejectError(result.error);
      }
    } finally {
      setRejecting(false);
    }
  }, [data, rejectObs, fetchCotacoes, onChange]);

  if (loading) {
    return (
      <Card className="rounded-2xl border-border/50">
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando cotações...
        </CardContent>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card className="rounded-2xl border-destructive/50">
        <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (!data || (data.active == null && data.history.length === 0)) {
    return null;
  }

  const active = data.active;
  const historyWithoutActive = active
    ? data.history.filter((c) => c._id !== active._id)
    : data.history;

  return (
    <>
      {active && (
        <Card className="rounded-2xl border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/10">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-5 w-5 text-amber-600" />
              Cotação aguardando aprovação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {error && (
              <div className="rounded-xl border border-destructive bg-destructive/10 p-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-2xl font-semibold text-foreground">
                {formatBrl(active.valorEstimado)}
              </span>
              {active.prazoEntregaDias != null && (
                <span className="text-sm text-muted-foreground">
                  Prazo: {active.prazoEntregaDias} dia
                  {active.prazoEntregaDias === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Descrição</div>
              <p className="whitespace-pre-wrap text-sm">{active.descricao}</p>
            </div>
            {active.observacoes && (
              <div>
                <div className="text-xs font-medium text-muted-foreground">Observações</div>
                <p className="whitespace-pre-wrap text-sm">{active.observacoes}</p>
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Enviada por {active.submittedByName ?? 'desconhecido'} em{' '}
              {formatDateTime(new Date(active.submittedAt))}
            </div>
            {canReview && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  onClick={handleApprove}
                  disabled={approving || rejecting}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-sm hover:from-emerald-700 hover:to-emerald-800"
                >
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  {approving ? 'Aprovando...' : 'Aprovar'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setRejectError(null);
                    setRejectObs('');
                    setRejectDialogOpen(true);
                  }}
                  disabled={approving || rejecting}
                  className="rounded-xl border-rose-300 text-rose-700 hover:bg-rose-50"
                >
                  <ThumbsDown className="mr-1 h-4 w-4" />
                  Recusar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {historyWithoutActive.length > 0 && (
        <Card className="rounded-2xl border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Histórico de cotações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {historyWithoutActive.map((c, idx) => (
              <div key={c._id} className="text-sm">
                {idx > 0 && <Separator className="mb-3" />}
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{formatBrl(c.valorEstimado)}</span>
                  <Badge variant="outline" className={STATUS_BADGE[c.status]}>
                    {STATUS_LABEL[c.status]}
                  </Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {c.descricao}
                </p>
                <div className="mt-1 text-xs text-muted-foreground">
                  Enviada por {c.submittedByName ?? '—'} em{' '}
                  {formatDateTime(new Date(c.submittedAt))}
                  {c.reviewedAt && (
                    <>
                      {' '}· Decidida por {c.reviewedByName ?? '—'} em{' '}
                      {formatDateTime(new Date(c.reviewedAt))}
                    </>
                  )}
                </div>
                {c.reviewObservacao && (
                  <p className="mt-1 text-xs italic text-muted-foreground">
                    &ldquo;{c.reviewObservacao}&rdquo;
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={rejectDialogOpen}
        onOpenChange={(v) => {
          if (!rejecting) setRejectDialogOpen(v);
        }}
      >
        <DialogContent className="max-w-md sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Recusar cotação</DialogTitle>
            <DialogDescription>
              Informe o motivo da recusa. A contratada poderá enviar uma nova cotação.
            </DialogDescription>
          </DialogHeader>
          {rejectError && (
            <div className="rounded-xl border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              {rejectError}
            </div>
          )}
          <Textarea
            value={rejectObs}
            onChange={(e) => setRejectObs(e.target.value)}
            placeholder="Motivo da recusa (mín. 5 caracteres)..."
            className="min-h-[100px] rounded-xl"
            disabled={rejecting}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              disabled={rejecting}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleReject}
              disabled={rejecting}
              className="rounded-xl bg-rose-600 text-white hover:bg-rose-700"
            >
              {rejecting ? 'Recusando...' : 'Confirmar Recusa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
