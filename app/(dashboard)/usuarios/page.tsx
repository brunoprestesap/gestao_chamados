'use client';

import { Ban, CheckCircle2, Pencil, Plus, Search } from 'lucide-react';
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

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Usuários</h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Gerencie contas e permissões
          </p>
        </div>

        <Button onClick={openCreate} className="w-full gap-2 sm:w-auto" size="sm">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Novo Usuário</span>
          <span className="sm:hidden">Novo</span>
        </Button>
      </div>

      {/* Filtros */}
      <Card className="p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              placeholder="Buscar por nome, matrícula ou email..."
              value={filters.q}
              onChange={(e) => handleFilterChange('q', e.target.value)}
              className="pl-9"
              aria-label="Buscar usuários"
            />
          </div>

          <div className="w-full">
            <Select
              value={filters.role}
              onValueChange={(v) =>
                handleFilterChange('role', v as UserRole | typeof FILTER_ALL_VALUE)
              }
            >
              <SelectTrigger aria-label="Filtrar por perfil">
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

          <div className="w-full">
            <Select value={filters.unitId} onValueChange={(v) => handleFilterChange('unitId', v)}>
              <SelectTrigger aria-label="Filtrar por unidade">
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

          <div className="w-full">
            <Select
              value={filters.status}
              onValueChange={(v) => handleFilterChange('status', v as StatusFilter)}
            >
              <SelectTrigger aria-label="Filtrar por status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL_VALUE}>Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Mensagem de erro */}
      {error && (
        <Card className="border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {/* Tabela Desktop / Cards Mobile */}
      <Card className="overflow-hidden">
        {/* Desktop: Header da tabela */}
        <div className="hidden border-b px-4 py-3 md:block">
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
          <Table>
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
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {emptyMessage}
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
                      <span className="text-sm text-muted-foreground">{unitName(row.unitId)}</span>
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
                          className="h-8 w-8"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onToggleActive(row)}
                          aria-label={row.isActive ? `Inativar ${row.name}` : `Ativar ${row.name}`}
                          className="h-8 w-8"
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

        {/* Mobile: Cards */}
        <div className="md:hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">{emptyMessage}</div>
          ) : (
            <div className="divide-y">
              {items.map((row) => (
                <div
                  key={row._id}
                  className={`p-4 transition-colors ${
                    row.isActive ? 'hover:bg-muted/30' : 'opacity-70 hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {row.username}
                          </span>
                          <Badge
                            variant={row.isActive ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {row.isActive ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>
                        <h3 className="mt-1 font-semibold leading-tight">{row.name}</h3>
                        {row.email && <p className="text-xs text-muted-foreground">{row.email}</p>}
                      </div>

                      <div className="space-y-1.5 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground/80">Perfil:</span>
                          <Badge variant="outline" className="text-xs">
                            {row.role}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground/80">Unidade:</span>
                          <span>{unitName(row.unitId)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(row)}
                        aria-label={`Editar usuário ${row.name}`}
                        className="h-9 w-9"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onToggleActive(row)}
                        aria-label={row.isActive ? `Inativar ${row.name}` : `Ativar ${row.name}`}
                        className="h-9 w-9"
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
