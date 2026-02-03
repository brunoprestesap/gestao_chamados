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
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1920px] flex-1 flex-col px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden sm:gap-5 md:gap-6">
        <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <PageHeader
            title="Meus Chamados"
            subtitle="Visualize e filtre seus chamados por status ou texto"
          />
          <Button
            onClick={() => setDialogOpen(true)}
            className="w-full shrink-0 gap-2 sm:w-auto sm:min-w-[140px]"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            Novo chamado
          </Button>
        </div>

        {/* Filtros: empilha em mobile, linha em sm+ */}
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
          <div className="relative w-full min-w-0 sm:flex-1 sm:max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <Input
              placeholder="Buscar por título ou descrição..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="min-w-0 pl-9 text-base sm:text-sm"
              aria-label="Buscar chamados"
            />
          </div>
          <div className="w-full shrink-0 sm:w-auto sm:min-w-[180px]">
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="w-full sm:w-full" aria-label="Filtrar por status">
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
          <div className="grid min-h-[280px] flex-1 place-items-center gap-4 rounded-xl border border-dashed bg-muted/20 py-16 sm:min-h-[320px]">
            <Loader2
              className="h-8 w-8 animate-spin text-muted-foreground sm:h-10 sm:w-10"
              aria-hidden
            />
            <p className="text-sm text-muted-foreground sm:text-base">Carregando chamados...</p>
          </div>
        ) : items.length === 0 ? (
          <Card className="overflow-hidden border-dashed">
            <CardContent className="flex flex-col items-center justify-center px-4 py-12 text-center sm:py-16">
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-muted sm:h-14 sm:w-14">
                <Ticket className="h-6 w-6 text-muted-foreground sm:h-7 sm:w-7" aria-hidden />
              </div>
              <p className="font-medium text-foreground sm:text-lg">Nenhum chamado encontrado</p>
              <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{emptyMessage}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Kanban: scroll horizontal em telas pequenas; scroll vertical contido nas colunas */}
            <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden rounded-xl border bg-muted/20 pb-2 scroll-smooth [-webkit-overflow-scrolling:touch]">
              <div className="inline-flex h-full min-h-[320px] gap-3 p-3 sm:gap-4 sm:p-4 lg:gap-5">
                {KANBAN_STATUSES.map((statusKey) => {
                  const columnItems = itemsByStatus[statusKey] ?? [];
                  const label = CHAMADO_STATUS_LABELS[statusKey];
                  return (
                    <div
                      key={statusKey}
                      className="flex h-full min-h-0 w-[260px] shrink-0 flex-col rounded-lg border bg-card shadow-sm sm:w-[280px] md:min-w-[140px] md:max-w-[200px] md:flex-1 lg:min-w-[160px] lg:max-w-[220px] xl:max-w-[280px]"
                    >
                      <div className="flex min-w-0 shrink-0 items-center justify-between gap-2 border-b px-2 py-2 sm:px-3 sm:py-2.5">
                        <span
                          className="truncate text-xs font-semibold text-foreground sm:text-sm"
                          title={label}
                        >
                          {label}
                        </span>
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground sm:text-xs">
                          {columnItems.length}
                        </span>
                      </div>
                      <ScrollArea className="min-h-0 flex-1">
                        <div className="min-h-full">
                          <div className="flex flex-col gap-2 p-2 sm:gap-2.5 sm:p-3">
                            {columnItems.length === 0 ? (
                              <p
                                className="py-4 text-center text-xs text-muted-foreground sm:py-6"
                                title="Nenhum chamado neste status"
                              >
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
                        </div>
                      </ScrollArea>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

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
