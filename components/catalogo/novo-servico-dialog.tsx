'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
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
  FormDescription,
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
import { getCodePrefixFromSubtypeName } from '@/shared/catalog/service.utils';

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

  const subtypeId = form.watch('subtypeId');
  const [nextCodePreview, setNextCodePreview] = useState<string>('');

  useEffect(() => {
    if (!subtypeId) {
      setNextCodePreview('');
      return;
    }
    let cancelled = false;
    fetch(`/api/catalog/services/next-code?subtypeId=${encodeURIComponent(subtypeId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.nextCode) setNextCodePreview(data.nextCode);
      })
      .catch(() => setNextCodePreview(''));
    return () => {
      cancelled = true;
    };
  }, [subtypeId]);

  const selectedSubtype = useMemo(
    () => subtypes.find((s) => String(s._id) === String(subtypeId)),
    [subtypes, subtypeId],
  );
  const codePreview =
    nextCodePreview ||
    (selectedSubtype?.name ? `${getCodePrefixFromSubtypeName(selectedSubtype.name)}-0001` : '');

  async function onSubmit(values: ServiceCreateInput) {
    setSubmitting(true);
    // Código é gerado no backend; não enviar
    const { code: _code, ...payload } = values;
    const res = await fetch('/api/catalog/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
      <DialogContent
        className="flex max-h-[85dvh] w-[min(100vw-1rem,calc(100%-2rem))] max-w-4xl flex-col gap-4 overflow-hidden p-4 sm:p-5 md:p-6"
        aria-describedby="novo-servico-desc"
      >
        <DialogHeader className="shrink-0 space-y-1 pr-8 sm:pr-0">
          <DialogTitle className="text-base font-semibold sm:text-lg">
            Novo Serviço
          </DialogTitle>
          <DialogDescription id="novo-servico-desc" className="text-sm">
            Cadastre um novo serviço no catálogo.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain sm:gap-6"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem className="!gap-y-0">
                    <FormLabel className="min-h-10 block">Código do Serviço</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={codePreview}
                        readOnly
                        className="min-h-10 bg-muted"
                        placeholder="Selecione o subtipo para ver o código"
                        aria-readonly
                      />
                    </FormControl>
                    <FormDescription className="text-xs sm:text-sm">
                      Código gerado automaticamente com base no subtipo do serviço.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="!gap-y-0">
                    <FormLabel className="min-h-10 block">
                      Nome do Serviço <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ex: Troca de lâmpadas"
                        className="min-h-10"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="typeId"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel>
                      Tipo de Serviço <span className="text-destructive">*</span>
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
                  <FormItem className="space-y-2">
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
                <FormItem className="space-y-2">
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva o serviço..."
                      className="min-h-[100px] resize-y"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="priorityDefault"
                render={({ field }) => (
                  <FormItem className="space-y-2">
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
                  <FormItem className="space-y-2">
                    <FormLabel>Tempo Estimado (horas)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        className="min-h-10"
                        {...field}
                      />
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
                <FormItem className="space-y-2">
                  <FormLabel>Materiais Necessários</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Liste os materiais normalmente necessários..."
                      className="min-h-[100px] resize-y"
                      rows={3}
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
                <FormItem className="space-y-2">
                  <FormLabel>Procedimento Padrão</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva o procedimento padrão de execução..."
                      className="min-h-[100px] resize-y"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="shrink-0 flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="w-full sm:w-auto sm:min-w-28"
                disabled={submitting}
              >
                {submitting ? 'Criando...' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
