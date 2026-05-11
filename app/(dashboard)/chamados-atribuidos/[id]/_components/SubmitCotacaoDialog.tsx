'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ClipboardList } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  type CotacaoActionResult,
  submitCotacaoAction,
} from '@/app/(dashboard)/chamados-atribuidos/cotacao.actions';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SubmitCotacaoSchema } from '@/shared/chamados/cotacao.schemas';

const formSchema = SubmitCotacaoSchema.omit({ ticketId: true });
type FormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  onSuccess: () => void;
}

export function SubmitCotacaoDialog({ open, onOpenChange, ticketId, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      valorEstimado: undefined as unknown as number,
      descricao: '',
      prazoEntregaDias: undefined,
      observacoes: '',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        valorEstimado: undefined as unknown as number,
        descricao: '',
        prazoEntregaDias: undefined,
        observacoes: '',
      });
      setError(null);
    }
  }, [open, form]);

  const onSubmit = useCallback(
    async (values: FormValues) => {
      setSubmitting(true);
      setError(null);
      try {
        const result: CotacaoActionResult = await submitCotacaoAction({
          ticketId,
          valorEstimado: values.valorEstimado,
          descricao: values.descricao,
          prazoEntregaDias: values.prazoEntregaDias,
          observacoes: values.observacoes,
        });
        if (result.ok) {
          onOpenChange(false);
          onSuccess();
        } else {
          setError(result.error);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao enviar cotação.');
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
      <DialogContent
        className="max-w-lg sm:rounded-2xl max-h-[90vh] overflow-y-auto"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-indigo-600" />
            Solicitar Aprovação de Cotação
          </DialogTitle>
          <DialogDescription>
            O SLA será pausado a partir do envio até a decisão do gestor (aprovação ou
            recusa).
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
              name="valorEstimado"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Valor Estimado (R$) <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0.01"
                      placeholder="0,00"
                      className="rounded-xl transition-all focus-visible:ring-indigo-500/30"
                      disabled={submitting}
                      value={field.value ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        field.onChange(v === '' ? undefined : Number(v));
                      }}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Material/Serviço <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva o material ou serviço, quantidade, especificações..."
                      className="min-h-[100px] resize-y rounded-xl transition-all focus-visible:ring-indigo-500/30"
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Mín. 10 caracteres.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="prazoEntregaDias"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prazo de Entrega (dias)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="365"
                      placeholder="Ex.: 5"
                      className="rounded-xl transition-all focus-visible:ring-indigo-500/30"
                      disabled={submitting}
                      value={field.value ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        field.onChange(v === '' ? undefined : Number(v));
                      }}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormDescription>Opcional.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Informações adicionais para o gestor (opcional)..."
                      className="min-h-[70px] resize-y rounded-xl transition-all focus-visible:ring-indigo-500/30"
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-3 text-sm text-indigo-900 dark:border-indigo-800/50 dark:bg-indigo-950/30 dark:text-indigo-100">
              Para anexar fotos ou documentos da cotação, use a galeria de anexos do chamado
              após o envio.
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
                className="rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm shadow-indigo-500/20 transition-all hover:from-indigo-700 hover:to-blue-700 hover:shadow-indigo-500/30"
              >
                {submitting ? 'Enviando...' : 'Enviar para Aprovação'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
