'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { reopenTicketAction, type ReopenTicketResult } from '@/app/(dashboard)/gestao/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { CHAMADO_STATUS_LABELS, type ChamadoStatus } from '@/shared/chamados/chamado.constants';

const formSchema = z.object({
  reason: z
    .string()
    .min(10, 'Motivo deve ter no mínimo 10 caracteres')
    .max(2000, 'Motivo deve ter no máximo 2000 caracteres')
    .transform((v) => v.trim()),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chamadoId: string;
  chamadoStatus: ChamadoStatus;
  onSuccess: () => void;
};

export function ReabrirChamadoDialog({
  open,
  onOpenChange,
  chamadoId,
  chamadoStatus,
  onSuccess,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema) as any,
    defaultValues: { reason: '' },
  });

  useEffect(() => {
    if (open) {
      form.reset({ reason: '' });
      setError(null);
    }
  }, [open, form]);

  const onSubmit = useCallback(
    async (values: FormValues) => {
      setSubmitting(true);
      setError(null);
      try {
        const result: ReopenTicketResult = await reopenTicketAction({
          ticketId: chamadoId,
          reason: values.reason,
        });
        if (result.ok) {
          onOpenChange(false);
          onSuccess();
        } else {
          setError(result.error);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao reabrir. Tente novamente.');
      } finally {
        setSubmitting(false);
      }
    },
    [chamadoId, onOpenChange, onSuccess],
  );

  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (!submitting) onOpenChange(v);
    },
    [submitting, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex max-h-[90dvh] w-[calc(100%-1rem)] flex-col gap-4 overflow-y-auto p-4 sm:max-w-md sm:p-6 [&>button]:right-3 [&>button]:top-3 sm:[&>button]:right-4 sm:[&>button]:top-4"
        showCloseButton
      >
        <DialogHeader className="pr-8 sm:pr-0">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-100 dark:bg-amber-900/40">
              <RotateCcw className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold sm:text-lg">
                Reabrir Chamado
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs sm:text-sm">
                O chamado voltará para atendimento. Informe o motivo da reabertura.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200 sm:text-sm">
          <p>
            <span className="font-semibold">{CHAMADO_STATUS_LABELS[chamadoStatus]}</span>
            <span className="mx-2 text-amber-700/80 dark:text-amber-300/70">→</span>
            <span className="font-semibold">Em atendimento</span>
          </p>
          <p className="mt-1 text-amber-800/80 dark:text-amber-200/80">
            O técnico atribuído permanece. A avaliação (se houver) é preservada como histórico.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive sm:text-sm">
            {error}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo da reabertura *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva o motivo da reabertura (mínimo 10 caracteres)..."
                      className="min-h-24 resize-y"
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
                className="order-1 w-full min-h-11 touch-manipulation bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700 sm:order-2 sm:w-auto sm:min-h-9"
                disabled={submitting}
              >
                {submitting ? 'Reabrindo…' : 'Reabrir'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
