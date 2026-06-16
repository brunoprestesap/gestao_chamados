'use client';

import { Pencil, Plus, Trash2 } from 'lucide-react';
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
    toast.success('Subtipo removido');
    fetchSubtypes();
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full min-w-0 sm:w-56 md:w-64">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Todos os Tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Tipos</SelectItem>
              {typeOptions.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={openCreate} className="w-full shrink-0 gap-2 sm:w-auto">
          <Plus className="h-4 w-4 shrink-0" />
          <span>Novo Subtipo</span>
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Nome</TableHead>
                <TableHead className="min-w-[140px]">Tipo</TableHead>
                <TableHead className="w-[100px] text-center">Status</TableHead>
                <TableHead className="w-[100px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Nenhum subtipo cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow key={row._id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <span className="inline-flex w-fit rounded-md bg-muted px-2 py-0.5 text-xs">
                        {row.typeName || '—'}
                      </span>
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
                          onClick={() => onDelete(row)}
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
