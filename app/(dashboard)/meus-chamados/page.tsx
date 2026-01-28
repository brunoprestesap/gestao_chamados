'use client';

import { Loader2, Plus, Search, Ticket } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import {
  ChamadoCard,
  type ChamadoDTO,
} from '@/app/(dashboard)/meus-chamados/_components/ChamadoCard';
import { NewTicketDialog } from '@/app/(dashboard)/meus-chamados/_components/NewTicketDialog';
import { type ChamadoStatus, STATUS_OPTIONS } from '@/app/(dashboard)/meus-chamados/_constants';
import { PageHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function MeusChamadosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | ChamadoStatus>('all');
  const [items, setItems] = useState<ChamadoDTO[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (status !== 'all') p.set('status', status);
    return p.toString();
  }, [q, status]);

  async function fetchChamados() {
    setLoading(true);
    const url = queryString ? `/api/meus-chamados?${queryString}` : '/api/meus-chamados';
    const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    if (res.status === 401) {
      router.replace('/login?callbackUrl=/meus-chamados');
      setLoading(false);
      return;
    }
    const data = await res.json().catch(() => ({}));
    setItems(Array.isArray(data.items) ? data.items : []);
    setLoading(false);
  }

  useEffect(() => {
    fetchChamados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  const emptyMessage =
    q.trim() || status !== 'all'
      ? 'Tente ajustar os filtros de busca ou status.'
      : 'Você ainda não possui chamados registrados.';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Meus Chamados"
          subtitle="Visualize e filtre seus chamados por status ou texto"
        />
        <Button onClick={() => setDialogOpen(true)} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Novo chamado
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por título ou descrição..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="w-full sm:w-56">
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-full">
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <ChamadoCard key={c._id} chamado={c} />
          ))}
        </div>
      )}

      <NewTicketDialog open={dialogOpen} onOpenChange={setDialogOpen} onSuccess={fetchChamados} />
    </div>
  );
}
