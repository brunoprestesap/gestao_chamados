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
import { TypeCreateSchema } from '@/shared/catalog/type.schemas';

type TypeForm = z.infer<typeof TypeCreateSchema>;

export type TypeDTO = {
  _id: string;
  name: string;
  isActive: boolean;
};

export function TipoDialog({
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
  initialData?: TypeDTO | null;
}) {
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<TypeForm>({
    resolver: zodResolver(TypeCreateSchema) as import('react-hook-form').Resolver<TypeForm>,
    defaultValues: { name: '', isActive: true },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: initialData?.name ?? '',
      isActive: initialData?.isActive ?? true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData?._id, mode]);

  async function onSubmit(values: TypeForm) {
    setSubmitting(true);

    const isEdit = mode === 'edit' && initialData?._id;
    const url = isEdit ? `/api/catalog/types/${initialData!._id}` : '/api/catalog/types';
    const method = isEdit ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error || 'Erro ao salvar tipo');
      return;
    }

    toast.success(isEdit ? 'Tipo atualizado' : 'Tipo cadastrado');
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md rounded-2xl border-border/50">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl">
            {mode === 'create' ? 'Novo Tipo' : 'Editar Tipo'}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {mode === 'create'
              ? 'Cadastre um novo tipo de serviço.'
              : 'Atualize os dados do tipo de serviço.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-sm font-medium">Nome do Tipo</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: Manutenção Predial"
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
                  <FormLabel className="font-medium cursor-pointer">Tipo Ativo</FormLabel>
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
