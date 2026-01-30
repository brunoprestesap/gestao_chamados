'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import z from 'zod';

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
import { Textarea } from '@/components/ui/textarea';
import { SubtypeSelectWithCreate } from '@/components/catalogo/subtype-select-with-create';
import { PRIORITIES } from '@/shared/catalog/service.constants';
import { ServiceCreateSchema } from '@/shared/catalog/service.schemas';
import type { ServiceCreateInput } from '@/shared/catalog/service.types';

type SubtypeItem = { _id: string; name: string; typeId: string; isActive: boolean };

export function NovoServicoDialog({
  open,
  onOpenChange,
  onCreated,
  typeOptions,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
  typeOptions: { id: string; name: string }[];
}) {
  const [submitting, setSubmitting] = useState(false);
  const [subtypes, setSubtypes] = useState<SubtypeItem[]>([]);

  type ServiceCreateForm = z.infer<typeof ServiceCreateSchema>;

  const form = useForm<ServiceCreateForm>({
    resolver: zodResolver(ServiceCreateSchema) as import('react-hook-form').Resolver<ServiceCreateForm>,
    defaultValues: {
      code: '',
      name: '',
      typeId: '',
      subtypeId: '',
      description: '',
      priorityDefault: 'Normal',
      estimatedHours: 0,
      materials: '',
      procedure: '',
      isActive: true,
    },
  });

  const typeId = form.watch('typeId');

  async function fetchSubtypes(selectedTypeId: string) {
    if (!selectedTypeId) {
      setSubtypes([]);
      return;
    }
    const res = await fetch(`/api/catalog/subtypes?typeId=${selectedTypeId}`, {
      cache: 'no-store',
    });
    const data = await res.json();
    setSubtypes((data.items || []).filter((s: SubtypeItem) => s.isActive));
  }

  useEffect(() => {
    form.setValue('subtypeId', '');
    fetchSubtypes(typeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeId]);

  async function onSubmit(values: ServiceCreateInput) {
    setSubmitting(true);
    const res = await fetch('/api/catalog/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error || 'Erro ao criar serviço');
      return;
    }

    form.reset();
    onOpenChange(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Novo Serviço</DialogTitle>
          <DialogDescription>Cadastre um novo serviço no catálogo.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código do Serviço</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: ELET-001" {...field} />
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
                    <FormLabel>
                      Nome do Serviço <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Troca de lâmpadas" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="typeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Tipo de Serviço <span className="text-red-500">*</span>
                    </FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
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
                name="subtypeId"
                render={({ field }) => (
                  <FormItem>
                    <SubtypeSelectWithCreate
                      typeId={typeId}
                      value={field.value}
                      onChange={field.onChange}
                      subtypes={subtypes}
                      onSubtypesRefetch={() => fetchSubtypes(typeId)}
                      disabled={!typeId}
                      placeholder="Selecione o subtipo"
                      label="Subtipo"
                      required
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Descreva o serviço..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="priorityDefault"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioridade Padrão</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
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
                name="estimatedHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tempo Estimado (horas)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="materials"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Materiais Necessários</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Liste os materiais normalmente necessários..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="procedure"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Procedimento Padrão</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva o procedimento padrão de execução..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Criando...' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
