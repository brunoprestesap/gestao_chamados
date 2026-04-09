'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarCheck, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

import type { RecurringItem } from '@/app/(dashboard)/gestao/recurring/_components/RecurringTicketsClient';
import {
  createRecurringTemplateAction,
  updateRecurringTemplateAction,
} from '@/app/(dashboard)/gestao/recurring/actions';
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
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  type CreateRecurringTicketInput,
  CreateRecurringTicketSchema,
  DAY_OF_WEEK_LABELS,
  RECURRENCE_TYPE_LABELS,
  type RecurrenceType,
} from '@/shared/chamados/recurring-ticket.schemas';

type UnitOption = { id: string; name: string };
type UserOption = { id: string; name: string; username: string };

const TIPO_SERVICO_DISPLAY = ['Manutenção Predial', 'Ar-Condicionado', 'Elevador'] as const;
const NATUREZA_DISPLAY = ['Padrão', 'Urgente'] as const;
const GRAU_DISPLAY = ['Baixo', 'Normal', 'Alto', 'Crítico'] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem: RecurringItem | null;
  onSuccess: () => void;
}

const emptyDefaults: CreateRecurringTicketInput = {
  name: '',
  titulo: '',
  descricao: '',
  unitId: '',
  tipoServico: undefined as unknown as (typeof TIPO_SERVICO_DISPLAY)[number],
  naturezaAtendimento: undefined as unknown as (typeof NATUREZA_DISPLAY)[number],
  grauUrgencia: 'Normal',
  solicitanteId: '',
  recurrenceType: undefined as unknown as RecurrenceType,
  dayOfWeek: undefined,
  dayOfMonth: undefined,
  intervalDays: undefined,
  subtypeId: '',
  catalogServiceId: '',
};

export function RecurringTicketDialog({ open, onOpenChange, editingItem, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);

  const isEditing = !!editingItem;

  const form = useForm<CreateRecurringTicketInput>({
    resolver: zodResolver(CreateRecurringTicketSchema),
    defaultValues: emptyDefaults,
  });

  const recurrenceType = form.watch('recurrenceType');
  const dayOfWeek = form.watch('dayOfWeek');
  const dayOfMonth = form.watch('dayOfMonth');
  const intervalDays = form.watch('intervalDays');

  // Load dependencies when dialog opens
  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoading(true);

    const controller = new AbortController();
    Promise.all([
      fetch('/api/units', { cache: 'no-store', signal: controller.signal }).then((r) => r.json()),
      fetch('/api/users?active=true', { cache: 'no-store', signal: controller.signal }).then((r) =>
        r.json(),
      ),
    ])
      .then(([unitsData, usersData]) => {
        const unitsList = (unitsData.items ?? []) as {
          _id?: string;
          id?: string;
          name: string;
        }[];
        setUnits(
          unitsList
            .filter((u) => u._id ?? u.id)
            .map((u) => ({ id: String(u._id ?? u.id), name: u.name })),
        );

        const usersList = (usersData.items ?? usersData.users ?? []) as {
          _id?: string;
          id?: string;
          name: string;
          username: string;
        }[];
        setUsers(
          usersList
            .filter((u) => u._id ?? u.id)
            .map((u) => ({
              id: String(u._id ?? u.id),
              name: u.name,
              username: u.username,
            })),
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('Erro ao carregar dados. Tente fechar e reabrir o formulário.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open]);

  // Reset form when dialog opens or editing item changes
  useEffect(() => {
    if (!open) return;

    if (editingItem) {
      form.reset({
        name: editingItem.name,
        titulo: editingItem.titulo,
        descricao: editingItem.descricao,
        unitId: editingItem.unitId,
        tipoServico: editingItem.tipoServico as (typeof TIPO_SERVICO_DISPLAY)[number],
        naturezaAtendimento:
          editingItem.naturezaAtendimento as (typeof NATUREZA_DISPLAY)[number],
        grauUrgencia: (editingItem.grauUrgencia as (typeof GRAU_DISPLAY)[number]) || 'Normal',
        solicitanteId: editingItem.solicitanteId,
        recurrenceType: editingItem.recurrenceType as RecurrenceType,
        dayOfWeek: editingItem.dayOfWeek,
        dayOfMonth: editingItem.dayOfMonth,
        intervalDays: editingItem.intervalDays,
        subtypeId: editingItem.subtypeId ?? '',
        catalogServiceId: editingItem.catalogServiceId ?? '',
      });
    } else {
      form.reset(emptyDefaults);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingItem]);

  const nextRunPreview = useMemo(() => {
    if (!recurrenceType) return null;
    const dow = Number(dayOfWeek);
    const dom = Number(dayOfMonth);
    const intv = Number(intervalDays);

    try {
      const now = new Date();
      let next: Date | null = null;

      if (recurrenceType === 'weekly' && !isNaN(dow)) {
        next = new Date(now);
        next.setHours(8, 0, 0, 0);
        const current = next.getDay();
        let diff = dow - current;
        if (diff <= 0) diff += 7;
        next.setDate(next.getDate() + diff);
      } else if (recurrenceType === 'monthly' && !isNaN(dom)) {
        next = new Date(now);
        next.setHours(8, 0, 0, 0);
        next.setDate(dom);
        if (next <= now) next.setMonth(next.getMonth() + 1);
      } else if (recurrenceType === 'custom' && !isNaN(intv) && intv > 0) {
        next = new Date(now);
        next.setHours(8, 0, 0, 0);
        next.setDate(next.getDate() + intv);
      }

      if (!next) return null;
      return next.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return null;
    }
  }, [recurrenceType, dayOfWeek, dayOfMonth, intervalDays]);

  const handleSubmit = useCallback(
    async (data: CreateRecurringTicketInput) => {
      setSubmitting(true);
      setError(null);

      try {
        const result = isEditing
          ? await updateRecurringTemplateAction({ ...data, id: editingItem!._id })
          : await createRecurringTemplateAction(data);

        if (result.ok) {
          onOpenChange(false);
          onSuccess();
        } else {
          setError(result.error);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao salvar agendamento.');
      } finally {
        setSubmitting(false);
      }
    },
    [isEditing, editingItem, onOpenChange, onSuccess],
  );

  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (!submitting) onOpenChange(v);
    },
    [submitting, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex max-h-[90dvh] w-[calc(100%-1rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[90vh] [&>button]:right-3 [&>button]:top-3 sm:[&>button]:right-4 sm:[&>button]:top-4"
        showCloseButton
      >
        {/* Fixed header */}
        <DialogHeader className="shrink-0 border-b px-4 py-4 pr-10 sm:px-6 sm:py-5 sm:pr-6">
          <DialogTitle className="text-base font-semibold sm:text-lg">
            {isEditing ? 'Editar Agendamento' : 'Novo Agendamento Recorrente'}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {isEditing
              ? 'Altere os dados do agendamento recorrente.'
              : 'Configure a recorrência e os dados do chamado que será gerado automaticamente.'}
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div aria-live="polite" aria-atomic="true" className="px-4 pt-4 sm:px-6 sm:pt-5">
            {error && (
              <div
                role="alert"
                className="rounded-xl border border-destructive bg-destructive/10 p-3 text-xs text-destructive sm:text-sm"
              >
                {error}
              </div>
            )}
          </div>

          {loading ? (
            <div
              role="status"
              aria-label="Carregando dados do formulário"
              className="flex items-center justify-center gap-2 px-4 py-12 sm:px-6"
            >
              <Loader2
                className="h-5 w-5 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-sm text-muted-foreground">Carregando...</p>
            </div>
          ) : (
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleSubmit)}
                className="flex flex-col gap-0 pb-[env(safe-area-inset-bottom,1rem)]"
                id="recurring-ticket-form"
              >
                {/* ── Bloco 1: Agendamento ── */}
                <section aria-labelledby="section-agendamento" className="px-4 py-4 sm:px-6 sm:py-5">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-950/60">
                      <RefreshCw
                        className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400"
                        aria-hidden="true"
                      />
                    </div>
                    <h2
                      id="section-agendamento"
                      className="text-sm font-semibold text-foreground"
                    >
                      Agendamento
                    </h2>
                  </div>

                  <div className="space-y-4">
                    {/* Nome — full width */}
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Nome do agendamento <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Ex: Revisão mensal AC — Bloco A"
                              maxLength={150}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Recorrência + campo condicional em grid 2 cols no sm+ */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="recurrenceType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Tipo de recorrência <span className="text-destructive">*</span>
                            </FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? ''}>
                              <FormControl>
                                <SelectTrigger className="w-full min-h-10 sm:min-h-9">
                                  <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {(
                                  Object.entries(RECURRENCE_TYPE_LABELS) as [
                                    RecurrenceType,
                                    string,
                                  ][]
                                ).map(([value, label]) => (
                                  <SelectItem key={value} value={value}>
                                    {label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Conditional slot — always occupies the second column to prevent layout shift */}
                      <div
                        className={`overflow-hidden transition-all duration-200 ${
                          recurrenceType === 'weekly' ||
                          recurrenceType === 'monthly' ||
                          recurrenceType === 'custom'
                            ? 'opacity-100'
                            : 'pointer-events-none opacity-0'
                        }`}
                        aria-hidden={
                          recurrenceType !== 'weekly' &&
                          recurrenceType !== 'monthly' &&
                          recurrenceType !== 'custom'
                        }
                      >
                        {recurrenceType === 'weekly' && (
                          <FormField
                            control={form.control}
                            name="dayOfWeek"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  Dia da semana <span className="text-destructive">*</span>
                                </FormLabel>
                                <Select
                                  onValueChange={(v) => field.onChange(Number(v))}
                                  value={field.value !== undefined ? String(field.value) : ''}
                                >
                                  <FormControl>
                                    <SelectTrigger className="w-full min-h-10 sm:min-h-9">
                                      <SelectValue placeholder="Selecione..." />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {Object.entries(DAY_OF_WEEK_LABELS).map(([val, label]) => (
                                      <SelectItem key={val} value={val}>
                                        {label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        {recurrenceType === 'monthly' && (
                          <FormField
                            control={form.control}
                            name="dayOfMonth"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  Dia do mês <span className="text-destructive">*</span>
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min={1}
                                    max={28}
                                    placeholder="Ex: 15"
                                    {...field}
                                    value={field.value != null ? String(field.value) : ''}
                                    onChange={(e) =>
                                      field.onChange(
                                        e.target.value ? Number(e.target.value) : undefined,
                                      )
                                    }
                                  />
                                </FormControl>
                                <FormDescription className="text-xs">
                                  Use entre 1 e 28 para evitar problemas com meses curtos.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        {recurrenceType === 'custom' && (
                          <FormField
                            control={form.control}
                            name="intervalDays"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  Intervalo em dias <span className="text-destructive">*</span>
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min={1}
                                    placeholder="Ex: 90"
                                    {...field}
                                    value={field.value != null ? String(field.value) : ''}
                                    onChange={(e) =>
                                      field.onChange(
                                        e.target.value ? Number(e.target.value) : undefined,
                                      )
                                    }
                                  />
                                </FormControl>
                                <FormDescription className="text-xs">
                                  Ex: 90 para trimestral, 180 para semestral.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}
                      </div>
                    </div>

                    {/* Solicitante — full width */}
                    <FormField
                      control={form.control}
                      name="solicitanteId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Solicitante do chamado <span className="text-destructive">*</span>
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ''}>
                            <FormControl>
                              <SelectTrigger className="w-full min-h-10 sm:min-h-9">
                                <SelectValue placeholder="Selecione o solicitante..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent
                              className="max-h-[min(60vh,18rem)]"
                              position="popper"
                            >
                              {users.length === 0 ? (
                                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                                  Nenhum usuário encontrado.
                                </div>
                              ) : (
                                users.map((u) => (
                                  <SelectItem key={u.id} value={u.id}>
                                    {u.name}{' '}
                                    <span className="text-muted-foreground">({u.username})</span>
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          <FormDescription className="text-xs">
                            Quem será o solicitante nos chamados gerados automaticamente.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Preview — destaque visual com transição */}
                    <div
                      role="status"
                      aria-live="polite"
                      className={`overflow-hidden transition-all duration-300 ${
                        nextRunPreview ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'
                      }`}
                    >
                      {nextRunPreview && (
                        <div className="flex items-start gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300">
                          <CalendarCheck
                            className="mt-px h-4 w-4 shrink-0"
                            aria-hidden="true"
                          />
                          <span className="leading-snug">
                            Próxima geração estimada:{' '}
                            <strong className="font-semibold">{nextRunPreview}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <Separator />

                {/* ── Bloco 2: Template do Chamado ── */}
                <section
                  aria-labelledby="section-template"
                  className="px-4 py-4 sm:px-6 sm:py-5"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <div
                      className="h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-500"
                      aria-hidden="true"
                    />
                    <h2
                      id="section-template"
                      className="text-sm font-semibold text-foreground"
                    >
                      Template do Chamado
                    </h2>
                  </div>

                  <div className="space-y-4">
                    {/* Título — full width */}
                    <FormField
                      control={form.control}
                      name="titulo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Título do chamado <span className="text-destructive">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Ex: Revisão preventiva ar-condicionado"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Descrição — full width */}
                    <FormField
                      control={form.control}
                      name="descricao"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Descrição</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="Descreva o serviço a ser realizado..."
                              className="min-h-20 resize-y"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Unidade + Tipo de serviço */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="unitId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Unidade/Setor <span className="text-destructive">*</span>
                            </FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? ''}>
                              <FormControl>
                                <SelectTrigger className="w-full min-h-10 sm:min-h-9">
                                  <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent
                                className="max-h-[min(60vh,16rem)]"
                                position="popper"
                              >
                                {units.length === 0 ? (
                                  <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                                    Nenhuma unidade encontrada.
                                  </div>
                                ) : (
                                  units.map((u) => (
                                    <SelectItem key={u.id} value={u.id}>
                                      {u.name}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="tipoServico"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Tipo de serviço <span className="text-destructive">*</span>
                            </FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? ''}>
                              <FormControl>
                                <SelectTrigger className="w-full min-h-10 sm:min-h-9">
                                  <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {TIPO_SERVICO_DISPLAY.map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Natureza + Grau de urgência */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="naturezaAtendimento"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Natureza <span className="text-destructive">*</span>
                            </FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? ''}>
                              <FormControl>
                                <SelectTrigger className="w-full min-h-10 sm:min-h-9">
                                  <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {NATUREZA_DISPLAY.map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt}
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
                        name="grauUrgencia"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Grau de urgência</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value ?? 'Normal'}
                            >
                              <FormControl>
                                <SelectTrigger className="w-full min-h-10 sm:min-h-9">
                                  <SelectValue placeholder="Normal" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {GRAU_DISPLAY.map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </section>

                {/* Footer is outside the scrollable area — appended to the form for submit */}
              </form>
            </Form>
          )}
        </div>

        {/* Fixed footer */}
        <div className="shrink-0 border-t bg-background px-4 py-3 sm:px-6 sm:py-4">
          <DialogFooter className="flex flex-col gap-2 pb-[env(safe-area-inset-bottom,0)] sm:flex-row sm:justify-end sm:gap-2 sm:pb-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
              className="order-2 w-full min-h-11 touch-manipulation sm:order-1 sm:w-auto sm:min-h-9"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="recurring-ticket-form"
              disabled={submitting || loading}
              className="order-1 w-full min-h-11 touch-manipulation bg-linear-to-r from-indigo-600 to-blue-600 shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-blue-700 sm:order-2 sm:w-auto sm:min-h-9"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Salvando...
                </>
              ) : isEditing ? (
                'Salvar Alterações'
              ) : (
                'Criar Agendamento'
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
