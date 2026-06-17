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
      <DialogContent className="sm:max-w-md rounded-2xl border-border/50">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl">
            {mode === 'create' ? 'Novo Subtipo' : 'Editar Subtipo'}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {mode === 'create'
              ? 'Cadastre um novo subtipo vinculado a um tipo de serviço.'
              : 'Atualize os dados do subtipo. O tipo vinculado não pode ser alterado.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-2">
            <FormField
              control={form.control}
              name="typeId"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-sm font-medium">Tipo de Serviço</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={mode === 'edit'}
                  >
                    <FormControl>
                      <SelectTrigger className="h-11 rounded-xl border-border/50 bg-background/50 backdrop-blur-sm transition-all focus:bg-background">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="rounded-xl">
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
                  <FormLabel className="text-sm font-medium">Nome do Subtipo</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: Troca de lâmpadas"
                      className="h-11 rounded-xl border-border/50 bg-background/50 backdrop-blur-sm transition-all focus:bg-background"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-xl border border-border/50 bg-muted/30 p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="rounded-md"
                    />
                  </FormControl>
                  <FormLabel className="font-medium cursor-pointer">Subtipo Ativo</FormLabel>
                </FormItem>
              )}
            />

            <DialogFooter className="gap-3 sm:justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl w-full sm:w-auto"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="rounded-xl w-full sm:w-auto sm:min-w-28 bg-gradient-to-r from-indigo-600 to-blue-600 shadow-indigo-500/20 hover:shadow-indigo-500/30"
                disabled={submitting}
              >
                {submitting ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
