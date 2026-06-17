'use client';

import { Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { TipoDialog, type TypeDTO } from '@/components/catalogo/tipo-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function TiposTab() {
  const [items, setItems] = useState<TypeDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [selected, setSelected] = useState<TypeDTO | null>(null);

  async function fetchTypes() {
    setLoading(true);
    const res = await fetch('/api/catalog/types', { cache: 'no-store' });
    const data = (await res.json()) as {
      items?: Array<{ _id: unknown; name: string; isActive?: boolean }>;
    };
    setItems(
      (data.items || []).map((t) => ({
        _id: String(t._id),
        name: t.name,
        isActive: t.isActive ?? true,
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    fetchTypes();
  }, []);

  function openCreate() {
    setSelected(null);
    setDialogMode('create');
    setDialogOpen(true);
  }

  function openEdit(item: TypeDTO) {
    setSelected(item);
    setDialogMode('edit');
    setDialogOpen(true);
  }

  async function onDelete(item: TypeDTO) {
    if (!confirm(`Deseja remover o tipo "${item.name}"?`)) return;

    const res = await fetch(`/api/catalog/types/${item._id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error || 'Erro ao remover tipo');
      return;
    }
    toast.success('Tipo removido com sucesso');
    fetchTypes();
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          onClick={openCreate}
          className="w-full shrink-0 gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 shadow-indigo-500/20 hover:shadow-indigo-500/30 sm:w-auto"
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span>Novo Tipo</span>
        </Button>
      </div>

      <Card className="overflow-hidden rounded-2xl border-border/50">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[200px] font-semibold">Nome</TableHead>
                <TableHead className="w-[120px] text-center font-semibold">Status</TableHead>
                <TableHead className="w-[120px] text-right font-semibold">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-32 text-center text-sm text-muted-foreground">
                    Carregando tipos...
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-32 text-center text-sm text-muted-foreground">
                    Nenhum tipo cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow key={row._id} className="group transition-colors hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                          <Layers className="h-5 w-5 opacity-75" />
                        </div>
                        <span className="font-medium text-foreground">{row.name}</span>
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

      <TipoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={fetchTypes}
        mode={dialogMode}
        initialData={selected}
      />
    </div>
  );
}
