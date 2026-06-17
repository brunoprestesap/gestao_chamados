'use client';

import { Clock, Pencil, Plus, Search, Settings2, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { ServiceDTO } from '@/components/catalogo/servico-dialog';
import { ServicoDialog } from '@/components/catalogo/servico-dialog';
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

type TypeOption = { id: string; name: string };

type ServiceRow = ServiceDTO & {
  type?: { id: string; name: string } | null;
  subtype?: { id: string; name: string } | null;
};

function formatHours(h: number) {
  if (!h || h <= 0) return '0h';
  if (h === 1) return '1h';
  return `${h}h`;
}

export function ServicosTab() {
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState('');
  const [typeId, setTypeId] = useState('all');

  const [items, setItems] = useState<ServiceRow[]>([]);
  const [typeOptions, setTypeOptions] = useState<TypeOption[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [selected, setSelected] = useState<ServiceDTO | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (typeId !== 'all') p.set('typeId', typeId);
    return p.toString();
  }, [q, typeId]);

  async function fetchTypes() {
    const res = await fetch('/api/catalog/types', { cache: 'no-store' });
    const data = (await res.json()) as {
      items?: Array<{ _id?: unknown; id?: unknown; name?: string }>;
    };
    setTypeOptions(
      (data.items || [])
        .map((t) => ({ id: String(t._id ?? t.id ?? ''), name: String(t.name ?? '') }))
        .filter((t) => t.id.length > 0),
    );
  }

  async function fetchServices() {
    setLoading(true);
    const url = queryString ? `/api/catalog/services?${queryString}` : '/api/catalog/services';
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    setItems(data.items || []);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      await Promise.all([fetchTypes(), fetchServices()]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  function openCreate() {
    setSelected(null);
    setDialogMode('create');
    setDialogOpen(true);
  }

  function openEdit(item: ServiceDTO) {
    setSelected(item);
    setDialogMode('edit');
    setDialogOpen(true);
  }

  async function onDelete(id: string) {
    const ok = confirm('Deseja remover este serviço?');
    if (!ok) return;

    const res = await fetch(`/api/catalog/services/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error || 'Erro ao remover serviço');
      return;
    }
    toast.success('Serviço removido com sucesso');
    fetchServices();
  }

  return (
    <div className="space-y-6">
      {/* Top Actions & Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar serviços..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-10 pl-9 rounded-xl border-border/50 bg-background/50 backdrop-blur-sm transition-all focus:bg-background"
            />
          </div>
          <div className="w-full min-w-0 sm:w-56">
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger className="h-10 rounded-xl border-border/50 bg-background/50 backdrop-blur-sm transition-all focus:bg-background">
                <SelectValue placeholder="Todos os Tipos" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">Todos os Tipos</SelectItem>
                {typeOptions
                  .filter((t) => t.id)
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          onClick={openCreate}
          className="w-full shrink-0 gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 shadow-indigo-500/20 hover:shadow-indigo-500/30 sm:w-auto"
          size="default"
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span>Novo Serviço</span>
        </Button>
      </div>

      {/* Mobile: lista em cards */}
      <div className="md:hidden">
        {loading ? (
          <Card className="rounded-2xl border-border/50 p-8 text-center text-sm text-muted-foreground">
            Carregando serviços...
          </Card>
        ) : items.length === 0 ? (
          <Card className="rounded-2xl border-border/50 p-8 text-center text-sm text-muted-foreground">
            Nenhum serviço encontrado.
          </Card>
        ) : (
          <ul className="space-y-4">
            {items.map((row) => (
              <li key={row._id}>
                <Card className="group relative overflow-hidden rounded-2xl border-border/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500/60 to-blue-500/60 opacity-0 transition-opacity group-hover:opacity-100" />
                  <div className="flex flex-col gap-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="font-mono text-xs font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                            {row.code}
                          </span>
                          <Badge
                            variant={row.isActive ? 'default' : 'secondary'}
                            className="shrink-0 text-[10px] uppercase tracking-wider"
                          >
                            {row.isActive ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>
                        <h3 className="font-semibold text-foreground leading-tight">{row.name}</h3>
                        {row.description ? (
                          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                            {row.description}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-1 bg-muted/30 rounded-lg p-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-md hover:bg-background hover:shadow-sm"
                          onClick={() => openEdit(row)}
                          aria-label="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-md text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
                          onClick={() => onDelete(row._id)}
                          aria-label="Excluir"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
                      <Badge
                        variant="secondary"
                        className="bg-indigo-50 text-indigo-700 hover:bg-indigo-50 dark:bg-indigo-950/50 dark:text-indigo-300"
                      >
                        {row.type?.name ?? row.typeId}
                      </Badge>
                      <span className="text-xs font-medium text-muted-foreground">
                        {row.subtype?.name ?? row.subtypeId}
                      </span>
                      <div className="ml-auto flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                          {row.priorityDefault}
                        </Badge>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                          <Clock className="h-3 w-3" />
                          {formatHours(row.estimatedHours)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Desktop: tabela */}
      <Card className="hidden overflow-hidden rounded-2xl border-border/50 md:block">
        <div className="overflow-x-auto">
          <Table className="table-fixed">
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[110px] font-semibold">Código</TableHead>
                <TableHead className="font-semibold">Serviço</TableHead>
                <TableHead className="w-[200px] font-semibold">Tipo/Subtipo</TableHead>
                <TableHead className="w-[120px] font-semibold">Prioridade</TableHead>
                <TableHead className="w-[100px] font-semibold">Tempo</TableHead>
                <TableHead className="w-[100px] text-center font-semibold">Status</TableHead>
                <TableHead className="w-[100px] text-right font-semibold">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">
                    Carregando serviços...
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">
                    Nenhum serviço encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow key={row._id} className="group transition-colors hover:bg-muted/30">
                    <TableCell className="truncate font-mono text-xs font-medium text-muted-foreground">
                      {row.code}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                          <Settings2 className="h-5 w-5 opacity-75" />
                        </div>
                        <div className="min-w-0 leading-tight">
                          <div className="truncate font-medium text-foreground">{row.name}</div>
                          {row.description ? (
                            <div className="truncate text-xs text-muted-foreground mt-0.5">
                              {row.description}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground mt-0.5">—</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <Badge
                          variant="secondary"
                          className="w-fit max-w-full truncate bg-indigo-50 text-indigo-700 hover:bg-indigo-50 dark:bg-indigo-950/50 dark:text-indigo-300"
                        >
                          {row.type?.name ?? row.typeId}
                        </Badge>
                        <span className="truncate text-xs font-medium text-muted-foreground pl-1">
                          {row.subtype?.name ?? row.subtypeId}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase tracking-wider bg-background"
                      >
                        {row.priorityDefault}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                        <Clock className="h-3.5 w-3.5" />
                        {formatHours(row.estimatedHours)}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={row.isActive ? 'default' : 'secondary'}
                        className="text-[10px] uppercase tracking-wider"
                      >
                        {row.isActive ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          onClick={() => openEdit(row)}
                          aria-label="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
                          onClick={() => onDelete(row._id)}
                          aria-label="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <ServicoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={fetchServices}
        typeOptions={typeOptions}
        mode={dialogMode}
        initialData={selected}
      />
    </div>
  );
}
