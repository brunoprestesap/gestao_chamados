'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { SubtypeSelectWithCreate } from '@/components/catalogo/subtype-select-with-create';
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
import { PRIORITIES } from '@/shared/catalog/service.constants';
import { ServiceCreateSchema } from '@/shared/catalog/service.schemas';
import { getCodePrefixFromSubtypeName } from '@/shared/catalog/service.utils';

type ServiceForm = z.infer<typeof ServiceCreateSchema>;
type SubtypeItem = { _id: string; name: string; typeId: string; isActive: boolean };

export type ServiceDTO = {
  _id: string;
  code: string;
  name: string;
  description?: string;
  typeId: string;
  subtypeId: string;
  /** Dados populados pela API (type/subtype) para exibição no modo edição */
  type?: { id: string; name: string } | null;
  subtype?: { id: string; name: string } | null;
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
    resolver: zodResolver(ServiceCreateSchema) as import('react-hook-form').Resolver<ServiceForm>,
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
        const exists = list?.some(
          (s: SubtypeItem) => String(s._id) === String(defaultValues.subtypeId),
        );
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

  // No modo edição, inclui o subtipo atual na lista para exibir corretamente
  // (evita placeholder enquanto subtypes carregam assincronamente)
  const displaySubtypes = useMemo(() => {
    const list = [...subtypes];
    if (
      mode === 'edit' &&
      initialData?.subtype &&
      initialData?.subtypeId &&
      !list.some((s) => String(s._id) === String(initialData!.subtypeId))
    ) {
      list.unshift({
        _id: initialData.subtypeId,
        name: initialData.subtype.name,
        typeId: initialData.typeId,
        isActive: true,
      });
    }
    return list;
  }, [subtypes, mode, initialData]);

  const subtypeId = form.watch('subtypeId');
  const [nextCodePreview, setNextCodePreview] = useState<string>('');

  useEffect(() => {
    if (mode !== 'create' || !subtypeId) {
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
  }, [mode, subtypeId]);

  const selectedSubtype = useMemo(
    () => displaySubtypes.find((s) => String(s._id) === String(subtypeId)),
    [displaySubtypes, subtypeId],
  );

  const codePreview =
    mode === 'edit' && initialData?.code
      ? initialData.code
      : mode === 'create' && nextCodePreview
        ? nextCodePreview
        : mode === 'create' && selectedSubtype?.name
          ? `${getCodePrefixFromSubtypeName(selectedSubtype.name)}-0001`
          : '';

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

    // No create, o código é gerado no backend; nunca enviar
    const payload = isEdit
      ? values
      : (() => {
          const { code, ...rest } = values;
          void code;
          return rest;
        })();

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error || 'Erro ao salvar serviço');
      return;
    }

    toast.success(isEdit ? 'Serviço atualizado' : 'Serviço cadastrado');
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent
        className="flex max-h-[90dvh] w-[min(100vw-1rem,calc(100%-2rem))] max-w-4xl flex-col gap-0 overflow-hidden p-0 rounded-2xl border-border/50"
        aria-describedby="servico-dialog-desc"
      >
        <div className="p-6 pb-4 border-b border-border/50 bg-muted/10">
          <DialogHeader className="shrink-0 space-y-2 pr-8 sm:pr-0">
            <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
            <DialogDescription id="servico-dialog-desc" className="text-sm">
              {descriptionText}
            </DialogDescription>
          </DialogHeader>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto overscroll-contain p-6 space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-start">
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel className="text-sm font-medium">Código do Serviço</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={codePreview}
                          readOnly
                          className="h-11 rounded-xl bg-muted/50 font-mono text-sm"
                          placeholder="Selecione o subtipo para ver o código"
                          aria-readonly
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Código gerado automaticamente com base no subtipo.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel className="text-sm font-medium">Nome do Serviço</FormLabel>
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
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="typeId"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel className="text-sm font-medium">Tipo de Serviço</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
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
                  name="subtypeId"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <SubtypeSelectWithCreate
                        typeId={typeId}
                        value={field.value}
                        onChange={field.onChange}
                        subtypes={displaySubtypes}
                        onSubtypesRefetch={() => fetchSubtypes(typeId)}
                        disabled={!typeId}
                        placeholder="Selecione o subtipo"
                        label="Subtipo"
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
                    <FormLabel className="text-sm font-medium">Descrição</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Descreva o serviço..."
                        className="min-h-[100px] resize-y rounded-xl border-border/50 bg-background/50 backdrop-blur-sm transition-all focus:bg-background"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="priorityDefault"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel className="text-sm font-medium">Prioridade Padrão</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="h-11 rounded-xl border-border/50 bg-background/50 backdrop-blur-sm transition-all focus:bg-background">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-xl">
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
                      <FormLabel className="text-sm font-medium">Tempo Estimado (horas)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step={0.5}
                          className="h-11 rounded-xl border-border/50 bg-background/50 backdrop-blur-sm transition-all focus:bg-background"
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
                    <FormLabel className="text-sm font-medium">Materiais Necessários</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Liste os materiais normalmente necessários..."
                        className="min-h-[100px] resize-y rounded-xl border-border/50 bg-background/50 backdrop-blur-sm transition-all focus:bg-background"
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
                    <FormLabel className="text-sm font-medium">Procedimento Padrão</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Descreva o procedimento padrão de execução..."
                        className="min-h-[100px] resize-y rounded-xl border-border/50 bg-background/50 backdrop-blur-sm transition-all focus:bg-background"
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
                    <FormLabel className="font-medium cursor-pointer">Serviço Ativo</FormLabel>
                  </FormItem>
                )}
              />
            </div>

            <div className="shrink-0 border-t border-border/50 bg-muted/10 p-6">
              <DialogFooter className="flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto rounded-xl"
                  onClick={() => onOpenChange(false)}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="w-full sm:w-auto sm:min-w-28 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 shadow-indigo-500/20 hover:shadow-indigo-500/30"
                  disabled={submitting}
                >
                  {submitting ? 'Salvando...' : 'Salvar'}
                </Button>
              </DialogFooter>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
