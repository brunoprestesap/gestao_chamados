'use client';

import { Clock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { NovoServicoDialog } from '@/components/catalogo/novo-servico-dialog';
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

type TypeItem = { _id: string; name: string; isActive: boolean };
type ServiceItem = {
  _id: string;
  code: string;
  name: string;
  description?: string;
  type: string;
  subtype: string;
  typeId: string;
  subtypeId: string;
  priorityDefault: 'Baixa' | 'Normal' | 'Alta' | 'Emergencial';
  estimatedHours: number;
  isActive: boolean;
};

export function CatalogoServicosClient() {
  const [types, setTypes] = useState<TypeItem[]>([]);
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState('');
  const [typeId, setTypeId] = useState<string>('__all__');
  const [openNew, setOpenNew] = useState(false);

  const typeOptions = useMemo(() => types.filter((t) => t.isActive), [types]);

  async function fetchTypes() {
    const res = await fetch('/api/catalog/types', { cache: 'no-store' });
    const data = await res.json();
    setTypes(data.items || []);
  }

  async function fetchServices() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (typeId !== '__all__') params.set('typeId', typeId);

    const res = await fetch(`/api/catalog/services?${params.toString()}`, { cache: 'no-store' });
    const data = await res.json();
    setItems(data.items || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchTypes();
    fetchServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchServices(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, typeId]);

  async function onDelete(id: string) {
    if (!confirm('Deseja realmente excluir este serviço?')) return;
    await fetch(`/api/catalog/services/${id}`, { method: 'DELETE' });
    fetchServices();
  }

  console.log(items);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Catálogo de Serviços</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os tipos de serviços de manutenção
          </p>
        </div>

        <Button onClick={() => setOpenNew(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Serviço
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-full sm:max-w-md">
          <Input
            placeholder="Buscar serviços..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="w-full sm:max-w-xs">
          <Select value={typeId} onValueChange={setTypeId}>
            <SelectTrigger>
              <SelectValue placeholder="Todos os Tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os Tipos</SelectItem>
              {typeOptions.map((t) => (
                <SelectItem key={t._id} value={t._id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabela */}
      <Card className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-35">Código</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead className="w-[220px]">Tipo/Subtipo</TableHead>
                <TableHead className="w-[170px]">Prioridade Padrão</TableHead>
                <TableHead className="w-[150px]">Tempo Estimado</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[120px] text-right">Ações</TableHead>
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
                items.map((it) => (
                  <TableRow key={it._id}>
                    <TableCell className="font-mono text-xs">{it.code}</TableCell>

                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-muted" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{it.name}</p>
                          {it.description ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {it.description}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="space-y-1">
                        <Badge variant="secondary">{it.type.name}</Badge>
                        <p className="text-xs text-muted-foreground">{it.subtype.name}</p>
                      </div>
                    </TableCell>

                    <TableCell>
                      <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs">
                        {it.priorityDefault}
                      </span>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        {it.estimatedHours ?? 0}h
                      </div>
                    </TableCell>

                    <TableCell>
                      <span className="inline-flex items-center rounded-md bg-black px-2 py-1 text-xs text-white">
                        {it.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <Button variant="ghost" size="icon" disabled title="Editar (próximo passo)">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(it._id)}
                          title="Excluir"
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
        </div>
      </Card>

      <NovoServicoDialog
        open={openNew}
        onOpenChange={setOpenNew}
        onCreated={() => fetchServices()}
        typeOptions={typeOptions.map((t) => ({ id: t._id, name: t.name }))}
      />
    </div>
  );
}
