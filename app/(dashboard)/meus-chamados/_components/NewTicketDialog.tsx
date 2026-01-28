'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Clock, Wind, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  buildTypeIdByTipo,
  CARD_BASE_CLASS,
  CARD_SELECTED_CLASS,
  CARD_UNSELECTED_CLASS,
  FORM_GRID_CLASS,
  FORM_GRID_GRAU_CLASS,
  FORM_ITEM_MIN_CLASS,
  GRAU_SELECT_TRIGGER_CLASS,
  NATUREZA_DESCRIPTIONS,
  optionalSelectOnChange,
  optionalSelectValue,
  SELECT_TRIGGER_FULL_CLASS,
} from '@/app/(dashboard)/meus-chamados/_components/new-ticket.utils';
import { createTicketAction } from '@/app/(dashboard)/meus-chamados/actions';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  GRAU_URGENCIA_OPTIONS,
  NATUREZA_OPTIONS,
  NewTicketFormSchema,
  type NewTicketFormValues,
  TIPO_SERVICO_OPTIONS,
} from '@/shared/chamados/new-ticket.schemas';

type UnitOption = { id: string; name: string; responsiblePhone?: string };
type TypeOption = { id: string; name: string };
type SubtypeOption = { id: string; name: string };
type CatalogServiceOption = {
  id: string;
  code: string;
  name: string;
  priorityDefault?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

const defaultValues = {
  unitId: '',
  localExato: '',
  tipoServico: undefined as NewTicketFormValues['tipoServico'] | undefined,
  descricao: '',
  naturezaAtendimento: undefined as NewTicketFormValues['naturezaAtendimento'] | undefined,
  grauUrgencia: 'Normal' as const,
  telefoneContato: '',
  subtypeId: '',
  catalogServiceId: '',
};

export function NewTicketDialog({ open, onOpenChange, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [types, setTypes] = useState<TypeOption[]>([]);
  const [subtypes, setSubtypes] = useState<SubtypeOption[]>([]);
  const [catalogServices, setCatalogServices] = useState<CatalogServiceOption[]>([]);

  const form = useForm<NewTicketFormValues>({
    resolver: zodResolver(NewTicketFormSchema),
    defaultValues,
  });

  const tipoServico = form.watch('tipoServico');
  const subtypeId = form.watch('subtypeId');
  const catalogServiceId = form.watch('catalogServiceId');
  const unitId = form.watch('unitId');

  useEffect(() => {
    if (!open) return;
    form.reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [unitsRes, typesRes, sessionRes] = await Promise.all([
        fetch('/api/units', { cache: 'no-store' }),
        fetch('/api/catalog/types', { cache: 'no-store' }),
        fetch('/api/session', { cache: 'no-store' }),
      ]);
      const unitsData = await unitsRes.json().catch(() => ({}));
      const typesData = await typesRes.json().catch(() => ({}));
      const sessionData = await sessionRes.json().catch(() => ({}));

      const unitsList = (unitsData.items ?? []) as {
        _id?: string;
        id?: string;
        name: string;
        responsiblePhone?: string;
      }[];
      const typesList = (typesData.items ?? []) as { _id: string; name: string }[];

      const normalizedUnits = unitsList
        .filter((u) => u._id ?? u.id)
        .map((u) => ({
          id: String(u._id ?? u.id),
          name: u.name,
          responsiblePhone: u.responsiblePhone ?? '',
        }));

      setUnits(normalizedUnits);
      setTypes(typesList.map((t) => ({ id: String(t._id), name: t.name })));

      // Preenche unitId automaticamente com a unidade de lotação do usuário
      if (sessionData.unitId) {
        const userUnitId = String(sessionData.unitId);
        // Verifica se a unidade existe na lista antes de preencher
        const unitExists = normalizedUnits.some((u) => u.id === userUnitId);
        if (unitExists) {
          form.setValue('unitId', userUnitId);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const typeIdByTipo = useMemo(() => buildTypeIdByTipo(types), [types]);
  const currentTypeId = tipoServico ? (typeIdByTipo.get(tipoServico) ?? '') : '';

  async function fetchSubtypes(typeId: string) {
    if (!typeId) {
      setSubtypes([]);
      return;
    }
    const res = await fetch(`/api/catalog/subtypes?typeId=${typeId}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    const list = (data.items ?? []) as { _id: string; name: string; isActive?: boolean }[];
    setSubtypes(
      list.filter((s) => s.isActive !== false).map((s) => ({ id: String(s._id), name: s.name })),
    );
  }

  /**
   * Mapeia priorityDefault do ServiceCatalog para grauUrgencia do formulário.
   * PRIORITIES: ['Baixa', 'Normal', 'Alta', 'Emergencial']
   * GRAU_URGENCIA_OPTIONS: ['Baixo', 'Normal', 'Alto', 'Crítico']
   */
  function mapPriorityToGrauUrgencia(priority?: string): 'Baixo' | 'Normal' | 'Alto' | 'Crítico' {
    switch (priority) {
      case 'Baixa':
        return 'Baixo';
      case 'Normal':
        return 'Normal';
      case 'Alta':
        return 'Alto';
      case 'Emergencial':
        return 'Crítico';
      default:
        return 'Normal';
    }
  }

  async function fetchCatalogServices(typeId: string, subtypeIdFilter?: string) {
    if (!typeId) {
      setCatalogServices([]);
      return;
    }
    const params = new URLSearchParams({ typeId });
    if (subtypeIdFilter) params.set('subtypeId', subtypeIdFilter);
    const res = await fetch(`/api/catalog/services?${params}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    const list = (data.items ?? []) as {
      _id: string;
      typeId?: string;
      subtypeId?: string;
      code?: string;
      name?: string;
      priorityDefault?: string;
    }[];
    setCatalogServices(
      list.map((s) => ({
        id: String(s._id),
        code: s.code ?? '',
        name: s.name ?? '',
        priorityDefault: s.priorityDefault,
      })),
    );
  }

  useEffect(() => {
    if (!currentTypeId) {
      setSubtypes([]);
      setCatalogServices([]);
      form.setValue('subtypeId', '');
      form.setValue('catalogServiceId', '');
      return;
    }
    form.setValue('subtypeId', '');
    form.setValue('catalogServiceId', '');
    fetchSubtypes(currentTypeId);
    // catalog fetch happens in the subtype effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTypeId]);

  useEffect(() => {
    if (!currentTypeId) return;
    if (subtypeId) {
      fetchCatalogServices(currentTypeId, subtypeId);
    } else {
      fetchCatalogServices(currentTypeId);
    }
    form.setValue('catalogServiceId', '');
    form.setValue('grauUrgencia', 'Normal'); // Reset para padrão quando muda tipo/subtipo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTypeId, subtypeId]);

  // Atualiza telefoneContato automaticamente quando unitId muda
  useEffect(() => {
    if (!unitId) {
      // Se não há unidade selecionada, limpa o telefone
      form.setValue('telefoneContato', '');
      return;
    }

    const selectedUnit = units.find((u) => u.id === unitId);
    if (selectedUnit?.responsiblePhone) {
      form.setValue('telefoneContato', selectedUnit.responsiblePhone);
    } else {
      // Se a unidade não tem telefone cadastrado, limpa o campo
      form.setValue('telefoneContato', '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, units]);

  // Atualiza grauUrgencia automaticamente quando catalogServiceId muda
  useEffect(() => {
    if (!catalogServiceId) {
      // Se não há serviço selecionado, volta para o padrão Normal
      form.setValue('grauUrgencia', 'Normal');
      return;
    }

    const selectedService = catalogServices.find((s) => s.id === catalogServiceId);
    if (selectedService?.priorityDefault) {
      const grauUrgencia = mapPriorityToGrauUrgencia(selectedService.priorityDefault);
      form.setValue('grauUrgencia', grauUrgencia);
    } else {
      // Se o serviço não tem priorityDefault, mantém Normal
      form.setValue('grauUrgencia', 'Normal');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogServiceId, catalogServices]);

  async function onSubmit(values: NewTicketFormValues) {
    form.clearErrors('root');
    setSubmitting(true);
    const result = await createTicketAction(values);
    setSubmitting(false);
    if (!result.ok) {
      form.setError('root', { message: result.error });
      return;
    }
    onOpenChange(false);
    onSuccess?.();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent
        className={cn(
          'flex max-h-[85dvh] w-[calc(100vw-2rem)] max-w-3xl flex-col overflow-hidden p-4',
          'sm:w-full sm:max-h-[90vh] sm:max-w-3xl sm:p-6',
        )}
      >
        <DialogHeader className="shrink-0 text-center">
          <DialogTitle className="text-base sm:text-lg">Novo Chamado de Manutenção</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className={cn(
              'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden pr-1',
              'pb-6 sm:gap-5 sm:pb-0',
            )}
          >
            <div className={FORM_GRID_CLASS}>
              <FormField
                control={form.control}
                name="unitId"
                render={({ field }) => (
                  <FormItem className={FORM_ITEM_MIN_CLASS}>
                    <FormLabel>Unidade/Setor *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className={SELECT_TRIGGER_FULL_CLASS}>
                          <SelectValue placeholder="Selecione a unidade/setor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {units.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name}
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
                name="localExato"
                render={({ field }) => (
                  <FormItem className={FORM_ITEM_MIN_CLASS}>
                    <FormLabel>Local Exato *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Sala 302, próximo à janela" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="tipoServico"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Serviço *</FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                      {TIPO_SERVICO_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => field.onChange(opt)}
                          className={cn(
                            'flex items-center gap-3 sm:min-h-14',
                            CARD_BASE_CLASS,
                            field.value === opt ? CARD_SELECTED_CLASS : CARD_UNSELECTED_CLASS,
                          )}
                        >
                          <div
                            className={cn(
                              'grid h-9 w-9 shrink-0 place-items-center rounded-lg sm:h-10 sm:w-10',
                              opt === 'Manutenção Predial'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
                            )}
                          >
                            {opt === 'Manutenção Predial' ? (
                              <Wrench className="h-4 w-4 sm:h-5 sm:w-5" />
                            ) : (
                              <Wind className="h-4 w-4 sm:h-5 sm:w-5" />
                            )}
                          </div>
                          <span className="text-sm font-medium sm:text-base">{opt}</span>
                        </button>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {tipoServico && (
              <div className={FORM_GRID_CLASS}>
                <FormField
                  control={form.control}
                  name="subtypeId"
                  render={({ field }) => (
                    <FormItem className={FORM_ITEM_MIN_CLASS}>
                      <FormLabel>Subtipo</FormLabel>
                      <Select
                        value={optionalSelectValue(field.value ?? '')}
                        onValueChange={optionalSelectOnChange(field.onChange)}
                      >
                        <FormControl>
                          <SelectTrigger className={SELECT_TRIGGER_FULL_CLASS}>
                            <SelectValue placeholder="Selecione o subtipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Selecione o subtipo</SelectItem>
                          {subtypes.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
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
                  name="catalogServiceId"
                  render={({ field }) => (
                    <FormItem className={FORM_ITEM_MIN_CLASS}>
                      <FormLabel>Serviço (Opcional — do Catálogo)</FormLabel>
                      <Select
                        value={optionalSelectValue(field.value ?? '')}
                        onValueChange={optionalSelectOnChange(field.onChange)}
                      >
                        <FormControl>
                          <SelectTrigger className={SELECT_TRIGGER_FULL_CLASS}>
                            <SelectValue placeholder="Catálogo ou descreva abaixo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">
                            Selecione um serviço do catálogo ou descreva abaixo
                          </SelectItem>
                          {catalogServices.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.code ? `${s.code} — ${s.name}` : s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição do Problema *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva detalhadamente o problema encontrado..."
                      className="min-h-20 resize-y sm:min-h-24"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="naturezaAtendimento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Natureza do Atendimento *</FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                      {NATUREZA_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => field.onChange(opt)}
                          className={cn(
                            'flex flex-col gap-2 sm:min-h-18',
                            CARD_BASE_CLASS,
                            field.value === opt ? CARD_SELECTED_CLASS : CARD_UNSELECTED_CLASS,
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                'grid h-8 w-8 shrink-0 place-items-center rounded-md sm:h-9 sm:w-9',
                                opt === 'Padrão'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                              )}
                            >
                              {opt === 'Padrão' ? (
                                <Clock className="h-4 w-4" />
                              ) : (
                                <AlertTriangle className="h-4 w-4" />
                              )}
                            </div>
                            <span className="text-sm font-medium sm:text-base">{opt}</span>
                          </div>
                          <span className="text-muted-foreground text-xs leading-snug sm:text-sm">
                            {NATUREZA_DESCRIPTIONS[opt]}
                          </span>
                        </button>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div
              className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 dark:border-blue-800 dark:bg-blue-950/40 sm:px-4 sm:py-3"
              role="status"
            >
              <Clock className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 sm:h-5 sm:w-5" />
              <p className="text-xs leading-snug text-blue-900 dark:text-blue-100 sm:text-sm">
                Horário de Atendimento: Segunda a sexta, das 08:00 às 18:00. O prazo de 3 dias úteis
                será contado apenas dentro deste horário.
              </p>
            </div>

            <div className={FORM_GRID_GRAU_CLASS}>
              <FormField
                control={form.control}
                name="grauUrgencia"
                render={({ field }) => {
                  const selectedLabel =
                    GRAU_URGENCIA_OPTIONS.find((opt) => opt === field.value) || field.value;
                  const displayValue =
                    selectedLabel === 'Normal'
                      ? `${selectedLabel} — Necessário, mas sem urgência imediata`
                      : selectedLabel;

                  return (
                    <FormItem className={FORM_ITEM_MIN_CLASS}>
                      <FormLabel>
                        Grau de Urgência Sugerido
                        {catalogServiceId && (
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            (automático)
                          </span>
                        )}
                      </FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={!!catalogServiceId}
                        >
                          <SelectTrigger
                            className={cn(
                              GRAU_SELECT_TRIGGER_CLASS,
                              catalogServiceId && 'cursor-not-allowed opacity-60',
                            )}
                          >
                            <SelectValue placeholder="Selecione um serviço do catálogo">
                              {field.value ? (
                                <span className={catalogServiceId ? 'text-muted-foreground' : ''}>
                                  {displayValue}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">
                                  {catalogServiceId ? 'Selecione um serviço do catálogo' : 'Normal'}
                                </span>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {GRAU_URGENCIA_OPTIONS.map((opt) => (
                              <SelectItem key={opt} value={opt}>
                                {opt}
                                {opt === 'Normal' && ' — Necessário, mas sem urgência imediata'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      {catalogServiceId && (
                        <p className="text-xs text-muted-foreground">
                          Preenchido automaticamente pelo catálogo de serviços
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="telefoneContato"
                render={({ field }) => {
                  const hasUnitPhone =
                    unitId && units.find((u) => u.id === unitId)?.responsiblePhone;
                  return (
                    <FormItem className={FORM_ITEM_MIN_CLASS}>
                      <FormLabel>
                        Telefone para Contato
                        {hasUnitPhone && (
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            (da unidade)
                          </span>
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="(00) 00000-0000"
                          {...field}
                          value={field.value ?? ''}
                          className={hasUnitPhone ? 'bg-muted/50' : ''}
                        />
                      </FormControl>
                      {hasUnitPhone && (
                        <p className="text-xs text-muted-foreground">
                          Preenchido automaticamente da unidade selecionada
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </div>

            {form.formState.errors.root && (
              <p className="text-destructive text-sm">{form.formState.errors.root.message}</p>
            )}

            <DialogFooter
              className={cn(
                'shrink-0 flex-col gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-2 sm:pt-0',
              )}
            >
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className="order-2 w-full sm:order-1 sm:w-auto"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="order-1 w-full sm:order-2 sm:w-auto"
              >
                {submitting ? 'Abrindo…' : 'Abrir Chamado'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
