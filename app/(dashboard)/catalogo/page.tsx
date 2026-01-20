// app/(dashboard)/catalogo/page.tsx
'use client';

import { Clock, Pencil, Plus, Trash2 } from 'lucide-react';
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Catálogo de Serviços</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os tipos de serviços de manutenção
          </p>
        </div>

        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Serviço
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex-1">
          <Input
            placeholder="Buscar serviços..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="w-full md:w-64">
          <Select value={typeId} onValueChange={setTypeId}>
            <SelectTrigger>
              <SelectValue placeholder="Todos os Tipos" />
            </SelectTrigger>

            <SelectContent>
              {/* ✅ sentinel (não pode ser string vazia) */}
              <SelectItem value="all">Todos os Tipos</SelectItem>

              {/* ✅ opções reais */}
              {typeOptions
                .filter((t) => t.id) // defesa: nunca cria SelectItem sem value
                .map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabela */}
      <Card className="overflow-hidden">
        <div className="border-b px-4 py-3">
          <div className="grid grid-cols-6 gap-2 text-sm font-medium text-muted-foreground md:grid-cols-12">
            <div className="col-span-2 md:col-span-2">Código</div>
            <div className="col-span-4 md:col-span-5">Serviço</div>
            <div className="hidden md:col-span-2 md:block">Tipo/Subtipo</div>
            <div className="hidden md:col-span-1 md:block">Prioridade</div>
            <div className="hidden md:col-span-1 md:block">Tempo</div>
            <div className="col-span-2 md:col-span-1 text-center">Status</div>
            <div className="col-span-0 md:col-span-0" />
          </div>
        </div>

        <Table>
          <TableHeader className="hidden">
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Serviço</TableHead>
              <TableHead>Tipo/Subtipo</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Tempo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum serviço encontrado.
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => (
                <TableRow key={row._id} className="hover:bg-muted/30">
                  <TableCell className="w-[140px] font-mono text-xs">{row.code}</TableCell>

                  <TableCell>
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-lg bg-muted" />
                      <div className="leading-tight">
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

                    {/* Mobile: mostra tipo/subtipo abaixo */}
                    <div className="mt-2 flex flex-col gap-1 md:hidden">
                      <span className="inline-flex w-fit rounded-md bg-muted px-2 py-0.5 text-xs">
                        {row.type?.name ?? row.typeId}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {row.subtype?.name ?? row.subtypeId}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex w-fit rounded-md bg-muted px-2 py-0.5 text-xs">
                        {row.type?.name ?? row.typeId}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {row.subtype?.name ?? row.subtypeId}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline">{row.priorityDefault}</Badge>
                  </TableCell>

                  <TableCell className="hidden md:table-cell">
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
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Dialog create/edit */}
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
