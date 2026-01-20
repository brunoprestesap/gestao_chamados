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
    // carga inicial
    fetchUnits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // refetch quando busca mudar
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Unidades</h1>
          <p className="text-sm text-muted-foreground">Cadastre e gerencie as unidades</p>
        </div>

        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Unidade
        </Button>
      </div>

      {/* Busca */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar unidades..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Tabela */}
      <Card className="overflow-hidden">
        <div className="border-b px-4 py-3">
          <div className="grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground">
            <div className="col-span-4">Unidade</div>
            <div className="col-span-2">Andar</div>
            <div className="col-span-3">Responsável</div>
            <div className="col-span-2 text-center">Status</div>
            <div className="col-span-1 text-right">Ações</div>
          </div>
        </div>

        <Table>
          <TableHeader className="hidden">
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
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  Nenhuma unidade encontrada.
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => (
                <TableRow key={row._id} className="hover:bg-muted/30">
                  {/* Unidade */}
                  <TableCell className="align-top">
                    <div className="leading-tight">
                      <div className="font-semibold">{row.name}</div>

                      {/* Mobile: detalhes abaixo */}
                      <div className="mt-1 space-y-1 text-xs text-muted-foreground md:hidden">
                        <div>
                          <span className="font-medium text-foreground/80">Andar:</span> {row.floor}
                        </div>
                        <div>
                          <span className="font-medium text-foreground/80">Resp.:</span>{' '}
                          {row.responsibleName}
                        </div>
                        {row.responsibleEmail ? <div>{row.responsibleEmail}</div> : null}
                        {row.responsiblePhone ? <div>{row.responsiblePhone}</div> : null}
                      </div>
                    </div>
                  </TableCell>

                  {/* Andar (desktop) */}
                  <TableCell className="hidden align-top md:table-cell">
                    <span className="text-sm">{row.floor}</span>
                  </TableCell>

                  {/* Responsável (desktop) */}
                  <TableCell className="hidden align-top md:table-cell">
                    <div className="leading-tight">
                      <div className="text-sm font-medium">{row.responsibleName}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.responsibleEmail ? row.responsibleEmail : '—'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {row.responsiblePhone ? row.responsiblePhone : '—'}
                      </div>
                    </div>
                  </TableCell>

                  {/* Status */}
                  <TableCell className="align-top text-center">
                    <Badge variant={row.isActive ? 'default' : 'secondary'}>
                      {row.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>

                  {/* Ações */}
                  <TableCell className="align-top">
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
