'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { PRIORITIES } from '@/shared/catalog/service.constants';
import { ServiceCreateSchema } from '@/shared/catalog/service.schemas';

type ServiceForm = z.infer<typeof ServiceCreateSchema>;
type SubtypeItem = { _id: string; name: string; typeId: string; isActive: boolean };

export type ServiceDTO = {
  _id: string;
  code: string;
  name: string;
  description?: string;
  typeId: string;
  subtypeId: string;
  priorityDefault: (typeof PRIORITIES)[number];
  estimatedHours: number;
  materials?: string;
  procedure?: string;
  isActive: boolean;
};

export function ServicoDialog({
  mode,
  open,
  onOpenChange,
  onSaved,
  typeOptions,
  initialData,
}: {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  typeOptions: { id: string; name: string }[];
  initialData?: ServiceDTO | null;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [subtypes, setSubtypes] = useState<SubtypeItem[]>([]);

  const skipResetSubtypeOnce = useRef(false);

  const title = mode === 'create' ? 'Novo Serviço' : 'Editar Serviço';
  const descriptionText =
    mode === 'create' ? 'Cadastre um novo serviço no catálogo.' : 'Atualize os dados do serviço.';

  const defaultValues: ServiceForm = {
    code: initialData?.code ?? '',
    name: initialData?.name ?? '',
    typeId: initialData?.typeId ?? '',
    subtypeId: initialData?.subtypeId ?? '',
    description: initialData?.description ?? '',
    priorityDefault: initialData?.priorityDefault ?? 'Normal',
    estimatedHours: initialData?.estimatedHours ?? 0,
    materials: initialData?.materials ?? '',
    procedure: initialData?.procedure ?? '',
    isActive: initialData?.isActive ?? true,
  };

  const form = useForm<ServiceForm>({
    resolver: zodResolver(ServiceCreateSchema),
    defaultValues,
  });

  // quando abrir em edit, re-hidrata o form com os dados do item
  useEffect(() => {
    if (!open) return;

    // no edit, queremos carregar subtypes e manter subtypeId
    skipResetSubtypeOnce.current = mode === 'edit';

    form.reset(defaultValues);

    // se abriu edit, já dispara carregamento de subtypes do type atual
    if (mode === 'edit' && defaultValues.typeId) {
      (async () => {
        const list = await fetchSubtypes(defaultValues.typeId);
        // garante que o subtypeId exista na lista (caso item esteja inativo)
        const exists = list?.some((s) => String(s._id) === String(defaultValues.subtypeId));
        if (!exists) form.setValue('subtypeId', '');
      })();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData?._id, mode]);

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
    const list = (data.items || []).filter((s: SubtypeItem) => s.isActive);

    setSubtypes(list);
    return list;
  }

  useEffect(() => {
    if (!open) return;
    if (!typeId) {
      setSubtypes([]);
      return;
    }

    // ✅ na primeira carga do edit, NÃO zera subtypeId
    if (skipResetSubtypeOnce.current) {
      skipResetSubtypeOnce.current = false;
      fetchSubtypes(typeId);
      return;
    }

    // ✅ quando o usuário trocou o tipo, aí sim zera
    form.setValue('subtypeId', '');
    fetchSubtypes(typeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeId, open]);

  async function onSubmit(values: ServiceForm) {
    setSubmitting(true);

    const isEdit = mode === 'edit' && initialData?._id;
    const url = isEdit ? `/api/catalog/services/${initialData!._id}` : '/api/catalog/services';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error || 'Erro ao salvar serviço');
      return;
    }

    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{descriptionText}</DialogDescription>
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
                    <FormLabel>Nome do Serviço</FormLabel>
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
                    <FormLabel>Tipo de Serviço</FormLabel>
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
                    <FormLabel>Subtipo</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={!typeId}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o subtipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {subtypes.map((s) => (
                          <SelectItem key={s._id} value={s._id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                    <Textarea placeholder="Liste os materiais..." {...field} />
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
                    <Textarea placeholder="Descreva o procedimento..." {...field} />
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
                {submitting ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
