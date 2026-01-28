'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';

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
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const CancelTicketSchema = z.object({
  observacoes: z
    .string()
    .optional()
    .default('')
    .transform((v) => (v ?? '').trim()),
});

type CancelTicketFormValues = z.infer<typeof CancelTicketSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: (observacoes?: string) => Promise<void>;
};

export function CancelTicketDialog({ open, onOpenChange, onCancel }: Props) {
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<CancelTicketFormValues>({
    resolver: zodResolver(CancelTicketSchema),
    defaultValues: {
      observacoes: '',
    },
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        observacoes: '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(values: CancelTicketFormValues) {
    setSubmitting(true);
    try {
      await onCancel(values.observacoes || undefined);
    } catch (error) {
      console.error('Erro ao cancelar chamado:', error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-100 dark:bg-red-900/40">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <DialogTitle>Cancelar Chamado</DialogTitle>
              <DialogDescription className="mt-1">
                Esta ação não pode ser desfeita. O chamado será marcado como cancelado.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo do Cancelamento (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva o motivo do cancelamento..."
                      className="min-h-20 resize-y"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Não Cancelar
              </Button>
              <Button type="submit" variant="destructive" disabled={submitting}>
                {submitting ? 'Cancelando...' : 'Confirmar Cancelamento'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
