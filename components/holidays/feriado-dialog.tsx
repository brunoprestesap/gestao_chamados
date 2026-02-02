'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HolidayCreateSchema, HOLIDAY_SCOPES } from '@/shared/holidays/holiday.schemas';

type HolidayForm = z.infer<typeof HolidayCreateSchema>;

export type HolidayDTO = {
  _id: string;
  date: string;
  name: string;
  scope: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

const SCOPE_LABELS: Record<string, string> = {
  NACIONAL: 'Nacional',
  ESTADUAL: 'Estadual',
  MUNICIPAL: 'Municipal',
  INSTITUCIONAL: 'Institucional',
};

export function FeriadoDialog({
  mode,
  open,
  onOpenChange,
  onSaved,
  initialData,
}: {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  initialData?: HolidayDTO | null;
}) {
  const [submitting, setSubmitting] = useState(false);

  const title = mode === 'create' ? 'Novo Feriado' : 'Editar Feriado';
  const desc =
    mode === 'create'
      ? 'Cadastre um feriado. Será considerado dia não útil no cálculo de SLA.'
      : 'Atualize os dados do feriado.';

  const form = useForm<HolidayForm>({
    resolver: zodResolver(HolidayCreateSchema) as import('react-hook-form').Resolver<HolidayForm>,
    defaultValues: {
      date: '',
      name: '',
      scope: 'INSTITUCIONAL',
      isActive: true,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      date: initialData?.date ?? '',
      name: initialData?.name ?? '',
      scope: (initialData?.scope as HolidayForm['scope']) ?? 'INSTITUCIONAL',
      isActive: initialData?.isActive ?? true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData?._id, mode]);

  async function onSubmit(values: HolidayForm) {
    setSubmitting(true);

    const isEdit = mode === 'edit' && initialData?._id;
    const url = isEdit ? `/api/holidays/${initialData!._id}` : '/api/holidays';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error || 'Erro ao salvar feriado');
      return;
    }

    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="flex max-h-[90dvh] max-w-[calc(100vw-3rem)] flex-col gap-4 overflow-hidden p-4 sm:max-w-xl sm:p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-base sm:text-lg">{title}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">{desc}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Feriado *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Natal, Feriado Municipal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="scope"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Escopo</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {HOLIDAY_SCOPES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {SCOPE_LABELS[s] ?? s}
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
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={field.onChange}
                      className="h-4 w-4 rounded"
                    />
                  </FormControl>
                  <FormLabel className="!mt-0 font-normal">
                    Ativo (considerado no cálculo de SLA)
                  </FormLabel>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
