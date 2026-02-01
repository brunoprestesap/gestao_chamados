'use client';

import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { PageHeader } from '@/components/dashboard/header';
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
import { FeriadoDialog, type HolidayDTO } from '@/components/holidays/feriado-dialog';

const SCOPE_LABELS: Record<string, string> = {
  NACIONAL: 'Nacional',
  ESTADUAL: 'Estadual',
  MUNICIPAL: 'Municipal',
  INSTITUCIONAL: 'Institucional',
};

const currentYear = new Date().getFullYear();
const YEARS = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

function formatDateBr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

const emptyMessage = 'Nenhum feriado encontrado.';

export default function FeriadosPage() {
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [year, setYear] = useState<string>('');
  const [items, setItems] = useState<HolidayDTO[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [selected, setSelected] = useState<HolidayDTO | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (year) p.set('year', year);
    return p.toString();
  }, [q, year]);

  async function fetchHolidays() {
    setLoading(true);
    const url = queryString ? `/api/holidays?${queryString}` : '/api/holidays';
    const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    setItems(data.items || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchHolidays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchHolidays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  function openCreate() {
    setSelected(null);
    setDialogMode('create');
    setDialogOpen(true);
  }

  function openEdit(item: HolidayDTO) {
    setSelected(item);
    setDialogMode('edit');
    setDialogOpen(true);
  }

  async function onToggleActive(item: HolidayDTO) {
    const res = await fetch(`/api/holidays/${item._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !item.isActive }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error || 'Erro ao atualizar');
      return;
    }
    fetchHolidays();
  }

  async function onDelete(id: string) {
    const ok = confirm('Deseja remover este feriado?');
    if (!ok) return;

    const res = await fetch(`/api/holidays/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error || 'Erro ao remover');
      return;
    }
    fetchHolidays();
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Feriados"
        subtitle="Feriados são considerados dias não úteis para cálculo de SLA."
      />

      <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
        Alterações afetam apenas novos chamados e novos cálculos de SLA. Chamados já classificados não são alterados.
      </p>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              placeholder="Buscar por nome..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
              aria-label="Buscar feriados"
            />
          </div>
          <Select value={year || 'all'} onValueChange={(v) => setYear(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Todos os anos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os anos</SelectItem>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={openCreate} className="w-full gap-2 sm:w-auto" size="sm">
          <Plus className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Novo Feriado</span>
          <span className="sm:hidden">Novo</span>
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Escopo</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow key={row._id} className="transition-colors hover:bg-muted/30">
                    <TableCell className="font-medium">{formatDateBr(row.date)}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{SCOPE_LABELS[row.scope] ?? row.scope}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={row.isActive ? 'default' : 'secondary'} className="text-xs">
                        {row.isActive ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
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
                          size="sm"
                          onClick={() => onToggleActive(row)}
                          aria-label={row.isActive ? 'Desativar' : 'Ativar'}
                          className="h-8 text-xs"
                        >
                          {row.isActive ? 'Desativar' : 'Ativar'}
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
                  className="flex items-start justify-between gap-3 p-4 transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{formatDateBr(row.date)}</span>
                      <Badge variant={row.isActive ? 'default' : 'secondary'} className="text-xs">
                        {row.isActive ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                    <div className="text-sm">{row.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {SCOPE_LABELS[row.scope] ?? row.scope}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(row)}
                      aria-label={`Editar ${row.name}`}
                      className="h-9 w-9"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onToggleActive(row)}
                      className="text-xs"
                    >
                      {row.isActive ? 'Desativar' : 'Ativar'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(row._id)}
                      aria-label={`Excluir ${row.name}`}
                      className="h-9 w-9 text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <FeriadoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={fetchHolidays}
        mode={dialogMode}
        initialData={selected}
      />
    </div>
  );
}
