'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Gauge } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  updateTicketPriorityAction,
  type UpdateTicketPriorityResult,
} from '@/app/(dashboard)/gestao/actions';
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
import {
  FINAL_PRIORITY_LABELS,
  FINAL_PRIORITY_VALUES,
  type FinalPriority,
} from '@/shared/chamados/chamado.constants';
import { UpdateTicketPrioritySchema } from '@/shared/chamados/chamado.schemas';

/**
 * A correção mínima da prioridade de um chamado já `validado` (spec 0007,
 * AC-11). A ação recusa fora da janela (chamado atribuído, status diferente
 * de `validado`, ou mesma prioridade); esta tela só mostra a mensagem que a
 * ação devolve, sem repetir a checagem aqui.
 */

const formSchema = UpdateTicketPrioritySchema.omit({ chamadoId: true });

type FormValues = z.infer<typeof formSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chamadoId: string;
  currentPriority: FinalPriority | null | undefined;
  onSuccess: () => void;
};

export function CorrigirPrioridadeDialog({
  open,
  onOpenChange,
  chamadoId,
  currentPriority,
  onSuccess,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema) as any,
    defaultValues: { finalPriority: currentPriority ?? 'NORMAL', classificationNotes: '' },
  });

  useEffect(() => {
    if (open) {
      form.reset({ finalPriority: currentPriority ?? 'NORMAL', classificationNotes: '' });
      setError(null);
    }
  }, [open, currentPriority, form]);

  const onSubmit = useCallback(
    async (values: FormValues) => {
      setSubmitting(true);
      setError(null);
      try {
        const result: UpdateTicketPriorityResult = await updateTicketPriorityAction({
          chamadoId,
          ...values,
        });
        if (result.ok) {
          onOpenChange(false);
          onSuccess();
        } else {
          setError(result.error);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao corrigir prioridade. Tente novamente.');
      } finally {
        setSubmitting(false);
      }
    },
    [chamadoId, onOpenChange, onSuccess],
  );

  // Enviar a prioridade que já vale só devolveria o erro "já é a atual".
  const mesmaPrioridade = form.watch('finalPriority') === currentPriority;

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
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-100 dark:bg-indigo-900/40">
              <Gauge className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold sm:text-lg">
                Corrigir Prioridade
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs sm:text-sm">
                O SLA é recalculado a partir da classificação original, sem mover o prazo pela
                correção em si. Só é possível enquanto o chamado está validado e sem técnico
                atribuído.
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
              name="finalPriority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nova prioridade *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full min-h-10 sm:min-h-9">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-[min(70vh,20rem)]" position="popper">
                      {FINAL_PRIORITY_VALUES.map((v) => (
                        <SelectItem key={v} value={v}>
                          {FINAL_PRIORITY_LABELS[v]}
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
              name="classificationNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações da correção</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Por que a prioridade mudou (acrescenta à classificação original)."
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
                disabled={submitting || mesmaPrioridade}
                className="order-1 w-full min-h-11 touch-manipulation sm:order-2 sm:w-auto sm:min-h-9"
              >
                {submitting ? 'Corrigindo…' : 'Corrigir Prioridade'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
