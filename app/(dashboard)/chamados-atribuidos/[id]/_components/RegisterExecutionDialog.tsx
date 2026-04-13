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
      <DialogContent className="max-w-lg overflow-y-auto sm:max-h-[90vh]" showCloseButton>
        <DialogHeader>
          <DialogTitle>Registrar Execução do Serviço</DialogTitle>
        </DialogHeader>

        {/* Banner informativo */}
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-4 dark:border-indigo-800/50 dark:bg-indigo-950/30">
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span className="text-indigo-900 dark:text-indigo-100">
                Início: {formatDateTime(chamado.createdAt, tzOpt)} (abertura do chamado)
              </span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span className="text-indigo-900 dark:text-indigo-100">
                Conclusão: Será registrada automaticamente agora
              </span>
            </div>
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span className="text-indigo-900 dark:text-indigo-100">
                Campos de data/hora gerenciados automaticamente pelo sistema
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="serviceDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Descrição do Serviço Executado <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva o que foi realizado..."
                      className="min-h-[100px] resize-y rounded-xl transition-all focus-visible:ring-indigo-500/30"
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
              name="materialsUsed"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Materiais Utilizados</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Liste os materiais utilizados..."
                      className="min-h-[80px] resize-y rounded-xl transition-all focus-visible:ring-indigo-500/30"
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
              name="evidencePhotos"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fotos de Evidência</FormLabel>
                  <FormControl>
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
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Observações adicionais..."
                      className="min-h-[80px] resize-y rounded-xl transition-all focus-visible:ring-indigo-500/30"
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
                className="rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-500/20 transition-all hover:from-emerald-600 hover:to-emerald-700 hover:shadow-emerald-500/30"
              >
                {submitting ? 'Registrando...' : 'Registrar e Concluir'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
