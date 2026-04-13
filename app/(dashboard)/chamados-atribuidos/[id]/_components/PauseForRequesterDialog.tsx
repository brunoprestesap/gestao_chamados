'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Hourglass } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  type ActionResult,
  pauseForRequesterAction,
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { PauseForRequesterSchema } from '@/shared/chamados/pause.schemas';

const formSchema = PauseForRequesterSchema.omit({ ticketId: true });
type FormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  onSuccess: () => void;
}

export function PauseForRequesterDialog({ open, onOpenChange, ticketId, onSuccess }: Props) {
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
        const result: ActionResult = await pauseForRequesterAction({
          ticketId,
          reason: values.reason,
        });
        if (result.ok) {
          onOpenChange(false);
          onSuccess();
        } else {
          setError(result.error);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao pausar chamado.');
      } finally {
        setSubmitting(false);
      }
    },
    [ticketId, onOpenChange, onSuccess],
  );

  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (!submitting) onOpenChange(v);
    },
    [submitting, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md sm:rounded-2xl" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hourglass className="h-5 w-5 text-amber-600" />
            Aguardando Solicitante
          </DialogTitle>
          <DialogDescription>
            O SLA de resolução será pausado enquanto aguarda resposta do solicitante.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-xl border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
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
                  <FormLabel>
                    Motivo <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva o motivo da espera (min. 10 caracteres)..."
                      className="min-h-[100px] resize-y rounded-xl transition-all focus-visible:ring-amber-500/30"
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-sm shadow-amber-500/20 transition-all hover:from-amber-600 hover:to-amber-700 hover:shadow-amber-500/30"
              >
                {submitting ? 'Pausando...' : 'Confirmar Pausa'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
