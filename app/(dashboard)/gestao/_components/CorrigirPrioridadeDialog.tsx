'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Gauge } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  direcaoDaPrioridade,
  FINAL_PRIORITY_LABELS,
  FINAL_PRIORITY_VALUES,
  type FinalPriority,
  PRIORIDADE_ORDEM,
} from '@/shared/chamados/chamado.constants';
import { UpdateTicketPrioritySchema } from '@/shared/chamados/chamado.schemas';

/**
 * Corrige a prioridade de um chamado `validado` ou `em atendimento` (spec
 * 0007, AC-11; janela alargada e regra de SLA assimétrica pela spec 0009,
 * AC-7 a AC-10). A ação recusa fora da janela ou fora do papel; esta tela só
 * mostra a mensagem que a ação devolve, sem repetir a checagem de status
 * aqui — mas desabilita, à vista, as prioridades mais baixas para o Preposto
 * quando o chamado já tem técnico (só o Admin baixa nesse caso, AC-10).
 */

const formSchema = UpdateTicketPrioritySchema.omit({ chamadoId: true });

type FormValues = z.infer<typeof formSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chamadoId: string;
  currentPriority: FinalPriority | null | undefined;
  /** Chamado já tem técnico atribuído — trava a descida para quem não é Admin (AC-10). */
  hasTechnician: boolean;
  isAdmin: boolean;
  onSuccess: () => void;
};

const EFEITO_SLA_TEXTO: Record<'sobe' | 'desce', string> = {
  sobe: 'Subir a prioridade nunca aumenta o prazo que o chamado já tinha — só encolhe ou mantém.',
  desce: 'Baixar a prioridade dá o prazo cheio da prioridade nova, contado desde a classificação.',
};

export function CorrigirPrioridadeDialog({
  open,
  onOpenChange,
  chamadoId,
  currentPriority,
  hasTechnician,
  isAdmin,
  onSuccess,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema) as any,
    defaultValues: { finalPriority: currentPriority ?? 'NORMAL', motivo: '' },
  });

  useEffect(() => {
    if (open) {
      form.reset({ finalPriority: currentPriority ?? 'NORMAL', motivo: '' });
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

  const selecionada = form.watch('finalPriority');
  // Enviar a prioridade que já vale só devolveria o erro "já é a atual".
  const mesmaPrioridade = selecionada === currentPriority;
  const direcao = currentPriority ? direcaoDaPrioridade(currentPriority, selecionada) : null;
  const soAdminBaixaComTecnico = hasTechnician && !isAdmin;

  const opcoesDesabilitadas = useMemo(() => {
    if (!soAdminBaixaComTecnico || !currentPriority) return new Set<FinalPriority>();
    return new Set(
      FINAL_PRIORITY_VALUES.filter((v) => PRIORIDADE_ORDEM[v] < PRIORIDADE_ORDEM[currentPriority]),
    );
  }, [soAdminBaixaComTecnico, currentPriority]);

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
                Vale para chamados validados ou em atendimento. O prazo segue a regra de SLA da
                correção, nunca o cálculo comum da classificação.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive sm:text-sm"
          >
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
                        <SelectItem key={v} value={v} disabled={opcoesDesabilitadas.has(v)}>
                          {FINAL_PRIORITY_LABELS[v]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {soAdminBaixaComTecnico && (
                    <p className="text-xs text-muted-foreground">
                      Este chamado já tem técnico atribuído: só o Admin pode baixar a prioridade.
                    </p>
                  )}
                  {direcao && (
                    <p aria-live="polite" className="text-xs text-muted-foreground">
                      {EFEITO_SLA_TEXTO[direcao]}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="motivo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Explique por que a prioridade mudou (pelo menos 10 caracteres)."
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
