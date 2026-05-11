'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Ban } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  refuseServiceAction,
  type RefuseServiceResult,
} from '@/app/(dashboard)/meus-chamados/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  reason: z
    .string()
    .min(10, 'Motivo deve ter no mínimo 10 caracteres')
    .max(2000, 'Motivo deve ter no máximo 2000 caracteres')
    .transform((v) => v.trim()),
});

type FormValues = z.infer<typeof formSchema>;

export type RecusarServicoDialogChamado = {
  _id: string;
  ticket_number: string;
  titulo: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chamado: RecusarServicoDialogChamado | null;
  onSuccess: () => void;
};

export function RecusarServicoDialog({ open, onOpenChange, chamado, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema) as any,
    defaultValues: { reason: '' },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({ reason: '' });
    setError(null);
  }, [open, chamado?._id, form]);

  const onSubmit = useCallback(
    async (values: FormValues) => {
      if (!chamado) return;
      setSubmitting(true);
      setError(null);
      try {
        const result: RefuseServiceResult = await refuseServiceAction({
          ticketId: chamado._id,
          reason: values.reason,
        });
        if (result.ok) {
          onOpenChange(false);
          onSuccess();
        } else {
          setError(result.error);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao recusar serviço. Tente novamente.');
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" />
            Recusar Serviço
          </DialogTitle>
          <DialogDescription className="mt-1">
            O chamado será reaberto para retrabalho pelo técnico. Descreva o motivo da recusa.
          </DialogDescription>
        </DialogHeader>

        <Card className="border-muted">
          <CardContent className="pt-4">
            <p className="font-mono text-sm font-semibold text-foreground">
              #{chamado.ticket_number || 'Sem número'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{chamado.titulo}</p>
          </CardContent>
        </Card>

        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          Ao recusar, o chamado voltará ao status &quot;Em Atendimento&quot; e o técnico será
          notificado para realizar o retrabalho.
        </div>

        {error && (
          <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
                  <FormLabel>Motivo da Recusa (obrigatório)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva por que o serviço não foi satisfatório. Ex.: O problema do ar-condicionado voltou após o atendimento..."
                      className="min-h-24 resize-y"
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
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" disabled={submitting}>
                {submitting ? 'Recusando…' : 'Recusar Serviço'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
