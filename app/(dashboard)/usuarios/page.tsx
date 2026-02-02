'use client';

import { Ban, CheckCircle2, Filter, Pencil, Plus, Search, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type UserDTO, UsuarioDialog } from '@/components/usuarios/usuario-dialog';
import { USER_ROLES, type UserRole } from '@/shared/users/user.schemas';

// Constantes
const DEBOUNCE_DELAY = 300;
const FILTER_ALL_VALUE = 'all';
type StatusFilter = 'all' | 'active' | 'inactive';

type UnitOption = { id: string; name: string };
type DialogMode = 'create' | 'edit';

interface UnitApiResponse {
  _id?: string;
  id?: string;
  name: string;
}

interface FilterState {
  q: string;
  role: UserRole | typeof FILTER_ALL_VALUE;
  unitId: string;
  status: StatusFilter;
}

export default function UsuariosPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<FilterState>({
    q: '',
    role: FILTER_ALL_VALUE,
    unitId: FILTER_ALL_VALUE,
    status: FILTER_ALL_VALUE,
  });

  const [items, setItems] = useState<UserDTO[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>('create');
  const [selected, setSelected] = useState<UserDTO | null>(null);

  // Debounced search query
  const [debouncedQ, setDebouncedQ] = useState(filters.q);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedQ.trim()) params.set('q', debouncedQ.trim());
    if (filters.role !== FILTER_ALL_VALUE) params.set('role', filters.role);
    if (filters.unitId !== FILTER_ALL_VALUE) params.set('unitId', filters.unitId);
    if (filters.status !== FILTER_ALL_VALUE) params.set('status', filters.status);
    return params.toString();
  }, [debouncedQ, filters.role, filters.unitId, filters.status]);

  // Debounce effect para busca
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(filters.q);
    }, DEBOUNCE_DELAY);

    return () => clearTimeout(timer);
  }, [filters.q]);

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

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const url = queryString ? `/api/users?${queryString}` : '/api/users';
      const res = await fetch(url, { cache: 'no-store' });

      if (!res.ok) {
        throw new Error('Erro ao carregar usuários');
      }

      const data = await res.json().catch(() => ({}));
      setItems(data.items || []);
    } catch (err) {
      console.error('Erro ao buscar usuários:', err);
      setError('Erro ao carregar usuários. Tente novamente.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    const initializeData = async () => {
      await Promise.all([fetchUnits(), fetchUsers()]);
    };
    initializeData();
  }, [fetchUnits, fetchUsers]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const openCreate = useCallback(() => {
    setSelected(null);
    setDialogMode('create');
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((item: UserDTO) => {
    setSelected(item);
    setDialogMode('edit');
    setDialogOpen(true);
  }, []);

  const onToggleActive = useCallback(
    async (user: UserDTO) => {
      const next = !user.isActive;
      const action = next ? 'ATIVAR' : 'INATIVAR';

      const confirmed = window.confirm(`Deseja ${action} o usuário ${user.username}?`);
      if (!confirmed) return;

      try {
        const res = await fetch(`/api/users/${user._id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: next }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || 'Erro ao atualizar status');
        }

        await fetchUsers();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao atualizar status';
        window.alert(message);
      }
    },
    [fetchUsers],
  );

  const unitName = useCallback(
    (id?: string | null): string => {
      if (!id) return '—';
      return units.find((u) => u.id === id)?.name ?? id;
    },
    [units],
  );

  const handleFilterChange = useCallback(
    <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleDialogClose = useCallback((open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setSelected(null);
    }
  }, []);

  const handleDialogSaved = useCallback(() => {
    fetchUsers();
  }, [fetchUsers]);

  const emptyMessage = useMemo(() => {
    if (
      filters.q.trim() ||
      filters.role !== FILTER_ALL_VALUE ||
      filters.unitId !== FILTER_ALL_VALUE ||
      filters.status !== FILTER_ALL_VALUE
    ) {
      return 'Nenhum usuário encontrado com os filtros aplicados.';
    }
    return 'Nenhum usuário encontrado.';
  }, [filters]);

  const hasActiveFilters =
    filters.role !== FILTER_ALL_VALUE ||
    filters.unitId !== FILTER_ALL_VALUE ||
    filters.status !== FILTER_ALL_VALUE;

  const FiltersContent = () => (
    <>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Perfil</label>
        <Select
          value={filters.role}
          onValueChange={(v) => handleFilterChange('role', v as UserRole | typeof FILTER_ALL_VALUE)}
        >
          <SelectTrigger aria-label="Filtrar por perfil" className="h-11">
            <SelectValue placeholder="Perfil" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTER_ALL_VALUE}>Todos os Perfis</SelectItem>
            {USER_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Unidade</label>
        <Select value={filters.unitId} onValueChange={(v) => handleFilterChange('unitId', v)}>
          <SelectTrigger aria-label="Filtrar por unidade" className="h-11">
            <SelectValue placeholder="Unidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTER_ALL_VALUE}>Todas as Unidades</SelectItem>
            {units.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Status</label>
        <Select
          value={filters.status}
          onValueChange={(v) => handleFilterChange('status', v as StatusFilter)}
        >
          <SelectTrigger aria-label="Filtrar por status" className="h-11">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTER_ALL_VALUE}>Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 sm:space-y-5 md:space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 gap-y-1">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
              Usuários
            </h1>
            {!loading && items.length >= 0 && (
              <Badge variant="secondary" className="text-xs font-normal tabular-nums">
                {items.length} {items.length === 1 ? 'usuário' : 'usuários'}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Gerencie contas e permissões
          </p>
        </div>

        <Button
          onClick={openCreate}
          className="h-11 w-full min-w-0 gap-2 sm:h-9 sm:w-auto sm:min-w-[140px]"
          size="sm"
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          <span className="hidden sm:inline">Novo Usuário</span>
          <span className="sm:hidden">Novo usuário</span>
        </Button>
      </header>

      {/* Filtros: mobile Sheet + desktop grid */}
      <Card className="overflow-hidden border-0 py-0 shadow-sm sm:border sm:py-0 md:py-0">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3 sm:p-4 lg:flex-nowrap lg:gap-4">
          <div className="relative min-w-0 flex-1 sm:min-w-[200px] lg:min-w-0 lg:max-w-[280px]">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              placeholder="Buscar nome, matrícula ou email..."
              value={filters.q}
              onChange={(e) => handleFilterChange('q', e.target.value)}
              className="h-11 pl-9"
              aria-label="Buscar usuários"
            />
          </div>

          {/* Desktop: selects inline */}
          <div className="hidden gap-3 sm:flex sm:flex-wrap lg:flex-1 lg:flex-nowrap lg:justify-end lg:gap-4">
            <Select
              value={filters.role}
              onValueChange={(v) =>
                handleFilterChange('role', v as UserRole | typeof FILTER_ALL_VALUE)
              }
            >
              <SelectTrigger
                aria-label="Filtrar por perfil"
                className="h-11 w-full min-w-[140px] lg:w-[160px]"
              >
                <SelectValue placeholder="Perfil" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL_VALUE}>Todos os Perfis</SelectItem>
                {USER_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.unitId} onValueChange={(v) => handleFilterChange('unitId', v)}>
              <SelectTrigger
                aria-label="Filtrar por unidade"
                className="h-11 w-full min-w-[140px] lg:w-[180px]"
              >
                <SelectValue placeholder="Unidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL_VALUE}>Todas as Unidades</SelectItem>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.status}
              onValueChange={(v) => handleFilterChange('status', v as StatusFilter)}
            >
              <SelectTrigger
                aria-label="Filtrar por status"
                className="h-11 w-full min-w-[120px] lg:w-[140px]"
              >
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL_VALUE}>Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Mobile: botão Filtros abre Sheet */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-11 w-full gap-2 sm:hidden"
                aria-label="Abrir filtros"
              >
                <Filter className="h-4 w-4" />
                Filtros
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    •
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>Filtros</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-1 gap-4 pb-6">
                <FiltersContent />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </Card>

      {/* Mensagem de erro */}
      {error && (
        <Card className="border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {/* Tabela Desktop (scroll horizontal em telas médias) / Cards Mobile */}
      <Card className="overflow-hidden rounded-xl border shadow-sm">
        <div className="overflow-x-auto">
          {/* Desktop: Header da tabela */}
          <div className="hidden min-w-[700px] border-b bg-muted/30 px-4 py-3 md:block">
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground sm:text-sm">
              <div className="col-span-2">Matrícula</div>
              <div className="col-span-3">Usuário</div>
              <div className="col-span-2">Perfil</div>
              <div className="col-span-2">Unidade</div>
              <div className="col-span-2 text-center">Status</div>
              <div className="col-span-1 text-right">Ações</div>
            </div>
          </div>

          {/* Desktop: Tabela */}
          <div className="hidden md:block">
            <Table className="min-w-[700px]">
              <TableHeader className="sr-only">
                <TableRow>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="animate-pulse">
                      <TableCell className="py-4">
                        <div className="h-4 w-20 rounded bg-muted" />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="h-4 w-32 rounded bg-muted" />
                          <div className="h-3 w-40 rounded bg-muted" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="h-5 w-16 rounded-full bg-muted" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-24 rounded bg-muted" />
                      </TableCell>
                      <TableCell>
                        <div className="mx-auto h-5 w-14 rounded-full bg-muted" />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <div className="h-8 w-8 rounded bg-muted" />
                          <div className="h-8 w-8 rounded bg-muted" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <div className="rounded-full bg-muted p-4">
                          <Users className="h-8 w-8" aria-hidden />
                        </div>
                        <p className="text-sm font-medium">{emptyMessage}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((row) => (
                    <TableRow
                      key={row._id}
                      className={
                        row.isActive
                          ? 'hover:bg-muted/30 transition-colors'
                          : 'opacity-70 hover:bg-muted/30 transition-colors'
                      }
                    >
                      <TableCell className="font-mono text-xs">{row.username}</TableCell>

                      <TableCell>
                        <div className="leading-tight">
                          <div className="font-semibold">{row.name}</div>
                          <div className="text-xs text-muted-foreground">{row.email || '—'}</div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {row.role}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {unitName(row.unitId)}
                        </span>
                      </TableCell>

                      <TableCell className="text-center">
                        <Badge variant={row.isActive ? 'default' : 'secondary'} className="text-xs">
                          {row.isActive ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(row)}
                            aria-label={`Editar usuário ${row.name}`}
                            className="h-9 w-9 touch-manipulation"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onToggleActive(row)}
                            aria-label={
                              row.isActive ? `Inativar ${row.name}` : `Ativar ${row.name}`
                            }
                            className="h-9 w-9 touch-manipulation"
                          >
                            {row.isActive ? (
                              <Ban className="h-3.5 w-3.5 text-red-500" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Mobile: Cards com touch targets adequados */}
        <div className="md:hidden">
          {loading ? (
            <div className="space-y-0 divide-y">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-16 rounded bg-muted" />
                        <div className="h-5 w-14 rounded-full bg-muted" />
                      </div>
                      <div className="h-4 w-32 rounded bg-muted" />
                      <div className="h-3 w-40 rounded bg-muted" />
                      <div className="flex gap-2">
                        <div className="h-5 w-20 rounded-full bg-muted" />
                        <div className="h-4 w-24 rounded bg-muted" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="h-10 w-10 rounded-md bg-muted" />
                      <div className="h-10 w-10 rounded-md bg-muted" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center">
              <div className="rounded-full bg-muted p-4">
                <Users className="h-10 w-10 text-muted-foreground" aria-hidden />
              </div>
              <p className="text-sm font-medium text-muted-foreground">{emptyMessage}</p>
            </div>
          ) : (
            <div className="divide-y">
              {items.map((row) => (
                <div
                  key={row._id}
                  className={`px-4 py-4 transition-colors active:bg-muted/40 ${
                    row.isActive ? 'hover:bg-muted/20' : 'opacity-70'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {row.username}
                        </span>
                        <Badge variant={row.isActive ? 'default' : 'secondary'} className="text-xs">
                          {row.isActive ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      <h3 className="font-semibold leading-tight">{row.name}</h3>
                      {row.email && (
                        <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                      )}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          <span className="font-medium text-foreground/80">Perfil:</span>{' '}
                          <Badge variant="outline" className="text-xs font-normal">
                            {row.role}
                          </Badge>
                        </span>
                        <span>
                          <span className="font-medium text-foreground/80">Unidade:</span>{' '}
                          {unitName(row.unitId)}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(row)}
                        aria-label={`Editar usuário ${row.name}`}
                        className="h-11 w-11 touch-manipulation"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onToggleActive(row)}
                        aria-label={row.isActive ? `Inativar ${row.name}` : `Ativar ${row.name}`}
                        className="h-11 w-11 touch-manipulation"
                      >
                        {row.isActive ? (
                          <Ban className="h-4 w-4 text-red-500" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <UsuarioDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        onSaved={handleDialogSaved}
        mode={dialogMode}
        initialData={selected}
      />
    </div>
  );
}
