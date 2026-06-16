'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { SubtypeCreateSchema } from '@/shared/catalog/subtype.schemas';

type SubtypeForm = z.infer<typeof SubtypeCreateSchema>;

export type SubtypeDTO = {
  _id: string;
  name: string;
  typeId: string;
  isActive: boolean;
};

export function SubtipoDialog({
  mode,
  open,
  onOpenChange,
  onSaved,
  typeOptions,
  initialData,
  defaultTypeId,
}: {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  typeOptions: { id: string; name: string }[];
  initialData?: SubtypeDTO | null;
  /** Pré-seleciona o tipo no create (ex.: filtro ativo na aba). */
  defaultTypeId?: string;
}) {
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<SubtypeForm>({
    resolver: zodResolver(SubtypeCreateSchema) as import('react-hook-form').Resolver<SubtypeForm>,
    defaultValues: { typeId: '', name: '', isActive: true },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      typeId: initialData?.typeId ?? defaultTypeId ?? '',
      name: initialData?.name ?? '',
      isActive: initialData?.isActive ?? true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData?._id, mode]);

  async function onSubmit(values: SubtypeForm) {
    setSubmitting(true);

    const isEdit = mode === 'edit' && initialData?._id;
    const url = isEdit ? `/api/catalog/subtypes/${initialData!._id}` : '/api/catalog/subtypes';
    const method = isEdit ? 'PATCH' : 'POST';

    // No edit, o tipo é mantido fixo: envia apenas name/isActive.
    const payload = isEdit ? { name: values.name, isActive: values.isActive } : values;

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error || 'Erro ao salvar subtipo');
      return;
    }

    toast.success(isEdit ? 'Subtipo atualizado' : 'Subtipo cadastrado');
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Novo Subtipo' : 'Editar Subtipo'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Cadastre um novo subtipo vinculado a um tipo de serviço.'
              : 'Atualize os dados do subtipo. O tipo vinculado não pode ser alterado.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="typeId"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>Tipo de Serviço</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={mode === 'edit'}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {typeOptions.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
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
              name="name"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>Nome do Subtipo</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Troca de lâmpadas" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="font-normal">Ativo</FormLabel>
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" className="sm:min-w-28" disabled={submitting}>
                {submitting ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
