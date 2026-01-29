'use client';

import { Loader2, Plus, Search, Ticket } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import {
  AvaliarChamadoDialog,
  type AvaliarChamadoDialogChamado,
} from '@/app/(dashboard)/meus-chamados/_components/AvaliarChamadoDialog';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { CHAMADO_STATUS_LABELS, CHAMADO_STATUSES } from '@/shared/chamados/chamado.constants';

const KANBAN_STATUSES = CHAMADO_STATUSES.filter((s) => s !== 'fechado' && s !== 'emvalidacao');

export default function MeusChamadosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | ChamadoStatus>('all');
  const [items, setItems] = useState<ChamadoDTO[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [avaliarChamado, setAvaliarChamado] = useState<AvaliarChamadoDialogChamado | null>(null);
  const [avaliarDialogOpen, setAvaliarDialogOpen] = useState(false);

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

  const itemsByStatus = useMemo(() => {
    const map: Record<string, ChamadoDTO[]> = {};
    KANBAN_STATUSES.forEach((s) => {
      map[s] = items.filter((c) => c.status === s);
    });
    return map;
  }, [items]);

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
        <div className="overflow-x-auto rounded-lg border bg-muted/30 pb-2">
          <div className="flex min-w-max gap-4 p-4">
            {KANBAN_STATUSES.map((statusKey) => {
              const columnItems = itemsByStatus[statusKey] ?? [];
              const label = CHAMADO_STATUS_LABELS[statusKey];
              return (
                <div
                  key={statusKey}
                  className="flex w-[300px] shrink-0 flex-col rounded-lg border bg-card shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                    <span className="font-semibold text-foreground">{label}</span>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm font-medium text-muted-foreground">
                      {columnItems.length}
                    </span>
                  </div>
                  <ScrollArea className="h-[calc(100vh-16rem)] min-h-[280px]">
                    <div className="flex flex-col gap-3 p-3">
                      {columnItems.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                          Nenhum chamado neste status
                        </p>
                      ) : (
                        columnItems.map((c) => (
                          <ChamadoCard
                            key={c._id}
                            compact
                            chamado={c}
                            showAvaliar
                            onAvaliar={(ch) => {
                              setAvaliarChamado({
                                _id: ch._id,
                                ticket_number: ch.ticket_number,
                                titulo: ch.titulo,
                                assignedToUserId: ch.assignedToUserId ?? null,
                              });
                              setAvaliarDialogOpen(true);
                            }}
                          />
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <NewTicketDialog open={dialogOpen} onOpenChange={setDialogOpen} onSuccess={fetchChamados} />

      <AvaliarChamadoDialog
        open={avaliarDialogOpen}
        onOpenChange={setAvaliarDialogOpen}
        chamado={avaliarChamado}
        onSuccess={fetchChamados}
      />
    </div>
  );
}
