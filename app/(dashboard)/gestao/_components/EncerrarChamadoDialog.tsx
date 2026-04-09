'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { closeTicketAction, type CloseTicketResult } from '@/app/(dashboard)/gestao/actions';
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

const formSchema = z.object({
  closureNotes: z
    .string()
    .default('')
    .transform((v) => (v ?? '').trim())
    .refine((v) => v.length <= 2000, 'Máximo 2000 caracteres'),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chamadoId: string;
  onSuccess: () => void;
};

export function EncerrarChamadoDialog({ open, onOpenChange, chamadoId, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema) as any,
    defaultValues: { closureNotes: '' },
  });

  useEffect(() => {
    if (open) {
      form.reset({ closureNotes: '' });
      setError(null);
    }
  }, [open, form]);

  const onSubmit = useCallback(
    async (values: FormValues) => {
      setSubmitting(true);
      setError(null);
      try {
        const result: CloseTicketResult = await closeTicketAction({
          ticketId: chamadoId,
          closureNotes: values.closureNotes ?? '',
        });
        if (result.ok) {
          onOpenChange(false);
          onSuccess();
        } else {
          setError(result.error);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao encerrar. Tente novamente.');
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
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold sm:text-lg">
                Encerrar Chamado
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs sm:text-sm">
                Confirma o encerramento deste chamado? Esta ação finalizará o atendimento.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {error && (
          <div className="rounded-xl border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive sm:text-sm">
            {error}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="closureNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações do Encerramento</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Observações finais..."
                      className="min-h-20 resize-y"
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
                className="order-1 w-full min-h-11 touch-manipulation bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700 sm:order-2 sm:w-auto sm:min-h-9"
                disabled={submitting}
              >
                {submitting ? 'Encerrando…' : 'Encerrar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
