'use client';

import { Loader2, Search, Ticket } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ClassificarChamadoDialog } from '@/app/(dashboard)/gestao/_components/ClassificarChamadoDialog';
import {
  ChamadoCard,
  type ChamadoDTO,
} from '@/app/(dashboard)/meus-chamados/_components/ChamadoCard';
import { type ChamadoStatus, STATUS_OPTIONS } from '@/app/(dashboard)/meus-chamados/_constants';
import { PageHeader } from '@/components/dashboard/header';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const DEBOUNCE_MS = 300;

export default function GestaoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ChamadoDTO[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<ChamadoDTO | null>(null);

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState<'all' | ChamadoStatus>('all');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (debouncedQ.trim()) p.set('q', debouncedQ.trim());
    if (status !== 'all') p.set('status', status);
    return p.toString();
  }, [debouncedQ, status]);

  const fetchChamados = useCallback(async () => {
    setLoading(true);
    try {
      const url = queryString ? `/api/gestao/chamados?${queryString}` : '/api/gestao/chamados';
      const res = await fetch(url, {
        cache: 'no-store',
        credentials: 'same-origin',
        redirect: 'manual',
      });
      if (res.type === 'opaqueredirect' || res.status === 302) {
        router.replace('/dashboard');
        return;
      }
      if (res.status === 401) {
        router.replace('/login?callbackUrl=/gestao');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [router, queryString]);

  useEffect(() => {
    fetchChamados();
  }, [fetchChamados]);

  const handleClassificar = useCallback((chamado: ChamadoDTO) => {
    setSelected(chamado);
    setDialogOpen(true);
  }, []);

  const handleDialogClose = useCallback((open: boolean) => {
    setDialogOpen(open);
    if (!open) setSelected(null);
  }, []);

  const emptyMessage = useMemo(() => {
    if (q.trim() || status !== 'all') {
      return 'Nenhum chamado encontrado com os filtros aplicados. Tente ajustar a busca ou o status.';
    }
    return 'Nenhum chamado cadastrado.';
  }, [q, status]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de Chamados"
        subtitle="Visualize e classifique chamados. Filtre por texto ou status. Apenas Admin ou Preposto."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            placeholder="Buscar por número, título, descrição, local, tipo, natureza..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
            aria-label="Buscar chamados"
          />
        </div>
        <div className="w-full sm:w-56">
          <Select value={status} onValueChange={(v) => setStatus(v as 'all' | ChamadoStatus)}>
            <SelectTrigger aria-label="Filtrar por status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center gap-4 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Carregando chamados...</p>
        </div>
      ) : items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-muted">
              <Ticket className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="font-medium text-foreground">Nenhum chamado encontrado</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{emptyMessage}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {items.map((c) => (
            <ChamadoCard
              key={c._id}
              chamado={c}
              hideDetailLink
              onClassificar={c.status === 'aberto' ? handleClassificar : undefined}
            />
          ))}
        </div>
      )}

      <ClassificarChamadoDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        chamado={selected}
        onSuccess={fetchChamados}
      />
    </div>
  );
}
