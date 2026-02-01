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
import { ScrollArea } from '@/components/ui/scroll-area';
import { UnitCreateSchema } from '@/shared/units/unit.schemas';

type UnitForm = z.infer<typeof UnitCreateSchema>;

export type UnitDTO = UnitForm & { _id: string };

export function UnidadeDialog({
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
  initialData?: UnitDTO | null;
}) {
  const [submitting, setSubmitting] = useState(false);

  const title = mode === 'create' ? 'Nova Unidade' : 'Editar Unidade';
  const desc = mode === 'create' ? 'Cadastre uma unidade.' : 'Atualize os dados da unidade.';

  const form = useForm<UnitForm>({
    resolver: zodResolver(UnitCreateSchema) as import('react-hook-form').Resolver<UnitForm>,
    defaultValues: {
      name: '',
      floor: '',
      responsibleName: '',
      responsibleEmail: '',
      responsiblePhone: '',
      isActive: true,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: initialData?.name ?? '',
      floor: initialData?.floor ?? '',
      responsibleName: initialData?.responsibleName ?? '',
      responsibleEmail: initialData?.responsibleEmail ?? '',
      responsiblePhone: initialData?.responsiblePhone ?? '',
      isActive: initialData?.isActive ?? true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData?._id, mode]);

  async function onSubmit(values: UnitForm) {
    setSubmitting(true);

    const isEdit = mode === 'edit' && initialData?._id;
    const url = isEdit ? `/api/units/${initialData!._id}` : `/api/units`;
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error || 'Erro ao salvar unidade');
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
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <ScrollArea className="flex-1 pr-2">
              <div className="space-y-4 pb-4">
                <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da Unidade *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Auditoria Interna" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="floor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Andar *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: 4º Andar" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="responsibleName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Responsável *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Luciana Santos" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="responsibleEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email do Responsável</FormLabel>
                  <FormControl>
                    <Input placeholder="ex: luciana@org.gov.br" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="responsiblePhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone do Responsável</FormLabel>
                  <FormControl>
                    <Input placeholder="(61) 3333-1006" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
              </div>
            </ScrollArea>

            <DialogFooter className="shrink-0 gap-2 border-t pt-4">
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
