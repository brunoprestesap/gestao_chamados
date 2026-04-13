'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PauseCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  type ActionResult,
  pauseTicketAction,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PauseTicketBaseSchema } from '@/shared/chamados/pause.schemas';
import {
  PAUSE_REASON_LABELS,
  PAUSE_REASONS,
  type PauseReason,
} from '@/shared/chamados/pause-reason.constants';

const formSchema = PauseTicketBaseSchema.omit({ ticketId: true }).refine(
  (data) => {
    if (data.reason === 'outro') {
      return !!data.details && data.details.trim().length >= 10;
    }
    return true;
  },
  {
    message: 'Detalhes obrigatórios quando motivo é "Outro" (mín. 10 caracteres)',
    path: ['details'],
  },
);
type FormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  onSuccess: () => void;
}

export function PauseTicketDialog({ open, onOpenChange, ticketId, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema) as any,
    defaultValues: { reason: undefined, details: '' },
  });

  const watchedReason = form.watch('reason');

  useEffect(() => {
    if (open) {
      form.reset({ reason: undefined, details: '' });
      setError(null);
    }
  }, [open, form]);

  const onSubmit = useCallback(
    async (values: FormValues) => {
      setSubmitting(true);
      setError(null);
      try {
        const result: ActionResult = await pauseTicketAction({
          ticketId,
          reason: values.reason,
          details: values.details,
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
      <DialogContent className="max-w-md sm:rounded-2xl max-h-[90vh] overflow-y-auto" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PauseCircle className="h-5 w-5 text-orange-600" />
            Pausar Atendimento
          </DialogTitle>
          <DialogDescription>
            O SLA de resolução será pausado até que o atendimento seja retomado.
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
                    Motivo da Pausa <span className="text-destructive">*</span>
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={submitting}
                  >
                    <FormControl>
                      <SelectTrigger className="rounded-xl transition-all focus:ring-orange-500/30">
                        <SelectValue placeholder="Selecione o motivo..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="rounded-xl">
                      {PAUSE_REASONS.map((r) => (
                        <SelectItem key={r} value={r} className="rounded-lg">
                          {PAUSE_REASON_LABELS[r as PauseReason]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="details"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Detalhes
                    {watchedReason === 'outro' && (
                      <span className="text-destructive"> *</span>
                    )}
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={
                        watchedReason === 'outro'
                          ? 'Descreva o motivo da pausa (mín. 10 caracteres)...'
                          : 'Informações adicionais (opcional)...'
                      }
                      className="min-h-[80px] resize-y rounded-xl transition-all focus-visible:ring-orange-500/30"
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-xl border border-orange-200 bg-orange-50/80 p-3 text-sm text-orange-900 dark:border-orange-800/50 dark:bg-orange-950/30 dark:text-orange-100">
              O SLA será pausado até que o atendimento seja retomado.
            </div>

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
                className="rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-sm shadow-orange-500/20 transition-all hover:from-orange-600 hover:to-orange-700 hover:shadow-orange-500/30"
              >
                {submitting ? 'Pausando...' : 'Pausar Atendimento'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
