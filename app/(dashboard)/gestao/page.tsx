'use client';

import { Loader2, Search, Ticket } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AtribuirChamadoDialog } from '@/app/(dashboard)/gestao/_components/AtribuirChamadoDialog';
import { ClassificarChamadoDialog } from '@/app/(dashboard)/gestao/_components/ClassificarChamadoDialog';
import { EncerrarChamadoDialog } from '@/app/(dashboard)/gestao/_components/EncerrarChamadoDialog';
import { ReatribuirChamadoDialog } from '@/app/(dashboard)/gestao/_components/ReatribuirChamadoDialog';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { CHAMADO_STATUS_LABELS, CHAMADO_STATUSES } from '@/shared/chamados/chamado.constants';

const KANBAN_STATUSES = CHAMADO_STATUSES.filter((s) => s !== 'fechado' && s !== 'emvalidacao');

const DEBOUNCE_MS = 300;

export default function GestaoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ChamadoDTO[]>([]);
  const [classificarDialogOpen, setClassificarDialogOpen] = useState(false);
  const [atribuirDialogOpen, setAtribuirDialogOpen] = useState(false);
  const [encerrarChamadoId, setEncerrarChamadoId] = useState<string | null>(null);
  const [reatribuirChamado, setReatribuirChamado] = useState<ChamadoDTO | null>(null);
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
    setClassificarDialogOpen(true);
  }, []);

  const handleAtribuir = useCallback((chamado: ChamadoDTO) => {
    setSelected(chamado);
    setAtribuirDialogOpen(true);
  }, []);

  const handleClassificarDialogClose = useCallback((open: boolean) => {
    setClassificarDialogOpen(open);
    if (!open) setSelected(null);
  }, []);

  const handleAtribuirDialogClose = useCallback((open: boolean) => {
    setAtribuirDialogOpen(open);
    if (!open) setSelected(null);
  }, []);

  const handleEncerrar = useCallback((chamado: ChamadoDTO) => {
    setEncerrarChamadoId(chamado._id);
  }, []);

  const handleEncerrarSuccess = useCallback(() => {
    setEncerrarChamadoId(null);
    fetchChamados();
  }, [fetchChamados]);

  const handleReatribuir = useCallback((chamado: ChamadoDTO) => {
    setReatribuirChamado(chamado);
  }, []);

  const handleReatribuirSuccess = useCallback(() => {
    setReatribuirChamado(null);
    fetchChamados();
  }, [fetchChamados]);

  const emptyMessage = useMemo(() => {
    if (q.trim() || status !== 'all') {
      return 'Nenhum chamado encontrado com os filtros aplicados. Tente ajustar a busca ou o status.';
    }
    return 'Nenhum chamado cadastrado.';
  }, [q, status]);

  const itemsByStatus = useMemo(() => {
    const map: Record<string, ChamadoDTO[]> = {};
    KANBAN_STATUSES.forEach((s) => {
      map[s] = items.filter((c) => c.status === s);
    });
    return map;
  }, [items]);

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
                            onClassificar={c.status === 'aberto' ? handleClassificar : undefined}
                            onAtribuir={
                              c.status === 'validado' || c.status === 'emvalidacao'
                                ? handleAtribuir
                                : undefined
                            }
                            onEncerrar={handleEncerrar}
                            onReatribuir={handleReatribuir}
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

      <ClassificarChamadoDialog
        open={classificarDialogOpen}
        onOpenChange={handleClassificarDialogClose}
        chamado={selected}
        onSuccess={fetchChamados}
      />

      <AtribuirChamadoDialog
        open={atribuirDialogOpen}
        onOpenChange={handleAtribuirDialogClose}
        chamado={selected}
        onSuccess={fetchChamados}
      />

      {encerrarChamadoId && (
        <EncerrarChamadoDialog
          open
          onOpenChange={(open) => {
            if (!open) setEncerrarChamadoId(null);
          }}
          chamadoId={encerrarChamadoId}
          onSuccess={handleEncerrarSuccess}
        />
      )}

      {reatribuirChamado && (
        <ReatribuirChamadoDialog
          open
          onOpenChange={(open) => {
            if (!open) setReatribuirChamado(null);
          }}
          chamado={reatribuirChamado}
          onSuccess={handleReatribuirSuccess}
        />
      )}
    </div>
  );
}
