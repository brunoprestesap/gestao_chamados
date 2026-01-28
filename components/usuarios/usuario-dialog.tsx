'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  USER_ROLES,
  UserCreateSchema,
  type UserRole,
  UserUpdateSchema,
} from '@/shared/users/user.schemas';

// Constantes
const DEFAULT_ROLE: UserRole = 'Solicitante';
const UNIT_NONE_VALUE = 'none';
const STATUS_ACTIVE = 'true';
const STATUS_INACTIVE = 'false';

export type UserDTO = {
  _id: string;
  username: string;
  name: string;
  email?: string;
  role: UserRole;
  unitId?: string | null;
  isActive: boolean;
  specialties?: string[];
  maxAssignedTickets?: number;
};

type UnitOption = { id: string; name: string };

interface UnitApiResponse {
  _id?: string;
  id?: string;
  name: string;
}

type ServiceCatalogOption = {
  _id: string;
  code: string;
  name: string;
  isActive?: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  mode: 'create' | 'edit';
  initialData?: UserDTO | null;
};

export function UsuarioDialog({ open, onOpenChange, onSaved, mode, initialData }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [serviceCatalogs, setServiceCatalogs] = useState<ServiceCatalogOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isEdit = mode === 'edit' && !!initialData?._id;

  // Schema customizado para edição que permite senha vazia (opcional)
  const editSchema = useMemo(
    () =>
      UserUpdateSchema.extend({
        password: z
          .string()
          .optional()
          .superRefine((val, ctx) => {
            // Se vazio ou apenas espaços, é válido (opcional)
            if (!val || val.trim() === '') {
              return;
            }
            // Se preenchido, deve ter no mínimo 6 caracteres
            if (val.trim().length < 6) {
              ctx.addIssue({
                code: z.ZodIssueCode.too_small,
                minimum: 6,
                type: 'string',
                inclusive: true,
                origin: 'string',
                message: 'Senha deve ter no mínimo 6 caracteres',
              });
            }
          })
          .transform((val) => {
            // Transforma string vazia ou apenas espaços em undefined
            if (!val || val.trim() === '') return undefined;
            return val.trim();
          }),
      }),
    [],
  );

  const schema = useMemo(() => (isEdit ? editSchema : UserCreateSchema), [isEdit, editSchema]);

  type FormData = z.infer<typeof UserCreateSchema> | z.infer<typeof editSchema>;

  const defaultValues = useMemo(
    () => ({
      username: initialData?.username ?? '',
      name: initialData?.name ?? '',
      email: initialData?.email ?? '',
      role: initialData?.role ?? DEFAULT_ROLE,
      unitId: initialData?.unitId ?? null,
      password: '',
      isActive: initialData?.isActive ?? true,
      specialties: initialData?.specialties ?? [],
      maxAssignedTickets: initialData?.maxAssignedTickets ?? 5,
    }),
    [initialData],
  );

  const form = useForm<FormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: defaultValues as FormData,
  });

  useEffect(() => {
    if (!open) {
      setError(null);
      return;
    }
    form.reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData?._id, mode, defaultValues]);

  // Atualiza campos de técnico quando o role muda
  const currentRole = form.watch('role');
  useEffect(() => {
    if (currentRole === 'Técnico') {
      // Garante que os campos existam quando muda para Técnico
      const currentSpecialties = form.getValues('specialties');
      const currentMaxTickets = form.getValues('maxAssignedTickets');
      if (!Array.isArray(currentSpecialties)) {
        form.setValue('specialties', []);
      }
      if (!currentMaxTickets || currentMaxTickets < 1) {
        form.setValue('maxAssignedTickets', 5);
      }
    }
  }, [currentRole, form]);

  const fetchUnits = useCallback(async () => {
    try {
      const res = await fetch('/api/units', { cache: 'no-store' });
      if (!res.ok) throw new Error('Erro ao carregar unidades');
      const data = (await res.json().catch(() => ({}))) as { items?: UnitApiResponse[] };
      setUnits(
        (data.items || []).map((u: UnitApiResponse) => ({
          id: u._id ?? u.id ?? '',
          name: u.name,
        })),
      );
    } catch (err) {
      console.error('Erro ao buscar unidades:', err);
      setError('Erro ao carregar unidades');
    }
  }, []);

  const fetchServiceCatalogs = useCallback(async () => {
    try {
      const res = await fetch('/api/catalog/services', { cache: 'no-store' });
      if (!res.ok) throw new Error('Erro ao carregar serviços');
      const data = (await res.json().catch(() => ({}))) as { items?: ServiceCatalogOption[] };
      // Filtra apenas serviços ativos
      setServiceCatalogs((data.items || []).filter((s) => s.isActive !== false));
    } catch (err) {
      console.error('Erro ao buscar serviços:', err);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchUnits();
    fetchServiceCatalogs();
  }, [open, fetchUnits, fetchServiceCatalogs]);

  const isTechnician = form.watch('role') === 'Técnico';

  const onSubmit = useCallback(
    async (values: FormData) => {
      setSubmitting(true);
      setError(null);

      try {
        const url = isEdit ? `/api/users/${initialData!._id}` : '/api/users';
        const method = isEdit ? 'PUT' : 'POST';

        // Prepara o payload
        const payload: any = { ...values };

        // no edit: se password vazio, não envia
        if (isEdit && (!payload.password || String(payload.password).trim() === '')) {
          delete payload.password;
        }

        // Tratamento dos campos específicos de Técnico
        // IMPORTANTE: Sempre envia os campos quando é Técnico, mesmo que vazios
        if (payload.role === 'Técnico') {
          // Se é Técnico, garante que os campos existam e sejam arrays válidos
          // Se specialties não existe ou não é array, inicializa como array vazio
          if (!Array.isArray(payload.specialties)) {
            payload.specialties = [];
          }
          // Se maxAssignedTickets não existe ou é inválido, usa padrão 5
          if (!payload.maxAssignedTickets || payload.maxAssignedTickets < 1) {
            payload.maxAssignedTickets = 5;
          }
        } else {
          // Se não é Técnico, limpa os campos (envia array vazio para specialties)
          // No modo edit, sempre envia para limpar no banco
          if (isEdit) {
            payload.specialties = [];
            // Não envia maxAssignedTickets se não for técnico
            delete payload.maxAssignedTickets;
          } else {
            // No modo create, não envia esses campos se não for técnico
            delete payload.specialties;
            delete payload.maxAssignedTickets;
          }
        }

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data?.error || 'Erro ao salvar usuário');
        }

        onOpenChange(false);
        onSaved();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao salvar usuário';
        setError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [isEdit, initialData, onOpenChange, onSaved],
  );

  const handleDialogChange = useCallback(
    (value: boolean) => {
      if (!submitting) {
        onOpenChange(value);
      }
    },
    [submitting, onOpenChange],
  );

  const title = isEdit ? 'Editar Usuário' : 'Novo Usuário';
  const desc = isEdit ? 'Atualize os dados do usuário.' : 'Cadastre um novo usuário.';

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto sm:max-h-[85vh] p-4 sm:p-6">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-lg sm:text-xl">{title}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm mt-1">{desc}</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="mb-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 sm:space-y-6">
            {/* Primeira linha: Matrícula e Nome */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem className="space-y-2 min-w-0">
                    <FormLabel className="text-sm font-medium">Matrícula</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="ex.: ap20256"
                        {...field}
                        className="text-sm h-9 w-full"
                        aria-label="Matrícula do usuário"
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="space-y-2 min-w-0">
                    <FormLabel className="text-sm font-medium">Nome</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Nome completo"
                        {...field}
                        className="text-sm h-9 w-full"
                        aria-label="Nome completo do usuário"
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>

            {/* Segunda linha: Email e Perfil */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="space-y-2 min-w-0">
                    <FormLabel className="text-sm font-medium">
                      Email <span className="text-muted-foreground font-normal">(opcional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="nome@dominio.com"
                        {...field}
                        className="text-sm h-9 w-full"
                        aria-label="Email do usuário (opcional)"
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem className="space-y-2 min-w-0">
                    <FormLabel className="text-sm font-medium">Perfil</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger
                          className="text-sm h-9 w-full"
                          aria-label="Selecione o perfil"
                        >
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {USER_ROLES.map((r) => (
                          <SelectItem key={r} value={r} className="text-sm">
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>

            {/* Terceira linha: Unidade e Status */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="unitId"
                render={({ field }) => (
                  <FormItem className="space-y-2 min-w-0 flex-1">
                    <FormLabel className="text-sm font-medium">
                      Unidade <span className="text-muted-foreground font-normal">(opcional)</span>
                    </FormLabel>
                    <Select
                      value={field.value ?? UNIT_NONE_VALUE}
                      onValueChange={(v) => field.onChange(v === UNIT_NONE_VALUE ? null : v)}
                    >
                      <FormControl className="w-full min-w-0">
                        <SelectTrigger
                          className="text-sm h-9 w-full min-w-0 max-w-full"
                          aria-label="Selecione a unidade"
                        >
                          <SelectValue placeholder="Selecione uma unidade" className="truncate" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={UNIT_NONE_VALUE} className="text-sm">
                          Sem unidade
                        </SelectItem>
                        {units.map((u) => (
                          <SelectItem key={u.id} value={u.id} className="text-sm">
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="space-y-2 min-w-0 flex-1">
                    <FormLabel className="text-sm font-medium">Status</FormLabel>
                    <Select
                      value={field.value ? STATUS_ACTIVE : STATUS_INACTIVE}
                      onValueChange={(v) => field.onChange(v === STATUS_ACTIVE)}
                    >
                      <FormControl>
                        <SelectTrigger
                          className="text-sm h-9 w-full"
                          aria-label="Selecione o status"
                        >
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={STATUS_ACTIVE} className="text-sm">
                          Ativo
                        </SelectItem>
                        <SelectItem value={STATUS_INACTIVE} className="text-sm">
                          Inativo
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>

            {/* Senha */}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-sm font-medium">
                    Senha
                    {isEdit && (
                      <span className="ml-1 text-xs text-muted-foreground font-normal">
                        (deixe em branco para não alterar)
                      </span>
                    )}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      {...field}
                      className="text-sm h-9"
                      aria-label={isEdit ? 'Nova senha (opcional)' : 'Senha do usuário'}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            {/* Campos específicos para Técnico */}
            {isTechnician && (
              <>
                <FormField
                  control={form.control}
                  name="specialties"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel className="text-sm font-medium">
                        Especialidades{' '}
                        <span className="text-muted-foreground font-normal">(opcional)</span>
                      </FormLabel>
                      <FormControl>
                        <div className="space-y-2">
                          <Select
                            value=""
                            onValueChange={(value) => {
                              if (value && !field.value?.includes(value)) {
                                field.onChange([...(field.value || []), value]);
                              }
                            }}
                          >
                            <SelectTrigger className="text-sm h-9">
                              <SelectValue placeholder="Selecione uma especialidade para adicionar" />
                            </SelectTrigger>
                            <SelectContent>
                              {serviceCatalogs
                                .filter((s) => !field.value?.includes(s._id))
                                .map((s) => (
                                  <SelectItem key={s._id} value={s._id} className="text-sm">
                                    {s.code} - {s.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          {field.value && field.value.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {field.value.map((specialtyId) => {
                                const specialty = serviceCatalogs.find(
                                  (s) => s._id === specialtyId,
                                );
                                if (!specialty) return null;
                                return (
                                  <div
                                    key={specialtyId}
                                    className="flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs"
                                  >
                                    <span>
                                      {specialty.code} - {specialty.name}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        field.onChange(
                                          field.value?.filter((id) => id !== specialtyId),
                                        );
                                      }}
                                      className="ml-1 text-muted-foreground hover:text-destructive"
                                      aria-label={`Remover ${specialty.name}`}
                                    >
                                      ×
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="maxAssignedTickets"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel className="text-sm font-medium">
                        Capacidade Máxima de Chamados
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          placeholder="5"
                          {...field}
                          value={field.value ?? 5}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            field.onChange(isNaN(val) ? 5 : Math.max(1, val));
                          }}
                          className="text-sm h-9"
                          aria-label="Capacidade máxima de chamados atribuídos"
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Número máximo de chamados que este técnico pode ter atribuídos
                        simultaneamente.
                      </p>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
              </>
            )}

            <DialogFooter className="flex-col gap-2 pt-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className="w-full sm:w-auto"
                size="sm"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting} className="w-full sm:w-auto" size="sm">
                {submitting ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
