// app/(dashboard)/catalogo/page.tsx
'use client';

import { Clock, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

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
  // Se sua API já normaliza, esses campos vêm prontos:
  type?: { id: string; name: string } | null;
  subtype?: { id: string; name: string } | null;
};

function formatHours(h: number) {
  if (!h || h <= 0) return '0h';
  if (h === 1) return '1h';
  return `${h}h`;
}

export default function CatalogoPage() {
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
    const data = await res.json();
    setTypeOptions(
      (data.items || [])
        .map((t: any) => ({ id: String(t._id ?? t.id ?? ''), name: t.name }))
        .filter((t: any) => t.id.length > 0),
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
    // carga inicial
    (async () => {
      await Promise.all([fetchTypes(), fetchServices()]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // refetch quando filtros mudarem
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
      alert(data?.error || 'Erro ao remover serviço');
      return;
    }
    fetchServices();
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header — empilha em mobile, botão full-width em xs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Catálogo de Serviços</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Gerencie os tipos de serviços de manutenção
          </p>
        </div>
        <Button onClick={openCreate} className="w-full shrink-0 gap-2 sm:w-auto" size="default">
          <Plus className="h-4 w-4 shrink-0" />
          <span>Novo Serviço</span>
        </Button>
      </div>

      {/* Filtros — full width em mobile, min-w-0 evita overflow */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar serviços..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-10 pl-9 sm:h-9"
          />
        </div>
        <div className="w-full min-w-0 sm:w-56 md:w-64">
          <Select value={typeId} onValueChange={setTypeId}>
            <SelectTrigger className="h-10 sm:h-9">
              <SelectValue placeholder="Todos os Tipos" />
            </SelectTrigger>
            <SelectContent>
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

      {/* Mobile: lista em cards */}
      <div className="md:hidden">
        {loading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Carregando...</Card>
        ) : items.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Nenhum serviço encontrado.
          </Card>
        ) : (
          <ul className="space-y-3">
            {items.map((row) => (
              <li key={row._id}>
                <Card className="overflow-hidden transition-colors hover:bg-muted/30">
                  <div className="flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {row.code}
                          </span>
                          <Badge
                            variant={row.isActive ? 'default' : 'secondary'}
                            className="shrink-0 text-xs"
                          >
                            {row.isActive ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>
                        <h3 className="mt-0.5 font-semibold uppercase leading-tight">{row.name}</h3>
                        {row.description ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {row.description}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-10 min-h-10 min-w-10 touch-manipulation"
                          onClick={() => openEdit(row)}
                          aria-label="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-10 min-h-10 min-w-10 touch-manipulation text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
                          onClick={() => onDelete(row._id)}
                          aria-label="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                      <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs">
                        {row.type?.name ?? row.typeId}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {row.subtype?.name ?? row.subtypeId}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {row.priorityDefault}
                      </Badge>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {formatHours(row.estimatedHours)}
                      </span>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Desktop: tabela com scroll horizontal em telas menores */}
      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px] sm:w-[120px]">Código</TableHead>
                <TableHead className="min-w-[200px]">Serviço</TableHead>
                <TableHead className="min-w-[140px]">Tipo/Subtipo</TableHead>
                <TableHead className="w-[100px]">Prioridade</TableHead>
                <TableHead className="w-[80px]">Tempo</TableHead>
                <TableHead className="w-[90px] text-center">Status</TableHead>
                <TableHead className="w-[100px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Nenhum serviço encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow key={row._id} className="hover:bg-muted/30">
                    <TableCell className="w-[120px] font-mono text-xs">{row.code}</TableCell>
                    <TableCell>
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 shrink-0 rounded-lg bg-muted" />
                        <div className="min-w-0 leading-tight">
                          <div className="font-semibold uppercase">{row.name}</div>
                          {row.description ? (
                            <div className="text-xs text-muted-foreground line-clamp-1">
                              {row.description}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">—</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="inline-flex w-fit rounded-md bg-muted px-2 py-0.5 text-xs">
                          {row.type?.name ?? row.typeId}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {row.subtype?.name ?? row.subtypeId}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.priorityDefault}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        {formatHours(row.estimatedHours)}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={row.isActive ? 'default' : 'secondary'}>
                        {row.isActive ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(row)}
                          aria-label="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(row._id)}
                          aria-label="Excluir"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
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
