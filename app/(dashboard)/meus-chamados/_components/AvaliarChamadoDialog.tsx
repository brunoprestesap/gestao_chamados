'use client';

import { Star } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import {
  submitTicketEvaluationAction,
  type SubmitEvaluationResult,
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
  rating: z.number().int().min(1, 'Selecione de 1 a 5 estrelas').max(5),
  comment: z
    .string()
    .default('')
    .transform((v) => (v ?? '').trim())
    .refine((v) => v.length <= 2000, 'Máximo 2000 caracteres'),
});

type FormValues = z.infer<typeof formSchema>;

export type AvaliarChamadoDialogChamado = {
  _id: string;
  ticket_number: string;
  titulo: string;
  assignedToUserId?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chamado: AvaliarChamadoDialogChamado | null;
  onSuccess: () => void;
};

async function fetchUserName(userId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/users/${userId}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data.item?.name ?? null;
  } catch {
    return null;
  }
}

export function AvaliarChamadoDialog({ open, onOpenChange, chamado, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [technicianName, setTechnicianName] = useState<string | null>(null);

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema) as any,
    defaultValues: { rating: 0, comment: '' },
  });

  const rating = form.watch('rating');

  useEffect(() => {
    if (!open) return;
    form.reset({ rating: 0, comment: '' });
    setError(null);
    setTechnicianName(null);
    if (chamado?.assignedToUserId) {
      fetchUserName(chamado.assignedToUserId).then(setTechnicianName);
    }
  }, [open, chamado?.assignedToUserId, chamado?._id, form]);

  const onSubmit = useCallback(
    async (values: FormValues) => {
      if (!chamado) return;
      setSubmitting(true);
      setError(null);
      try {
        const result: SubmitEvaluationResult = await submitTicketEvaluationAction({
          ticketId: chamado._id,
          rating: values.rating,
          ...(values.comment.trim() ? { comment: values.comment.trim() } : {}),
        });
        if (result.ok) {
          onOpenChange(false);
          onSuccess();
        } else {
          setError(result.error);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao enviar avaliação. Tente novamente.');
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
          <DialogTitle>Avaliar Atendimento</DialogTitle>
          <DialogDescription className="mt-1">
            Avalie o atendimento deste chamado. Sua opinião nos ajuda a melhorar.
          </DialogDescription>
        </DialogHeader>

        <Card className="border-muted">
          <CardContent className="pt-4">
            <p className="font-mono text-sm font-semibold text-foreground">
              #{chamado.ticket_number || 'Sem número'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{chamado.titulo}</p>
            <p className="mt-2 text-sm text-muted-foreground">Técnico: {technicianName ?? '—'}</p>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="rating"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Avaliação (obrigatório)</FormLabel>
                  <FormControl>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          className="rounded p-1 transition-colors hover:scale-110 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          onClick={() => field.onChange(n)}
                          aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
                        >
                          <Star
                            className={`h-8 w-8 ${
                              n <= (rating || 0)
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-muted-foreground'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="comment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Comentário (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Comentário opcional sobre o atendimento..."
                      className="min-h-20 resize-y"
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
              <Button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                disabled={submitting || !rating || rating < 1}
              >
                {submitting ? 'Enviando…' : 'Enviar Avaliação'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
