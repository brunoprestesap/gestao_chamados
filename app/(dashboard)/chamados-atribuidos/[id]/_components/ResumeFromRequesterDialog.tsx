'use client';

import { Play } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
  type ActionResult,
  resumeTicketAction,
} from '@/app/(dashboard)/chamados-atribuidos/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PAUSE_REASON_LABELS, type PauseReason } from '@/shared/chamados/pause-reason.constants';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  slaPausedAt: string | null;
  pauseReason?: string | null;
  onSuccess: () => void;
}

export function ResumeFromRequesterDialog({
  open,
  onOpenChange,
  ticketId,
  slaPausedAt,
  pauseReason,
  onSuccess,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedStr, setElapsedStr] = useState('');

  useEffect(() => {
    if (!open || !slaPausedAt) {
      setError(null);
      setElapsedStr('');
      return;
    }

    function update() {
      const pausedAt = new Date(slaPausedAt!).getTime();
      const diffMs = Date.now() - pausedAt;
      const mins = Math.max(0, Math.round(diffMs / 60000));
      if (mins >= 60) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        setElapsedStr(`${h}h${m > 0 ? ` ${m}min` : ''}`);
      } else {
        setElapsedStr(`${mins}min`);
      }
    }

    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [open, slaPausedAt]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result: ActionResult = await resumeTicketAction({ ticketId });
      if (result.ok) {
        onOpenChange(false);
        onSuccess();
      } else {
        setError(result.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao retomar chamado.');
    } finally {
      setSubmitting(false);
    }
  }, [ticketId, onOpenChange, onSuccess]);

  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (!submitting) onOpenChange(v);
    },
    [submitting, onOpenChange],
  );

  const reasonLabel = pauseReason
    ? (PAUSE_REASON_LABELS[pauseReason as PauseReason] ?? pauseReason)
    : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-md sm:rounded-2xl max-h-[90vh] overflow-y-auto"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-emerald-600" />
            Retomar Atendimento
          </DialogTitle>
          <DialogDescription>
            O SLA será retomado e o prazo de resolução ajustado pelo tempo pausado.
          </DialogDescription>
        </DialogHeader>

        {reasonLabel && (
          <div className="rounded-xl border border-orange-200 bg-orange-50/80 p-3 dark:border-orange-800/50 dark:bg-orange-950/30">
            <p className="text-sm text-orange-900 dark:text-orange-100">
              Motivo da pausa: <span className="font-semibold">{reasonLabel}</span>
            </p>
          </div>
        )}

        {elapsedStr && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-800/50 dark:bg-amber-950/30">
            <p className="text-sm text-amber-900 dark:text-amber-100">
              Tempo pausado: <span className="font-semibold">{elapsedStr}</span>
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl transition-all"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-500/20 transition-all hover:from-emerald-600 hover:to-emerald-700 hover:shadow-emerald-500/30"
          >
            {submitting ? 'Retomando...' : 'Retomar Atendimento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
