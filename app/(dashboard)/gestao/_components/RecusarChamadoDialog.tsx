'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Ban } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { rejectTicketAction, type RejectTicketResult } from '@/app/(dashboard)/gestao/actions';
import type { ChamadoDTO } from '@/app/(dashboard)/meus-chamados/_components/ChamadoCard';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { RejectTicketSchema } from '@/shared/chamados/rejection.schemas';

const formSchema = RejectTicketSchema.omit({ chamadoId: true });
type FormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chamado: ChamadoDTO | null;
  onSuccess: () => void;
}

export function RecusarChamadoDialog({ open, onOpenChange, chamado, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      rejectionReason: '',
      rejectionGuidance: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({ rejectionReason: '', rejectionGuidance: '' });
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chamado?._id]);

  const onSubmit = useCallback(
    async (values: FormValues) => {
      if (!chamado) return;
      setSubmitting(true);
      setError(null);
      try {
        const result: RejectTicketResult = await rejectTicketAction({
          chamadoId: chamado._id,
          ...values,
        });
        if (result.ok) {
          onOpenChange(false);
          onSuccess();
        } else {
          setError(result.error);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao recusar chamado. Tente novamente.');
      } finally {
        setSubmitting(false);
      }
    },
    [chamado, onOpenChange, onSuccess],
  );

  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (!submitting) onOpenChange(v);
    },
    [submitting, onOpenChange],
  );

  if (!chamado) return null;

  const reasonValue = form.watch('rejectionReason') ?? '';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex max-h-[90dvh] w-[calc(100%-1rem)] max-w-lg flex-col gap-4 overflow-y-auto rounded-lg p-4 shadow-lg sm:max-h-[90vh] sm:p-6 [&>button]:top-3 [&>button]:right-3 sm:[&>button]:top-4 sm:[&>button]:right-4"
        showCloseButton
      >
        <DialogHeader className="space-y-1 pr-8 sm:pr-0">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold leading-tight sm:text-lg">
            <Ban className="h-5 w-5 shrink-0 text-rose-600" aria-hidden />
            Recusar Chamado
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 sm:p-4 sm:space-y-1">
          <p className="font-semibold text-foreground break-words text-sm sm:text-base">
            #{chamado.ticket_number}
          </p>
          <p className="text-muted-foreground break-words text-xs sm:text-sm">
            {chamado.titulo || 'Sem título'}
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="text-xs leading-relaxed sm:text-sm">
            Esta ação é <strong>irreversível</strong>. O chamado será encerrado como recusado e o
            solicitante será notificado com a justificativa informada.
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-xs text-destructive sm:text-sm">
            {error}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="rejectionReason"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-sm">
                    Justificativa da Recusa <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Explique o motivo da recusa da demanda (mínimo 10 caracteres)..."
                      className="min-h-[5rem] resize-y text-sm sm:min-h-24 sm:text-base"
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <div className="flex items-center justify-between">
                    <FormMessage />
                    <span className="ml-auto text-xs text-muted-foreground">
                      {reasonValue.length} / 1000
                    </span>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rejectionGuidance"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-sm">Orientação ao Solicitante</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Oriente o solicitante sobre como proceder (ex: abrir novo chamado com informações corretas)..."
                      className="min-h-[4rem] resize-y text-sm sm:min-h-20 sm:text-base"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="flex flex-col gap-2 pt-2 pb-[env(safe-area-inset-bottom,0)] sm:flex-row sm:justify-end sm:gap-2 sm:pt-0 sm:pb-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
                className="order-2 w-full min-h-11 touch-manipulation sm:order-1 sm:w-auto sm:min-h-9"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={submitting}
                className="order-1 w-full min-h-11 touch-manipulation sm:order-2 sm:w-auto sm:min-h-9"
              >
                <Ban className="mr-1.5 h-4 w-4" aria-hidden />
                {submitting ? 'Recusando…' : 'Recusar Chamado'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
