'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Clock, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { ChamadoDTO } from '@/app/(dashboard)/meus-chamados/_components/ChamadoCard';
import { classificarChamadoAction, type ClassificarResult } from '@/app/(dashboard)/gestao/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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
import { FINAL_PRIORITY_VALUES, type FinalPriority } from '@/shared/chamados/chamado.constants';
import {
  ClassificarChamadoSchema,
  type ClassificarChamadoInput,
} from '@/shared/chamados/chamado.schemas';
import { NATUREZA_OPTIONS } from '@/shared/chamados/new-ticket.schemas';

/** Valores iguais a NATUREZA_OPTIONS; labels longos para o select de classificação */
const NATUREZA_LABELS: Record<(typeof NATUREZA_OPTIONS)[number], string> = {
  Padrão: 'Padrão (08h-18h, seg-sex)',
  Urgente: 'Urgente (qualquer horário)',
};

const PRIORIDADE_LABELS: Record<FinalPriority, string> = {
  BAIXA: 'Baixa',
  NORMAL: 'Normal',
  ALTA: 'Alta',
  EMERGENCIAL: 'Emergencial',
};

const formSchema = ClassificarChamadoSchema.omit({ chamadoId: true });

type FormValues = z.infer<typeof formSchema>;

type UnitOption = { id: string; name: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chamado: ChamadoDTO | null;
  onSuccess: () => void;
}

async function fetchUnits(): Promise<UnitOption[]> {
  const res = await fetch('/api/units', { cache: 'no-store' });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => ({}))) as {
    items?: { _id?: string; id?: string; name: string }[];
  };
  return (data.items ?? []).map((u) => ({
    id: String(u._id ?? u.id ?? ''),
    name: u.name,
  }));
}

export function ClassificarChamadoDialog({ open, onOpenChange, chamado, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unitName, setUnitName] = useState<string | null>(null);

  const defaultValues = useMemo<FormValues>(
    () => ({
      naturezaAtendimento: 'Padrão',
      finalPriority: 'EMERGENCIAL' as FinalPriority,
      classificationNotes: '',
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
      setUnitName(null);
      return;
    }
    form.reset(defaultValues);
    setError(null);
    const load = async () => {
      const units = await fetchUnits();
      const u = units.find((x) => x.id === chamado.unitId);
      setUnitName(u?.name ?? null);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chamado?._id, chamado?.unitId]);

  const onSubmit = useCallback(
    async (values: FormValues) => {
      if (!chamado) return;
      setSubmitting(true);
      setError(null);
      try {
        const payload: ClassificarChamadoInput = {
          chamadoId: chamado._id,
          ...values,
        };
        const result: ClassificarResult = await classificarChamadoAction(payload);
        if (result.ok) {
          onOpenChange(false);
          onSuccess();
        } else {
          setError(result.error);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao classificar. Tente novamente.');
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

  const headerSubtitle = [unitName, chamado.localExato].filter(Boolean).join(' • ') || '—';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg overflow-y-auto sm:max-h-[90vh]" showCloseButton>
        <DialogHeader>
          <DialogTitle>Classificar Chamado</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
          <p className="font-semibold text-foreground">#{chamado.ticket_number}</p>
          <p className="text-sm text-muted-foreground">{chamado.titulo || 'Sem título'}</p>
          <p className="text-xs text-muted-foreground">{headerSubtitle}</p>
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
              name="naturezaAtendimento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    Natureza do Atendimento <span className="text-destructive">*</span>
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {NATUREZA_OPTIONS.map((v) => (
                        <SelectItem key={v} value={v}>
                          {NATUREZA_LABELS[v]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {field.value === 'Padrão' && (
                    <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                      SLA: 3 dias úteis, apenas em horário comercial.
                    </div>
                  )}
                  {field.value === 'Urgente' && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                      Urgente: Atendimento fora do horário permitido.
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="finalPriority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Prioridade Final <span className="text-destructive">*</span>
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {FINAL_PRIORITY_VALUES.map((v) => (
                        <SelectItem key={v} value={v}>
                          {PRIORIDADE_LABELS[v]}
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
                  <FormLabel>Observações da Classificação</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Observações sobre a classificação..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/30">
              <label className="flex cursor-not-allowed items-start gap-3 opacity-70">
                <input
                  type="checkbox"
                  disabled
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                  aria-hidden
                />
                <span className="flex items-center gap-2 text-sm">
                  <Zap className="h-4 w-4 shrink-0 text-amber-500" />
                  Atribuir automaticamente ao técnico disponível com especialidade
                  <span className="text-muted-foreground">(Em breve)</span>
                </span>
              </label>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Classificando…' : 'Classificar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
