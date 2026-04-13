'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  registerExecutionAction,
  type RegisterExecutionResult,
} from '@/app/(dashboard)/chamados-atribuidos/actions';
import { notifyAttachmentAction } from '@/app/(dashboard)/meus-chamados/actions';
import { useInstitutionalTimezone } from '@/components/config/expediente-provider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FileUpload, type UploadedFile } from '@/components/ui/file-upload';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime } from '@/lib/utils';
import { RegisterExecutionSchema } from '@/shared/chamados/execution.schemas';

const formSchema = RegisterExecutionSchema.omit({ ticketId: true });
type FormValues = z.infer<typeof formSchema>;

/** Mínimo necessário para o dialog (lista ou detalhe). */
export type ChamadoExecutionInput = { _id: string; createdAt: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chamado: ChamadoExecutionInput | null;
  onSuccess: () => void;
}

export function RegisterExecutionDialog({ open, onOpenChange, chamado, onSuccess }: Props) {
  const timezone = useInstitutionalTimezone();
  const tzOpt = { timeZone: timezone };
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultValues = useMemo<FormValues>(
    () => ({
      serviceDescription: '',
      materialsUsed: '',
      notes: '',
      evidencePhotos: [],
    }),
    [],
  );

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema) as any,
    defaultValues,
  });

  useEffect(() => {
    if (!open || !chamado) {
      setError(null);
      return;
    }
    form.reset(defaultValues);
    setError(null);
  }, [open, chamado, form, defaultValues]);

  const onSubmit = useCallback(
    async (values: FormValues) => {
      if (!chamado) return;
      setSubmitting(true);
      setError(null);
      try {
        const result: RegisterExecutionResult = await registerExecutionAction({
          ticketId: chamado._id,
          serviceDescription: values.serviceDescription,
          materialsUsed: values.materialsUsed || undefined,
          notes: values.notes || undefined,
          evidencePhotos: values.evidencePhotos ?? [],
        });
        if (result.ok) {
          onOpenChange(false);
          onSuccess();
        } else {
          setError(result.error);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao registrar execução. Tente novamente.');
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
      <DialogContent className="flex max-h-[95vh] w-full max-w-2xl flex-col gap-0 p-0 sm:max-h-[90vh]" showCloseButton>
        <DialogHeader className="border-b border-border/40 px-6 py-5">
          <DialogTitle className="text-xl">Registrar Execução do Serviço</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-6">
            {/* Banner informativo */}
            <div className="flex flex-col gap-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-900/30 dark:bg-indigo-950/20">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
                  <Clock className="h-3.5 w-3.5" />
                </div>
                <div className="text-sm">
                  <span className="font-medium text-indigo-900 dark:text-indigo-100">Início do atendimento:</span>
                  <p className="text-indigo-700 dark:text-indigo-300">{formatDateTime(chamado.createdAt, tzOpt)} (abertura do chamado)</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </div>
                <div className="text-sm">
                  <span className="font-medium text-emerald-900 dark:text-emerald-100">Conclusão:</span>
                  <p className="text-emerald-700 dark:text-emerald-300">Será registrada automaticamente ao salvar este formulário</p>
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <Form {...form}>
              <form id="register-execution-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="serviceDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">
                        Descrição do Serviço Executado <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Descreva detalhadamente o que foi realizado..."
                          className="min-h-[120px] resize-y rounded-xl bg-muted/30 transition-all focus-visible:bg-background focus-visible:ring-indigo-500/30"
                          disabled={submitting}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="materialsUsed"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground">Materiais Utilizados</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Liste os materiais utilizados..."
                            className="min-h-[100px] resize-y rounded-xl bg-muted/30 transition-all focus-visible:bg-background focus-visible:ring-indigo-500/30"
                            disabled={submitting}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground">Observações</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Observações adicionais, pendências..."
                            className="min-h-[100px] resize-y rounded-xl bg-muted/30 transition-all focus-visible:bg-background focus-visible:ring-indigo-500/30"
                            disabled={submitting}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="evidencePhotos"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Fotos de Evidência</FormLabel>
                      <FormControl>
                        <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-4 transition-colors hover:bg-muted/20">
                          <FileUpload
                            chamadoId={chamado._id}
                            context="execucao"
                            mode="immediate"
                            onUploadComplete={(file: UploadedFile) => {
                              const current = field.value ?? [];
                              field.onChange([...current, file.url]);
                              void notifyAttachmentAction({
                                chamadoId: chamado._id,
                                attachmentId: file._id,
                              });
                            }}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </div>
        </div>

        <DialogFooter className="border-t border-border/40 bg-muted/10 px-6 py-4 sm:justify-between">
          <p className="hidden text-sm text-muted-foreground sm:block">
            Verifique as informações antes de concluir.
          </p>
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:gap-3">
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-xl transition-all sm:w-auto"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="register-execution-form"
              disabled={submitting}
              className="w-full rounded-xl bg-linear-to-r from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-500/20 transition-all hover:from-emerald-600 hover:to-emerald-700 hover:shadow-emerald-500/30 sm:w-auto"
            >
              {submitting ? 'Registrando...' : 'Registrar e Concluir'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
