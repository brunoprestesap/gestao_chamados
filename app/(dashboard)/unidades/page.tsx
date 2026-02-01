'use client';

import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UnidadeDialog, type UnitDTO } from '@/components/unidades/unidade-dialog';

const emptyMessage = 'Nenhuma unidade encontrada.';

export default function UnidadesPage() {
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<UnitDTO[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [selected, setSelected] = useState<UnitDTO | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    return p.toString();
  }, [q]);

  async function fetchUnits() {
    setLoading(true);
    const url = queryString ? `/api/units?${queryString}` : '/api/units';
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    setItems(data.items || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchUnits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchUnits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  function openCreate() {
    setSelected(null);
    setDialogMode('create');
    setDialogOpen(true);
  }

  function openEdit(item: UnitDTO) {
    setSelected(item);
    setDialogMode('edit');
    setDialogOpen(true);
  }

  async function onDelete(id: string) {
    const ok = confirm('Deseja remover esta unidade?');
    if (!ok) return;

    const res = await fetch(`/api/units/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error || 'Erro ao remover unidade');
      return;
    }
    fetchUnits();
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header responsivo */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Unidades</h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Cadastre e gerencie as unidades
          </p>
        </div>

        <Button onClick={openCreate} className="w-full gap-2 sm:w-auto" size="sm">
          <Plus className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Nova Unidade</span>
          <span className="sm:hidden">Nova</span>
        </Button>
      </div>

      {/* Busca */}
      <Card className="p-3 sm:p-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            placeholder="Buscar unidades..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
            aria-label="Buscar unidades"
          />
        </div>
      </Card>

      {/* Desktop: Tabela | Mobile: Cards */}
      <Card className="overflow-hidden">
        {/* Desktop: Tabela */}
        <div className="hidden md:block">
          <div className="border-b px-4 py-3">
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground sm:text-sm">
              <div className="col-span-4">Unidade</div>
              <div className="col-span-2">Andar</div>
              <div className="col-span-3">Responsável</div>
              <div className="col-span-2 text-center">Status</div>
              <div className="col-span-1 text-right">Ações</div>
            </div>
          </div>

          <Table>
            <TableHeader className="sr-only">
              <TableRow>
                <TableHead>Unidade</TableHead>
                <TableHead>Andar</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow key={row._id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="align-top">
                      <div className="leading-tight">
                        <div className="font-semibold">{row.name}</div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="text-sm">{row.floor}</span>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="leading-tight">
                        <div className="text-sm font-medium">{row.responsibleName}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.responsibleEmail || '—'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {row.responsiblePhone || '—'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-center">
                      <Badge
                        variant={row.isActive ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {row.isActive ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(row)}
                          aria-label={`Editar ${row.name}`}
                          className="h-8 w-8"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(row._id)}
                          aria-label={`Excluir ${row.name}`}
                          className="h-8 w-8"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
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
            <div className="p-10 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">{emptyMessage}</div>
          ) : (
            <div className="divide-y">
              {items.map((row) => (
                <div
                  key={row._id}
                  className="p-4 transition-colors hover:bg-muted/30 active:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold leading-tight">{row.name}</h3>
                        <Badge
                          variant={row.isActive ? 'default' : 'secondary'}
                          className="shrink-0 text-xs"
                        >
                          {row.isActive ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>

                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground/80">Andar:</span>
                          <span>{row.floor}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground/80">Responsável:</span>
                          <span className="truncate">{row.responsibleName}</span>
                        </div>
                        {row.responsibleEmail && (
                          <div className="truncate sm:max-w-[200px]">{row.responsibleEmail}</div>
                        )}
                        {row.responsiblePhone && (
                          <div className="truncate">{row.responsiblePhone}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(row)}
                        aria-label={`Editar ${row.name}`}
                        className="h-10 w-10 min-w-10 touch-manipulation"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(row._id)}
                        aria-label={`Excluir ${row.name}`}
                        className="h-10 w-10 min-w-10 touch-manipulation"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <UnidadeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={fetchUnits}
        mode={dialogMode}
        initialData={selected}
      />
    </div>
  );
}
