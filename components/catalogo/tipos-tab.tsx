'use client';

import { Pencil, Plus, Trash2 } from 'lucide-react';
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
    const data = (await res.json()) as { items?: Array<{ _id: unknown; name: string; isActive?: boolean }> };
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
    toast.success('Tipo removido');
    fetchTypes();
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex justify-end">
        <Button onClick={openCreate} className="w-full shrink-0 gap-2 sm:w-auto">
          <Plus className="h-4 w-4 shrink-0" />
          <span>Novo Tipo</span>
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Nome</TableHead>
                <TableHead className="w-[100px] text-center">Status</TableHead>
                <TableHead className="w-[100px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                    Nenhum tipo cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow key={row._id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{row.name}</TableCell>
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
