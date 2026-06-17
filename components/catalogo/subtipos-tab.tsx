'use client';

import { ListTree, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { SubtipoDialog, type SubtypeDTO } from '@/components/catalogo/subtipo-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
type SubtypeRow = SubtypeDTO & { typeName: string };

export function SubtiposTab() {
  const [typeOptions, setTypeOptions] = useState<TypeOption[]>([]);
  const [items, setItems] = useState<SubtypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [selected, setSelected] = useState<SubtypeDTO | null>(null);

  async function fetchTypes() {
    const res = await fetch('/api/catalog/types', { cache: 'no-store' });
    const data = (await res.json()) as { items?: Array<{ _id: unknown; name: string }> };
    setTypeOptions(
      (data.items || [])
        .map((t) => ({ id: String(t._id), name: t.name }))
        .filter((t) => t.id.length > 0),
    );
  }

  async function fetchSubtypes() {
    setLoading(true);
    const url =
      typeFilter !== 'all'
        ? `/api/catalog/subtypes?typeId=${encodeURIComponent(typeFilter)}`
        : '/api/catalog/subtypes';
    const res = await fetch(url, { cache: 'no-store' });
    const data = (await res.json()) as {
      items?: Array<{
        _id: string;
        name: string;
        typeId: string;
        isActive: boolean;
        typeName?: string;
      }>;
    };
    setItems(
      (data.items || []).map((s) => ({
        _id: String(s._id),
        name: s.name,
        typeId: s.typeId,
        isActive: s.isActive,
        typeName: s.typeName ?? '',
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    fetchTypes();
  }, []);

  useEffect(() => {
    fetchSubtypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter]);

  const defaultTypeId = useMemo(
    () => (typeFilter !== 'all' ? typeFilter : undefined),
    [typeFilter],
  );

  function openCreate() {
    setSelected(null);
    setDialogMode('create');
    setDialogOpen(true);
  }

  function openEdit(item: SubtypeRow) {
    setSelected(item);
    setDialogMode('edit');
    setDialogOpen(true);
  }

  async function onDelete(item: SubtypeRow) {
    if (!confirm(`Deseja remover o subtipo "${item.name}"?`)) return;

    const res = await fetch(`/api/catalog/subtypes/${item._id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error || 'Erro ao remover subtipo');
      return;
    }
    toast.success('Subtipo removido com sucesso');
    fetchSubtypes();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full min-w-0 sm:w-64">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-10 rounded-xl border-border/50 bg-background/50 backdrop-blur-sm transition-all focus:bg-background">
              <SelectValue placeholder="Todos os Tipos" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">Todos os Tipos</SelectItem>
              {typeOptions.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={openCreate}
          className="w-full shrink-0 gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 shadow-indigo-500/20 hover:shadow-indigo-500/30 sm:w-auto"
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span>Novo Subtipo</span>
        </Button>
      </div>

      <Card className="overflow-hidden rounded-2xl border-border/50">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[200px] font-semibold">Nome</TableHead>
                <TableHead className="min-w-[160px] font-semibold">Tipo</TableHead>
                <TableHead className="w-[120px] text-center font-semibold">Status</TableHead>
                <TableHead className="w-[120px] text-right font-semibold">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center text-sm text-muted-foreground">
                    Carregando subtipos...
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center text-sm text-muted-foreground">
                    Nenhum subtipo cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow key={row._id} className="group transition-colors hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                          <ListTree className="h-5 w-5 opacity-75" />
                        </div>
                        <span className="font-medium text-foreground">{row.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="bg-indigo-50 text-indigo-700 hover:bg-indigo-50 dark:bg-indigo-950/50 dark:text-indigo-300"
                      >
                        {row.typeName || '—'}
                      </Badge>
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
                          onClick={() => onDelete(row)}
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

      <SubtipoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={fetchSubtypes}
        typeOptions={typeOptions}
        mode={dialogMode}
        initialData={selected}
        defaultTypeId={defaultTypeId}
      />
    </div>
  );
}
